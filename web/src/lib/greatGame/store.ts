import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import { buildState } from "./engine";
import { commitOf, newSeed } from "./fairness";
import { decide, timeoutAction, type GGActor } from "./decide";
import { demoConfig } from "./demo";
import type { GGAction, GGConfig, GGState } from "./model";

/**
 * Great Game storage: one row per event (its setup, the secret seed and the
 * seed's public fingerprint) and one row per action, in order. The website
 * keeps each open event's log in memory and serializes writes per event, so
 * two captains pressing at once can never both get the same turn.
 *
 * Preview mode (SCHEDULER_DEMO=1, `next dev` only) keeps everything in
 * memory with the sample event "demo".
 */

const EVENTS_DDL = `CREATE TABLE IF NOT EXISTS gg_events (
  slug VARCHAR(40) NOT NULL PRIMARY KEY,
  config JSON NOT NULL,
  seed CHAR(64) NOT NULL,
  commit_hash CHAR(64) NOT NULL,
  revealed TINYINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
)`;

const ACTIONS_DDL = `CREATE TABLE IF NOT EXISTS gg_actions (
  slug VARCHAR(40) NOT NULL,
  seq INT NOT NULL,
  at BIGINT NOT NULL,
  by_id VARCHAR(40) NOT NULL,
  kind VARCHAR(24) NOT NULL,
  payload JSON NOT NULL,
  override TINYINT NOT NULL DEFAULT 0,
  reason VARCHAR(200) NULL,
  PRIMARY KEY (slug, seq)
)`;

export const SLUG_RE = /^[a-z0-9-]{2,40}$/;

interface LoadedEvent {
  slug: string;
  config: GGConfig;
  seed: string;
  commit: string;
  revealed: boolean;
  log: GGAction[];
  /** Writes wait in line here. */
  queue: Promise<unknown>;
}

interface Holder {
  events: Map<string, LoadedEvent>;
  loading: Map<string, Promise<LoadedEvent | null>>;
  ddl: Promise<void> | null;
  listeners: Set<(slug: string) => void>;
}

function holder(): Holder {
  const g = globalThis as { __ggStore?: Holder };
  if (!g.__ggStore) g.__ggStore = { events: new Map(), loading: new Map(), ddl: null, listeners: new Set() };
  return g.__ggStore;
}

async function ensureTables(): Promise<void> {
  const h = holder();
  if (!h.ddl) {
    h.ddl = (async () => {
      const pool = getPool();
      await pool.query(EVENTS_DDL);
      await pool.query(ACTIONS_DDL);
    })().catch((error) => {
      h.ddl = null;
      throw error;
    });
  }
  return h.ddl;
}

function parseJson<T>(raw: unknown): T {
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
}

async function loadFromDb(slug: string): Promise<LoadedEvent | null> {
  await ensureTables();
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>("SELECT config, seed, commit_hash, revealed FROM gg_events WHERE slug = ?", [slug]);
  const row = rows[0];
  if (!row) return null;
  const [actions] = await pool.query<RowDataPacket[]>(
    "SELECT seq, at, by_id, kind, payload, override, reason FROM gg_actions WHERE slug = ? ORDER BY seq",
    [slug],
  );
  return {
    slug,
    config: parseJson<GGConfig>(row.config),
    seed: String(row.seed),
    commit: String(row.commit_hash),
    revealed: Boolean(row.revealed),
    log: actions.map((a) => ({
      seq: Number(a.seq),
      at: Number(a.at),
      by: String(a.by_id),
      kind: a.kind,
      payload: parseJson<Record<string, unknown>>(a.payload),
      ...(a.override ? { override: true, reason: a.reason ?? null } : {}),
    })) as GGAction[],
    queue: Promise.resolve(),
  };
}

function demoEvent(slug: string): LoadedEvent | null {
  if (slug !== "demo") return null;
  const seed = newSeed();
  return { slug, config: demoConfig(), seed, commit: commitOf(seed), revealed: false, log: [], queue: Promise.resolve() };
}

export async function loadEvent(slug: string): Promise<LoadedEvent | null> {
  const h = holder();
  const cached = h.events.get(slug);
  if (cached) return cached;
  let pending = h.loading.get(slug);
  if (!pending) {
    pending = (isSchedulerDemo() ? Promise.resolve(demoEvent(slug)) : loadFromDb(slug)).finally(() => h.loading.delete(slug));
    h.loading.set(slug, pending);
  }
  const event = await pending;
  if (event) h.events.set(slug, event);
  return event;
}

export function stateOf(event: LoadedEvent, now = Date.now()): GGState {
  return buildState(event.slug, event.config, event.log, { commit: event.commit, seed: event.revealed ? event.seed : null }, now);
}

export async function getState(slug: string): Promise<GGState | null> {
  const event = await loadEvent(slug);
  return event ? stateOf(event) : null;
}

/**
 * What the replay page needs to rebuild the night itself: the event's setup as
 * it was created (later changes are in the log), the whole log, and the
 * fairness fingerprint (with the seed once it's revealed).
 */
export async function getReplay(slug: string): Promise<{ config: GGConfig; log: GGAction[]; fairness: { commit: string; seed: string | null } } | null> {
  const event = await loadEvent(slug);
  if (!event) return null;
  return { config: event.config, log: [...event.log], fairness: { commit: event.commit, seed: event.revealed ? event.seed : null } };
}

/** Called after every change (the live hub pushes it to the open pages). */
export function onEventChange(listener: (slug: string) => void): () => void {
  const h = holder();
  h.listeners.add(listener);
  return () => h.listeners.delete(listener);
}

function changed(slug: string) {
  for (const listener of holder().listeners) {
    try {
      listener(slug);
    } catch (error) {
      console.error("[greatgame] listener failed:", error);
    }
  }
}

async function append(event: LoadedEvent, draft: Omit<GGAction, "seq" | "at">): Promise<GGAction> {
  const action: GGAction = { ...draft, seq: (event.log.at(-1)?.seq ?? 0) + 1, at: Date.now() };
  if (!isSchedulerDemo()) {
    await getPool().query(
      "INSERT INTO gg_actions (slug, seq, at, by_id, kind, payload, override, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [event.slug, action.seq, action.at, action.by, action.kind, JSON.stringify(action.payload), action.override ? 1 : 0, action.reason ?? null],
    );
  }
  event.log.push(action);
  return action;
}

/** Run one write at a time per event. */
function serialize<T>(event: LoadedEvent, work: () => Promise<T>): Promise<T> {
  const run = event.queue.then(work, work);
  event.queue = run.catch(() => undefined);
  return run;
}

export type ActResult = { ok: true; action: GGAction; state: GGState } | { ok: false; error: string; status: number };

export async function act(slug: string, actor: GGActor, body: Record<string, unknown>): Promise<ActResult> {
  const event = await loadEvent(slug);
  if (!event) return { ok: false, error: "No such event.", status: 404 };
  return serialize(event, async () => {
    const state = stateOf(event);
    const nextSeq = (event.log.at(-1)?.seq ?? 0) + 1;
    const decision = decide(state, actor, body, event.seed, nextSeq);
    if (!decision.ok) return { ok: false as const, error: decision.error, status: 409 };
    const action = await append(event, decision.action);
    changed(slug);
    return { ok: true as const, action, state: stateOf(event) };
  });
}

/** Apply a run-out clock's consequence, if any (the hub calls this every second for open events). */
export async function checkTimeout(slug: string): Promise<void> {
  const event = holder().events.get(slug);
  if (!event) return;
  await serialize(event, async () => {
    const now = Date.now();
    const state = stateOf(event, now);
    const nextSeq = (event.log.at(-1)?.seq ?? 0) + 1;
    const draft = timeoutAction(state, event.seed, nextSeq, now);
    if (!draft) return;
    await append(event, { ...draft, override: false });
    changed(slug);
  });
}

/** Publish the seed (organizers, once the teams are locked). */
export async function revealSeed(slug: string): Promise<ActResult> {
  const event = await loadEvent(slug);
  if (!event) return { ok: false, error: "No such event.", status: 404 };
  return serialize(event, async () => {
    const state = stateOf(event);
    if (state.phase !== "locked") return { ok: false as const, error: "Reveal the fairness code once the teams are locked.", status: 409 };
    if (!isSchedulerDemo()) await getPool().query("UPDATE gg_events SET revealed = 1 WHERE slug = ?", [slug]);
    event.revealed = true;
    changed(slug);
    const now = stateOf(event);
    return { ok: true as const, action: now.log.at(-1) as GGAction, state: now };
  });
}

/** Create an event (system admins). Returns the public fingerprint to post in the announcement. */
export async function createEvent(slug: string, config: GGConfig): Promise<{ commit: string }> {
  if (!SLUG_RE.test(slug)) throw new Error("Bad event id.");
  if (isSchedulerDemo()) throw new Error("Preview mode only has the demo event.");
  await ensureTables();
  const seed = newSeed();
  const commit = commitOf(seed);
  const [result] = await getPool().query<RowDataPacket[]>("SELECT 1 FROM gg_events WHERE slug = ?", [slug]);
  if (result.length) throw new Error("That event already exists.");
  await getPool().query("INSERT INTO gg_events (slug, config, seed, commit_hash, revealed, created_at) VALUES (?, ?, ?, ?, 0, ?)", [
    slug,
    JSON.stringify(config),
    seed,
    commit,
    Date.now(),
  ]);
  return { commit };
}

/** Events loaded in this process (the hub checks their clocks). */
export function loadedSlugs(): string[] {
  return [...holder().events.keys()];
}

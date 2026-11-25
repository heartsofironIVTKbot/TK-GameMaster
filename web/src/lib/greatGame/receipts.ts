import { autoPlacements, decide, timeoutAction, unplaced, type GGActor } from "./decide";
import { commitOf, drawTrace } from "./draw";
import { activeActions, buildState, openMinors } from "./engine";
import type { GGAction, GGConfig, GGState } from "./model";

/**
 * Great Game receipts: every random result of the night, rebuilt from the log.
 *
 * For each draw the page rebuilds the event exactly as it stood the moment
 * before (from the log), then runs the very same rules the server ran
 * (decide.ts, with the revealed seed) and compares the answer with what was
 * logged. Before the seed is revealed the receipts are "sealed": what was
 * drawn and from what is public, but nobody can check it yet.
 */

export type ReceiptStatus = "sealed" | "ok" | "mismatch";

export interface Receipt {
  seq: number;
  at: number;
  kind: GGAction["kind"];
  /** The draw's name in the HMAC message (e.g. "wheel.spin"). */
  label: string;
  /** What it was drawn from, sorted exactly as the draw sorts it. Empty for a multi-draw (assign.auto). */
  pool: string[];
  /** What came out (a team id, a nation tag, a person id). */
  picked: string | null;
  /** For a multi-draw: every placement. */
  placements?: { team: string; person: string; tag: string }[];
  /** Whether a later undo took it back (still checked: it was drawn). */
  undone: boolean;
  status: ReceiptStatus;
  /** The working, once the seed is known: the HMAC message and the 32-bit word that decided it. */
  trace?: { message: string; word: number; value: number; index: number };
}

export interface ReceiptCheck {
  receipts: Receipt[];
  /** null while sealed; else whether SHA-256(seed) is the fingerprint published before the draft. */
  commitOk: boolean | null;
  ok: number;
  mismatches: number;
}

/** An organizer outside every team, so the rules never refuse the re-run for who's asking. */
const CHECKER: GGActor = { id: "__receipts__", organizer: true, captainOf: null, teamOf: null };

/** The draw label of a logged action, or null when the action wasn't random. */
export function drawLabel(action: GGAction): string | null {
  switch (action.kind) {
    case "drum.draw":
    case "wheel.spin":
    case "vice.draw":
    case "recruit.draw":
      return action.kind;
    case "ban.set":
      return action.by === "system" && action.payload.tag ? "ban.timeout" : null;
    case "pick.set":
      return action.by === "system" && action.payload.tag ? "pick.timeout" : null;
    case "assign.auto":
      return "assign";
    default:
      return null;
  }
}

/** JSON with sorted keys and no undefined fields, so two payloads compare by content. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return inner;
  });
}

function poolOf(before: GGState, action: GGAction): string[] {
  switch (action.kind) {
    case "drum.draw":
      return before.teams.map((team) => team.id).filter((id) => !before.order.includes(id));
    case "wheel.spin": {
      const taken = new Set(before.teams.map((team) => team.major).filter(Boolean));
      return before.config.majors.filter((tag) => !taken.has(tag));
    }
    case "vice.draw":
      return unplaced(before, "vice");
    case "recruit.draw":
      return unplaced(before, "recruit");
    case "ban.set":
    case "pick.set":
      return openMinors(before.config, before.teams);
    default:
      return [];
  }
}

function pickedOf(action: GGAction): string | null {
  const p = action.payload;
  const value = action.kind === "drum.draw" ? p.team : action.kind === "vice.draw" || action.kind === "recruit.draw" ? p.person : p.tag;
  return typeof value === "string" ? value : null;
}

/** What the rules give for this action, re-run on the state just before it with the seed. */
function rerun(before: GGState, action: GGAction, seed: string): unknown {
  if (action.kind === "assign.auto") return { placements: autoPlacements(before, seed, action.seq) };
  if (action.by === "system") return timeoutAction(before, seed, action.seq, action.at)?.payload ?? null;
  const body: Record<string, unknown> = { kind: action.kind };
  if (action.kind === "recruit.draw" && action.payload.card !== undefined) body.card = action.payload.card;
  const decision = decide(before, CHECKER, body, seed, action.seq);
  return decision.ok ? decision.action.payload : { refused: decision.error };
}

export function checkReceipts(slug: string, config: GGConfig, log: GGAction[], fairness: { commit: string; seed: string | null }): ReceiptCheck {
  const seed = fairness.seed;
  const live = new Set(activeActions(log).map((action) => action.seq));
  const receipts: Receipt[] = [];
  log.forEach((action, index) => {
    const label = drawLabel(action);
    if (!label) return;
    const before = buildState(slug, config, log.slice(0, index), { commit: fairness.commit, seed: null }, action.at);
    const pool = [...poolOf(before, action)].sort();
    const receipt: Receipt = {
      seq: action.seq,
      at: action.at,
      kind: action.kind,
      label,
      pool,
      picked: pickedOf(action),
      undone: !live.has(action.seq) && action.kind !== "undo",
      status: "sealed",
    };
    if (action.kind === "assign.auto") receipt.placements = (action.payload.placements as Receipt["placements"]) ?? [];
    if (seed) {
      receipt.status = canonical(rerun(before, action, seed)) === canonical(action.payload) ? "ok" : "mismatch";
      if (pool.length > 1) {
        const trace = drawTrace(seed, action.seq, label, pool.length);
        receipt.trace = { message: trace.message, word: trace.word, value: trace.value, index: trace.index };
      }
    }
    receipts.push(receipt);
  });
  return {
    receipts,
    commitOk: seed ? commitOf(seed) === fairness.commit : null,
    ok: receipts.filter((receipt) => receipt.status === "ok").length,
    mismatches: receipts.filter((receipt) => receipt.status === "mismatch").length,
  };
}

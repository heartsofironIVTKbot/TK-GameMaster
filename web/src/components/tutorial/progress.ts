import type { Tour, TourRecord, TutorialProgress } from "./types";

/**
 * Which tours someone has seen. Logged in: saved to the account
 * (/api/tutorial), so another browser doesn't show them again. Logged out:
 * this browser only; merged into the account on login. The browser copy is
 * always written too, so the next page load knows at once.
 */

const LOCAL_KEY = "gm_tutorial_v1";

export const EMPTY_PROGRESS: TutorialProgress = { autoStart: true, tours: {} };

function cleanRecord(raw: unknown): TourRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record.status !== "done" && record.status !== "skipped") return null;
  const version = Number(record.version);
  const at = Number(record.at);
  if (!Number.isInteger(version) || version < 1 || version > 1000) return null;
  return { status: record.status, version, at: Number.isFinite(at) ? Math.floor(at) : 0 };
}

/** Accepts anything; keeps only well-formed records for known tour ids. */
export function cleanProgress(raw: unknown, knownIds: ReadonlySet<string>): TutorialProgress {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_PROGRESS, tours: {} };
  const value = raw as Record<string, unknown>;
  const tours: Record<string, TourRecord> = {};
  const rawTours = typeof value.tours === "object" && value.tours !== null ? (value.tours as Record<string, unknown>) : {};
  for (const [id, record] of Object.entries(rawTours)) {
    if (!knownIds.has(id)) continue;
    const clean = cleanRecord(record);
    if (clean) tours[id] = clean;
  }
  return { autoStart: value.autoStart !== false, tours };
}

/** Union of both: a tour seen in either counts as seen (newer version wins). */
export function mergeProgress(account: TutorialProgress, local: TutorialProgress): TutorialProgress {
  const tours: Record<string, TourRecord> = { ...account.tours };
  for (const [id, record] of Object.entries(local.tours)) {
    const current = tours[id];
    if (!current || record.version > current.version || (record.version === current.version && record.at > current.at)) {
      tours[id] = record;
    }
  }
  return { autoStart: account.autoStart, tours };
}

export function sameProgress(a: TutorialProgress, b: TutorialProgress): boolean {
  if (a.autoStart !== b.autoStart) return false;
  const aKeys = Object.keys(a.tours);
  if (aKeys.length !== Object.keys(b.tours).length) return false;
  return aKeys.every((id) => {
    const x = a.tours[id];
    const y = b.tours[id];
    return Boolean(y) && x.status === y.status && x.version === y.version;
  });
}

export function hasSeen(progress: TutorialProgress, tour: Tour): boolean {
  const record = progress.tours[tour.id];
  return Boolean(record && record.version >= tour.version);
}

export function readLocal(knownIds: ReadonlySet<string>): TutorialProgress | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? cleanProgress(JSON.parse(raw), knownIds) : null;
  } catch {
    return null;
  }
}

export function writeLocal(progress: TutorialProgress): void {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(progress));
  } catch {
    // Storage blocked (private window): the account copy still works.
  }
}

export interface AccountProgress {
  loggedIn: boolean;
  /** null: logged in but nothing saved yet, or the database is unreachable. */
  progress: TutorialProgress | null;
}

export async function fetchAccountProgress(knownIds: ReadonlySet<string>): Promise<AccountProgress> {
  try {
    const response = await fetch("/api/tutorial", { cache: "no-store" });
    if (!response.ok) return { loggedIn: false, progress: null };
    const body = (await response.json()) as { loggedIn?: boolean; progress?: unknown };
    return {
      loggedIn: body.loggedIn === true,
      progress: body.progress ? cleanProgress(body.progress, knownIds) : null,
    };
  } catch {
    return { loggedIn: false, progress: null };
  }
}

export function saveAccountProgress(progress: TutorialProgress): void {
  void fetch("/api/tutorial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(progress),
    keepalive: true,
  }).catch(() => {});
}

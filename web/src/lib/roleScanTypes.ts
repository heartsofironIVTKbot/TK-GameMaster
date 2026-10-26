/**
 * The role check (bot.py.py _run_role_verification_scan — formerly /scan):
 * Trusted (5+ commends, VIP or the Valor pick, with that game type's Verified
 * role and no game ban), Hearts of Valor, Dishonored, and the database's
 * Verified / host-tier flags. A preview lists what would change; apply does
 * it. It also runs by itself every day at 04:00 UTC. Client-safe.
 */

export type RoleScanKind =
  | "trusted_add"
  | "trusted_remove"
  | "valor_add"
  | "valor_remove"
  | "dishonored_add"
  | "dishonored_remove"
  | "record";

export interface RoleScanChange {
  user_id: string;
  name: string;
  kind: RoleScanKind;
  role: string;
  detail: string;
}

export interface RoleScanResult {
  applied: boolean;
  trigger: "web" | "daily" | "manual";
  /** Discord id of who ran it from the website (null = the daily run). */
  by: string | null;
  by_name?: string | null;
  finished_at: number;
  members_checked: number;
  members_scanned: number;
  counts: Record<RoleScanKind, number>;
  total: number;
  /** Capped at 400 (total has the real count). */
  changes: RoleScanChange[];
  errors: string[];
}

export interface RoleScanState {
  preview: RoleScanResult | null;
  apply: RoleScanResult | null;
  /** Host Management may run it. */
  can_run: boolean;
  /** Daily automatic run (UTC). */
  daily_at_utc: string;
}

export const ROLE_SCAN_GROUPS: readonly { kinds: RoleScanKind[]; title: string; tone: string }[] = [
  { kinds: ["trusted_remove"], title: "🚫 Trusted removed", tone: "text-rose-200" },
  { kinds: ["trusted_add"], title: "✅ Trusted added", tone: "text-emerald-200" },
  { kinds: ["valor_add", "valor_remove"], title: "🎖️ Hearts of Valor", tone: "text-amber-200" },
  { kinds: ["dishonored_add", "dishonored_remove"], title: "⚖️ Dishonored", tone: "text-violet-200" },
  { kinds: ["record"], title: "🗂️ Records fixed (database only)", tone: "text-slate-200" },
];

export function roleScanVerb(kind: RoleScanKind): string {
  if (kind.endsWith("_add")) return "gets";
  if (kind.endsWith("_remove")) return "loses";
  return "record:";
}

/**
 * Great Game: the shapes shared by the server and the page.
 *
 * The event is a log of actions (append-only, numbered). Everything the page
 * shows (teams, majors, bans, picks, who is on the clock) is rebuilt from that
 * log by lib/greatGame/engine.ts, so an organizer's fix, an undo, the public
 * log, the fairness receipts and the replay all read the same list.
 */

export type GGPhase = "teams" | "drum" | "wheel" | "vice" | "recruits" | "bans" | "draft" | "assign" | "locked";

export const PHASES: GGPhase[] = ["teams", "drum", "wheel", "vice", "recruits", "bans", "draft", "assign", "locked"];

export const PHASE_LABEL: Record<GGPhase, string> = {
  teams: "Teams",
  drum: "Lottery drum",
  wheel: "Major wheel",
  vice: "Vice-captains",
  recruits: "Recruits",
  bans: "Bans",
  draft: "Minor draft",
  assign: "Assign players",
  locked: "Teams locked",
};

export type GGRole = "organizer" | "captain" | "vice" | "recruit" | "caster";

export interface GGPerson {
  /** Discord user id (a filler has "filler:<n>"). */
  id: string;
  name: string;
  role: GGRole;
  /** A content creator's channel, shown next to their name. */
  channel?: string | null;
  /** A stand-in until the real person is known (an organizer swaps them in). */
  filler?: boolean;
}

export interface GGTeamConfig {
  id: string;
  captain_id: string;
}

export type TimeoutRule = "wait" | "random" | "skip";

export interface GGConfig {
  title: string;
  /** Major tags, strongest first (bans go in this order; the draft starts at the end). */
  majors: string[];
  /** Minor tags that can be banned and picked. */
  pool: string[];
  /** Display names for every tag above. */
  names: Record<string, string>;
  people: GGPerson[];
  teams: GGTeamConfig[];
  /** Seconds per turn. */
  timers: { ban: number; pick: number; assign: number };
  /** What happens when a turn's clock runs out. */
  on_timeout: { ban: TimeoutRule; pick: TimeoutRule; assign: TimeoutRule };
}

/** One entry in the log. */
export interface GGAction {
  seq: number;
  /** Epoch ms. */
  at: number;
  /** Discord id of who did it ("system" for timeouts). */
  by: string;
  kind: GGActionKind;
  payload: Record<string, unknown>;
  /** Written by an organizer outside the normal turn: shown as a fix in the log. */
  override?: boolean;
  reason?: string | null;
}

export type GGActionKind =
  | "team.set" // {team, name?, color?, approved?}
  | "phase.set" // {phase}
  | "pause.set" // {on}
  | "drum.draw" // {team} (result)
  | "wheel.spin" // {team, tag} (result)
  | "vice.draw" // {team, person} (result)
  | "recruit.draw" // {team, person, slot} (result)
  | "ban.set" // {team, tag} ("" = ban lost)
  | "pick.set" // {team, round, tag} ("" = clears the slot)
  | "assign.set" // {team, person, tag} ("" = unassign)
  | "assign.auto" // {placements: [{team, person, tag}]}
  | "major.set" // override: {team, tag}
  | "order.set" // override: {order: team ids}  (the drum result)
  | "member.set" // override: {team, slot: "vice"|"r1"|"r2", person}
  | "person.set" // override: {person: GGPerson} (add or replace someone in the roster)
  | "config.set" // override: {majors?, timers?, on_timeout?}
  | "undo"; // {seq}

/** A team as the page sees it. */
export interface GGTeam {
  id: string;
  name: string;
  color: string;
  approved: boolean;
  captain: string;
  major: string | null;
  vice: string | null;
  recruits: [string | null, string | null];
  /** "" = lost to a timeout, null = not yet. */
  ban: string | null;
  picks: [string | null, string | null, string | null];
  /** person id -> nation tag */
  assign: Record<string, string>;
}

export interface GGTurn {
  phase: GGPhase;
  /** The team that acts now (null = an organizer acts, or nobody). */
  team: string | null;
  /** Draft: which pick this is (1-21) and its round (1-3). */
  pick?: number;
  round?: number;
  /** Recruits: 1 or 2. */
  slot?: number;
  /** When this turn's clock started (epoch ms), for the timed phases. */
  started_at: number | null;
  /** Seconds this turn gets (null = untimed). */
  seconds: number | null;
  /** While paused: when the pause began (the clock stands still from there). */
  paused_at?: number | null;
}

export interface GGState {
  slug: string;
  config: GGConfig;
  phase: GGPhase;
  paused: boolean;
  teams: GGTeam[];
  /** Drum result so far (team ids in the order drawn). */
  order: string[];
  turn: GGTurn;
  /** Whether everything this phase needs is done (the organizer can move on). */
  phase_done: boolean;
  /** The last randomizer result, for the animation: {kind, seq, at, team, value}. */
  last_draw: { kind: string; seq: number; at: number; team: string; value: string } | null;
  log: GGAction[];
  fairness: { commit: string; seed: string | null };
  /** Server time when this state was built (the page corrects its clock with it). */
  now: number;
}

export const VALID_COLOR = /^#[0-9a-f]{6}$/i;

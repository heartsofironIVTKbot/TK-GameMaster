import { drawFrom } from "./fairness";
import { NEUTRAL_TEAM_COLOR, membersOf, nameOf, nationsOf, openMinors, strengthOrder, turnDeadline } from "./engine";
import { PHASES, VALID_COLOR, type GGAction, type GGActionKind, type GGPerson, type GGPhase, type GGState, type GGTeam } from "./model";

/**
 * Great Game: turns a request from the page into the action to log, or says
 * no. The server runs every random draw here (with the event's secret seed),
 * so a result is decided once, saved, and only then shown to anyone.
 *
 * Captains act on their own team's turn (name and colour, scratch and flip
 * cards, ban, pick, assign their players). Organizers can do anything at any
 * time; whatever falls outside the normal turn is marked as a fix in the
 * public log, with their reason.
 */

export interface GGActor {
  id: string;
  organizer: boolean;
  /** The team this person captains, if any. */
  captainOf: string | null;
}

export type Decision = { ok: true; action: Omit<GGAction, "seq" | "at"> } | { ok: false; error: string };

const no = (error: string): Decision => ({ ok: false, error });

/** Requests an organizer may always send. */
const ORGANIZER_ONLY = new Set<string>([
  "phase.set",
  "pause.set",
  "drum.draw",
  "wheel.spin",
  "order.set",
  "major.set",
  "member.set",
  "person.set",
  "config.set",
  "undo",
  "assign.auto",
]);

/**
 * Colours the map keeps for itself: the yellow "being considered" glow, the
 * grey of AI nations and the sea. One team may still be red (ban stamps only
 * sit on grey AI nations and say BANNED), but never two similar reds.
 */
const RESERVED = ["#ffd23f", "#3b3650", "#0d0820"];

function lab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** How different two colours look (CIE76 ΔE: under ~20 reads as "the same colour" on the map). */
export function colorDistance(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export const MIN_COLOR_DISTANCE = 22;

export function colorProblem(state: GGState, teamId: string, color: string): string | null {
  if (!VALID_COLOR.test(color)) return "Pick a colour.";
  for (const reserved of RESERVED) {
    if (colorDistance(color, reserved) < MIN_COLOR_DISTANCE) {
      return "That colour is too close to one the map uses for its own signals (the yellow glow or AI grey). Pick another.";
    }
  }
  for (const team of state.teams) {
    // Skip the team itself and teams still on the starting grey.
    if (team.id === teamId || team.color === NEUTRAL_TEAM_COLOR) continue;
    if (colorDistance(color, team.color) < MIN_COLOR_DISTANCE) return `That colour is too close to ${team.name}'s. Pick another.`;
  }
  return null;
}

function teamOf(state: GGState, id: unknown): GGTeam | null {
  return typeof id === "string" ? (state.teams.find((team) => team.id === id) ?? null) : null;
}

function cleanReason(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 200) : null;
}

/** Players not yet placed in any team, of a role. */
function unplaced(state: GGState, role: GGPerson["role"]): string[] {
  const placed = new Set(state.teams.flatMap((team) => membersOf(team)));
  return state.config.people.filter((person) => person.role === role && !placed.has(person.id)).map((person) => person.id);
}

/**
 * @param body the page's request: {kind, ...fields, reason?}
 * @param seed the event's secret seed; @param nextSeq the seq this action gets
 */
export function decide(state: GGState, actor: GGActor, body: Record<string, unknown>, seed: string, nextSeq: number): Decision {
  const kind = String(body.kind ?? "") as GGActionKind;
  const reason = cleanReason(body.reason);
  const org = actor.organizer;
  if (ORGANIZER_ONLY.has(kind) && !org) return no("Only organizers can do that.");
  if (state.paused && !org) return no("The event is paused.");
  if (state.phase === "locked" && !org) return no("The teams are locked.");
  const action = (payload: Record<string, unknown>, override = false): Decision => ({
    ok: true,
    action: { by: actor.id, kind, payload, ...(override ? { override: true, reason } : {}) },
  });
  const turnTeam = state.turn.team;

  switch (kind) {
    case "phase.set": {
      const phase = String(body.phase) as GGPhase;
      if (!PHASES.includes(phase)) return no("Unknown step.");
      const from = PHASES.indexOf(state.phase);
      const to = PHASES.indexOf(phase);
      // Moving on from an unfinished step, or going back, is a fix.
      return action({ phase }, to !== from + 1 || !state.phase_done);
    }
    case "pause.set":
      return action({ on: Boolean(body.on) });
    case "undo": {
      const seq = Number(body.seq);
      const target = state.log.find((entry) => entry.seq === seq);
      if (!target || target.kind === "undo") return no("That action can't be undone.");
      if (state.log.some((entry) => entry.kind === "undo" && Number(entry.payload.seq) === seq)) return no("Already undone.");
      return action({ seq }, true);
    }
    case "team.set": {
      const team = teamOf(state, body.team);
      if (!team) return no("Unknown team.");
      const mine = actor.captainOf === team.id && state.phase === "teams" && !team.approved;
      if (!mine && !org) return no("You can only change your own team before it's approved.");
      const payload: Record<string, unknown> = { team: team.id };
      if (typeof body.name === "string") {
        const name = body.name.trim().replace(/\s+/g, " ");
        if (name.length < 2 || name.length > 24) return no("Team names are 2 to 24 characters.");
        if (state.teams.some((other) => other.id !== team.id && other.name.toLowerCase() === name.toLowerCase())) {
          return no("Another team already has that name.");
        }
        payload.name = name;
      }
      if (typeof body.color === "string") {
        const color = body.color.toLowerCase();
        const problem = colorProblem(state, team.id, color);
        if (problem) return no(problem);
        payload.color = color;
      }
      if (typeof body.approved === "boolean") {
        if (!org) return no("Only organizers approve teams.");
        payload.approved = body.approved;
      }
      return action(payload, org && !mine && state.phase !== "teams");
    }
    case "drum.draw": {
      const left = state.teams.map((team) => team.id).filter((id) => !state.order.includes(id));
      if (!left.length) return no("Every team is already drawn.");
      return action({ team: drawFrom(seed, nextSeq, kind, left) }, state.phase !== "drum");
    }
    case "order.set": {
      const order = Array.isArray(body.order) ? body.order.filter((id): id is string => typeof id === "string") : [];
      if (order.some((id) => !teamOf(state, id)) || new Set(order).size !== order.length) return no("That order doesn't match the teams.");
      return action({ order }, true);
    }
    case "wheel.spin": {
      if (!turnTeam || state.phase !== "wheel") return no("No team is waiting to spin.");
      const taken = new Set(state.teams.map((team) => team.major).filter(Boolean));
      const left = state.config.majors.filter((tag) => !taken.has(tag));
      if (!left.length) return no("Every major is taken.");
      return action({ team: turnTeam, tag: drawFrom(seed, nextSeq, kind, left) });
    }
    case "major.set": {
      const team = teamOf(state, body.team);
      const tag = String(body.tag ?? "");
      if (!team || (tag && !state.config.majors.includes(tag))) return no("Pick a team and a major.");
      return action({ team: team.id, tag }, true);
    }
    case "vice.draw":
    case "recruit.draw": {
      const phase = kind === "vice.draw" ? "vice" : "recruits";
      if (state.phase !== phase || !turnTeam) return no("It isn't time for that draw.");
      if (!org && actor.captainOf !== turnTeam) return no("It's another team's turn.");
      const left = unplaced(state, kind === "vice.draw" ? "vice" : "recruit");
      if (!left.length) return no("Nobody is left to draw.");
      const person = drawFrom(seed, nextSeq, kind, left);
      return action(kind === "vice.draw" ? { team: turnTeam, person } : { team: turnTeam, person, slot: state.turn.slot ?? 1 });
    }
    case "member.set": {
      const team = teamOf(state, body.team);
      const slot = String(body.slot);
      const person = String(body.person ?? "");
      if (!team || !["captain", "vice", "r1", "r2"].includes(slot)) return no("Pick a team and a slot.");
      if (person && !state.config.people.some((entry) => entry.id === person)) return no("That person isn't on the roster.");
      if (slot === "captain" && !person) return no("A team always has a captain.");
      return action({ team: team.id, slot, person }, true);
    }
    case "person.set": {
      const raw = body.person as Record<string, unknown> | undefined;
      const id = String(raw?.id ?? "").trim();
      const name = String(raw?.name ?? "").trim();
      const role = String(raw?.role ?? "");
      if (!/^(\d{15,25}|filler:\w+)$/.test(id) || !name || !["organizer", "captain", "vice", "recruit", "caster"].includes(role)) {
        return no("A person needs a Discord id, a name and a role.");
      }
      const person: GGPerson = {
        id,
        name: name.slice(0, 40),
        role: role as GGPerson["role"],
        channel: typeof raw?.channel === "string" && raw.channel ? raw.channel.slice(0, 200) : null,
        filler: id.startsWith("filler:"),
      };
      const replaces = typeof body.replaces === "string" && body.replaces ? body.replaces : undefined;
      return action({ person, ...(replaces ? { replaces } : {}) }, true);
    }
    case "config.set": {
      const payload: Record<string, unknown> = {};
      if (Array.isArray(body.majors)) {
        const majors = body.majors.map(String);
        if (majors.length !== state.config.majors.length || majors.some((tag) => !state.config.majors.includes(tag))) {
          return no("The ranking must list the same seven majors.");
        }
        payload.majors = majors;
      }
      if (body.timers && typeof body.timers === "object") {
        const timers: Record<string, number> = {};
        for (const key of ["ban", "pick", "assign"]) {
          const value = Number((body.timers as Record<string, unknown>)[key]);
          if (Number.isFinite(value)) timers[key] = Math.max(10, Math.min(3600, Math.round(value)));
        }
        payload.timers = timers;
      }
      if (body.on_timeout && typeof body.on_timeout === "object") {
        const rules: Record<string, string> = {};
        for (const [key, value] of Object.entries(body.on_timeout as Record<string, unknown>)) {
          if (["ban", "pick", "assign"].includes(key) && ["wait", "random", "skip"].includes(String(value))) rules[key] = String(value);
        }
        payload.on_timeout = rules;
      }
      return action(payload, true);
    }
    case "ban.set": {
      const tag = String(body.tag ?? "");
      const team = teamOf(state, body.team ?? turnTeam);
      if (!team) return no("Unknown team.");
      const normal = state.phase === "bans" && team.id === turnTeam;
      if (!normal && !org) return no("It isn't your turn to ban.");
      if (!org && actor.captainOf !== team.id) return no("It's another team's turn.");
      if (tag && !state.config.pool.includes(tag)) return no("That nation can't be banned.");
      if (tag && state.teams.some((other) => other.ban === tag && other.id !== team.id)) return no(`${nameOf(state.config, tag)} is already banned.`);
      if (tag && state.teams.some((other) => other.picks.includes(tag))) return no(`${nameOf(state.config, tag)} is already picked.`);
      if (!tag && !org) return no("Pick a nation to ban.");
      // An organizer banning on the team's own turn is normal; any other time it's a fix.
      return action({ team: team.id, tag }, !normal);
    }
    case "pick.set": {
      const tag = String(body.tag ?? "");
      const team = teamOf(state, body.team ?? turnTeam);
      if (!team) return no("Unknown team.");
      const normal = state.phase === "draft" && team.id === turnTeam && body.round === undefined;
      const round = normal ? (state.turn.round ?? 1) : Number(body.round);
      if (!(round >= 1 && round <= 3)) return no("Pick a round.");
      if (!normal && !org) return no("It isn't your turn to pick.");
      if (!org && actor.captainOf !== team.id) return no("It's another team's turn.");
      if (tag) {
        if (!state.config.pool.includes(tag)) return no("That nation isn't in the pool.");
        if (state.teams.some((other) => other.ban === tag)) return no(`${nameOf(state.config, tag)} is banned.`);
        if (state.teams.some((other) => other.picks.includes(tag))) return no(`${nameOf(state.config, tag)} is already picked.`);
      } else if (!org) return no("Pick a nation.");
      return action({ team: team.id, round, tag }, !normal);
    }
    case "assign.set": {
      const team = teamOf(state, body.team);
      const person = String(body.person ?? "");
      const tag = String(body.tag ?? "");
      if (!team) return no("Unknown team.");
      const normal = state.phase === "assign" && actor.captainOf === team.id;
      if (!normal && !org) return no("You can only place your own players while the window is open.");
      if (!membersOf(team).includes(person)) return no("That player isn't on this team.");
      if (tag && !nationsOf(team).includes(tag)) return no("That nation isn't this team's.");
      return action({ team: team.id, person, tag }, !normal);
    }
    case "assign.auto":
      return action({ placements: autoPlacements(state, seed, nextSeq) }, state.phase !== "assign");
    default:
      return no("Unknown action.");
  }
}

/** Every unplaced player goes to a random empty nation of their own team. */
export function autoPlacements(state: GGState, seed: string, seq: number): { team: string; person: string; tag: string }[] {
  const out: { team: string; person: string; tag: string }[] = [];
  for (const team of state.teams) {
    const used = new Set(Object.values(team.assign));
    const free = nationsOf(team).filter((tag) => !used.has(tag));
    for (const person of membersOf(team).filter((id) => !team.assign[id]).sort()) {
      if (!free.length) break;
      const tag = drawFrom(seed, seq, `assign:${team.id}:${person}`, free);
      free.splice(free.indexOf(tag), 1);
      out.push({ team: team.id, person, tag });
    }
  }
  return out;
}

/**
 * The action a run-out clock causes (by "system"), or null: bans can be lost
 * or drawn at random, picks drawn at random, and the assignment window places
 * everyone left. "wait" leaves it to the captain and the organizers.
 */
export function timeoutAction(state: GGState, seed: string, nextSeq: number, now: number): Omit<GGAction, "seq" | "at"> | null {
  if (state.paused) return null;
  const deadline = turnDeadline(state);
  if (deadline === null || now < deadline) return null;
  const rules = state.config.on_timeout;
  const reason = "Clock ran out";
  if (state.phase === "bans" && state.turn.team) {
    if (rules.ban === "skip") return { by: "system", kind: "ban.set", payload: { team: state.turn.team, tag: "" }, reason };
    if (rules.ban === "random") {
      const open = openMinors(state.config, state.teams);
      if (open.length) return { by: "system", kind: "ban.set", payload: { team: state.turn.team, tag: drawFrom(seed, nextSeq, "ban.timeout", open) }, reason };
    }
  }
  if (state.phase === "draft" && state.turn.team && rules.pick === "random") {
    const open = openMinors(state.config, state.teams);
    if (open.length) {
      return {
        by: "system",
        kind: "pick.set",
        payload: { team: state.turn.team, round: state.turn.round ?? 1, tag: drawFrom(seed, nextSeq, "pick.timeout", open) },
        reason,
      };
    }
  }
  if (state.phase === "assign" && rules.assign === "random" && !state.phase_done) {
    return { by: "system", kind: "assign.auto", payload: { placements: autoPlacements(state, seed, nextSeq) }, reason };
  }
  return null;
}

export { strengthOrder };

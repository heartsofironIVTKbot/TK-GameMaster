import type { GGAction, GGConfig, GGPerson, GGPhase, GGState, GGTeam, GGTurn } from "./model";

/**
 * Great Game: rebuilds the event from its log (pure, no I/O, runs on the
 * server and in the page).
 *
 * Every slot (a team's major, vice-captain, recruits, ban, three picks,
 * assignments) is filled by the actions that name it, in order. Whose turn it
 * is follows from the first empty slot in that phase's order, so an organizer
 * who fills or clears any slot moves the turn with it and nothing else needs
 * fixing.
 */

export const NEUTRAL_TEAM_COLOR = "#8a7fb0";

/** Undone actions are skipped. An undo can't be undone (redo the action instead). */
export function activeActions(log: GGAction[]): GGAction[] {
  const undone = new Set<number>();
  for (const action of log) {
    if (action.kind === "undo") {
      const target = Number(action.payload.seq);
      const hit = log.find((entry) => entry.seq === target);
      if (hit && hit.kind !== "undo") undone.add(target);
    }
  }
  return log.filter((action) => action.kind !== "undo" && !undone.has(action.seq));
}

export function membersOf(team: Pick<GGTeam, "captain" | "vice" | "recruits">): string[] {
  return [team.captain, team.vice, ...team.recruits].filter((id): id is string => Boolean(id));
}

export function nationsOf(team: Pick<GGTeam, "major" | "picks">): string[] {
  return [team.major, ...team.picks].filter((tag): tag is string => Boolean(tag));
}

/** Teams by their major's strength (strongest first); teams without one keep their place at the end. */
export function strengthOrder(teams: GGTeam[], majors: string[]): GGTeam[] {
  const rank = (team: GGTeam) => (team.major ? majors.indexOf(team.major) : 99);
  return [...teams].sort((a, b) => rank(a) - rank(b) || teams.indexOf(a) - teams.indexOf(b));
}

/** The 21 picks in snake order: weakest major first, reversing each round. */
export function draftOrder(teams: GGTeam[], majors: string[]): { team: string; round: number; pick: number }[] {
  const strong = strengthOrder(teams, majors).map((team) => team.id);
  const weak = [...strong].reverse();
  const out: { team: string; round: number; pick: number }[] = [];
  [weak, strong, weak].forEach((order, round) => {
    for (const team of order) out.push({ team, round: round + 1, pick: out.length + 1 });
  });
  return out;
}

export function personById(config: GGConfig, id: string | null | undefined): GGPerson | null {
  if (!id) return null;
  return config.people.find((person) => person.id === id) ?? null;
}

export function nameOf(config: GGConfig, tag: string | null | undefined): string {
  if (!tag) return "";
  return config.names[tag] ?? tag;
}

/** Nations nobody banned or picked yet. */
export function openMinors(config: GGConfig, teams: GGTeam[]): string[] {
  const taken = new Set<string>();
  for (const team of teams) {
    if (team.ban) taken.add(team.ban);
    for (const pick of team.picks) if (pick) taken.add(pick);
  }
  return config.pool.filter((tag) => !taken.has(tag));
}

function blankTeam(config: GGConfig, index: number): GGTeam {
  const team = config.teams[index];
  return {
    id: team.id,
    name: `Team ${index + 1}`,
    color: NEUTRAL_TEAM_COLOR,
    approved: false,
    captain: team.captain_id,
    major: null,
    vice: null,
    recruits: [null, null],
    ban: null,
    picks: [null, null, null],
    assign: {},
  };
}

const TIMED: Partial<Record<GGPhase, "ban" | "pick" | "assign">> = { bans: "ban", draft: "pick", assign: "assign" };

export function buildState(
  slug: string,
  baseConfig: GGConfig,
  log: GGAction[],
  fairness: { commit: string; seed: string | null },
  now: number,
): GGState {
  const config: GGConfig = structuredClone(baseConfig);
  const teams = config.teams.map((_, index) => blankTeam(config, index));
  const byId = new Map(teams.map((team) => [team.id, team]));
  let phase: GGPhase = "teams";
  let paused = false;
  let pausedAt: number | null = null;
  let turnStartedAt: number | null = null;
  let order: string[] = [];
  let lastDraw: GGState["last_draw"] = null;

  const clearPerson = (personId: string) => {
    for (const team of teams) {
      if (team.vice === personId) team.vice = null;
      team.recruits = team.recruits.map((id) => (id === personId ? null : id)) as [string | null, string | null];
      delete team.assign[personId];
    }
  };
  const clearMinor = (tag: string) => {
    for (const team of teams) team.picks = team.picks.map((pick) => (pick === tag ? null : pick)) as GGTeam["picks"];
  };

  for (const action of activeActions(log)) {
    const p = action.payload;
    const team = typeof p.team === "string" ? byId.get(p.team) : undefined;
    switch (action.kind) {
      case "team.set":
        if (!team) break;
        if (typeof p.name === "string") team.name = p.name;
        if (typeof p.color === "string") team.color = p.color;
        if (typeof p.approved === "boolean") team.approved = p.approved;
        break;
      case "phase.set":
        if (typeof p.phase === "string") {
          phase = p.phase as GGPhase;
          turnStartedAt = action.at;
          if (paused) pausedAt = action.at;
        }
        break;
      case "pause.set":
        if (p.on && !paused) {
          paused = true;
          pausedAt = action.at;
        } else if (!p.on && paused) {
          paused = false;
          if (turnStartedAt !== null && pausedAt !== null) turnStartedAt += action.at - pausedAt;
          pausedAt = null;
        }
        break;
      case "drum.draw":
        if (team && !order.includes(team.id)) order.push(team.id);
        if (team) lastDraw = { kind: "drum", seq: action.seq, at: action.at, team: team.id, value: String(order.length) };
        break;
      case "order.set":
        if (Array.isArray(p.order)) order = (p.order as unknown[]).filter((id): id is string => typeof id === "string" && byId.has(id));
        break;
      case "wheel.spin":
      case "major.set":
        if (!team || typeof p.tag !== "string") break;
        for (const other of teams) if (other.major === p.tag) other.major = null;
        team.major = p.tag || null;
        if (action.kind === "wheel.spin") lastDraw = { kind: "wheel", seq: action.seq, at: action.at, team: team.id, value: p.tag };
        break;
      case "vice.draw":
      case "recruit.draw":
      case "member.set": {
        if (!team || typeof p.person !== "string") break;
        const slot = action.kind === "vice.draw" ? "vice" : action.kind === "recruit.draw" ? (Number(p.slot) === 2 ? "r2" : "r1") : String(p.slot);
        if (p.person) clearPerson(p.person);
        const value = p.person || null;
        if (slot === "vice") team.vice = value;
        else if (slot === "r1") team.recruits[0] = value;
        else if (slot === "r2") team.recruits[1] = value;
        else if (slot === "captain" && value) team.captain = value;
        if (action.kind !== "member.set" && value) {
          lastDraw = { kind: action.kind === "vice.draw" ? "vice" : "recruit", seq: action.seq, at: action.at, team: team.id, value };
        }
        break;
      }
      case "person.set": {
        const person = p.person as GGPerson | undefined;
        if (!person || typeof person.id !== "string") break;
        const replaces = typeof p.replaces === "string" ? p.replaces : null;
        const at = config.people.findIndex((entry) => entry.id === (replaces ?? person.id));
        if (at >= 0) config.people[at] = person;
        else config.people.push(person);
        if (replaces && replaces !== person.id) {
          for (const t of teams) {
            if (t.captain === replaces) t.captain = person.id;
            if (t.vice === replaces) t.vice = person.id;
            t.recruits = t.recruits.map((id) => (id === replaces ? person.id : id)) as [string | null, string | null];
            if (t.assign[replaces]) {
              t.assign[person.id] = t.assign[replaces];
              delete t.assign[replaces];
            }
          }
        }
        break;
      }
      case "ban.set":
        if (!team || typeof p.tag !== "string") break;
        if (p.tag) for (const other of teams) if (other !== team && other.ban === p.tag) other.ban = null;
        team.ban = p.tag;
        if (p.tag) clearMinor(p.tag);
        turnStartedAt = action.at;
        break;
      case "pick.set": {
        const round = Number(p.round);
        if (!team || typeof p.tag !== "string" || round < 1 || round > 3) break;
        if (p.tag) clearMinor(p.tag);
        team.picks[round - 1] = p.tag || null;
        turnStartedAt = action.at;
        break;
      }
      case "assign.set":
        if (!team || typeof p.person !== "string" || typeof p.tag !== "string") break;
        if (p.tag) {
          for (const [person, tag] of Object.entries(team.assign)) if (tag === p.tag) delete team.assign[person];
          team.assign[p.person] = p.tag;
        } else delete team.assign[p.person];
        break;
      case "assign.auto":
        for (const placement of (p.placements as { team: string; person: string; tag: string }[]) ?? []) {
          const target = byId.get(placement.team);
          if (target) target.assign[placement.person] = placement.tag;
        }
        break;
      case "config.set":
        if (Array.isArray(p.majors)) config.majors = p.majors as string[];
        if (p.timers && typeof p.timers === "object") config.timers = { ...config.timers, ...(p.timers as GGConfig["timers"]) };
        if (p.on_timeout && typeof p.on_timeout === "object") {
          config.on_timeout = { ...config.on_timeout, ...(p.on_timeout as GGConfig["on_timeout"]) };
        }
        break;
      default:
        break;
    }
  }

  const turn = currentTurn(config, phase, teams, order, turnStartedAt, paused ? pausedAt : null);
  return {
    slug,
    config,
    phase,
    paused,
    teams,
    order,
    turn,
    phase_done: phaseDone(phase, teams, order),
    last_draw: lastDraw,
    log,
    fairness,
    now,
  };
}

export function currentTurn(
  config: GGConfig,
  phase: GGPhase,
  teams: GGTeam[],
  order: string[],
  startedAt: number | null,
  pausedAt: number | null,
): GGTurn & { paused_at?: number | null } {
  const timed = TIMED[phase];
  const base = {
    phase,
    team: null as string | null,
    started_at: timed ? startedAt : null,
    seconds: timed ? config.timers[timed] : null,
    paused_at: pausedAt,
  };
  const byId = new Map(teams.map((team) => [team.id, team]));
  switch (phase) {
    case "wheel": {
      const next = order.map((id) => byId.get(id)).find((team) => team && !team.major);
      return { ...base, team: next?.id ?? null };
    }
    case "vice": {
      const next = strengthOrder(teams, config.majors).find((team) => !team.vice);
      return { ...base, team: next?.id ?? null };
    }
    case "recruits": {
      const strong = strengthOrder(teams, config.majors);
      for (const slot of [0, 1]) {
        const next = strong.find((team) => !team.recruits[slot]);
        if (next) return { ...base, team: next.id, slot: slot + 1 };
      }
      return base;
    }
    case "bans": {
      const next = strengthOrder(teams, config.majors).find((team) => team.ban === null);
      return { ...base, team: next?.id ?? null };
    }
    case "draft": {
      const next = draftOrder(teams, config.majors).find((slot) => !byId.get(slot.team)?.picks[slot.round - 1]);
      return next ? { ...base, team: next.team, pick: next.pick, round: next.round } : base;
    }
    default:
      return base;
  }
}

export function phaseDone(phase: GGPhase, teams: GGTeam[], order: string[]): boolean {
  switch (phase) {
    case "teams":
      return teams.every((team) => team.approved);
    case "drum":
      return order.length === teams.length;
    case "wheel":
      return teams.every((team) => team.major);
    case "vice":
      return teams.every((team) => team.vice);
    case "recruits":
      return teams.every((team) => team.recruits.every(Boolean));
    case "bans":
      return teams.every((team) => team.ban !== null);
    case "draft":
      return teams.every((team) => team.picks.every(Boolean));
    case "assign":
      return teams.every((team) => membersOf(team).every((id) => team.assign[id]));
    default:
      return true;
  }
}

/** When the current turn's clock runs out (epoch ms), or null when untimed / not started. */
export function turnDeadline(state: Pick<GGState, "turn">): number | null {
  const { started_at, seconds } = state.turn;
  return started_at !== null && seconds !== null ? started_at + seconds * 1000 : null;
}

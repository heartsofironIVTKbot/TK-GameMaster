import { nameOf } from "./engine";
import type { GGPhase, GGState } from "./model";

/**
 * What the public front page (/greatgame) may show about an event. The draft
 * room is private (the roster watches it there, everyone else on the
 * streams), so before the teams lock this is only the event's shape: the step
 * it's on, the majors, how many players, the fairness fingerprint. Team names,
 * players and nations come out once the teams are locked (the final lobby).
 */

export interface GGPublicTeam {
  name: string;
  color: string;
  major: string | null;
  nations: string[];
  players: { name: string; role: "Captain" | "Vice-captain" | "Recruit"; nation: string | null }[];
}

export interface GGPublic {
  slug: string;
  title: string;
  phase: GGPhase;
  phaseDone: boolean;
  paused: boolean;
  /** Whether anything has happened yet. */
  started: boolean;
  /** The majors, strongest first, with their display names. */
  majors: { tag: string; name: string }[];
  names: Record<string, string>;
  counts: { teams: number; captains: number; vices: number; recruits: number; casters: number; minors: number };
  fairness: { commit: string; seed: string | null };
  /** Only once the teams are locked. */
  teams: GGPublicTeam[] | null;
}

export function publicView(state: GGState): GGPublic {
  const { config } = state;
  const count = (role: string) => config.people.filter((person) => person.role === role).length;
  const nameOfPerson = (id: string | null) => config.people.find((person) => person.id === id)?.name ?? "To be announced";
  const locked = state.phase === "locked";
  const names: Record<string, string> = {};
  for (const tag of config.majors) names[tag] = nameOf(config, tag);
  const teams = locked
    ? state.teams.map((team): GGPublicTeam => {
        const nations = [team.major, ...team.picks].filter((tag): tag is string => Boolean(tag));
        for (const tag of nations) names[tag] = nameOf(config, tag);
        const roles: GGPublicTeam["players"][number]["role"][] = ["Captain", "Vice-captain", "Recruit", "Recruit"];
        return {
          name: team.name,
          color: team.color,
          major: team.major,
          nations,
          players: [team.captain, team.vice, ...team.recruits].map((id, i) => ({ name: nameOfPerson(id), role: roles[i], nation: id ? (team.assign[id] ?? null) : null })),
        };
      })
    : null;
  return {
    slug: state.slug,
    title: config.title,
    phase: state.phase,
    phaseDone: state.phase_done,
    paused: state.paused,
    started: state.log.length > 0,
    majors: config.majors.map((tag) => ({ tag, name: nameOf(config, tag) })),
    names,
    counts: {
      teams: state.teams.length,
      captains: count("captain"),
      vices: count("vice"),
      recruits: count("recruit"),
      casters: count("caster"),
      minors: config.pool.length,
    },
    fairness: state.fairness,
    teams,
  };
}

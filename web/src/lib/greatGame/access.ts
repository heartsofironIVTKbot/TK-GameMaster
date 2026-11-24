import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import { isSystemAdmin } from "@/lib/systemAdmin";
import type { GGActor } from "./decide";
import { DEMO_ORGANIZER } from "./demo";
import type { GGPerson, GGRole, GGState } from "./model";

/**
 * Who is looking at a Great Game event. The page is private: only the people
 * on the event's roster (captains, vice-captains, recruits, casters,
 * organizers) and GameMaster's owners get in; everyone else watches the
 * streams. Organizers are the roster's organizers plus GameMaster's owners.
 *
 * Preview mode: you are the demo organizer, or whoever the "gg_as" cookie
 * names ("Act as" on the page), to try every role locally.
 */

export interface GGViewer {
  id: string;
  name: string;
  role: GGRole | "admin";
  organizer: boolean;
  captainOf: string | null;
  /** The team this person plays on (any slot), if any. */
  teamOf: string | null;
}

export type ViewerResult = { ok: true; viewer: GGViewer } | { ok: false; status: 401 | 403; error: string };

export async function viewerFor(state: GGState): Promise<ViewerResult> {
  let id: string | null = null;
  let fallbackName = "";
  if (isSchedulerDemo()) {
    const jar = await cookies();
    id = jar.get("gg_as")?.value || DEMO_ORGANIZER;
  } else {
    const session = await getSession().catch(() => null);
    if (!session) return { ok: false, status: 401, error: "Log in with Discord to open the Great Game draft." };
    id = session.discord_id;
    fallbackName = session.ingame_nickname || session.username;
  }
  const person: GGPerson | undefined = state.config.people.find((entry) => entry.id === id);
  const admin = !isSchedulerDemo() && (await isSystemAdmin(id));
  if (!person && !admin) {
    return { ok: false, status: 403, error: "This draft is private to the players, casters and organizers. Watch it live on the streams." };
  }
  const captainOf = state.teams.find((team) => team.captain === id)?.id ?? null;
  const teamOf = state.teams.find((team) => [team.captain, team.vice, ...team.recruits].includes(id))?.id ?? null;
  return {
    ok: true,
    viewer: {
      id,
      name: person?.name ?? fallbackName,
      role: person?.role ?? "admin",
      organizer: person?.role === "organizer" || person?.organizer === true || admin,
      captainOf,
      teamOf,
    },
  };
}

export function actorOf(viewer: GGViewer): GGActor {
  return { id: viewer.id, organizer: viewer.organizer, captainOf: viewer.captainOf, teamOf: viewer.teamOf };
}

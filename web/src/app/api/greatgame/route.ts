import { getSession } from "@/lib/session";
import { isSystemAdmin } from "@/lib/systemAdmin";
import type { GGConfig, GGPerson } from "@/lib/greatGame/model";
import { R56_MAJORS, R56_NAMES, R56_POOL } from "@/lib/greatGame/road56";
import { createEvent, SLUG_RE } from "@/lib/greatGame/store";

/**
 * POST /api/greatgame: create a Great Game event (GameMaster's owners only).
 *
 *   {slug: "gg2026", title?: "Great Game 2026",
 *    people: [{id, name, role: organizer|captain|vice|recruit|caster, channel?, organizer?}]}
 *
 * organizer: true on a player makes them an organizer too (they can't fix
 * their own team: decide.ts).
 *
 * Needs exactly 7 captains (one team each, in the order given), 7
 * vice-captains (a missing one can be a filler: id "filler:<name>") and 14
 * recruits. Road to 56 majors and pool, 90 s bans and picks, a 10-minute
 * assignment window that places everyone left at random. Answers with the
 * fairness code to post in the announcement.
 */
export async function POST(request: Request) {
  const session = await getSession().catch(() => null);
  if (!session || !(await isSystemAdmin(session.discord_id))) return Response.json({ error: "Only GameMaster's owners can create an event." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { slug?: unknown; title?: unknown; people?: unknown } | null;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  if (!SLUG_RE.test(slug)) return Response.json({ error: "slug: 2-40 lower-case letters, digits or dashes." }, { status: 400 });
  const raw = Array.isArray(body?.people) ? body.people : [];
  const people: GGPerson[] = [];
  const seen = new Set<string>();
  for (const entry of raw as Record<string, unknown>[]) {
    const id = String(entry?.id ?? "").trim();
    const name = String(entry?.name ?? "").trim();
    const role = String(entry?.role ?? "");
    if (!/^(\d{15,25}|filler:\w+)$/.test(id) || !name || !["organizer", "captain", "vice", "recruit", "caster"].includes(role)) {
      return Response.json({ error: `Bad roster entry: ${JSON.stringify(entry).slice(0, 120)}` }, { status: 400 });
    }
    if (seen.has(id)) return Response.json({ error: `${name} (${id}) is on the roster twice.` }, { status: 400 });
    seen.add(id);
    people.push({
      id,
      name: name.slice(0, 40),
      role: role as GGPerson["role"],
      channel: typeof entry.channel === "string" && entry.channel ? entry.channel.slice(0, 200) : null,
      filler: id.startsWith("filler:"),
      ...(entry.organizer === true && role !== "organizer" ? { organizer: true } : {}),
    });
  }
  const count = (role: GGPerson["role"]) => people.filter((person) => person.role === role).length;
  if (count("captain") !== 7 || count("vice") !== 7 || count("recruit") !== 14) {
    return Response.json(
      { error: `Need 7 captains, 7 vice-captains and 14 recruits (got ${count("captain")}, ${count("vice")}, ${count("recruit")}).` },
      { status: 400 },
    );
  }
  const config: GGConfig = {
    title: typeof body?.title === "string" && body.title.trim() ? body.title.trim().slice(0, 60) : "Great Game 2026",
    majors: [...R56_MAJORS],
    pool: [...R56_POOL],
    names: { ...R56_NAMES },
    people,
    teams: people.filter((person) => person.role === "captain").map((person, index) => ({ id: `t${index + 1}`, captain_id: person.id })),
    timers: { ban: 90, pick: 90, assign: 600 },
    on_timeout: { ban: "wait", pick: "wait", assign: "random" },
  };
  try {
    const { commit } = await createEvent(slug, config);
    return Response.json({ slug, commit, url: `/greatgame/${slug}` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't create the event." }, { status: 409 });
  }
}

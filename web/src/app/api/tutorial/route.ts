import type { NextRequest } from "next/server";
import { cleanProgress } from "@/components/tutorial/progress";
import { TOUR_IDS } from "@/components/tutorial/tours";
import { getSession } from "@/lib/session";
import { isSchedulerDemo } from "@/lib/scheduleStore";
import { readTutorial, writeTutorial } from "@/lib/tutorialStore";

/**
 * Guided tour progress for the logged-in account (docs/tutorial.md).
 *
 * GET  → { loggedIn, progress: { autoStart, tours } | null }
 * POST { autoStart, tours } → { ok }
 *
 * Logged out (or preview mode) the browser keeps progress itself.
 */

const MAX_BODY = 16_000;

export async function GET() {
  const session = await getSession();
  if (!session || isSchedulerDemo()) return Response.json({ loggedIn: false, progress: null });
  try {
    const stored = await readTutorial(session.discord_id);
    return Response.json({ loggedIn: true, progress: stored ? cleanProgress(stored, TOUR_IDS) : null });
  } catch (error) {
    console.error("[tutorial] read failed:", error);
    return Response.json({ loggedIn: true, progress: null });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Log in with Discord first." }, { status: 401 });
  if (isSchedulerDemo()) return Response.json({ ok: true });

  const text = await request.text();
  if (text.length > MAX_BODY) return Response.json({ error: "Too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const progress = cleanProgress(body, TOUR_IDS);
  try {
    await writeTutorial(session.discord_id, progress.autoStart, progress.tours);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[tutorial] save failed:", error);
    return Response.json({ error: "Couldn't save right now." }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

/**
 * POST /api/auth/logout
 *
 * Log out of this browser (the site menu's Log out button), then back to the
 * map. A login otherwise lasts 400 days from the last visit (lib/session.ts).
 */
export async function POST(request: NextRequest) {
  await destroySession();
  return NextResponse.redirect(new URL("/", request.url), 303);
}

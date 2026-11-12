import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { sitePage } from "@/lib/sitePage";

/**
 * POST /api/auth/logout
 *
 * Log out of this browser (the site menu's Log out button), then back to the
 * front page, at the public address (behind Render, request.url is
 * localhost). A login otherwise lasts 400 days from the last visit
 * (lib/session.ts).
 */
export async function POST(request: NextRequest) {
  await destroySession();
  return NextResponse.redirect(sitePage("/", request), 303);
}

/**
 * Going from game setup to the preset pages and back (2026-11-11).
 *
 * The setup page's preset links carry `?back=<the setup page's address>`;
 * the preset pages' back buttons and "Use in the game" return there with
 * `resume=1` (the setup page restores the half-filled game from the browser
 * tab, GameSetupApp) and, after picking or saving one, `preset=<id>`.
 * Only addresses inside game setup are accepted, so a link can't send
 * anyone off the site. Client-safe.
 */

const ALLOWED = /^\/schedule\/(new|edit)(\?[^#]*)?$/;

/** The `back` value if it's a game setup address, else null. */
export function safeBack(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  return ALLOWED.test(value) ? value : null;
}

/** `href` with `back` added (for links out of game setup). */
export function withBack(href: string, back: string | null): string {
  if (!back) return href;
  const [path, query = ""] = href.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("back", back);
  return `${path}?${params.toString()}`;
}

/** The setup page to return to: its own address plus resume=1, and the picked preset. */
export function backToGame(back: string, presetId?: string | null): string {
  const [path, query = ""] = back.split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("back");
  params.delete("preset");
  params.set("resume", "1");
  if (presetId) params.set("preset", presetId);
  return `${path}?${params.toString()}`;
}

/** This setup page's own address (without resume/preset), for links out of it. */
export function setupAddress(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete("resume");
  params.delete("preset");
  params.delete("back");
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

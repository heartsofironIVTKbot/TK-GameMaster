"use client";

import { useEffect } from "react";
import { discordAppHref } from "@/lib/discordLinks";

/**
 * Links to Discord messages and channels (discord.com/channels/…) open the
 * Discord desktop app instead of a browser tab (Branko, 2026-11-11). Every
 * such link on the site is covered, wherever it comes from (the Games page's
 * post / thread, host-log "Log" links, IronLegion's authenticate channel …).
 *
 * It tries the app (discord://-/channels/…); if the browser window never
 * loses focus within a moment, the app didn't open, and the usual web link
 * opens instead. Phones and tablets already hand discord.com links to the
 * app, and Ctrl / ⌘ / middle clicks keep their meaning, so those are left as
 * they are.
 */

const APP_TIMEOUT_MS = 1500;

export default function DiscordAppLinks() {
  useEffect(() => {
    // Desktop (a mouse) only: phones open discord.com links in the app themselves.
    if (!window.matchMedia?.("(pointer: fine)").matches) return undefined;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const web = anchor.href;
      const app = discordAppHref(web);
      if (!app) return;
      event.preventDefault();
      let opened = false;
      const left = () => {
        opened = true;
      };
      window.addEventListener("blur", left, { once: true });
      document.addEventListener("visibilitychange", left, { once: true });
      window.location.href = app;
      window.setTimeout(() => {
        window.removeEventListener("blur", left);
        document.removeEventListener("visibilitychange", left);
        // No Discord app answered: the web link, as before.
        if (!opened) window.open(web, "_blank", "noopener,noreferrer");
      }, APP_TIMEOUT_MS);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

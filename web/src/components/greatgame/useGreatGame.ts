"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GGState } from "@/lib/greatGame/model";

/**
 * The Great Game page's live data: loads the event once, then follows the
 * live channel (every change arrives as the whole state). `serverNow()` is the
 * server's clock, so every page runs the same timer and the same animation
 * frame no matter how far off its own clock is.
 */

export interface GGViewerInfo {
  id: string;
  name: string;
  role: "organizer" | "captain" | "vice" | "recruit" | "caster" | "admin";
  organizer: boolean;
  captainOf: string | null;
  teamOf: string | null;
}

export type Considering = Record<string, { tag: string; by: string; at: number } | null>;

/** The vice-captain ticket being scratched by hand (see lib/greatGame/hub.ts). */
export interface GGScratch {
  seq: number;
  lines: number[][];
  done: boolean;
}

type Loaded =
  | { ok: true; state: GGState; viewer: GGViewerInfo | null; demo: boolean; avatars: Record<string, string> }
  | { ok: false; status: number; message: string };

async function fetchEvent(slug: string): Promise<Loaded> {
  try {
    const response = await fetch(`/api/greatgame/${slug}`, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { state?: GGState; viewer?: GGViewerInfo; demo?: boolean; avatars?: Record<string, string>; error?: string };
    if (!response.ok || !body.state) {
      return { ok: false, status: response.status, message: body.error ?? "The draft is unavailable right now." };
    }
    return { ok: true, state: body.state, viewer: body.viewer ?? null, demo: Boolean(body.demo), avatars: body.avatars ?? {} };
  } catch {
    return { ok: false, status: 0, message: "Can't reach GameMaster. Check your connection." };
  }
}

export function useGreatGame(slug: string) {
  const [state, setState] = useState<GGState | null>(null);
  const [viewer, setViewer] = useState<GGViewerInfo | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [considering, setConsidering] = useState<Considering>({});
  const [viewers, setViewers] = useState(0);
  const [scratch, setScratch] = useState<GGScratch | null>(null);
  /** Step 4: the face-down card the captain on the clock points at. */
  const [hover, setHover] = useState<{ team: string; card: number } | null>(null);
  const [live, setLive] = useState(false);
  const [demo, setDemo] = useState(false);
  /** Discord profile pictures by person id (missing for people GameMaster's bot hasn't seen). */
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const offset = useRef(0);

  const take = useCallback((next: GGState) => {
    offset.current = next.now - Date.now();
    setState((current) => (current && current.log.length > next.log.length && current.fairness.seed === next.fairness.seed ? current : next));
  }, []);

  const apply = useCallback(
    (loaded: Loaded) => {
      if (!loaded.ok) {
        setError({ status: loaded.status, message: loaded.message });
        return false;
      }
      setError(null);
      take(loaded.state);
      setViewer(loaded.viewer);
      setDemo(loaded.demo);
      setAvatars(loaded.avatars);
      return true;
    },
    [take],
  );

  const load = useCallback(async () => apply(await fetchEvent(slug)), [slug, apply]);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;
    void fetchEvent(slug).then((loaded) => {
      if (cancelled || !apply(loaded)) return;
      source = new EventSource(`/api/greatgame/${slug}/live`);
      source.addEventListener("open", () => setLive(true));
      source.addEventListener("error", () => setLive(false));
      source.addEventListener("state", (event) => take(JSON.parse((event as MessageEvent).data) as GGState));
      source.addEventListener("considering", (event) => setConsidering(JSON.parse((event as MessageEvent).data) as Considering));
      source.addEventListener("hover", (event) => setHover(JSON.parse((event as MessageEvent).data) as { team: string; card: number } | null));
      source.addEventListener("scratch", (event) => setScratch(JSON.parse((event as MessageEvent).data) as GGScratch));
      source.addEventListener("scratch-add", (event) => {
        const add = JSON.parse((event as MessageEvent).data) as { seq: number; line: number[] | null; done: boolean };
        setScratch((current) => {
          const base = current && current.seq === add.seq ? current : { seq: add.seq, lines: [], done: false };
          return { seq: add.seq, lines: add.line ? [...base.lines, add.line] : base.lines, done: base.done || add.done };
        });
      });
      source.addEventListener("viewers", (event) => setViewers((JSON.parse((event as MessageEvent).data) as { count: number }).count));
    });
    return () => {
      cancelled = true;
      source?.close();
    };
  }, [slug, apply, take]);

  /** Send one action. Resolves to an error message, or null when it went through. */
  const act = useCallback(
    async (body: Record<string, unknown>): Promise<string | null> => {
      try {
        const response = await fetch(`/api/greatgame/${slug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await response.json().catch(() => ({}))) as { state?: GGState; error?: string };
        if (!response.ok) return data.error ?? "That didn't go through. Try again.";
        if (data.state) take(data.state);
        return null;
      } catch {
        return "Can't reach GameMaster. Check your connection and try again.";
      }
    },
    [slug, take],
  );

  const consider = useCallback(
    (tag: string) => {
      void fetch(`/api/greatgame/${slug}/consider`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      }).catch(() => undefined);
    },
    [slug],
  );

  const reveal = useCallback(async (): Promise<string | null> => {
    const response = await fetch(`/api/greatgame/${slug}/reveal`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { state?: GGState; error?: string };
    if (!response.ok) return data.error ?? "That didn't go through.";
    if (data.state) take(data.state);
    return null;
  }, [slug, take]);

  /** One batch of strokes on the ticket of vice draw `seq`, or `done` once it's scratched clear. */
  const sendScratch = useCallback(
    (seq: number, line: number[] | null, done = false) => {
      void fetch(`/api/greatgame/${slug}/scratch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seq, line, done }),
      }).catch(() => undefined);
    },
    [slug],
  );

  /** Step 4: point at face-down card `card` (null: none); it lifts on every page. */
  const sendHover = useCallback(
    (card: number | null) => {
      void fetch(`/api/greatgame/${slug}/hover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card }),
      }).catch(() => undefined);
    },
    [slug],
  );

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  return { state, viewer, error, considering, viewers, live, demo, avatars, scratch, hover, act, consider, reveal, sendScratch, sendHover, serverNow, reload: load };
}

/** Ticks every `ms` so clocks re-render; 0 stops it (nothing on screen is counting). */
export function useTick(ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (ms <= 0) return undefined;
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

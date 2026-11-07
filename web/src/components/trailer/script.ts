/**
 * The trailer, shot by shot, locked to "Master Your Game" (Niko's Suno track,
 * 150 BPM: a beat is 0.4 s, a bar 1.6 s). Mapped by scripts/trailer/analyze.mjs:
 * intro 0-6.4, first slam 6.4, build to 14.4, main drop 14.4-24.0, stutter
 * break 24.0-27.2 (cut-outs at 24.0, 24.75, 26.15), return 27.2, last hit 32.2.
 *
 * Every claim on screen is true of GameMaster today.
 */

export const BEAT = 0.4;
export const DURATION = 32.6;
export const FPS = 30;

/** Big moments: a white flash and a shake. */
export const SLAMS = [6.4, 14.4, 27.2, 32.2];
/** Smaller hits: a shake only. */
export const HITS = [24.0, 25.2, 26.15];
/** Where the beat pumps (kick on every beat): screens and words punch on it. */
export const DROPS: [number, number][] = [
  [14.4, 24.0],
  [27.2, 32.2],
];
/** Rows of 0/1 over the picture. */
export const GLITCHES: [number, number][] = [
  [0, 0.4],
  [6.15, 6.4],
  [14.05, 14.4],
  [24.75, 25.2],
  [26.9, 27.2],
];

export type GlobeShot = "close" | "punch" | "slam" | "pullout" | "end";

export interface Shot {
  start: number;
  end: number;
  kind: "globe" | "screens" | "map" | "logo" | "word" | "end" | "black";
  /** The big lines (one per row). */
  title?: string[];
  /** A word per screen, in place of `title` (the montage). */
  words?: string[];
  sub?: string;
  /** Screens shown in turn, evenly through the shot. */
  screens?: string[];
  /** Where in each screen to look on a tall (9:16) frame, 0..1 across. */
  focus?: number;
  globe?: GlobeShot;
  /** Draw the attendance clock (time passing). */
  clock?: boolean;
}

const tour = (path: string) => `/landing/tour/${path}.webp`;

export const SHOTS: Shot[] = [
  { start: 0, end: 0.4, kind: "black" },
  // ---- Intro: the hook ----
  { start: 0.4, end: 2.0, kind: "globe", globe: "close", title: ["THE WAR ROOM", "FOR HEARTS OF IRON IV"] },
  {
    start: 2.0,
    end: 3.6,
    kind: "screens",
    screens: [tour("calendar/15")],
    title: ["COMMAND", "YOUR DISCORD."],
    sub: "Your games, your players, your server. One machine.",
    focus: 0.55,
  },
  {
    start: 3.6,
    end: 5.2,
    kind: "screens",
    screens: [tour("calendar/01"), tour("archive/06"), tour("records/02"), tour("archive/01")],
    words: ["EVERY GAME.", "EVERY NATION.", "EVERY PLAYER.", "EVERY RECORD."],
    focus: 0.45,
  },
  { start: 5.2, end: 6.4, kind: "globe", globe: "punch", title: ["ONE SYSTEM."] },
  // ---- The slam ----
  { start: 6.4, end: 8.0, kind: "logo", globe: "slam" },
  // ---- Build: one feature a bar ----
  {
    start: 8.0,
    end: 9.6,
    kind: "screens",
    screens: [tour("calendar/01"), tour("calendar/04")],
    title: ["BOOK IT."],
    sub: "One calendar for every host, in every time zone.",
    focus: 0.6,
  },
  {
    start: 9.6,
    end: 11.2,
    kind: "screens",
    screens: [tour("calendar/05"), tour("calendar/06"), tour("calendar/07"), tour("calendar/08")],
    title: ["SET IT UP."],
    sub: "Mode, preset, locks and extras, right on the real map.",
    focus: 0.82,
  },
  {
    start: 11.2,
    end: 12.8,
    kind: "screens",
    screens: [tour("calendar/11"), tour("calendar/13"), tour("calendar/14"), tour("calendar/15")],
    title: ["ANNOUNCED.", "INSTANTLY."],
    sub: "Posted, pinged and linked the minute you pick.",
    focus: 0.5,
  },
  { start: 12.8, end: 14.4, kind: "map", title: ["CLAIM YOUR", "NATION."] },
  // ---- The drop: a feature a bar, cuts on the beat ----
  { start: 14.4, end: 16.0, kind: "map", title: ["64 PLAYERS.", "ONE LIVE MAP."], sub: "Every reservation, live, for everyone watching." },
  {
    start: 16.0,
    end: 17.6,
    kind: "screens",
    screens: [tour("attendance/101"), tour("attendance/102"), tour("attendance/103"), tour("attendance/104")],
    title: ["ZERO", "ROLL CALLS."],
    sub: "Voice checked every 20 minutes. Automatically.",
    focus: 0.5,
    clock: true,
  },
  {
    start: 17.6,
    end: 19.2,
    kind: "screens",
    screens: [tour("records/02"), tour("records/33"), tour("records/44"), tour("records/45")],
    title: ["KNOW EVERY", "PLAYER."],
    sub: "Commends, warnings and bans. Every one on record.",
    focus: 0.62,
  },
  {
    start: 19.2,
    end: 20.8,
    kind: "screens",
    screens: [tour("archive/07"), tour("archive/08"), tour("archive/09"), tour("archive/10")],
    title: ["EVERY GAME.", "KEPT FOREVER."],
    sub: "Who played, who showed up, and what they earned.",
    focus: 0.5,
  },
  {
    start: 20.8,
    end: 22.4,
    kind: "screens",
    screens: [tour("presets/05"), tour("presets/04"), tour("presets/06"), tour("presets/07")],
    title: ["SET A MODE", "UP ONCE."],
    sub: "Nations, locks, rules and mods. Reused in a click.",
    focus: 0.2,
  },
  {
    start: 22.4,
    end: 24.0,
    kind: "screens",
    screens: [tour("tickets/02"), tour("audit/02"), tour("archive/14"), tour("settings/03")],
    title: ["NOTHING", "SLIPS THROUGH."],
    sub: "Tickets, a full audit log, AI write-ups, total control.",
    focus: 0.45,
  },
  // ---- The break: the stutters ----
  { start: 24.0, end: 24.75, kind: "word", title: ["FREE."] },
  { start: 24.75, end: 25.2, kind: "black" },
  { start: 25.2, end: 26.15, kind: "word", title: ["NO ADS."] },
  { start: 26.15, end: 27.2, kind: "word", title: ["BUILT FOR", "THE COMMUNITY."] },
  // ---- The return ----
  { start: 27.2, end: 28.8, kind: "globe", globe: "pullout", title: ["MASTER", "YOUR GAME."] },
  { start: 28.8, end: 32.2, kind: "end", globe: "end" },
  { start: 32.2, end: DURATION, kind: "black" },
];

/** Every picture the trailer shows (preloaded before rendering). */
export const IMAGES = [...new Set(SHOTS.flatMap((shot) => shot.screens ?? []))];

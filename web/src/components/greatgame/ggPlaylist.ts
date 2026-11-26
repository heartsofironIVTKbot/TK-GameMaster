"use client";

import { useSyncExternalStore } from "react";

/**
 * The draft room's background music: twelve tracks on rotation, and the same
 * track at the same moment for everyone (the playlist runs on the server's
 * clock from a fixed start, like the turn clocks), so the casters' stream and
 * the players hear the same thing. Its own on/off and volume, remembered in
 * the browser; it only plays while the room's sound is on.
 *
 * Files: public/greatgame/music/*.m4a (loudness-matched AAC).
 */

export interface Track {
  title: string;
  src: string;
  /** Seconds. */
  duration: number;
}

/** The rotation. The Drum Turns opens it and comes back every fourth track. */
export const PLAYLIST: Track[] = [
  { title: "Track 1", src: "/greatgame/music/01-the-drum-turns.m4a", duration: 196.4 },
  { title: "Track 2", src: "/greatgame/music/02-neon-mobilization.m4a", duration: 193.6 },
  { title: "Track 3", src: "/greatgame/music/03-track-1.m4a", duration: 172.4 },
  { title: "Track 4", src: "/greatgame/music/04-time-ticking.m4a", duration: 180.0 },
  { title: "Track 5", src: "/greatgame/music/05-the-drum-turns-2.m4a", duration: 187.9 },
  { title: "Track 6", src: "/greatgame/music/06-track-2.m4a", duration: 183.4 },
  { title: "Track 7", src: "/greatgame/music/07-break-through.m4a", duration: 257.5 },
  { title: "Track 8", src: "/greatgame/music/08-neon-mobilization-2.m4a", duration: 199.2 },
  { title: "Track 9", src: "/greatgame/music/09-the-drum-turns-3.m4a", duration: 183.6 },
  { title: "Track 10", src: "/greatgame/music/10-aggressive.m4a", duration: 193.6 },
  { title: "Track 11", src: "/greatgame/music/11-track-7.m4a", duration: 192.4 },
  { title: "Track 12", src: "/greatgame/music/12-take-the-ground.m4a", duration: 222.9 },
];

const CYCLE = PLAYLIST.reduce((sum, track) => sum + track.duration, 0);
/** The rotation's fixed start (any shared instant works: every page counts from it). */
const EPOCH = Date.UTC(2026, 0, 1);

/** Seconds into the rotation where track `index` starts. */
export function startOf(index: number): number {
  return PLAYLIST.slice(0, index).reduce((sum, track) => sum + track.duration, 0);
}

/** Seconds into the rotation at `now` (server time, ms). */
export function rotationAt(now: number): number {
  return (((now - EPOCH) / 1000) % CYCLE + CYCLE) % CYCLE;
}

/** Which track plays at `now` (server time, ms) and how far into it (seconds). */
export function nowPlaying(now: number): { index: number; offset: number } {
  let t = rotationAt(now);
  for (let index = 0; index < PLAYLIST.length; index++) {
    if (t < PLAYLIST[index].duration) return { index, offset: t };
    t -= PLAYLIST[index].duration;
  }
  return { index: 0, offset: 0 };
}

// ---------- The switch and the volume (remembered) ----------

const ON_KEY = "gg-music";
const VOLUME_KEY = "gg-music-volume";
const listeners = new Set<() => void>();
let on = true;
let volume = 0.35;
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    on = window.localStorage.getItem(ON_KEY) !== "off";
    const saved = window.localStorage.getItem(VOLUME_KEY);
    if (saved !== null && Number.isFinite(Number(saved))) volume = Math.max(0, Math.min(1, Number(saved)));
  } catch {
    // Storage blocked: the defaults stand.
  }
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

export function setMusic(value: boolean) {
  on = value;
  try {
    window.localStorage.setItem(ON_KEY, value ? "on" : "off");
  } catch {
    // Not remembered, still applied.
  }
  emit();
}

export function setMusicVolume(value: number) {
  volume = Math.max(0, Math.min(1, value));
  try {
    window.localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Not remembered, still applied.
  }
  emit();
}

export function useMusic(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => (load(), on), () => true);
  return [value, setMusic];
}

export function useMusicVolume(): [number, (value: number) => void] {
  const value = useSyncExternalStore(subscribe, () => (load(), volume), () => 0.35);
  return [value, setMusicVolume];
}

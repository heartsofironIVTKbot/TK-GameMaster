"use client";

import { useSyncExternalStore } from "react";

/**
 * The draft room's sounds, made in the browser (Web Audio): the air in the
 * lottery machine, balls clacking on each other and tinking on the glass, the
 * catch, the suck up the tube, the roll, the reel's ticks and its bell. Every
 * sound is a small function, so a sound designer's files can replace them one
 * by one later.
 *
 * Per viewer and remembered in this browser: a switch (on by default) and a
 * volume for the effects (100% by default, so a streamer can turn them down
 * without losing them). Browsers only start audio after a click or key press
 * on the page, so sound begins with the viewer's first interaction.
 */

const STORAGE_KEY = "gg-sound";
const VOLUME_KEY = "gg-sound-volume";
const MASTER = 0.55;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = readEnabled();
let volume = readVolume();
const listeners = new Set<() => void>();

function readVolume(): number {
  if (typeof window === "undefined") return 1;
  try {
    const saved = Number(window.localStorage.getItem(VOLUME_KEY));
    return window.localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 1;
  } catch {
    return 1;
  }
}

function readEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === "undefined" || !enabled) return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = MASTER * volume;
    master.connect(context.destination);
    // Two seconds of white noise, reused by every noisy sound.
    noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (context.state === "suspended") return null;
  return { ctx: context, out: master! };
}

/** Wake the audio on the viewer's first click or key press. */
if (typeof window !== "undefined") {
  const wake = () => {
    if (!enabled) return;
    audio();
    void context?.resume();
  };
  window.addEventListener("pointerdown", wake, { capture: true });
  window.addEventListener("keydown", wake, { capture: true });
}

export function soundOn(): boolean {
  return enabled;
}

export function setSound(on: boolean) {
  enabled = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Private window: the choice lasts for this visit.
  }
  if (on) void context?.resume();
  else void context?.suspend();
  for (const listener of listeners) listener();
}

/** Effects volume, 0..1 (1 is the default level). */
export function setVolume(value: number) {
  volume = Math.max(0, Math.min(1, value));
  try {
    window.localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Private window: the choice lasts for this visit.
  }
  if (context && master) master.gain.setTargetAtTime(MASTER * volume, context.currentTime, 0.03);
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The switch's state, for a button. */
export function useSoundSwitch(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, () => enabled, () => true);
  return [on, setSound];
}

/** The effects volume, for a slider. */
export function useSoundVolume(): [number, (value: number) => void] {
  const value = useSyncExternalStore(subscribe, () => volume, () => 1);
  return [value, setVolume];
}

function panned(ctx: AudioContext, out: AudioNode, pan: number): AudioNode {
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(out);
  return panner;
}

function noiseSource(ctx: AudioContext): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  source.loopStart = Math.random();
  return source;
}

/**
 * A lottery ball hitting another: solid, dense rubbery plastic. A low body
 * with only a slight drop in pitch (a big drop sounded hollow), a mid layer
 * for weight, a muffled knock and a tiny contact click. Soft attack, short.
 */
export function clack(strength: number, pan = 0) {
  const a = audio();
  if (!a) return;
  const { ctx, out } = a;
  const t = ctx.currentTime;
  const level = Math.min(1, strength) * 0.32;
  if (level < 0.015) return;
  const dest = panned(ctx, out, pan);
  const pitch = 230 + Math.random() * 70;
  for (const [ratio, share, decay] of [
    [1, 0.9, 0.055],
    [2.1, 0.4, 0.03],
  ]) {
    const tone = ctx.createOscillator();
    tone.type = "sine";
    tone.frequency.setValueAtTime(pitch * ratio, t);
    tone.frequency.exponentialRampToValueAtTime(pitch * ratio * 0.82, t + decay);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level * share, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay + 0.015);
    tone.connect(gain).connect(dest);
    tone.start(t);
    tone.stop(t + decay + 0.025);
  }
  const knock = noiseSource(ctx);
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 1800;
  low.Q.value = 0.5;
  const knockGain = ctx.createGain();
  knockGain.gain.setValueAtTime(0.0001, t);
  knockGain.gain.exponentialRampToValueAtTime(level * 0.7, t + 0.002);
  knockGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
  knock.connect(low).connect(knockGain).connect(dest);
  knock.start(t);
  knock.stop(t + 0.03);
  const contact = noiseSource(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2600;
  band.Q.value = 1.5;
  const contactGain = ctx.createGain();
  contactGain.gain.setValueAtTime(level * 0.25, t);
  contactGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.008);
  contact.connect(band).connect(contactGain).connect(dest);
  contact.start(t);
  contact.stop(t + 0.012);
}

/**
 * A ball bumping the thick glass dome: mostly a dull thud and a soft knock,
 * with only a faint touch of glass ring.
 */
export function tink(strength: number, pan = 0) {
  const a = audio();
  if (!a) return;
  const { ctx, out } = a;
  const t = ctx.currentTime;
  const level = Math.min(1, strength) * 0.24;
  if (level < 0.012) return;
  const dest = panned(ctx, out, pan);
  const thud = ctx.createOscillator();
  thud.type = "sine";
  thud.frequency.setValueAtTime(190 + Math.random() * 40, t);
  thud.frequency.exponentialRampToValueAtTime(105, t + 0.09);
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.0001, t);
  thudGain.gain.exponentialRampToValueAtTime(level, t + 0.005);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  thud.connect(thudGain).connect(dest);
  thud.start(t);
  thud.stop(t + 0.12);
  const knock = noiseSource(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 850;
  band.Q.value = 1;
  const knockGain = ctx.createGain();
  knockGain.gain.setValueAtTime(0.0001, t);
  knockGain.gain.exponentialRampToValueAtTime(level * 0.5, t + 0.003);
  knockGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
  knock.connect(band).connect(knockGain).connect(dest);
  knock.start(t);
  knock.stop(t + 0.045);
  for (const freq of [2300 + Math.random() * 300, 3600 + Math.random() * 400]) {
    const ring = ctx.createOscillator();
    ring.type = "sine";
    ring.frequency.value = freq;
    const ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(level * 0.05, t);
    ringGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    ring.connect(ringGain).connect(dest);
    ring.start(t);
    ring.stop(t + 0.16);
  }
}

/** The blower: a continuous rush of air; `level` 0..1 (0 = idle, 1 = full surge). Call every frame. */
let air: { gain: GainNode; band: BiquadFilterNode; rumble: GainNode; stop: () => void } | null = null;
export function airLevel(level: number | null) {
  const a = audio();
  if (!a || level === null) {
    if (air && (level === null || !a)) {
      air.stop();
      air = null;
    }
    return;
  }
  const { ctx, out } = a;
  if (!air) {
    const hiss = noiseSource(ctx);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    hiss.connect(band).connect(gain).connect(out);
    const low = noiseSource(ctx);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 180;
    const rumble = ctx.createGain();
    rumble.gain.value = 0;
    low.connect(lowpass).connect(rumble).connect(out);
    hiss.start();
    low.start();
    air = {
      gain,
      band,
      rumble,
      stop: () => {
        const t = ctx.currentTime;
        gain.gain.setTargetAtTime(0, t, 0.1);
        rumble.gain.setTargetAtTime(0, t, 0.1);
        hiss.stop(t + 0.6);
        low.stop(t + 0.6);
      },
    };
  }
  const t = ctx.currentTime;
  air.gain.gain.setTargetAtTime(0.9 * (0.05 + 0.13 * level), t, 0.08);
  air.band.frequency.setTargetAtTime(700 + 1500 * level, t, 0.08);
  air.rumble.gain.setTargetAtTime(0.9 * (0.18 + 0.32 * level), t, 0.08);
}

/** The catch: a soft thunk as the ball seats in the collar. */
export function thunk(pan = 0) {
  const a = audio();
  if (!a) return;
  const { ctx, out } = a;
  const t = ctx.currentTime;
  const dest = panned(ctx, out, pan);
  const tone = ctx.createOscillator();
  tone.type = "sine";
  tone.frequency.setValueAtTime(190, t);
  tone.frequency.exponentialRampToValueAtTime(70, t + 0.14);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  tone.connect(gain).connect(dest);
  tone.start(t);
  tone.stop(t + 0.22);
  clack(0.9, pan);
}

/** Sucked up the tube: a rising whoosh. */
export function whoosh(seconds = 0.45, pan = 0) {
  const a = audio();
  if (!a) return;
  const { ctx, out } = a;
  const t = ctx.currentTime;
  const source = noiseSource(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(300, t);
  band.frequency.exponentialRampToValueAtTime(3200, t + seconds);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35, t + seconds * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.15);
  source.connect(band).connect(gain).connect(panned(ctx, out, pan));
  source.start(t);
  source.stop(t + seconds + 0.2);
}

/** Rolling along the tube: a low rumble that slows and fades over `seconds`, panned from right to left. */
export function roll(seconds: number) {
  const a = audio();
  if (!a) return;
  const { ctx, out } = a;
  const t = ctx.currentTime;
  const source = noiseSource(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 380;
  band.Q.value = 2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.4, t + 0.06);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  // The rolling flutter: amplitude wobble that slows down with the ball.
  const wobble = ctx.createOscillator();
  wobble.frequency.setValueAtTime(26, t);
  wobble.frequency.exponentialRampToValueAtTime(5, t + seconds);
  const depth = ctx.createGain();
  depth.gain.value = 0.15;
  wobble.connect(depth).connect(gain.gain);
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(0.5, t);
  panner.pan.linearRampToValueAtTime(-0.6, t + seconds);
  source.connect(band).connect(gain).connect(panner).connect(out);
  source.start(t);
  source.stop(t + seconds + 0.05);
  wobble.start(t);
  wobble.stop(t + seconds + 0.05);
}

/** The reel: one card passing the window. */
export function tick(strength = 1) {
  const a = audio();
  if (!a) return;
  const { ctx, out } = a;
  const t = ctx.currentTime;
  const tone = ctx.createOscillator();
  tone.type = "square";
  tone.frequency.value = 1500 + Math.random() * 120;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.09 * Math.min(1, strength), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  tone.connect(band).connect(gain).connect(out);
  tone.start(t);
  tone.stop(t + 0.03);
}

/** The reel lands: a bright two-note bell. */
export function bell() {
  const a = audio();
  if (!a) return;
  const { ctx, out } = a;
  const t = ctx.currentTime;
  [
    [880, 0],
    [1318.5, 0.09],
    [1760, 0.09],
  ].forEach(([freq, delay]) => {
    const tone = ctx.createOscillator();
    tone.type = "sine";
    tone.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.22, t + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 1.1);
    tone.connect(gain).connect(out);
    tone.start(t + delay);
    tone.stop(t + delay + 1.2);
  });
}

/**
 * The Casino's paper-scratch loop while a ticket is being scratched: call it
 * on every stroke (local or arriving live); it stops on its own a moment
 * after the last one.
 */
let scratchLoop: HTMLAudioElement | null = null;
let scratchStop: number | null = null;
export function scratching() {
  if (typeof window === "undefined" || !enabled) return;
  if (!scratchLoop) {
    scratchLoop = new Audio("/greatgame-scratching.mp3");
    scratchLoop.loop = true;
  }
  scratchLoop.volume = Math.min(1, 0.55 * volume);
  if (scratchLoop.paused) void scratchLoop.play().catch(() => undefined);
  if (scratchStop !== null) window.clearTimeout(scratchStop);
  scratchStop = window.setTimeout(() => {
    scratchLoop?.pause();
    scratchStop = null;
  }, 220);
}

/** A ban: a heavy rubber stamp coming down (a low thump and a slap). */
export function stamp() {
  const a = audio();
  if (!a) return;
  const { ctx, out } = a;
  const t = ctx.currentTime;
  const boom = ctx.createOscillator();
  boom.type = "sine";
  boom.frequency.setValueAtTime(120, t);
  boom.frequency.exponentialRampToValueAtTime(42, t + 0.25);
  const boomGain = ctx.createGain();
  boomGain.gain.setValueAtTime(0.0001, t);
  boomGain.gain.exponentialRampToValueAtTime(0.9, t + 0.008);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  boom.connect(boomGain).connect(out);
  boom.start(t);
  boom.stop(t + 0.42);
  const slap = noiseSource(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1400;
  band.Q.value = 0.8;
  const slapGain = ctx.createGain();
  slapGain.gain.setValueAtTime(0.0001, t);
  slapGain.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
  slapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  slap.connect(band).connect(slapGain).connect(out);
  slap.start(t);
  slap.stop(t + 0.14);
}

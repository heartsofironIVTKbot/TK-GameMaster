// An original phonk beat for the trailer, synthesized from scratch (no samples,
// so it's entirely GameMaster's): a pitched 808 cowbell riff, distorted 808
// bass with slides, kick, half-time clap, rolling hi-hats, risers, impacts and
// a tape stop. Arranged to the trailer: hit, build, drop, variation, break, slam.
//
//   node scripts/trailer/phonk.mjs drift    -> scripts/trailer/out/beat-drift.wav (+ .json beat map)
//   node scripts/trailer/phonk.mjs memphis  -> scripts/trailer/out/beat-memphis.wav
//
// The .json beat map (every kick, clap and section start, in seconds) is what
// the trailer's cuts are timed to.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");

// ---- The two versions. --------------------------------------------------------

const VARIANTS = {
  drift: {
    bpm: 150,
    root: 61, // C#
    // Bars per section: hit + riff alone, build, drop, drop 2, break, slam.
    sections: { intro: 2, build: 2, drop: 8, drop2: 4, break: 1, end: 2 },
    // The cowbell riff: two bars of 16ths, [step, semitones above the root's octave 5].
    riff: [
      [0, 12], [3, 12], [6, 15], [8, 12], [10, 10], [11, 12], [14, 7],
      [16, 12], [19, 12], [22, 15], [24, 17], [26, 15], [28, 14], [30, 10],
    ],
    // The second drop's riff: up, busier.
    riff2: [
      [0, 19], [2, 17], [3, 15], [6, 15], [8, 12], [10, 15], [11, 17], [14, 19],
      [16, 19], [18, 22], [19, 19], [22, 17], [24, 15], [26, 12], [28, 14], [30, 15],
    ],
    // 808: [step, semitones above root - 24, length in steps, slide to (or null)].
    bass: [
      [0, 0, 6, null], [7, 0, 3, null], [10, 3, 4, 0], [14, -5, 2, null],
      [16, -4, 6, null], [22, -4, 3, null], [26, -2, 4, null], [30, 0, 2, null],
    ],
    kicks: [0, 7, 10, 16, 22, 26],
    drive: 4.5,
  },
  memphis: {
    bpm: 130,
    root: 65, // F
    sections: { intro: 2, build: 2, drop: 4, drop2: 4, break: 1, end: 2 },
    riff: [
      [0, 12], [2, 12], [4, 11], [6, 12], [8, 15], [11, 13], [12, 12], [14, 8],
      [16, 12], [18, 12], [20, 11], [22, 12], [24, 7], [27, 8], [28, 11], [30, 12],
    ],
    riff2: [
      [0, 24], [3, 24], [4, 23], [6, 20], [8, 19], [10, 20], [12, 23], [14, 24],
      [16, 27], [19, 24], [20, 23], [22, 20], [24, 19], [26, 20], [28, 23], [30, 19],
    ],
    bass: [
      [0, 0, 7, null], [8, 0, 2, null], [10, -1, 4, 0], [14, 3, 2, null],
      [16, -4, 7, null], [24, -4, 2, null], [26, -5, 4, -4], [30, -2, 2, null],
    ],
    kicks: [0, 8, 10, 16, 24, 26],
    drive: 6,
  },
};

// ---- Small DSP kit. -------------------------------------------------------------

let seed = 0x9e3779b9;
function rand() {
  // mulberry32: the same beat every run.
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const noise = () => rand() * 2 - 1;
const mtof = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** A biquad (RBJ cookbook): lowpass, highpass or bandpass; `set` can move it while running. */
function biquad(type, freq, q = 0.707) {
  let b0, b1, b2, a1, a2;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (f, qq = q) => {
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
    const alpha = Math.sin(w) / (2 * qq);
    const cos = Math.cos(w);
    const a0 = 1 + alpha;
    if (type === "lowpass") {
      b0 = (1 - cos) / 2 / a0; b1 = (1 - cos) / a0; b2 = b0;
    } else if (type === "highpass") {
      b0 = (1 + cos) / 2 / a0; b1 = -(1 + cos) / a0; b2 = b0;
    } else {
      b0 = alpha / a0; b1 = 0; b2 = -alpha / a0;
    }
    a1 = (-2 * cos) / a0;
    a2 = (1 - alpha) / a0;
  };
  set(freq);
  const run = (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
  return { run, set };
}

function polyblep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** A square wave without the harsh aliasing of a naive one. */
function square() {
  let p = 0;
  return (f) => {
    const dt = f / SR;
    let v = p < 0.5 ? 1 : -1;
    v += polyblep(p, dt);
    v -= polyblep((p + 0.5) % 1, dt);
    p += dt;
    if (p >= 1) p -= 1;
    return v;
  };
}

const at = (t) => Math.round(t * SR);

// ---- Instruments (each writes into a mono bus). --------------------------------

function kick(bus, t0, gain = 1) {
  const start = at(t0);
  const n = at(0.42);
  let phase = 0;
  for (let i = 0; i < n && start + i < bus.length; i++) {
    const t = i / SR;
    const f = 42 + 140 * Math.exp(-t * 32);
    phase += (2 * Math.PI * f) / SR;
    const body = Math.sin(phase) * Math.exp(-t * 7.5);
    const click = t < 0.004 ? noise() * (1 - t / 0.004) * 0.6 : 0;
    bus[start + i] += Math.tanh((body + click) * 1.9) * gain;
  }
}

function bass808(bus, t0, midi, dur, slideTo, drive, gain = 1) {
  const start = at(t0);
  const f0 = mtof(midi);
  const f1 = slideTo === null ? f0 : mtof(slideTo);
  const n = at(dur + 0.08);
  let phase = 0;
  for (let i = 0; i < n && start + i < bus.length; i++) {
    const t = i / SR;
    let f = f0;
    if (slideTo !== null && t > dur - 0.11) f = f0 + (f1 - f0) * Math.min(1, (t - (dur - 0.11)) / 0.11);
    f *= 1 + 0.45 * Math.exp(-t * 45); // the punch at the start
    phase += (2 * Math.PI * f) / SR;
    const env = Math.min(1, t / 0.003) * (t < dur ? 1 - 0.22 * (t / dur) : 0.78 * Math.exp(-(t - dur) * 60));
    const x = Math.sin(phase) * env;
    // Saturation: the harmonics are what phones play back.
    bus[start + i] += (Math.tanh(x * drive) * 0.62 + x * 0.38) * gain;
  }
}

function cowbell(bus, t0, midi, gain = 1, len = 0.34) {
  const start = at(t0);
  const f1 = mtof(midi);
  const f2 = f1 * 1.4836; // the 808 cowbell's two oscillators, 540 : 800
  const a = square();
  const b = square();
  const n = at(len);
  for (let i = 0; i < n && start + i < bus.length; i++) {
    const t = i / SR;
    const env = (Math.exp(-t * 26) * 0.72 + Math.exp(-t * 6.5) * 0.28) * Math.min(1, t / 0.0015);
    bus[start + i] += (a(f1) * 0.55 + b(f2) * 0.45) * env * gain;
  }
}

function hat(bus, t0, open = false, gain = 1) {
  const start = at(t0);
  const hp = biquad("highpass", 7200, 0.9);
  const n = at(open ? 0.32 : 0.06);
  for (let i = 0; i < n && start + i < bus.length; i++) {
    const t = i / SR;
    const env = Math.exp(-t * (open ? 9 : 58));
    bus[start + i] += hp.run(noise()) * env * gain;
  }
}

function clap(bus, t0, gain = 1) {
  const start = at(t0);
  const bp = biquad("bandpass", 1250, 1.1);
  const n = at(0.32);
  let phase = 0;
  for (let i = 0; i < n && start + i < bus.length; i++) {
    const t = i / SR;
    let env = 0;
    for (const burst of [0, 0.011, 0.022]) if (t >= burst) env = Math.max(env, Math.exp(-(t - burst) * 190));
    if (t > 0.028) env = Math.max(env, 0.55 * Math.exp(-(t - 0.028) * 15));
    phase += (2 * Math.PI * 186) / SR;
    const body = Math.sin(phase) * Math.exp(-t * 26) * 0.35;
    bus[start + i] += (bp.run(noise()) * 2.2 * env + body) * gain;
  }
}

/** Filtered noise rising into a section, plus a climbing tone. */
function riser(bus, t0, dur, gain = 1) {
  const start = at(t0);
  const n = at(dur);
  const bp = biquad("bandpass", 400, 1.4);
  let phase = 0;
  for (let i = 0; i < n && start + i < bus.length; i++) {
    const k = i / n;
    if (i % 64 === 0) bp.set(400 * (7000 / 400) ** k, 1.4);
    phase += (2 * Math.PI * (180 + 1100 * k * k)) / SR;
    bus[start + i] += (bp.run(noise()) * 3 + Math.sin(phase) * 0.15) * k * k * gain;
  }
}

/** The slam: a deep boom and a crash. */
function impact(bus, t0, gain = 1) {
  const start = at(t0);
  const n = at(2.4);
  const hp = biquad("highpass", 350, 0.7);
  const lp = biquad("lowpass", 9000, 0.7);
  let phase = 0;
  for (let i = 0; i < n && start + i < bus.length; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * (34 + 40 * Math.exp(-t * 9))) / SR;
    const boom = Math.tanh(Math.sin(phase) * Math.exp(-t * 2.1) * 2.4) * 0.9;
    const crash = lp.run(hp.run(noise())) * Math.exp(-t * 2.4) * 0.55;
    bus[start + i] += (boom + crash) * gain;
  }
}

// ---- Effects. -------------------------------------------------------------------

function filterBus(bus, type, freq, q) {
  const f = biquad(type, freq, q);
  for (let i = 0; i < bus.length; i++) bus[i] = f.run(bus[i]);
}

/** A lowpass that opens from `from` to `to` Hz across [t0, t1]. */
function sweepBus(bus, t0, t1, from, to) {
  const f = biquad("lowpass", from, 0.9);
  const a = at(t0);
  const b = at(t1);
  for (let i = a; i < b && i < bus.length; i++) {
    if ((i - a) % 64 === 0) f.set(from * (to / from) ** ((i - a) / (b - a)), 0.9);
    bus[i] = f.run(bus[i]);
  }
}

/** Freeverb-style reverb: a mono send in, stereo out. */
function reverb(send, size = 0.84, damp = 0.22) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356];
  const allpasses = [556, 441];
  const side = (spread) => {
    const out = new Float32Array(send.length);
    const lines = combs.map((d) => ({ buf: new Float32Array(d + spread), i: 0, store: 0 }));
    const aps = allpasses.map((d) => ({ buf: new Float32Array(d + spread), i: 0 }));
    for (let n = 0; n < send.length; n++) {
      let acc = 0;
      for (const c of lines) {
        const y = c.buf[c.i];
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.i] = send[n] + c.store * size;
        c.i = (c.i + 1) % c.buf.length;
        acc += y;
      }
      for (const a of aps) {
        const y = a.buf[a.i];
        a.buf[a.i] = acc + y * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        acc = y - acc;
      }
      out[n] = acc * 0.12;
    }
    return out;
  };
  return [side(0), side(23)];
}

/** Echo, the Memphis slapback: delay (s) and feedback. */
function echo(bus, delay, feedback, mix) {
  const d = at(delay);
  const out = Float32Array.from(bus);
  for (let i = d; i < out.length; i++) out[i] += out[i - d] * feedback;
  for (let i = 0; i < bus.length; i++) bus[i] = bus[i] * (1 - mix) + out[i] * mix;
}

/** Duck a bus under each kick (sidechain pump). */
function duck(bus, kicks, depth = 0.55, release = 10) {
  for (const k of kicks) {
    const a = at(k);
    const n = at(0.35);
    for (let i = 0; i < n && a + i < bus.length; i++) bus[a + i] *= 1 - depth * Math.exp(-(i / SR) * release);
  }
}

/** Tape stop: the music slows to a halt over `dur`, then silence until `until`. */
function tapeStop(channel, t0, dur, until) {
  const a = at(t0);
  const n = at(dur);
  const copy = channel.slice(a, a + n * 2);
  let pos = 0;
  for (let i = 0; i < at(until - t0) && a + i < channel.length; i++) {
    if (i < n) {
      const rate = (1 - i / n) ** 1.6;
      pos += rate;
      const j = Math.floor(pos);
      const frac = pos - j;
      channel[a + i] = ((copy[j] ?? 0) * (1 - frac) + (copy[j + 1] ?? 0) * frac) * (1 - (i / n) ** 3);
    } else channel[a + i] = 0;
  }
}

// ---- Arrangement. -----------------------------------------------------------------

function render(name) {
  const v = VARIANTS[name];
  const step = 60 / v.bpm / 4;
  const bar = step * 16;
  const s = v.sections;
  const starts = {};
  let b = 0;
  for (const key of ["intro", "build", "drop", "drop2", "break", "end"]) {
    starts[key] = b * bar;
    b += s[key];
  }
  const total = b * bar + 2.2;
  const len = Math.ceil(total * SR);
  const bus = () => new Float32Array(len);
  const drums = bus();
  const bass = bus();
  const bells = bus();
  const hats = bus();
  const claps = bus();
  const fx = bus();
  const send = bus();
  const map = { bpm: v.bpm, step, bar, sections: starts, kicks: [], claps: [], impacts: [], length: b * bar };

  const riffAt = (t0, riff, octave = 0, gain = 1) => {
    for (const [st, semis] of riff) cowbell(bells, t0 + st * step, v.root + semis + octave, gain);
  };
  const bassAt = (t0) => {
    for (const [st, semis, len2, slide] of v.bass) {
      bass808(bass, t0 + st * step, v.root - 24 + semis, len2 * step, slide === null ? null : v.root - 24 + slide, v.drive);
    }
  };
  const kicksAt = (t0) => {
    for (const st of v.kicks) {
      kick(drums, t0 + st * step);
      map.kicks.push(+(t0 + st * step).toFixed(4));
    }
  };
  const clapsAt = (t0) => {
    for (const st of [8, 24]) {
      clap(claps, t0 + st * step);
      map.claps.push(+(t0 + st * step).toFixed(4));
    }
  };
  const hatsAt = (t0, rolls) => {
    for (let st = 0; st < 32; st += 2) hat(hats, t0 + st * step, st === 14 || st === 30, st % 4 === 0 ? 1 : 0.7);
    if (rolls) {
      // Triplet rolls at the end of the phrase.
      for (let k = 0; k < 6; k++) hat(hats, t0 + 28 * step + (k * 4 * step) / 6, false, 0.6 + k * 0.08);
    }
  };
  const slam = (t) => {
    impact(fx, t);
    map.impacts.push(+t.toFixed(4));
  };

  // Hit + the riff alone, filtered open.
  slam(0);
  riffAt(starts.intro, v.riff);
  // Build: riff, hats, claps, a riser and a snare roll into the drop.
  for (let k = 0; k < s.build; k += 2) {
    const t = starts.build + k * bar;
    riffAt(t, v.riff);
    hatsAt(t, false);
    clapsAt(t);
  }
  riser(fx, starts.build, s.build * bar - step, 0.55);
  // Snare roll: a beat of 16ths, then 32nds, then one 32nd of silence before the drop.
  const beat = step * 4;
  for (let k = 0; k < 4; k++) clap(claps, starts.drop - 2 * beat + k * step, 0.25 + k * 0.05);
  for (let k = 0; k < 7; k++) clap(claps, starts.drop - beat + (k * step) / 2, 0.45 + k * 0.07);
  // Drop 1 and 2.
  for (let k = 0; k < s.drop; k += 2) {
    const t = starts.drop + k * bar;
    riffAt(t, v.riff);
    bassAt(t);
    kicksAt(t);
    clapsAt(t);
    hatsAt(t, k % 4 === 2);
  }
  slam(starts.drop);
  for (let k = 0; k < s.drop2; k += 2) {
    const t = starts.drop2 + k * bar;
    riffAt(t, v.riff2, 0, 0.9);
    riffAt(t, v.riff, -12, 0.35); // the first riff an octave down underneath
    bassAt(t);
    kicksAt(t);
    clapsAt(t);
    hatsAt(t, true);
  }
  // Break: the music tape-stops (below), then a riser climbs back (added after the stop).
  const comeback = bus();
  riser(comeback, starts.break + bar * 0.45, bar * 0.55, 0.5);
  // End: the slam (logo), one more phrase, then the last hit.
  slam(starts.end);
  riffAt(starts.end, v.riff);
  bassAt(starts.end);
  kicksAt(starts.end);
  clapsAt(starts.end);
  hatsAt(starts.end, false);
  slam(starts.end + s.end * bar);
  bass808(bass, starts.end + s.end * bar, v.root - 24, 1.6, v.root - 36, v.drive); // a falling 808 under the last hit

  // Bells: warm, spacey (echo + reverb), opening up through the intro.
  filterBus(bells, "highpass", 280, 0.7);
  filterBus(bells, "lowpass", 6500, 0.7);
  sweepBus(bells, starts.intro, starts.build, 500, 9000);
  for (let i = 0; i < len; i++) bells[i] = Math.tanh(bells[i] * 1.6);
  echo(bells, step * 3, 0.32, 0.35);
  filterBus(bass, "lowpass", 1400, 0.8);
  const kicksAll = [...map.kicks];
  duck(bells, kicksAll, 0.5);
  duck(hats, kicksAll, 0.35);
  for (let i = 0; i < len; i++) send[i] = bells[i] * 0.3 + claps[i] * 0.25 + fx[i] * 0.2;
  const [verbL, verbR] = reverb(send);

  // Mix to stereo.
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    // The riff is the hook (and what phone speakers actually play), so it sits up front.
    const center = drums[i] * 0.7 + bass[i] * 0.42 + claps[i] * 0.5 + fx[i] * 0.45;
    L[i] = center + bells[i] * 0.62 + hats[i] * 0.3 + verbL[i] * 0.7;
    R[i] = center + bells[i] * 0.56 + hats[i] * 0.4 + verbR[i] * 0.7;
  }
  // The break: the whole mix slows to a stop.
  tapeStop(L, starts.break, bar * 0.45, starts.break + bar * 0.45);
  tapeStop(R, starts.break, bar * 0.45, starts.break + bar * 0.45);
  for (let i = 0; i < len; i++) {
    L[i] += comeback[i] * 0.5;
    R[i] += comeback[i] * 0.5;
  }
  // Master: soft clip, then peak to -0.5 dB.
  let peak = 0;
  for (let i = 0; i < len; i++) {
    L[i] = Math.tanh(L[i] * 0.9);
    R[i] = Math.tanh(R[i] * 0.9);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const scale = 0.944 / peak;
  for (let i = 0; i < len; i++) {
    L[i] *= scale;
    R[i] *= scale;
  }
  return { L, R, map };
}

function writeWav(file, L, R) {
  const n = L.length;
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

fs.mkdirSync(OUT, { recursive: true });
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VARIANTS)) {
  const { L, R, map } = render(name);
  writeWav(path.join(OUT, `beat-${name}.wav`), L, R);
  fs.writeFileSync(path.join(OUT, `beat-${name}.json`), JSON.stringify(map, null, 2));
  console.log(`${name}: ${(L.length / SR).toFixed(1)} s, ${map.bpm} BPM, drop at ${map.sections.drop.toFixed(2)} s, ${map.kicks.length} kicks`);
}

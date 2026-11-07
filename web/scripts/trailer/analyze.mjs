// Map a music track for the trailer's edit: tempo, every beat and bar, the
// kick and snare hits, how loud each moment is, and where the big changes
// (the drop, breaks) fall. The trailer's cuts are timed to this.
//
//   node scripts/trailer/analyze.mjs "<track.wav>" [out.json]
//
// 16-bit PCM WAV only (Suno's WAV export). Output defaults to
// scripts/trailer/out/<track>.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [input, outArg] = process.argv.slice(2);
if (!input) {
  console.log('usage: node scripts/trailer/analyze.mjs "<track.wav>" [out.json]');
  process.exit(1);
}

// ---- Read the WAV. ---------------------------------------------------------------

const file = fs.readFileSync(input);
let rate = 44100;
let channels = 2;
let bits = 16;
let data = null;
for (let o = 12; o < file.length - 8; ) {
  const id = file.toString("ascii", o, o + 4);
  const size = file.readUInt32LE(o + 4);
  if (id === "fmt ") {
    channels = file.readUInt16LE(o + 10);
    rate = file.readUInt32LE(o + 12);
    bits = file.readUInt16LE(o + 22);
  }
  if (id === "data") {
    data = file.subarray(o + 8, o + 8 + size);
    break;
  }
  o += 8 + size + (size % 2);
}
if (!data || bits !== 16) throw new Error("Expected a 16-bit PCM WAV.");
const frames = data.length / (2 * channels);
const mono = new Float32Array(frames);
for (let i = 0; i < frames; i++) {
  let sum = 0;
  for (let c = 0; c < channels; c++) sum += data.readInt16LE((i * channels + c) * 2) / 32768;
  mono[i] = sum / channels;
}
const duration = frames / rate;

// ---- Bands and envelopes. ----------------------------------------------------------

function biquad(type, freq, q = 0.707) {
  const w = (2 * Math.PI * freq) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  let b0, b1, b2;
  if (type === "lowpass") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === "highpass") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha];
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  return (input) => {
    const out = new Float32Array(input.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      out[i] = y;
    }
    return out;
  };
}

const HOP = Math.round(rate / 100); // 10 ms
const hops = Math.floor(frames / HOP);
const envelope = (signal) => {
  const out = new Float32Array(hops);
  for (let h = 0; h < hops; h++) {
    let sum = 0;
    for (let i = h * HOP; i < (h + 1) * HOP; i++) sum += signal[i] * signal[i];
    out[h] = Math.sqrt(sum / HOP);
  }
  return out;
};
const low = envelope(biquad("lowpass", 150)(mono)); // kick, 808
const mid = envelope(biquad("bandpass", 1500, 0.6)(mono)); // snare, clap, riff
const high = envelope(biquad("highpass", 6000)(mono)); // hats, cymbals
const all = envelope(mono);

/** Onset strength: how sharply a band's (log) energy rises, hop to hop. */
const onset = (env) => {
  const out = new Float32Array(env.length);
  for (let h = 1; h < env.length; h++) out[h] = Math.max(0, Math.log10(env[h] + 1e-4) - Math.log10(env[h - 1] + 1e-4));
  return out;
};
const lowOn = onset(low);
const midOn = onset(mid);
const flux = lowOn.map((v, i) => v + midOn[i] * 0.8 + onset(high)[i] * 0.3);

// ---- Tempo: autocorrelation of the onsets, phonk's range preferred. -------------

const corr = (lag) => {
  let sum = 0;
  for (let h = lag; h < hops; h++) sum += flux[h] * flux[h - lag];
  return sum / (hops - lag);
};
let best = { bpm: 0, score: -1 };
for (let bpm = 70; bpm <= 190; bpm += 0.25) {
  const lag = (60 / bpm) * 100;
  const a = Math.floor(lag);
  const score = (corr(a) * (1 - (lag - a)) + corr(a + 1) * (lag - a)) * (bpm >= 115 && bpm <= 175 ? 1.15 : 1);
  if (score > best.score) best = { bpm, score };
}
const bpm = best.bpm;
const beat = 60 / bpm;

// Phase: the beat grid that lands on the most onsets.
let phase = 0;
let phaseScore = -1;
for (let off = 0; off < beat * 100; off += 0.5) {
  let sum = 0;
  for (let t = off; t < hops; t += beat * 100) sum += flux[Math.round(t)] ?? 0;
  if (sum > phaseScore) {
    phaseScore = sum;
    phase = off / 100;
  }
}
const beats = [];
for (let t = phase; t < duration; t += beat) beats.push(+t.toFixed(3));

// Downbeats: of the four ways to group beats into bars, the one with the most kick on beat 1.
let barShift = 0;
let barScore = -1;
for (let shift = 0; shift < 4; shift++) {
  let sum = 0;
  for (let b = shift; b < beats.length; b += 4) sum += lowOn[Math.round(beats[b] * 100)] ?? 0;
  if (sum > barScore) {
    barScore = sum;
    barShift = shift;
  }
}
const bars = beats.filter((_, i) => i % 4 === barShift % 4);

// ---- Hits: kicks (low onsets) and snares/claps (mid onsets), peak-picked. ---------

const peaks = (strength, threshold, gap) => {
  const out = [];
  let last = -Infinity;
  for (let h = 2; h < hops - 2; h++) {
    const v = strength[h];
    if (v > threshold && v >= strength[h - 1] && v >= strength[h + 1] && h - last >= gap) {
      out.push(+(h / 100).toFixed(2));
      last = h;
    }
  }
  return out;
};
const pct = (array, p) => [...array].sort((a, b) => a - b)[Math.floor(array.length * p)];
const kicks = peaks(lowOn, Math.max(0.12, pct(lowOn, 0.97)), 12);
const snares = peaks(midOn, Math.max(0.1, pct(midOn, 0.97)), 12);

// ---- Sections: loudness per bar, and where it jumps or falls. ------------------------

const rms = (env, a, b) => {
  let sum = 0;
  let n = 0;
  for (let h = Math.round(a * 100); h < Math.min(hops, Math.round(b * 100)); h++) {
    sum += env[h] * env[h];
    n++;
  }
  return Math.sqrt(sum / Math.max(1, n));
};
const db = (x) => +(20 * Math.log10(x + 1e-6)).toFixed(1);
const perBar = bars.map((t, i) => {
  const end = bars[i + 1] ?? duration;
  return { start: t, all: db(rms(all, t, end)), low: db(rms(low, t, end)), mid: db(rms(mid, t, end)), high: db(rms(high, t, end)) };
});
const changes = perBar
  .slice(1)
  .map((bar, i) => ({ at: bar.start, lowJump: +(bar.low - perBar[i].low).toFixed(1), allJump: +(bar.all - perBar[i].all).toFixed(1) }))
  .sort((a, b) => b.lowJump - a.lowJump);
const drop = changes[0];
const quiet = perBar.filter((bar) => bar.all < db(rms(all, 0, duration)) - 9).map((bar) => bar.start);

const map = {
  track: path.basename(input),
  duration: +duration.toFixed(3),
  bpm,
  beat: +beat.toFixed(4),
  bar: +(beat * 4).toFixed(4),
  firstBeat: +phase.toFixed(3),
  drop: drop.at,
  quietBars: quiet,
  bars,
  beats,
  kicks,
  snares,
  perBar,
  biggestChanges: changes.slice(0, 6),
  // Loudness every 50 ms (dB), for drawing the track.
  loudness: Array.from({ length: Math.floor(hops / 5) }, (_, k) => db(rms(all, k * 0.05, (k + 1) * 0.05))),
  lowLoudness: Array.from({ length: Math.floor(hops / 5) }, (_, k) => db(rms(low, k * 0.05, (k + 1) * 0.05))),
};
const out = outArg ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "out", `${path.basename(input).replace(/\.wav$/i, "").replace(/\W+/g, "-").toLowerCase()}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(map, null, 1));
console.log(`${map.track}: ${map.duration} s, ${bpm} BPM (beat ${map.beat} s, bar ${map.bar} s), first beat ${map.firstBeat} s`);
console.log(`drop at ${drop.at} s (low +${drop.lowJump} dB); quiet bars at ${quiet.join(", ") || "none"}`);
console.log(`${bars.length} bars, ${kicks.length} kicks, ${snares.length} snares -> ${out}`);
console.log("bars:", perBar.map((b) => `${b.start.toFixed(2)}:${b.all}/${b.low}`).join("  "));

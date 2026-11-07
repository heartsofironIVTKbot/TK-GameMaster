// Render the trailer to MP4: step /lab/trailer frame by frame in headless Edge
// and pipe the frames into ffmpeg with the track.
//
//   1. npm run dev (the trailer page is dev only)
//   2. node scripts/trailer/render.mjs           (both formats)
//      node scripts/trailer/render.mjs wide      (just one: wide = 16:9, tall = 9:16)
//
// Needs ffmpeg (winget install Gyan.FFmpeg; or set FFMPEG to its path) and the
// track at public/landing/trailer/master-your-game.wav (kept out of git).
// Writes public/landing/trailer/gamemaster-trailer-<format>.mp4 and a poster
// (and gamemaster-trailer-wide-720.mp4, the phone copy).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(WEB, "public/landing/trailer");
const TRACK = path.join(OUT, "master-your-game.wav");
const BASE = process.env.BASE ?? "http://localhost:3000";
const EDGE = process.env.BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const FFMPEG = process.env.FFMPEG ?? findFfmpeg();
const SIZE = { wide: [1920, 1080], tall: [1080, 1920] };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function findFfmpeg() {
  const winget = path.join(os.homedir(), "AppData/Local/Microsoft/WinGet/Packages");
  if (fs.existsSync(winget)) {
    for (const dir of fs.readdirSync(winget).filter((d) => d.startsWith("Gyan.FFmpeg"))) {
      const root = path.join(winget, dir);
      for (const build of fs.readdirSync(root)) {
        const exe = path.join(root, build, "bin", "ffmpeg.exe");
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return "ffmpeg";
}

async function openBrowser(width, height, port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmtrailer-"));
  const edge = spawn(EDGE, ["--headless=new", "--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${width},${height}`, "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
  let tabs = [];
  for (let i = 0; i < 60 && !tabs.length; i++) {
    try {
      tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {}
    await sleep(200);
  }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result?.result?.value;
  };
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  return {
    send,
    evaluate,
    close: () => {
      ws.close();
      edge.kill();
    },
  };
}

async function render(format) {
  const [width, height] = SIZE[format];
  const browser = await openBrowser(width, height, format === "wide" ? 9420 : 9421);
  await browser.send("Page.navigate", { url: `${BASE}/lab/trailer?format=${format}&render=1` });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    if (await browser.evaluate("!!(window.__trailer && window.__trailer.ready)").catch(() => false)) break;
  }
  await browser.evaluate(`document.head.insertAdjacentHTML('beforeend', '<style>nextjs-portal,[data-tour~="help.button"]{display:none!important}</style>'); true`);
  const { duration, fps } = await browser.evaluate("({ duration: window.__trailer.duration, fps: window.__trailer.fps })");
  const frames = Math.round(duration * fps);
  const file = path.join(OUT, `gamemaster-trailer-${format}.mp4`);
  const ffmpeg = spawn(
    FFMPEG,
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
      "-i", TRACK,
      "-map", "0:v", "-map", "1:a",
      "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p",
      "-af", `afade=t=out:st=${(duration - 0.35).toFixed(2)}:d=0.35`,
      "-c:a", "aac", "-b:a", "192k",
      "-t", String(duration),
      "-movflags", "+faststart",
      file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    await browser.evaluate(`window.__trailer.seek(${(i / fps).toFixed(5)})`);
    const shot = await browser.send("Page.captureScreenshot", { format: "jpeg", quality: 94 });
    const buffer = Buffer.from(shot.result.data, "base64");
    if (!ffmpeg.stdin.write(buffer)) await new Promise((done) => ffmpeg.stdin.once("drain", done));
    if (i % 60 === 0) process.stdout.write(`\r  ${format}: frame ${i}/${frames}`);
  }
  ffmpeg.stdin.end();
  await new Promise((done, fail) => ffmpeg.on("close", (code) => (code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}`)))));
  // A poster: the logo slam, settled.
  const poster = path.join(OUT, `gamemaster-trailer-${format}.jpg`);
  await new Promise((done) => spawn(FFMPEG, ["-y", "-loglevel", "error", "-ss", "7.5", "-i", file, "-frames:v", "1", "-q:v", "3", poster]).on("close", done));
  browser.close();
  if (format === "wide") {
    // A 720p copy for phones (SceneTrailer picks it on narrow screens).
    const small = path.join(OUT, "gamemaster-trailer-wide-720.mp4");
    await new Promise((done) =>
      spawn(FFMPEG, ["-y", "-loglevel", "error", "-i", file, "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", small]).on("close", done),
    );
  }
  console.log(`\r  ${format}: ${frames} frames in ${((Date.now() - started) / 1000).toFixed(0)} s -> ${path.relative(WEB, file)} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
}

if (!fs.existsSync(TRACK)) throw new Error(`The track isn't at ${TRACK}.`);
for (const format of process.argv.slice(2).length ? process.argv.slice(2) : ["wide", "tall"]) await render(format);

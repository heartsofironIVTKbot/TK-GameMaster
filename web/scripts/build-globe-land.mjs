// Paint the front-page globe's land pictures once, here, instead of in every
// visitor's browser: painting them live (4096 x 2048, a glow on every coast)
// stalled the browser's graphics for 1-4 s on load, freezing the whole page.
//
//   node scripts/build-globe-land.mjs      (after build-globe-data.py)
//
// Reads public/landing/globe-<map>.json and writes
// public/landing/globe-<map>-land-<width>.webp (lossless; 4096 for high
// quality, 2048 for low), stored upside down (WebGL's way up). Channels, as
// the globe's shader reads them: red = land, blue = a shade per nation,
// green = the coast glow. Painted in headless Edge (the same canvas drawing
// the browser did before), compressed with Python's Pillow.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(WEB, "public/landing");
const EDGE = process.env.BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PYTHON = process.env.PYTHON ?? "python"; // with Pillow (pip install pillow)
const MAPS = ["vanilla", "modern"];
const WIDTHS = [4096, 2048];
const PORT = 9700 + Math.floor(Math.random() * 200);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Runs in the browser: paint one map's land picture and return it as a PNG data URL. */
function paint(data, width) {
  const height = width / 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  const x = (lon) => ((lon + 180) / 360) * width;
  const y = (lat) => ((90 - lat) / 180) * height;
  const trace = (ring, shift) => {
    context.beginPath();
    for (let i = 0; i < ring.length; i += 2) {
      const px = x(ring[i]) + shift;
      const py = y(ring[i + 1]);
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
  };
  // Each shape is drawn three times (-360, 0, +360), so shapes on the seam wrap.
  const shifts = [-width, 0, width];
  data.land.forEach((nation, index) => {
    const shade = 90 + ((index * 73) % 165);
    context.fillStyle = `rgb(255,0,${shade})`;
    for (const ring of nation.rings) {
      for (const shift of shifts) {
        trace(ring, shift);
        context.closePath();
        context.fill();
      }
    }
  });
  context.globalCompositeOperation = "lighter";
  context.strokeStyle = "rgb(0,150,0)";
  context.shadowColor = "rgb(0,255,0)";
  context.shadowBlur = width / 512;
  context.lineWidth = width / 2048;
  for (const line of data.coast) {
    for (const shift of shifts) {
      trace(line, shift);
      context.stroke();
    }
  }
  return canvas.toDataURL("image/png");
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmland-"));
const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
let tabs = [];
for (let i = 0; i < 60 && !tabs.length; i++) {
  try {
    tabs = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((t) => t.type === "page");
  } catch {}
  await sleep(200);
}
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  pending.get(message.id)?.(message);
  pending.delete(message.id);
});
const evaluate = (expression) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (m) => (m.result?.exceptionDetails ? reject(new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 300))) : resolve(m.result.result.value)));
    ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
  });

try {
  for (const map of MAPS) {
    const data = JSON.parse(fs.readFileSync(path.join(OUT, `globe-${map}.json`), "utf8"));
    for (const width of WIDTHS) {
      const url = await evaluate(`(${paint.toString()})(${JSON.stringify({ land: data.land, coast: data.coast })}, ${width})`);
      const file = path.join(OUT, `globe-${map}-land-${width}.webp`);
      const png = path.join(dir, `land-${map}-${width}.png`);
      fs.writeFileSync(png, Buffer.from(url.split(",")[1], "base64"));
      // Stored upside down, the way WebGL reads pictures (the globe loads it
      // as is, with no flip). Lossless WebP at Pillow's best effort: every pixel exact, under half the
      // PNG (the browser's own WebP encoder is lossless too, but bigger than PNG).
      execFileSync(PYTHON, ["-c", "import sys; from PIL import Image; Image.open(sys.argv[1]).convert('RGB').transpose(Image.Transpose.FLIP_TOP_BOTTOM).save(sys.argv[2], 'WEBP', lossless=True, method=6)", png, file]);
      console.log(`${path.relative(WEB, file)}  ${(fs.statSync(file).size / 1e3).toFixed(0)} KB`);
    }
  }
} finally {
  ws.close();
  edge.kill();
}

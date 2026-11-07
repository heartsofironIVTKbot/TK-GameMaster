// Shoot the front page's feature slideshow: the real site in its sample-data
// preview, clicked through step by step in headless Edge (or Chrome: set
// BROWSER to its path). Writes public/landing/tour/<slide>/NN.webp and
// src/components/landing/front/tourFrames.ts.
//
//   1. Restart `npm run dev` first: the preview's sample data lives in the dev
//      server's memory, and these tours change it (they schedule a game, give a
//      commend, take attendance samples).
//   2. node scripts/capture-tours.mjs            (every slide)
//      node scripts/capture-tours.mjs calendar   (just some)
//
// The slides and their captions are in tour-assets/slides.mjs. A slide is a list of steps; a step is a quick run of screens (frames). Each
// frame does one thing, then the screen is shot:
//   go: "/path"        open a page (shown with a fade, or `how: "cut"`)
//   click: "text"      click what starts with that text (or "re:<regex>", "css:<selector>");
//                      the player moves its cursor there and cuts to the result.
//                      `pick: "last"` takes the last match on the page instead of the first;
//                      `also: "text"` clicks something else straight after, unshown;
//                      `then: url` opens another page after the click (Discord, say)
//   scroll: y | "max"  scroll there like a person would: a quick run of small in-between
//                      screens (`burst`, left out of the full-size view), then the stop
//   type: "text"       type it into whatever has focus, a few words per screen
//   live: n            (archive) the running game, n events in (see LIVE below)
//   upload: file       (with a click that opens a file picker) pick that file in it
//   sample: true       (attendance) the bot takes the next voice sample, as it would on its
//                      own every 20 minutes; the page is reloaded with no "taken early" marks
//   overlay: "clock"   the player shows a fast clock over this screen (time passing)
//   quiet: true        do it, but don't shoot (setting up the next frame)
//   wait: ms           how long to let the page settle (default 1700)
//   ms: n              how long the player shows this screen (default: the player's)
// A step whose button isn't found prints a "!" line: the page changed, so fix it below.
// SITE (env) is the address the Discord posts' links show (default: this dev server).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slides } from "./tour-assets/slides.mjs";

const W = 1440;
const H = 900;
const BASE = process.env.BASE ?? "http://localhost:3000";
const SITE = process.env.SITE ?? BASE;
const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(WEB, "public/landing/tour");
const framesFile = path.join(WEB, "src/components/landing/front/tourFrames.ts");
const EDGE = process.env.BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** In-between screens of a scroll or typing: smaller and lighter, shown for a blink. */
const BURST_MS = 40;
const BURST_SCALE = 0.5;

// ---- The slides. --------------------------------------------------------------

/** The game the calendar tour schedules, read off the setup page (mode, time). */
let scheduled = { mode: "Roleplay", when: 0 };
const site = `site=${encodeURIComponent(SITE)}`;
const discord = (state) => () =>
  `/lab/discord?view=announce&state=${state}&mode=${encodeURIComponent(scheduled.mode)}&when=${scheduled.when}&host=Demo%20Host&${site}`;
const discordView = (view) => `/lab/discord?view=${view}&${site}`;
const RUNNING_GAME = "910000000000000001";
// The attendance page's running game (lib/attendanceDemo.ts).
const ATTENDANCE_GAME = "910000000000000001";

const SLIDES = slides({ discord, discordView, chatLog: path.join(WEB, "scripts/tour-assets/roleplay-87-chat.txt") });

/**
 * The running archive game as it plays: who told the host, and the hosts'
 * commends, Merit and warnings, in order. A `live: n` frame shows the first n.
 */
const LIVE = [
  ["Germany", "commend"], ["United Kingdom", "commend"], ["France", "merit"], ["Italy", "told_host"],
  ["Soviet Union", "warn"], ["Japan", "commend"], ["U.S.A", "commend"], ["Germany (co-op)", "merit"], ["Poland", "commend"], ["Spain", "warn"],
  ["Germany", "commend"], ["United Kingdom", "merit"], ["France", "commend"], ["Japan", "merit"], ["U.S.A", "commend"], ["Poland", "merit"],
  ["Spain", "commend"], ["Soviet Union", "warn"],
  ["Germany", "merit"], ["Germany (co-op)", "commend"], ["United Kingdom", "commend"], ["France", "commend"], ["Japan", "commend"],
  ["U.S.A", "merit"], ["Poland", "commend"],
];

function playLive(game, count) {
  for (const [nation, what] of LIVE.slice(0, count)) {
    for (const section of game.sections) {
      for (const row of section.rows) {
        if (row.nation !== nation) continue;
        if (what === "told_host") {
          row.presence = "told_host";
          game.card.counts.told_host += 1;
          game.card.counts.played -= 1;
        } else {
          row.marks[what] += 1;
          game.card.counts[what] += 1;
        }
      }
    }
  }
}

/** Take the "taken early, by the host" marks off samples (and their log lines). */
function unmark(value) {
  if (Array.isArray(value)) return value.forEach(unmark);
  if (!value || typeof value !== "object") return;
  if ("manual" in value) {
    value.manual = false;
    if ("by_name" in value) value.by_name = null;
  }
  Object.values(value).forEach(unmark);
}

// ---- Page helpers. ------------------------------------------------------------

// Find a visible element by text (case-insensitive start, "re:" regex or "css:" selector): its centre, or null.
const FIND = (needle, pick) => `(() => {
  const n = ${JSON.stringify(needle)};
  const clean = (e) => (e.innerText || e.getAttribute('aria-label') || e.value || '').trim().replace(/[\\s]+/g, ' ').toLowerCase();
  let list;
  if (n.startsWith('css:')) list = [...document.querySelectorAll(n.slice(4))];
  else {
    const all = [...document.querySelectorAll('a,button,input,textarea,[role=tab],[role=button],div,li,span,label,p')];
    list = n.startsWith('re:') ? all.filter((e) => new RegExp(n.slice(3), 'i').test(clean(e))) : all.filter((e) => clean(e).startsWith(n.toLowerCase()));
    list = list.filter((e) => !list.some((other) => other !== e && e.contains(other)));
  }
  list = list.filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.top >= 0 && b.bottom <= innerHeight; });
  const el = ${pick === "last" ? "list[list.length - 1]" : "list[0]"};
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
})()`;

// Hide what isn't the product: the Help button, the dev badge, the "Preview: sample data" tag.
const TIDY = `(() => {
  if (!document.getElementById('gm-cap-tidy')) {
    const style = document.createElement('style');
    style.id = 'gm-cap-tidy';
    style.textContent = '[data-tour~="help.button"], nextjs-portal { display: none !important; } html { scroll-behavior: auto !important; }';
    document.head.appendChild(style);
  }
  for (const el of document.querySelectorAll('span,div,p')) {
    if (el.children.length === 0 && /^Preview: sample data$/.test(el.textContent.trim())) (el.closest('span,div') || el).style.display = 'none';
  }
  return true;
})()`;

// The game being set up: its mode and start time, read off the setup page's title.
const READ_SETUP = `(() => {
  const text = document.body.innerText;
  const mode = (text.match(/New game, ([^\\n]+)/) || [])[1] || 'Roleplay';
  const when = (text.match(/[a-z]+day, ([0-9]+ [a-z]+ [0-9]{4}), ([0-9]{2}:[0-9]{2})/i) || []);
  return { mode: mode.trim(), when: when.length ? when[1] + ' ' + when[2] : null };
})()`;

// Wait for the page to paint what changed.
const PAINTED = "new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))";

// ---- Headless Edge over its DevTools protocol. --------------------------------

async function openBrowser(port = 9340) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gmcap-"));
  const edge = spawn(EDGE, ["--headless=new", "--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${W},${H}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
  const listeners = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method && listeners.has(message.method)) {
      listeners.get(message.method)(message.params);
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
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 4 / 3, mobile: false });
  await send("Emulation.setTimezoneOverride", { timezoneId: "Europe/London" });
  await send("Page.enable");
  await send("DOM.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "try{localStorage.setItem('gm_tutorial_v1', JSON.stringify({autoStart:false,tours:{}}));}catch{}" });
  const go = async (url, wait) => {
    await send("Page.navigate", { url });
    await sleep(wait);
    await evaluate("document.querySelector('[data-tutorial-root] [aria-label=\"Close the tour\"]')?.click(); true");
  };
  const shot = async (file, small = false) => {
    const params = { format: "webp", quality: small ? 58 : 78 };
    if (small) params.clip = { x: 0, y: await evaluate("scrollY"), width: W, height: H, scale: BURST_SCALE };
    const r = await send("Page.captureScreenshot", params);
    fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
  };
  const click = async (at) => {
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1 });
    }
  };
  const on = (method, handler) => listeners.set(method, handler);
  const close = () => {
    ws.close();
    edge.kill();
  };
  return { send, evaluate, go, shot, click, on, close };
}

// ---- Shooting. ----------------------------------------------------------------

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SLIDES);
const tours = readTours();
const browser = await openBrowser();

// The archive's running game, served `liveCount` events on when asked.
let liveCount = 0;
// The attendance page, with the samples the tour took looking like the bot's own.
let cleanSamples = false;
browser.on("Fetch.requestPaused", async ({ requestId }) => {
  const body = await browser.send("Fetch.getResponseBody", { requestId });
  const raw = body.result.base64Encoded ? Buffer.from(body.result.body, "base64").toString("utf8") : body.result.body;
  const game = JSON.parse(raw);
  if (cleanSamples) unmark(game);
  else playLive(game, liveCount);
  await browser.send("Fetch.fulfillRequest", {
    requestId,
    responseCode: 200,
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify(game)).toString("base64"),
  });
});

/** The next event of this kind from the browser, or null after `ms`. */
function waitFor(method, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    browser.on(method, (params) => {
      clearTimeout(timer);
      resolve(params);
    });
  });
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

for (const name of wanted) {
  const steps = SLIDES[name];
  if (!steps) {
    console.log(`! no slide "${name}"`);
    continue;
  }
  const dir = path.join(outDir, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  let n = 0;
  const nextFile = () => {
    n += 1;
    return `${String(n).padStart(2, "0")}.webp`;
  };

  for (const step of steps) {
    const frames = [];
    /** Shoot an in-between screen (a scroll or typing on its way). */
    const burst = async () => {
      const file = nextFile();
      await browser.shot(path.join(dir, file), true);
      frames.push({ src: `/landing/tour/${name}/${file}`, cursor: null, how: "cut", ms: BURST_MS, burst: true });
    };

    for (const frame of step.frames) {
      let cursor = null;
      let how = "cut";
      let ms = frame.ms ?? null;
      if (frame.go) {
        const url = typeof frame.go === "function" ? frame.go() : frame.go;
        await browser.go(BASE + url, frame.wait ?? 5000);
        await browser.evaluate(TIDY);
        how = frame.how ?? "fade";
      }
      if (frame.click) {
        const at = await browser.evaluate(FIND(frame.click, frame.pick));
        if (!at) {
          console.log(`  ! ${name}: no visible "${frame.click}"`);
          continue;
        }
        await sleep(250);
        if (frame.upload) await browser.send("Page.setInterceptFileChooserDialog", { enabled: true });
        await browser.click(at);
        cursor = { x: +(at.x / W).toFixed(4), y: +(at.y / H).toFixed(4) };
        if (frame.upload) {
          const chooser = await waitFor("Page.fileChooserOpened", 5000);
          if (chooser) await browser.send("DOM.setFileInputFiles", { files: [frame.upload], backendNodeId: chooser.backendNodeId });
          else console.log(`  ! ${name}: no file picker opened`);
          await browser.send("Page.setInterceptFileChooserDialog", { enabled: false });
        }
        await sleep(frame.wait ?? 1700);
        if (frame.also) {
          const also = await browser.evaluate(FIND(frame.also));
          if (also) {
            await browser.click(also);
            await sleep(1500);
          } else console.log(`  ! ${name}: no visible "${frame.also}"`);
        }
        if (frame.then) {
          await browser.go(BASE + frame.then, 4000);
        }
        await browser.evaluate(TIDY);
        if (frame.scrollTo !== undefined) {
          await browser.evaluate(`window.scrollTo(0, ${frame.scrollTo}); true`);
          await sleep(700);
        }
      }
      if (frame.type) {
        // A few words a screen, like someone typing.
        const words = frame.type.split(" ");
        for (let i = 0; i < words.length; i += 2) {
          await browser.send("Input.insertText", { text: words.slice(i, i + 2).join(" ") + (i + 2 < words.length ? " " : "") });
          await browser.evaluate(PAINTED);
          if (i + 2 < words.length) {
            await burst();
            frames[frames.length - 1].ms = 140;
          }
        }
        await sleep(500);
      }
      if (frame.scroll !== undefined) {
        const from = await browser.evaluate("scrollY");
        const target =
          frame.scroll === "max" ? await browser.evaluate("document.documentElement.scrollHeight - innerHeight") : frame.scroll;
        const distance = target - from;
        const count = Math.min(36, Math.max(10, Math.round(Math.abs(distance) / 26)));
        for (let k = 1; k < count; k++) {
          await browser.evaluate(`window.scrollTo(0, ${Math.round(from + distance * ease(k / count))}); true`);
          await browser.evaluate(PAINTED);
          await sleep(40);
          await burst();
        }
        await browser.evaluate(`window.scrollTo(0, ${target}); true`);
        await sleep(frame.wait ?? 900);
      }
      if (frame.live !== undefined) {
        liveCount = frame.live;
        await browser.send("Fetch.enable", { patterns: [{ urlPattern: `*/api/archive/${RUNNING_GAME}*`, requestStage: "Response" }] });
        await browser.go(`${BASE}/archive/${RUNNING_GAME}`, frame.wait ?? 3500);
        await browser.evaluate(TIDY);
        await browser.send("Fetch.disable");
      }
      if (frame.sample) {
        // What the bot does on its own every 20 minutes, sent the way the host's button would.
        const y = await browser.evaluate("scrollY");
        const taken = await browser.evaluate(`(async () => {
          const sent = await fetch("/api/schedule/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "att_sample", payload: { game_id: "${ATTENDANCE_GAME}" } }) }).then((r) => r.json());
          for (let i = 0; i < 20 && sent.request_id; i++) {
            const state = await fetch("/api/schedule/requests/" + sent.request_id, { cache: "no-store" }).then((r) => r.json());
            if (state.status && state.status !== "pending" && state.status !== "processing") return state.status;
            await new Promise((done) => setTimeout(done, 500));
          }
          return sent.error || "no answer";
        })()`);
        if (taken !== "done") console.log(`  ! ${name}: sample request said "${taken}"`);
        cleanSamples = true;
        await browser.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/attendance/games*", requestStage: "Response" }] });
        await browser.go(`${BASE}/attendance`, 5000);
        await browser.evaluate(TIDY);
        await browser.evaluate(`window.scrollTo(0, ${y}); true`);
        await sleep(800);
        // Left on for the rest of the slide: every reload of the page stays clean.
      }
      if (frame.read === "setup") {
        const found = await browser.evaluate(READ_SETUP);
        const when = found.when ? Date.parse(`${found.when} GMT`) / 1000 : Math.floor(Date.now() / 1000) + 86400;
        scheduled = { mode: found.mode, when };
      }
      if (frame.quiet) continue;
      const file = nextFile();
      await browser.shot(path.join(dir, file));
      frames.push({
        src: `/landing/tour/${name}/${file}`,
        cursor,
        how,
        ms,
        ...(frame.app ? { app: frame.app } : {}),
        ...(frame.overlay ? { overlay: frame.overlay } : {}),
      });
      console.log(`  ${name}/${file}  ${step.step}${cursor ? `  @${cursor.x},${cursor.y}` : ""}`);
    }
    out.push({ name: step.step, caption: step.caption, ...(step.badge ? { badge: step.badge } : {}), frames });
  }
  tours[name] = out;
  if (cleanSamples) {
    await browser.send("Fetch.disable");
    cleanSamples = false;
  }
}
browser.close();
writeTours(tours);

// tourFrames.ts holds every slide; keep the ones not shot this time.
function readTours() {
  if (!fs.existsSync(framesFile)) return {};
  const text = fs.readFileSync(framesFile, "utf8");
  const start = text.indexOf("TOURS: Record<string, TourStep[]> = ");
  if (start < 0) return {};
  return JSON.parse(text.slice(text.indexOf("{", start), text.lastIndexOf("}") + 1));
}

function writeTours(all) {
  const head = `// The front page's feature slideshow: screenshots of the site itself in its
// sample-data preview, taken by scripts/capture-tours.mjs, which clicks
// through each page like a person would. Re-run it when those pages change.
export interface TourFrame {
  src: string;
  /** Where the click that led here landed, as a share of the 1440x900 view (null: no click). */
  cursor: { x: number; y: number } | null;
  /** How this screen comes in: a click (or a scroll's in-between screen) cuts, a new page fades. */
  how: "cut" | "fade";
  /** How long it stays (null: the player decides). */
  ms: number | null;
  /** An in-between screen of a scroll or typing: smaller, and left out of the full-size view. */
  burst?: boolean;
  /** Shot in Discord rather than on the website. */
  app?: "discord";
  /** Something the player draws over it: "clock" = time passing (attendance samples). */
  overlay?: "clock";
}

export interface TourStep {
  name: string;
  caption: string;
  /** A small tag beside the step's name. */
  badge?: string;
  frames: TourFrame[];
}

export const TOURS: Record<string, TourStep[]> = `;
  fs.writeFileSync(framesFile, head + JSON.stringify(all, null, 2) + ";\n");
}

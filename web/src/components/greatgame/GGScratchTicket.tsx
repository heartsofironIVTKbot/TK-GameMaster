"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GGPerson, GGTeam } from "@/lib/greatGame/model";
import * as sound from "./ggSound";
import { Avatar } from "./ggUi";

/**
 * One team's vice-captain scratch ticket (step 3), scratched by hand like the
 * Casino's tickets: a holographic foil over the prize, a coin under the
 * pointer, flakes flying off. The captain on the clock (or an organizer)
 * scratches; every stroke goes out live, so all viewers watch the same foil
 * come away. Once enough is scratched (or on a double-click) it shreds clear.
 *
 * Strokes are polylines of x, y in 0..1 of the scratch area, so they land in
 * the same place on every screen size.
 */

export type TicketState = "revealed" | "scratching" | "ready" | "waiting";

/** A channel link shown short: "youtube.com/@Name" becomes "@Name". */
function channelLabel(channel: string): string {
  const handle = channel.match(/@[\w.-]+/);
  return handle ? handle[0] : channel.replace(/^https?:\/\/(www\.)?/, "");
}

/** Share of the foil that must be gone before the ticket shreds clear. */
const REVEAL_AT = 0.45;
/** Coin radius as a share of the scratch area's width. */
const COIN = 0.068;
/** Strokes go out in batches this often. */
const SEND_MS = 90;

const FLAKES = ["#f4f1ff", "#d9d5e6", "#b9b4c9", "#ff9cf0", "#8fe9ff", "#ffe08a"];

export default function GGScratchTicket({
  team,
  captain,
  index,
  total,
  person,
  state,
  canScratch,
  lines,
  seq,
  onFirstTouch,
  onLine,
  onDone,
}: {
  team: GGTeam;
  captain: string;
  index: number;
  total: number;
  /** Who is under the foil (known once the ticket is drawn). */
  person: GGPerson | null;
  state: TicketState;
  canScratch: boolean;
  /** Strokes so far, live from the scratcher. */
  lines: number[][];
  /** The draw behind this ticket, once made. */
  seq: number | null;
  onFirstTouch: () => void;
  onLine: (seq: number, line: number[]) => void;
  onDone: (seq: number) => void;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const foilRef = useRef<HTMLCanvasElement | null>(null);
  const flakesRef = useRef<HTMLDivElement | null>(null);
  const applied = useRef(0);
  const size = useRef({ w: 0, h: 0 });
  // Local strokes waiting to go out (and not yet sent because the draw isn't back yet).
  const queue = useRef<number[][]>([]);
  const current = useRef<number[] | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const lastFlake = useRef<{ x: number; y: number } | null>(null);
  const touched = useRef(false);
  const checked = useRef(0);
  const [cleared, setCleared] = useState(false);
  const revealed = state === "revealed" || cleared;
  const [burst, setBurst] = useState(0);
  const wasRevealed = useRef(revealed);

  // The foil: holographic silver with speckle, sheen and the instruction.
  const paint = () => {
    const canvas = foilRef.current;
    const box = bodyRef.current;
    if (!canvas || !box) return;
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    size.current = { w, h };
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const foil = ctx.createLinearGradient(0, 0, w, h);
    foil.addColorStop(0, "#e4e2f1");
    foil.addColorStop(0.28, "#b9b1db");
    foil.addColorStop(0.5, "#eadcf8");
    foil.addColorStop(0.72, "#aee0ee");
    foil.addColorStop(1, "#cdc6e6");
    ctx.fillStyle = foil;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 55; i++) {
      ctx.fillStyle = `rgba(40,24,80,${(0.04 + Math.random() * 0.09).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    }
    // Sheen bands.
    ctx.save();
    ctx.rotate(-0.5);
    for (const [x, a] of [
      [-0.1, 0.35],
      [0.35, 0.22],
      [0.7, 0.3],
    ] as [number, number][]) {
      const band = ctx.createLinearGradient(x * w * 1.6, 0, x * w * 1.6 + w * 0.22, 0);
      band.addColorStop(0, "rgba(255,255,255,0)");
      band.addColorStop(0.5, `rgba(255,255,255,${a})`);
      band.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = band;
      ctx.fillRect(x * w * 1.6, -h, w * 0.22, h * 3);
    }
    ctx.restore();
    // The instruction, with a coin.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(60,40,110,.82)";
    ctx.font = `900 ${Math.round(w * 0.17)}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
    ctx.fillText("SCRATCH", w / 2, h * 0.44, w * 0.86);
    ctx.font = `800 ${Math.round(w * 0.075)}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
    ctx.fillText("TO REVEAL YOUR VICE-CAPTAIN", w / 2, h * 0.6, w * 0.9);
    ctx.strokeStyle = "rgba(60,40,110,.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.22, w * 0.07, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.22, w * 0.04, 0, Math.PI * 2);
    ctx.stroke();
    applied.current = 0;
  };

  const scrape = (line: number[]) => {
    const ctx = foilRef.current?.getContext("2d");
    const { w, h } = size.current;
    if (!ctx || !w || line.length < 2) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = w * COIN * 2;
    ctx.beginPath();
    ctx.moveTo(line[0] * w, line[1] * h);
    if (line.length === 2) ctx.lineTo(line[0] * w + 0.1, line[1] * h);
    for (let i = 2; i < line.length; i += 2) ctx.lineTo(line[i] * w, line[i + 1] * h);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  };

  const flakes = (x: number, y: number, count: number) => {
    const layer = flakesRef.current;
    if (!layer || layer.childElementCount > 160) return;
    for (let i = 0; i < count; i++) {
      const flake = document.createElement("span");
      flake.className = "gg-flake";
      const s = 2 + Math.random() * 3;
      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 34;
      flake.style.cssText = `left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:${FLAKES[Math.floor(Math.random() * FLAKES.length)]};--dx:${Math.cos(angle) * speed}px;--dy:${Math.sin(angle) * speed + 8}px;--fall:${14 + Math.random() * 24}px;--rot:${(Math.random() - 0.5) * 360}deg`;
      flake.addEventListener("animationend", () => flake.remove());
      layer.appendChild(flake);
    }
  };

  // Paint once laid out, and again (with the strokes so far) on a resize.
  useLayoutEffect(() => {
    const box = bodyRef.current;
    if (!box) return undefined;
    paint();
    const observer = new ResizeObserver(() => {
      if (Math.abs(box.clientWidth - size.current.w) < 1 && Math.abs(box.clientHeight - size.current.h) < 1) return;
      paint();
    });
    observer.observe(box);
    return () => observer.disconnect();
     
  }, []);

  // Strokes arriving live: scrape them off, with flakes and the scratch sound.
  useEffect(() => {
    if (revealed) return;
    if (applied.current > lines.length) applied.current = 0;
    for (let i = applied.current; i < lines.length; i++) {
      scrape(lines[i]);
      const line = lines[i];
      const { w, h } = size.current;
      flakes(line[line.length - 2] * w, line[line.length - 1] * h, 6);
      sound.scratching();
    }
    applied.current = lines.length;
     
  }, [lines, revealed]);

  // Send strokes out in batches once the draw is in.
  useEffect(() => {
    if (!canScratch) return undefined;
    const id = window.setInterval(() => {
      if (seq === null) return;
      const open = current.current;
      if (open && open.length >= 2) {
        queue.current.push(open.slice());
        current.current = open.slice(-2);
      }
      for (const line of queue.current.splice(0)) if (line.length >= 2) onLine(seq, line);
    }, SEND_MS);
    return () => window.clearInterval(id);
  }, [canScratch, seq, onLine]);

  // Shredded clear: flakes everywhere, a flash and a bell.
  useEffect(() => {
    if (revealed && !wasRevealed.current) {
      const { w, h } = size.current;
      for (let i = 0; i < 6; i++) flakes(Math.random() * w, Math.random() * h, 18);
      setBurst((n) => n + 1);
      sound.bell();
    }
    wasRevealed.current = revealed;
  }, [revealed]);

  const finish = () => {
    if (cleared || seq === null) return;
    setCleared(true);
    onDone(seq);
  };

  // How much of the foil is gone.
  const coverage = () => {
    const canvas = foilRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return 0;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let gone = 0;
    let n = 0;
    for (let i = 3; i < data.length; i += 16) {
      n++;
      if (data[i] < 128) gone++;
    }
    return n ? gone / n : 0;
  };

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
  };

  const stroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canScratch || revealed) return;
    if (!touched.current) {
      touched.current = true;
      if (state === "ready") onFirstTouch();
    }
    const p = point(event);
    const prev = last.current;
    scrape(prev ? [prev.x, prev.y, p.x, p.y] : [p.x, p.y]);
    last.current = p;
    if (!current.current) current.current = [];
    current.current.push(Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000);
    const { w, h } = size.current;
    const fx = p.x * w;
    const fy = p.y * h;
    const lf = lastFlake.current;
    if (!lf || Math.hypot(fx - lf.x, fy - lf.y) > 12) {
      lastFlake.current = { x: fx, y: fy };
      flakes(fx, fy, 10);
    }
    sound.scratching();
    const now = performance.now();
    if (now - checked.current > 350) {
      checked.current = now;
      if (coverage() >= REVEAL_AT) finish();
    }
  };

  const lift = () => {
    if (current.current && current.current.length >= 2) queue.current.push(current.current);
    current.current = null;
    last.current = null;
    lastFlake.current = null;
    if (canScratch && !revealed && coverage() >= REVEAL_AT) finish();
  };

  const foot =
    state === "revealed" || cleared
      ? `Vice-captain · with ${captain}`
      : state === "scratching"
        ? canScratch
          ? "Keep scratching!"
          : `${captain} is scratching…`
        : state === "ready"
          ? canScratch
            ? "Your turn · scratch it"
            : `${captain} scratches next`
          : "Waits its turn";

  return (
    <div
      className={`gg-ticket ${revealed ? "is-revealed" : ""} ${state === "ready" || state === "scratching" ? "is-active" : ""} ${state === "waiting" ? "is-waiting" : ""}`}
      style={{ ["--team" as string]: team.color }}
    >
      <div className="gg-ticket-head">
        <span className="truncate">{team.name}</span>
        <span className="gg-ticket-no">
          {index + 1}/{total}
        </span>
      </div>
      <div ref={bodyRef} className="gg-ticket-body">
        <div className="gg-ticket-prize">
          {person ? (
            <>
              <Avatar id={person.id} name={person.name} color={team.color} size={64} />
              <span className="gg-ticket-name">{person.name}</span>
              {person.filler ? <span className="gg-ticket-sub">to be named</span> : person.channel ? <span className="gg-ticket-sub">{channelLabel(person.channel)}</span> : null}
            </>
          ) : (
            <span className="gg-ticket-q">?</span>
          )}
        </div>
        {burst > 0 && <span key={burst} className="gg-ticket-flash" aria-hidden />}
        <canvas
          ref={foilRef}
          aria-label={canScratch && !revealed ? `Scratch ${team.name}'s ticket to reveal their vice-captain` : undefined}
          className={`gg-ticket-foil ${revealed ? "is-gone" : ""} ${canScratch && !revealed ? "is-live" : ""}`}
          onPointerDown={(event) => {
            if (!canScratch || revealed) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            stroke(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons > 0) stroke(event);
          }}
          onPointerUp={lift}
          onPointerCancel={lift}
          onDoubleClick={() => {
            if (!canScratch || revealed || seq === null) return;
            queue.current.push([0, 0, 1, 1, 0, 1, 1, 0]);
            finish();
          }}
        />
        <div ref={flakesRef} aria-hidden className="pointer-events-none absolute inset-0 z-[3]" />
      </div>
      <div className="gg-ticket-foot">{foot}</div>
    </div>
  );
}

"use client";

import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, FastForward, Link2, Pause, Play, ShieldCheck, ShieldQuestion, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildState } from "@/lib/greatGame/engine";
import { PHASE_LABEL, type GGAction, type GGConfig, type GGPhase, type GGState } from "@/lib/greatGame/model";
import { checkReceipts, type Receipt } from "@/lib/greatGame/receipts";
import { DRUM_MS } from "./GGAirLottery";
import { GGRoom, type GGSource } from "./GGApp";
import { describe } from "./GGLog";
import { REEL_MS } from "./GGMajorReel";
import { FLIGHT, RECRUIT_MS } from "./GGRecruitTable";
import { Flag, nationName, person, teamById } from "./ggUi";
import type { GGScratch, GGViewerInfo } from "./useGreatGame";

/**
 * The replay (/greatgame/<event>/replay): the draft room itself, rebuilt in
 * the browser from the log move by move and played back on a virtual clock,
 * so every drum ball, reel spin, scratch ticket, card flip, ban and pick plays
 * again exactly as it did. Waits between moves fast-forward (the clocks whirr
 * down); each move plays in real time. A receipts panel re-runs every random
 * draw with the revealed seed and says whether it matches.
 *
 * Open to everyone on the roster (the same access as the room), so casters
 * and players can record it.
 */

interface ReplayData {
  slug: string;
  config: GGConfig;
  log: GGAction[];
  fairness: { commit: string; seed: string | null };
  viewer: GGViewerInfo;
  avatars: Record<string, string>;
  now: number;
}

const BAR_H = 96;
/** A move's window opens this long before it, so the moment before plays too. */
const LEAD = 900;
/** With "skip the waits" on, any wait plays back in at most this long. */
const IDLE_PLAY = 1400;
/** With it off, waits play in real time, up to this long (hours between sessions still fly by). */
const REAL_MAX = 120_000;
/** The ghost hand scratches a vice-captain ticket clear in this long. */
const GHOST_MS = 3200;

/** How long each kind of move takes to play out on screen. */
function holdOf(action: GGAction): number {
  switch (action.kind) {
    case "drum.draw":
      return DRUM_MS + 1600;
    case "wheel.spin":
      return REEL_MS + 2200;
    case "vice.draw":
      return GHOST_MS + 3400;
    case "recruit.draw":
      return (action.payload.then ? RECRUIT_MS : FLIGHT.landed) + 1400;
    case "ban.set":
    case "pick.set":
      return 3200;
    case "assign.set":
      return 1300;
    case "assign.auto":
      return 2600;
    case "phase.set":
      return action.payload.phase === "locked" ? 9000 : 2600;
    case "undo":
      return 2000;
    default:
      return 1100;
  }
}

/** The least time a move needs before the next one may start, so its show isn't covered by the next. */
function needOf(action: GGAction): number {
  switch (action.kind) {
    case "assign.set":
    case "team.set":
    case "pause.set":
    case "clock.set":
    case "member.set":
    case "person.set":
    case "config.set":
      return 700;
    default:
      return holdOf(action) - 400;
  }
}

/**
 * The log on the replay's own clock: moves that came faster than their shows
 * (a burst, or a test run) are spread out so each one plays in full; longer
 * waits keep their real length (the player fast-forwards through them).
 */
function retime(log: GGAction[]): GGAction[] {
  const out: GGAction[] = [];
  log.forEach((action, i) => {
    if (i === 0) {
      out.push(action);
      return;
    }
    const gap = Math.max(0, action.at - log[i - 1].at);
    out.push({ ...action, at: out[i - 1].at + Math.max(gap, needOf(log[i - 1])) });
  });
  return out;
}

interface Segment {
  v0: number;
  v1: number;
  p0: number;
  p1: number;
}

/** The playback timeline: playback time p (ms from the start) against event time v (epoch ms). */
function buildTimeline(log: GGAction[], skip: boolean, fallback: number): { segments: Segment[]; total: number; start: number; end: number } {
  if (!log.length) return { segments: [{ v0: fallback, v1: fallback + 1, p0: 0, p1: 1 }], total: 1, start: fallback, end: fallback + 1 };
  const windows = log.map((action) => [action.at - LEAD, action.at + holdOf(action)] as [number, number]).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of windows) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const start = merged[0][0] - 600;
  const end = merged.at(-1)![1];
  const segments: Segment[] = [];
  let v = start;
  let p = 0;
  const add = (v1: number, rate: number) => {
    if (v1 <= v) return;
    const dp = (v1 - v) / rate;
    segments.push({ v0: v, v1, p0: p, p1: p + dp });
    v = v1;
    p += dp;
  };
  for (const [a, b] of merged) {
    const idle = a - v;
    if (idle > 0) add(a, Math.max(1, skip ? idle / IDLE_PLAY : idle / REAL_MAX));
    add(b, 1);
  }
  return { segments, total: p, start, end };
}

function segmentAt(segments: Segment[], key: "p" | "v", x: number): Segment {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((key === "p" ? segments[mid].p1 : segments[mid].v1) < x) lo = mid + 1;
    else hi = mid;
  }
  return segments[lo];
}

const vOf = (segments: Segment[], p: number) => {
  const s = segmentAt(segments, "p", p);
  return s.v0 + ((Math.min(Math.max(p, s.p0), s.p1) - s.p0) * (s.v1 - s.v0)) / (s.p1 - s.p0 || 1);
};
const pOf = (segments: Segment[], v: number) => {
  const s = segmentAt(segments, "v", v);
  return s.p0 + ((Math.min(Math.max(v, s.v0), s.v1) - s.v0) * (s.p1 - s.p0)) / (s.v1 - s.v0 || 1);
};
const rateOf = (segments: Segment[], p: number) => {
  const s = segmentAt(segments, "p", p);
  return (s.v1 - s.v0) / (s.p1 - s.p0 || 1);
};

/** The ghost hand's strokes for a ticket: rows back and forth, in short pieces (x, y in 0..1). */
const GHOST_LINES: number[][] = (() => {
  const out: number[][] = [];
  const rows = 8;
  const pieces = 5;
  for (let r = 0; r < rows; r++) {
    const y = 0.1 + (r * 0.8) / (rows - 1);
    for (let k = 0; k < pieces; k++) {
      const i = r % 2 ? pieces - 1 - k : k;
      const x0 = 0.04 + (i * 0.92) / pieces;
      const x1 = x0 + 0.92 / pieces;
      const [a, b] = r % 2 ? [x1, x0] : [x0, x1];
      const line: number[] = [];
      for (let j = 0; j <= 4; j++) {
        const x = a + ((b - a) * j) / 4;
        line.push(x, y + Math.sin((x + r) * 23) * 0.035);
      }
      out.push(line);
    }
  }
  return out;
})();

const PHASE_TINT: Record<GGPhase, string> = {
  teams: "#8a7fb0",
  drum: "#ffb347",
  wheel: "#ff7a59",
  vice: "#ff2bd6",
  recruits: "#b46bff",
  bans: "#ff3b5c",
  draft: "#22e5ff",
  assign: "#1fd49a",
  locked: "#ffd23f",
};

const clockOf = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
};

const NOOP_ACT = async () => "This is a replay: nothing here changes the draft.";

export default function GGReplay({ slug }: { slug: string }) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/greatgame/${slug}/replay`, { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as Partial<ReplayData> & { error?: string };
        if (cancelled) return;
        if (!response.ok || !body.log || !body.config || !body.fairness || !body.viewer) {
          setError({ status: response.status, message: body.error ?? "The replay is unavailable right now." });
          return;
        }
        setData(body as ReplayData);
      } catch {
        if (!cancelled) setError({ status: 0, message: "Can't reach GameMaster. Check your connection." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <main className="gg flex items-center justify-center p-6">
        <div className="gg-panel max-w-md rounded-2xl p-8 text-center">
          <div className="gg-brush text-5xl">The Great Game</div>
          <p className="mt-4" style={{ color: "var(--gg-fg-2)" }}>
            {error.message}
          </p>
          {error.status === 401 && (
            <a className="gg-btn gg-btn-primary gg-btn-big mt-6 px-8" href={`/api/auth/login?next=${encodeURIComponent(`/greatgame/${slug}/replay`)}`}>
              Log in with Discord
            </a>
          )}
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="gg flex items-center justify-center">
        <div className="gg-brush text-5xl">The Great Game</div>
      </main>
    );
  }
  return <Player data={data} />;
}

function Player({ data }: { data: ReplayData }) {
  const { slug, config, fairness, avatars } = data;
  const realLog = data.log;
  const log = useMemo(() => retime(realLog), [realLog]);
  const [skip, setSkip] = useState(true);
  const timeline = useMemo(() => buildTimeline(log, skip, data.now), [log, skip, data.now]);
  const { segments, total } = timeline;

  // The playhead. The ref is the exact clock (where it was when it last
  // started or stopped, and when), read by the room's animations; `p` is the
  // same moment for rendering, refreshed ten times a second while playing.
  const anchor = useRef<{ p: number; wall: number; playing: boolean } | null>(null);
  const [opening] = useState(() => {
    // Open where the link says (?t=<move>), and with the receipts if asked (?receipts=1).
    const params = new URLSearchParams(window.location.search);
    const target = log.find((action) => action.seq === Number(params.get("t")));
    return { p: target ? pOf(segments, target.at - LEAD) : 0, receipts: Boolean(params.get("receipts")) };
  });
  const [p, setP] = useState(opening.p);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  /** Bumped on a seek backwards: the room starts over from that moment. */
  const [generation, setGeneration] = useState(0);
  const [receiptsOpen, setReceiptsOpen] = useState(opening.receipts);
  const [copied, setCopied] = useState(false);
  const segmentsRef = useRef(segments);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  const pNow = useCallback(() => {
    const a = anchor.current ?? { p: opening.p, wall: 0, playing: false };
    return a.playing ? Math.min(segmentsRef.current.at(-1)!.p1, a.p + (performance.now() - a.wall)) : a.p;
  }, [opening.p]);
  const serverNow = useCallback(() => vOf(segmentsRef.current, pNow()), [pNow]);
  const setAnchor = useCallback((at: number, run: boolean) => {
    anchor.current = { p: at, wall: performance.now(), playing: run };
    setP(at);
  }, []);

  // Refresh ten times a second while playing; stop at the end.
  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => {
      const end = segmentsRef.current.at(-1)!.p1;
      const now = pNow();
      if (now >= end) {
        setAnchor(end, false);
        setPlaying(false);
      } else setP(now);
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, pNow, setAnchor]);

  const v = vOf(segments, p);
  const rate = playing ? rateOf(segments, p) : 1;
  let count = 0;
  while (count < log.length && log[count].at <= v) count++;
  const state = useMemo(() => buildState(slug, config, log.slice(0, count), fairness, log[count - 1]?.at ?? timeline.start), [slug, config, log, count, fairness, timeline.start]);
  const finalState = useMemo(() => buildState(slug, config, realLog, fairness, data.now), [slug, config, realLog, fairness, data.now]);
  // The receipts run on the real log (a timed-out draw is checked against the real clock).
  const check = useMemo(() => checkReceipts(slug, config, realLog, fairness), [slug, config, realLog, fairness]);
  // The real time of this moment: the last move's real time plus the replay time since it.
  const wall = count ? realLog[count - 1].at + (v - log[count - 1].at) : (realLog[0]?.at ?? data.now) - ((log[0]?.at ?? v) - v);

  const play = useCallback(() => {
    const here = pNow();
    const fromStart = here >= segmentsRef.current.at(-1)!.p1 - 50;
    if (fromStart && here > 0) setGeneration((g) => g + 1);
    setAnchor(fromStart ? 0 : here, true);
    setPlaying(true);
    setStarted(true);
  }, [pNow, setAnchor]);
  const pause = useCallback(() => {
    setAnchor(pNow(), false);
    setPlaying(false);
  }, [pNow, setAnchor]);
  const isPlaying = useCallback(() => Boolean(anchor.current?.playing), []);
  const seek = useCallback(
    (target: number) => {
      const to = Math.max(0, Math.min(segmentsRef.current.at(-1)!.p1, target));
      if (to < pNow() - 30) setGeneration((g) => g + 1);
      setAnchor(to, isPlaying());
    },
    [pNow, setAnchor, isPlaying],
  );
  const toggleSkip = () => {
    // Keep the same moment when the timeline changes shape.
    const here = serverNow();
    const next = buildTimeline(log, !skip, data.now);
    segmentsRef.current = next.segments;
    setAnchor(pOf(next.segments, here), isPlaying());
    setSkip(!skip);
  };
  const nextMove = useCallback(() => {
    const now = serverNow();
    const target = log.find((action) => action.at - LEAD > now + 50);
    seek(target ? pOf(segmentsRef.current, target.at - LEAD) : segmentsRef.current.at(-1)!.p1);
  }, [log, seek, serverNow]);
  const prevMove = useCallback(() => {
    const here = pNow();
    const target = [...log].reverse().find((action) => pOf(segmentsRef.current, action.at - LEAD) < here - 1200);
    seek(target ? pOf(segmentsRef.current, target.at - LEAD) : 0);
  }, [log, pNow, seek]);

  // Keys: space plays and pauses, the arrows step move by move.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.closest("input, textarea, select, button, a, [contenteditable], [role=slider]"))) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (isPlaying()) pause();
        else play();
      } else if (event.key === "ArrowRight") nextMove();
      else if (event.key === "ArrowLeft") prevMove();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextMove, pause, play, prevMove, isPlaying]);

  // The ghost hand scratching the latest vice-captain ticket (the strokes themselves weren't saved).
  const draw = state.last_draw;
  const ghostOn = Boolean(draw && draw.kind === "vice");
  const ghostSince = ghostOn && draw ? v - draw.at : 0;
  const ghostN = Math.min(GHOST_LINES.length, Math.floor((Math.max(0, ghostSince) / GHOST_MS) * GHOST_LINES.length));
  const ghostDone = ghostOn && ghostSince >= GHOST_MS + 200;
  const ghostSeq = draw?.seq ?? 0;
  const scratch = useMemo<GGScratch | null>(
    () => (ghostOn ? { seq: ghostSeq, lines: GHOST_LINES.slice(0, ghostN), done: ghostDone } : null),
    [ghostOn, ghostSeq, ghostN, ghostDone],
  );

  const viewer = useMemo<GGViewerInfo>(() => ({ id: "__replay__", name: data.viewer.name, role: "caster", organizer: false, captainOf: null, teamOf: null }), [data.viewer.name]);
  const noop = useCallback(() => undefined, []);
  const reload = useCallback(async () => true, []);
  const source: GGSource = {
    state,
    viewer,
    error: null,
    considering: {},
    viewers: 0,
    live: true,
    demo: false,
    avatars,
    scratch,
    hover: null,
    act: NOOP_ACT,
    consider: noop,
    reveal: NOOP_ACT,
    sendScratch: noop,
    sendHover: noop,
    serverNow,
    reload,
  };

  // The chapters (one per step) and the marks on the timeline.
  const chapters = useMemo(() => {
    const out: { phase: GGPhase; p: number }[] = [{ phase: "teams", p: 0 }];
    for (const action of log) {
      if (action.kind !== "phase.set") continue;
      const phase = action.payload.phase as GGPhase;
      if (out.at(-1)!.phase !== phase) out.push({ phase, p: pOf(segments, action.at) });
    }
    return out;
  }, [log, segments]);
  const receiptsBySeq = useMemo(() => new Map(check.receipts.map((receipt) => [receipt.seq, receipt])), [check]);
  const marks = useMemo(
    () =>
      log.map((action) => ({
        seq: action.seq,
        x: pOf(segments, action.at) / total,
        kind: receiptsBySeq.has(action.seq) ? "draw" : action.kind === "ban.set" ? "ban" : action.kind === "pick.set" ? "pick" : action.kind === "phase.set" ? "step" : "move",
      })),
    [log, segments, total, receiptsBySeq],
  );

  const shareMoment = () => {
    const current = log[Math.max(0, count - 1)];
    const url = new URL(window.location.href);
    url.search = current ? `?t=${current.seq}` : "";
    void navigator.clipboard?.writeText(url.toString()).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };
  const download = () => {
    const blob = new Blob([JSON.stringify({ slug, config, log: realLog, fairness, exported_at: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `great-game-${slug}-log.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  };

  const sealed = !fairness.seed;
  const corner = (
    <a className="gg-btn" href={`/greatgame/${slug}`} title="Back to the draft room">
      <ArrowLeft size={16} aria-hidden /> <span className="hidden @min-[460px]:inline">Draft room</span>
    </a>
  );

  return (
    <>
      <GGRoom key={generation} slug={slug} game={source} replay={{ corner, bottom: BAR_H }} />
      <div className="gg-replay-ui">

      {/* Fast-forward: VHS tracking lines over the room and a badge, while a wait whirrs past. */}
      <div className={`gg-ff-veil ${rate > 1.5 ? "is-on" : ""}`} style={{ bottom: BAR_H }} aria-hidden />
      {rate > 1.5 && (
        <div className="gg-ff-badge" style={{ bottom: BAR_H + 14 }} role="status">
          <FastForward size={18} aria-hidden /> {Math.round(rate)}×
        </div>
      )}

      {receiptsOpen && <ReceiptsPanel state={finalState} check={check} sealed={sealed} commit={fairness.commit} seed={fairness.seed} onClose={() => setReceiptsOpen(false)} onWatch={(seq) => {
        const target = log.find((action) => action.seq === seq);
        if (target) seek(pOf(segmentsRef.current, target.at - LEAD));
      }} />}

      {!started && (
        <button type="button" className="gg-replay-intro" style={{ bottom: BAR_H }} onClick={play} aria-label="Play the replay">
          <span className="gg-replay-intro-card">
            <span className="gg-brush" style={{ fontSize: 46, lineHeight: 1 }}>
              The Great Game
            </span>
            <span className="gg-replay-intro-title">Replay</span>
            <span className="gg-replay-intro-meta">
              {log.length
                ? `${log.length} moves · ${clockOf(total)} · ${new Date(timeline.start + 600).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })}`
                : "Nothing to replay yet: the draft hasn't started"}
            </span>
            <span className={`gg-replay-intro-proof ${sealed ? "is-sealed" : check.mismatches ? "is-bad" : ""}`}>
              {sealed ? <ShieldQuestion size={15} aria-hidden /> : <ShieldCheck size={15} aria-hidden />}
              {sealed ? `${check.receipts.length} draws sealed until the seed is revealed` : check.mismatches ? `${check.mismatches} of ${check.receipts.length} draws don't match` : `All ${check.receipts.length} draws check out`}
            </span>
            <span className="gg-replay-intro-play">
              <Play size={30} aria-hidden fill="currentColor" />
            </span>
            <span className="gg-replay-intro-hint">Space plays and pauses · ← → step move by move</span>
          </span>
        </button>
      )}

      <Transport
        p={p}
        v={wall}
        total={total}
        playing={playing}
        chapters={chapters}
        marks={marks}
        rate={rate}
        skip={skip}
        sealed={sealed}
        check={check}
        receiptsOpen={receiptsOpen}
        copied={copied}
        describeAt={(x) => {
          const target = x * total;
          let best = log[0];
          let bestD = Infinity;
          for (const action of log) {
            const d = Math.abs(pOf(segments, action.at) - target);
            if (d < bestD) {
              best = action;
              bestD = d;
            }
          }
          const real = realLog.find((action) => action.seq === best?.seq);
          return best && real ? `${describe(finalState, real)} · ${new Date(real.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "";
        }}
        onPlay={play}
        onPause={pause}
        onSeek={(x) => seek(x * total)}
        onPrev={prevMove}
        onNext={nextMove}
        onSkip={toggleSkip}
        onReceipts={() => setReceiptsOpen(!receiptsOpen)}
        onShare={shareMoment}
        onDownload={download}
      />
      </div>
    </>
  );
}

function Transport(props: {
  p: number;
  v: number;
  total: number;
  playing: boolean;
  chapters: { phase: GGPhase; p: number }[];
  marks: { seq: number; x: number; kind: string }[];
  rate: number;
  skip: boolean;
  sealed: boolean;
  check: ReturnType<typeof checkReceipts>;
  receiptsOpen: boolean;
  copied: boolean;
  describeAt: (x: number) => string;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (x: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  onReceipts: () => void;
  onShare: () => void;
  onDownload: () => void;
}) {
  const { p, v, total, playing, chapters, marks, check, sealed } = props;
  const track = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  // The same, readable at once (a quick click's release can come before a re-render).
  const dragging = useRef(false);
  const [hover, setHover] = useState<{ x: number; text: string } | null>(null);
  const xOf = (clientX: number) => {
    const box = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - box.left) / box.width));
  };
  const at = drag ?? p / total;
  const chapterNow = [...chapters].reverse().find((chapter) => chapter.p <= at * total) ?? chapters[0];
  return (
    <div className="gg-transport" style={{ height: BAR_H }}>
      <div className="gg-transport-left">
        <button type="button" className="gg-transport-step" onClick={props.onPrev} aria-label="Previous move" title="Previous move (←)">
          <ChevronLeft size={20} />
        </button>
        <button type="button" className="gg-transport-play" onClick={playing ? props.onPause : props.onPlay} aria-label={playing ? "Pause" : "Play"} title="Play / pause (space)">
          {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        </button>
        <button type="button" className="gg-transport-step" onClick={props.onNext} aria-label="Next move" title="Next move (→)">
          <ChevronRight size={20} />
        </button>
        <div className="gg-transport-time">
          <b className="gg-digit">
            {clockOf(at * total)} <span>/ {clockOf(total)}</span>
          </b>
          <small>
            <span className="gg-transport-chapter" style={{ ["--tint" as string]: PHASE_TINT[chapterNow.phase] }}>
              {PHASE_LABEL[chapterNow.phase]}
            </span>{" "}
            · {new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </small>
        </div>
      </div>

      <div className="gg-transport-mid">
        <div
          ref={track}
          className="gg-track"
          role="slider"
          tabIndex={0}
          aria-label="Replay position"
          aria-valuemin={0}
          aria-valuemax={Math.round(total / 1000)}
          aria-valuenow={Math.round((at * total) / 1000)}
          aria-valuetext={clockOf(at * total)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") props.onSeek(Math.min(1, at + 5000 / total));
            if (event.key === "ArrowLeft") props.onSeek(Math.max(0, at - 5000 / total));
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            dragging.current = true;
            setDrag(xOf(event.clientX));
          }}
          onPointerMove={(event) => {
            const x = xOf(event.clientX);
            setHover({ x, text: props.describeAt(x) });
            if (dragging.current) setDrag(x);
          }}
          onPointerUp={(event) => {
            if (!dragging.current) return;
            dragging.current = false;
            props.onSeek(xOf(event.clientX));
            setDrag(null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          <div className="gg-track-chapters">
            {chapters.map((chapter, i) => {
              const end = chapters[i + 1]?.p ?? total;
              return (
                <span
                  key={`${chapter.phase}-${i}`}
                  className="gg-track-chapter"
                  style={{ left: `${(chapter.p / total) * 100}%`, width: `${((end - chapter.p) / total) * 100}%`, ["--tint" as string]: PHASE_TINT[chapter.phase] }}
                  title={PHASE_LABEL[chapter.phase]}
                >
                  <em>{PHASE_LABEL[chapter.phase]}</em>
                </span>
              );
            })}
          </div>
          <div className="gg-track-fill" style={{ width: `${at * 100}%` }} />
          {marks.map((mark) => (
            <i key={mark.seq} className={`gg-track-mark is-${mark.kind}`} style={{ left: `${mark.x * 100}%` }} />
          ))}
          <div className="gg-track-head" style={{ left: `${at * 100}%` }} />
          {hover && (
            <div className="gg-track-tip" style={{ left: `${hover.x * 100}%` }}>
              {hover.text}
            </div>
          )}
        </div>
      </div>

      <div className="gg-transport-right">
        <button type="button" className={`gg-btn ${props.skip ? "is-on" : ""}`} onClick={props.onSkip} aria-pressed={props.skip} title="Fast-forward through the waits between moves">
          <FastForward size={16} aria-hidden /> <span className="gg-transport-label">Skip waits</span>
        </button>
        <button type="button" className={`gg-btn ${props.receiptsOpen ? "is-on" : ""}`} onClick={props.onReceipts} title="Every random draw, checked">
          {sealed ? <ShieldQuestion size={16} aria-hidden /> : <ShieldCheck size={16} aria-hidden style={{ color: check.mismatches ? "#ff5a6e" : "var(--gg-ok)" }} />}
          <span className="gg-transport-label">Receipts</span>
        </button>
        <button type="button" className="gg-btn px-2.5" onClick={props.onShare} title="Copy a link to this moment" aria-label="Copy a link to this moment">
          {props.copied ? <Check size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
        </button>
        <button type="button" className="gg-btn px-2.5" onClick={props.onDownload} title="Download the whole log (to check the draws yourself)" aria-label="Download the log">
          <Download size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

const DRAW_NAME: Record<string, string> = {
  "drum.draw": "Lottery drum",
  "wheel.spin": "Major reel",
  "vice.draw": "Vice-captain ticket",
  "recruit.draw": "Recruit card",
  "ban.timeout": "Ban (clock ran out)",
  "pick.timeout": "Pick (clock ran out)",
  assign: "Players placed at random",
};

function ReceiptsPanel({
  state,
  check,
  sealed,
  commit,
  seed,
  onClose,
  onWatch,
}: {
  state: GGState;
  check: ReturnType<typeof checkReceipts>;
  sealed: boolean;
  commit: string;
  seed: string | null;
  onClose: () => void;
  onWatch: (seq: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <aside className="gg-panel gg-receipts" style={{ bottom: BAR_H }} aria-label="Receipts">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="gg-disp flex items-center gap-2 text-2xl font-black">
          <ShieldCheck size={20} aria-hidden /> Receipts
        </span>
        <button type="button" className="gg-btn h-8 min-h-0 px-2" onClick={onClose} aria-label="Close the receipts">
          <X size={16} />
        </button>
      </div>
      <div className="gg-scroll flex-1 px-4 pb-5">
        <section className={`gg-receipt-seal ${sealed ? "is-sealed" : check.commitOk && !check.mismatches ? "is-ok" : "is-bad"}`}>
          <div className="gg-receipt-verdict">
            {sealed
              ? "Sealed"
              : check.commitOk && !check.mismatches
                ? `All ${check.receipts.length} draws check out`
                : !check.commitOk
                  ? "The seed doesn't match the fingerprint"
                  : `${check.mismatches} of ${check.receipts.length} draws don't match`}
          </div>
          <p>
            {sealed
              ? "Every draw came from a secret seed whose fingerprint was published before the draft. Once the teams lock and an organizer reveals it, this page re-runs every draw below and checks it. What was drawn, and from what, is already public."
              : "Your browser rebuilt the event as it stood before each draw, ran the same rules the server ran with the revealed seed, and compared the result with what was logged."}
          </p>
          <div className="gg-receipt-code">
            <small>Fingerprint</small>
            <span>{commit}</span>
          </div>
          {seed && (
            <div className="gg-receipt-code">
              <small>Seed</small>
              <span>{seed}</span>
            </div>
          )}
          {seed && (
            <div className="gg-receipt-code">
              <small>SHA-256 of the seed</small>
              <span style={{ color: check.commitOk ? "var(--gg-ok)" : "#ff9b9b" }}>{check.commitOk ? "✓ is the fingerprint" : "✗ is not the fingerprint"}</span>
            </div>
          )}
        </section>

        <ol className="mt-3 grid gap-2">
          {check.receipts.map((receipt) => (
            <ReceiptRow key={receipt.seq} state={state} receipt={receipt} open={open === receipt.seq} onToggle={() => setOpen(open === receipt.seq ? null : receipt.seq)} onWatch={() => onWatch(receipt.seq)} />
          ))}
        </ol>
        {!check.receipts.length && (
          <p className="mt-4 text-[13px]" style={{ color: "var(--gg-fg-3)" }}>
            No random draws yet.
          </p>
        )}
      </div>
    </aside>
  );
}

function Item({ state, id, picked }: { state: GGState; id: string; picked: boolean }) {
  const team = teamById(state, id);
  const who = team ? null : person(state, id);
  const nation = !team && !who;
  return (
    <span className={`gg-receipt-item ${picked ? "is-picked" : ""}`} style={team ? { ["--team" as string]: team.color } : undefined}>
      {nation && <Flag tag={id} w={16} h={11} />}
      {team ? team.name : who ? who.name : nationName(state, id)}
    </span>
  );
}

function ReceiptRow({ state, receipt, open, onToggle, onWatch }: { state: GGState; receipt: Receipt; open: boolean; onToggle: () => void; onWatch: () => void }) {
  const action = state.log.find((entry) => entry.seq === receipt.seq);
  return (
    <li className={`gg-receipt is-${receipt.status} ${receipt.undone ? "is-undone" : ""}`}>
      <button type="button" className="gg-receipt-head" onClick={onToggle} aria-expanded={open}>
        <span className="gg-digit gg-receipt-seq">#{receipt.seq}</span>
        <span className="min-w-0 flex-1">
          <span className="gg-receipt-kind">{DRAW_NAME[receipt.label] ?? receipt.label}</span>
          <span className="gg-receipt-what">{action ? describe(state, action) : ""}</span>
        </span>
        <span className="gg-receipt-status">{receipt.status === "ok" ? "✓ Checked" : receipt.status === "sealed" ? "Sealed" : "✗ No match"}</span>
      </button>
      {open && (
        <div className="gg-receipt-body">
          {receipt.pool.length > 0 && (
            <>
              <small>
                Drawn from {receipt.pool.length}
                {receipt.pool.length > 1 ? ", sorted:" : " (the only one left)"}
              </small>
              <div className="gg-receipt-pool">
                {receipt.pool.map((id, index) => (
                  <span key={id} className="contents">
                    <b className="gg-digit">{index}</b>
                    <Item state={state} id={id} picked={id === receipt.picked} />
                  </span>
                ))}
              </div>
            </>
          )}
          {receipt.placements && (
            <div className="gg-receipt-pool">
              {receipt.placements.map((placement) => (
                <span key={placement.person} className="contents">
                  <Item state={state} id={placement.person} picked={false} />
                  <Item state={state} id={placement.tag} picked />
                </span>
              ))}
            </div>
          )}
          {receipt.trace && (
            <p className="gg-digit gg-receipt-trace">
              HMAC-SHA256(seed, &quot;{receipt.trace.message}&quot;) → word {receipt.trace.word} = {receipt.trace.value} → {receipt.trace.value} mod {receipt.pool.length} = {receipt.trace.index}
            </p>
          )}
          {receipt.undone && <p className="gg-receipt-trace">Undone later by an organizer (still checked: it was drawn).</p>}
          <button type="button" className="gg-btn h-8 min-h-0 px-2.5 text-xs" onClick={onWatch}>
            <Play size={13} aria-hidden /> Watch this moment
          </button>
        </div>
      )}
    </li>
  );
}

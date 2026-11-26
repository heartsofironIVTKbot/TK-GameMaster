"use client";

import { Music2, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ANTHEM_LINES, type AnthemLine } from "./anthemLyrics";

/**
 * The Great Game anthem on the front page. `useAnthem` owns the <audio> and
 * the time; the pieces go where they belong in the page: the play button with
 * the hero's buttons (browsers don't let music start by itself), karaoke
 * lyrics over the sea that light up word by word as they're sung, and a mini
 * player that stays on screen while scrolling. While it plays,
 * `anthemBeat.level` follows the bass so the scene can pulse with it.
 */

/** The music's low-end level, 0..1, for the scene to pulse with (read every frame). */
export const anthemBeat = { level: 0 };

const SOURCES = [
  { src: "/greatgame/anthem.opus", type: 'audio/ogg; codecs="opus"' },
  { src: "/greatgame/anthem.m4a", type: "audio/mp4" },
];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The line being sung at `t` (held a moment after it ends), or null in a gap. */
function lineAt(t: number): { line: AnthemLine; index: number } | null {
  for (let i = ANTHEM_LINES.length - 1; i >= 0; i--) {
    const line = ANTHEM_LINES[i];
    if (t >= line.start - 0.15) {
      const next = ANTHEM_LINES[i + 1];
      const hold = next ? Math.min(1.2, next.start - line.end - 0.15) : 1.2;
      return t <= line.end + Math.max(0, hold) ? { line, index: i } : null;
    }
  }
  return null;
}

export function useAnthem() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const graph = useRef<{ ctx: AudioContext; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(0);

  // The length may already be known before the page hydrates (its event fired too early to catch).
  useEffect(() => {
    const el = audioRef.current;
    if (el && Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
  }, []);

  // Follow the music every frame while it plays (the lyrics and the beat).
  useEffect(() => {
    if (!playing) {
      anthemBeat.level = 0;
      return undefined;
    }
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const el = audioRef.current;
      if (!el) return;
      setT(el.currentTime);
      if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
      const g = graph.current;
      if (g) {
        g.analyser.getByteFrequencyData(g.data);
        let sum = 0;
        for (let i = 1; i < 8; i++) sum += g.data[i];
        const level = Math.max(0, Math.min(1, (sum / 7 / 255 - 0.5) / 0.45));
        anthemBeat.level = Math.max(level, anthemBeat.level * 0.9);
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    if (!graph.current) {
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaElementSource(el).connect(analyser);
        analyser.connect(ctx.destination);
        graph.current = { ctx, analyser, data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) };
      } catch {
        // No Web Audio: the music still plays, just without the pulse.
      }
    }
    await graph.current?.ctx.resume().catch(() => undefined);
    if (el.ended) el.currentTime = 0;
    el.volume = 0.85;
    await el.play().catch(() => undefined);
    setStarted(true);
  }, []);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setT(0);
    setStarted(false);
  }, []);

  const seek = useCallback((to: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, to));
    setT(el.currentTime);
  }, []);

  const toggleMute = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }, []);

  const element = (
    <audio
      ref={audioRef}
      preload="metadata"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={(event) => {
        // Back to the start: the lyrics and the bar go, the note returns, the button says Play again.
        event.currentTarget.currentTime = 0;
        setPlaying(false);
        setStarted(false);
        setT(0);
      }}
      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      onSeeked={(event) => setT(event.currentTarget.currentTime)}
    >
      {SOURCES.map((source) => (
        <source key={source.src} src={source.src} type={source.type} />
      ))}
    </audio>
  );

  return { element, playing, started, muted, t, duration, toggle, stop, seek, toggleMute };
}

export type Anthem = ReturnType<typeof useAnthem>;

/** The hero's button. */
export function AnthemButton({ anthem }: { anthem: Anthem }) {
  return (
    <button type="button" className={`ggf-btn ggfa-play ${anthem.playing ? "is-playing" : ""}`} onClick={anthem.toggle} aria-pressed={anthem.playing}>
      {anthem.playing ? (
        <span className="ggfa-eq" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : (
        <Music2 size={17} aria-hidden />
      )}
      {anthem.playing ? "Pause the anthem" : anthem.started ? "Resume the anthem" : "Play the anthem"}
    </button>
  );
}

function Karaoke({ line, t }: { line: AnthemLine; t: number }) {
  return (
    <span className="ggfa-line">
      {line.words.map((word, i) => {
        const p = Math.max(0, Math.min(1, (t - word.start) / Math.max(0.12, word.end - word.start)));
        return (
          <span key={i} className={`ggfa-word ${p >= 1 ? "is-sung" : ""}`} style={{ ["--p" as string]: p }}>
            {word.text}
          </span>
        );
      })}
    </span>
  );
}

/** The lyrics over the sea: the section, the line lighting up word by word, the next line. */
export function AnthemLyrics({ anthem }: { anthem: Anthem }) {
  if (!anthem.started) return null;
  const { t } = anthem;
  const current = lineAt(t);
  const next = current ? ANTHEM_LINES[current.index + 1] : ANTHEM_LINES.find((line) => line.start > t);
  const soon = next && next.start - t < 5;
  const section = current?.line.section ?? (soon ? next.section : null);
  return (
    <div className="ggfa-lyrics" aria-hidden>
      <span className="ggfa-section">{section ?? " "}</span>
      {current ? (
        <Karaoke key={current.index} line={current.line} t={t} />
      ) : (
        <span className="ggfa-line ggfa-rest" key={`rest-${next?.start ?? "end"}`}>
          <span className="ggfa-eq" aria-hidden>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      )}
      <span className="ggfa-next">{next && (current || soon) ? next.text : " "}</span>
      <span className="ggfa-progress">
        <i style={{ width: `${anthem.duration ? (t / anthem.duration) * 100 : 0}%` }} />
      </span>
    </div>
  );
}

/** The mini player, bottom right, once you scroll away from the hero (until it's closed). */
export function AnthemMini({ anthem, showLine }: { anthem: Anthem; showLine: boolean }) {
  if (!anthem.started || !showLine) return null;
  const { t, duration, playing, muted } = anthem;
  const current = lineAt(t);
  return (
    <div className="ggfa-mini" role="region" aria-label="The Great Game anthem">
      <button type="button" className="ggfa-mini-play" onClick={anthem.toggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <div className="ggfa-mini-body">
        <b>{current ? current.line.text : "The Great Game · Anthem"}</b>
        <div className="ggfa-mini-bar">
          <span className="ggfa-mini-time">{clock(t)}</span>
          <span
            className="ggfa-mini-track"
            role="slider"
            tabIndex={0}
            aria-label="Position in the anthem"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(t)}
            aria-valuetext={clock(t)}
            onClick={(event) => {
              if (!duration) return;
              const box = event.currentTarget.getBoundingClientRect();
              anthem.seek(((event.clientX - box.left) / box.width) * duration);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") anthem.seek(t + 5);
              if (event.key === "ArrowLeft") anthem.seek(t - 5);
            }}
          >
            <i style={{ width: `${duration ? (t / duration) * 100 : 0}%` }} />
          </span>
          <span className="ggfa-mini-time">{clock(duration)}</span>
        </div>
      </div>
      <button type="button" className="ggfa-mini-icon" onClick={anthem.toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <button type="button" className="ggfa-mini-icon" onClick={anthem.stop} aria-label="Stop and close">
        <X size={16} />
      </button>
    </div>
  );
}

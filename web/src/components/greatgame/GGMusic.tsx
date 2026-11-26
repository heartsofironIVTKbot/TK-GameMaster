"use client";

import { Music2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { nowPlaying, PLAYLIST, useMusic, useMusicVolume } from "./ggPlaylist";
import { setSound, useSoundSwitch } from "./ggSound";

/**
 * The music button in the draft room's top bar and the player behind it: the
 * rotation (ggPlaylist.ts) plays on the server's clock, so everyone hears
 * the same track at the same moment. Each track fades in and out at its
 * edges, the music dips under the big moments (a draw, a ban or pick stamp)
 * so the effects punch through, and it resyncs if it drifts. Browsers only
 * allow sound after a click, so a blocked start waits for the first one.
 */

const clamp = (v: number) => Math.max(0, Math.min(1, v));

export default function GGMusic({ clock, duck }: { clock: () => number; duck: boolean }) {
  const [musicOn, setMusicOn] = useMusic();
  const [volume, setVolume] = useMusicVolume();
  const [soundOn] = useSoundSwitch();
  const wants = musicOn && soundOn;
  const audio = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(() => nowPlaying(clock()).index);
  const [playing, setPlaying] = useState(false);
  const [needsClick, setNeedsClick] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  // Live values for the frame loop.
  const live = useRef({ volume, duck });
  useEffect(() => {
    live.current = { volume, duck };
  }, [volume, duck]);

  useEffect(() => {
    const el = audio.current;
    if (!el) return undefined;
    if (!wants) {
      el.pause();
      return undefined;
    }
    let frame = 0;
    let current = -1;
    let lastCheck = 0;
    let blocked = false;
    let level = 1;
    const tryPlay = () => {
      void el.play().then(
        () => {
          blocked = false;
          setNeedsClick(false);
        },
        (error: unknown) => {
          if (error instanceof DOMException && error.name === "NotAllowedError") {
            blocked = true;
            setNeedsClick(true);
          }
        },
      );
    };
    const unblock = () => {
      if (blocked) tryPlay();
    };
    const onLoaded = () => {
      const at = nowPlaying(clock());
      if (at.index === current) el.currentTime = at.offset;
    };
    el.addEventListener("loadedmetadata", onLoaded);
    window.addEventListener("pointerdown", unblock);
    window.addEventListener("keydown", unblock);
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now();
      const at = nowPlaying(clock());
      if (at.index !== current) {
        current = at.index;
        el.src = PLAYLIST[at.index].src;
        el.currentTime = at.offset;
        setIndex(at.index);
        if (!blocked) tryPlay();
      } else if (now - lastCheck > 4000) {
        lastCheck = now;
        // Back in step if it drifted (a slow connection, a sleeping tab).
        if (!el.paused && el.readyState >= 2 && Math.abs(el.currentTime - at.offset) > 1.5) el.currentTime = at.offset;
        if (el.paused && !blocked) tryPlay();
      }
      // Fade at the track's edges, and dip under the big moments.
      const track = PLAYLIST[at.index];
      const edges = clamp(at.offset / 2) * clamp((track.duration - at.offset) / 2.5);
      level += ((live.current.duck ? 0.3 : 1) - level) * 0.06;
      el.volume = clamp(live.current.volume * edges * level);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("loadedmetadata", onLoaded);
      window.removeEventListener("pointerdown", unblock);
      window.removeEventListener("keydown", unblock);
      el.pause();
    };
  }, [wants, clock]);

  // Close the panel on a click outside it.
  useEffect(() => {
    if (!open) return undefined;
    const away = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  const track = PLAYLIST[index];
  const sounding = wants && playing;
  return (
    <div className="relative" ref={box}>
      <audio ref={audio} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      <button
        type="button"
        className={`gg-btn px-2.5 ${sounding ? "gg-music-on" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Music"
        title={sounding ? `Music: ${track.title}` : "Music"}
      >
        {sounding ? (
          <span className="gg-music-eq" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        ) : (
          <Music2 size={16} aria-hidden />
        )}
        {needsClick && wants && <span className="gg-music-dot" aria-hidden />}
      </button>
      {open && (
        <div className="gg-music-panel" role="dialog" aria-label="Music">
          <div className="gg-music-head">
            <span className="gg-disp">Music</span>
            <button type="button" className={`gg-music-switch ${musicOn ? "is-on" : ""}`} onClick={() => setMusicOn(!musicOn)} aria-pressed={musicOn}>
              <i />
              {musicOn ? "On" : "Off"}
            </button>
          </div>
          <div className="gg-music-now">
            <small>{sounding ? "Now playing" : "Up now"}</small>
            <b>{track.title}</b>
            <span>
              Track {index + 1} of {PLAYLIST.length} · the same for everyone in the room
            </span>
          </div>
          <label className="gg-music-volume">
            {volume === 0 ? <VolumeX size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
            <input type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={(event) => setVolume(Number(event.target.value) / 100)} aria-label="Music volume" />
            <span className="gg-digit">{Math.round(volume * 100)}%</span>
          </label>
          {!soundOn && (
            <button type="button" className="gg-btn mt-2 w-full" onClick={() => setSound(true)}>
              Room sound is off: turn it on
            </button>
          )}
          {needsClick && wants && <p className="gg-music-hint">Your browser waits for a click before playing sound: click anywhere to start the music.</p>}
          <ol className="gg-music-list">
            {PLAYLIST.map((entry, i) => (
              <li key={entry.src} className={i === index ? "is-now" : ""}>
                <span className="gg-digit">{String(i + 1).padStart(2, "0")}</span> {entry.title}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

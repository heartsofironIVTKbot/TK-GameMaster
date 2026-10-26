"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  allTimeZones,
  detectTimeZone,
  formatOffset,
  isValidTimeZone,
  offsetMinutes,
  zoneCity,
} from "@/lib/timeEngine";

const STORAGE_KEY = "gm_host_timezone";

/** The host's display zone: saved choice, else the device's zone. */
export function useHostTimeZone(): [string, (zone: string) => void] {
  const [zone, setZone] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && isValidTimeZone(saved)) return saved;
    } catch {
      // Storage blocked — fall back to the device zone.
    }
    return detectTimeZone();
  });
  const update = (next: string) => {
    setZone(next);
    try {
      if (next === detectTimeZone()) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
  };
  return [zone, update];
}

/** Searchable time-zone chooser (button + popover). */
export default function TimeZonePicker({
  value,
  onChange,
  align = "right",
}: {
  value: string;
  onChange: (zone: string) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const deviceZone = useMemo(() => detectTimeZone(), []);
  const zones = useMemo(() => allTimeZones(), []);
  // Offsets are read at this instant; refreshed whenever the list opens.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, "_");
    const list = needle ? zones.filter((zone) => zone.toLowerCase().includes(needle)) : zones;
    return list.slice(0, 120);
  }, [query, zones]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setNow(Date.now());
          setOpen((current) => !current);
        }}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-left text-xs font-semibold text-slate-200 transition hover:border-amber-300/40"
        title="Times on this page are shown in this time zone"
      >
        <span aria-hidden>🌐</span>
        <span className="max-w-[160px] truncate">{zoneCity(value)}</span>
        <span className="text-slate-500">{formatOffset(offsetMinutes(now, value))}</span>
        <span className="text-slate-500">▾</span>
      </button>
      {open && (
        <div
          className={`gm-fade-up absolute z-[1300] mt-2 w-72 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="border-b border-white/10 p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search city or zone…"
              className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
            />
            {deviceZone !== value && (
              <button
                type="button"
                onClick={() => {
                  onChange(deviceZone);
                  setOpen(false);
                }}
                className="mt-2 w-full rounded-lg bg-amber-400/10 px-3 py-1.5 text-left text-xs font-semibold text-amber-200 hover:bg-amber-400/20"
              >
                ↺ Use my device zone ({zoneCity(deviceZone)})
              </button>
            )}
          </div>
          <ul className="roster-scroll max-h-72 overflow-y-auto p-1">
            {filtered.map((zone) => (
              <li key={zone}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(zone);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition ${
                    zone === value ? "bg-amber-400/15 text-amber-100" : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <span className="truncate">{zone.replace(/_/g, " ")}</span>
                  <span className="shrink-0 text-slate-500">{formatOffset(offsetMinutes(now, zone))}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-slate-500">No matching zone</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

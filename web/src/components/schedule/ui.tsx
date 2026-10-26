"use client";

import { useState, type ReactNode } from "react";
import type { HostProfile } from "@/lib/scheduleTypes";

/** Small shared controls for the host calendar + game setup pages. */

export const GLASS =
  "border border-white/10 bg-slate-900/60 shadow-2xl shadow-black/40 backdrop-blur-xl";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex w-full rounded-xl border border-white/10 bg-slate-950/60 p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-lg font-semibold transition-all ${
              size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"
            } ${
              active
                ? "bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            } disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${
          checked ? "border-amber-300/60 bg-amber-400" : "border-white/15 bg-slate-700/70"
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-100">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-400">{description}</span>}
      </span>
    </label>
  );
}

export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  ariaLabel,
  marks = [],
  disabled,
}: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  marks?: { value: number; label: string }[];
  disabled?: boolean;
}) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div>
      <input
        type="range"
        className="gm-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ ["--fill" as string]: `${fill}%` }}
      />
      {marks.length > 0 && (
        <div className="relative mt-1 h-4 text-[10px] font-semibold text-slate-500">
          {marks.map((mark) => (
            <button
              key={mark.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(mark.value)}
              className="absolute -translate-x-1/2 rounded px-1 hover:text-amber-300"
              style={{ left: `${((mark.value - min) / (max - min)) * 100}%` }}
            >
              {mark.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          })
          .catch(() => {});
      }}
      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-amber-300/50 hover:text-amber-200"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function SectionCard({
  title,
  subtitle,
  icon,
  children,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {icon && <span className="mt-0.5 text-lg leading-none">{icon}</span>}
          <div className="min-w-0">
            <h3 className="text-sm font-bold tracking-wide text-slate-100">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`gm-spin inline-block rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function HostAvatar({ host, size = 32 }: { host: HostProfile; size?: number }) {
  const name = host.display_name || host.username;
  if (host.avatar) {
    return (
      // Discord CDN avatars: plain <img> keeps next/image config untouched.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://cdn.discordapp.com/avatars/${host.discord_id}/${host.avatar}.png?size=64`}
        alt=""
        width={size}
        height={size}
        className="rounded-full ring-2 ring-amber-400/40"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-xs font-black text-slate-950 ring-2 ring-amber-400/40"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

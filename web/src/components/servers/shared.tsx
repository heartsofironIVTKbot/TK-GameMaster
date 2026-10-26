"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  CreateItemBody,
  GuildSnapshot,
  ServerAccess,
  ServerSettings,
  SettingsIssue,
  SnapshotChannel,
  SnapshotRole,
  StepId,
} from "@/lib/serverSettingsTypes";
import type { ScheduleRequestStatus } from "@/lib/scheduleTypes";

/** What every setup step gets. */
export interface StepContext {
  serverId: string;
  draft: ServerSettings;
  update: (mutate: (next: ServerSettings) => void) => void;
  snapshot: GuildSnapshot | null;
  issues: SettingsIssue[];
  isHome: boolean;
  access: ServerAccess;
  setupDone: boolean;
  /** A role / channel the bot just created: reload the snapshot so pickers show it. */
  refreshSnapshot: () => Promise<void>;
  goTo: (step: StepId) => void;
}

export { inviteUrl } from "@/lib/serverSettingsTypes";

export const inputClass =
  "w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/60 focus:outline-none";

export function Field({
  label,
  hint,
  required,
  issues = [],
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  issues?: SettingsIssue[];
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
        {label}
        {required && <span className="rounded bg-amber-400/15 px-1 text-[9px] font-black uppercase tracking-wider text-amber-300">Required</span>}
      </p>
      {children}
      {hint && <p className="text-[11px] leading-snug text-slate-500">{hint}</p>}
      {issues.map((issue) => (
        <p
          key={issue.path + issue.message}
          className={`text-[11px] font-semibold ${issue.level === "error" ? "text-rose-300" : "text-amber-300"}`}
        >
          {issue.level === "error" ? "⛔ " : "⚠️ "}
          <Rich text={issue.message} />
        </p>
      ))}
    </div>
  );
}

/** **bold** in issue messages. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>,
      )}
    </>
  );
}

export function issuesAt(issues: SettingsIssue[], path: string): SettingsIssue[] {
  return issues.filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`));
}

export function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }
  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, step < 1 ? Math.round(parsed * 10) / 10 : Math.trunc(parsed)));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Less ${label}`}
          onClick={() => commit(String(value - step))}
          className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 text-lg text-slate-200 hover:border-amber-300/50"
        >
          −
        </button>
        <input
          inputMode="decimal"
          aria-label={label}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit((event.target as HTMLInputElement).value);
          }}
          className={`${inputClass} w-20 text-center font-bold`}
        />
        <button
          type="button"
          aria-label={`More ${label}`}
          onClick={() => commit(String(value + step))}
          className="h-9 w-9 rounded-lg border border-white/10 bg-white/5 text-lg text-slate-200 hover:border-amber-300/50"
        >
          +
        </button>
        {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
      </div>
    </Field>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warn" | "error" | "ok"; title?: ReactNode; children: ReactNode }) {
  const tones = {
    info: "border-sky-400/30 bg-sky-500/10 text-sky-50",
    warn: "border-amber-400/40 bg-amber-500/10 text-amber-50",
    error: "border-rose-400/40 bg-rose-500/10 text-rose-50",
    ok: "border-emerald-400/40 bg-emerald-500/10 text-emerald-50",
  };
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${tones[tone]}`}>
      {title && <p className="mb-0.5 text-sm font-black">{title}</p>}
      {children}
    </div>
  );
}

export function Card({ title, subtitle, icon, right, children }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {icon && <span className="mt-0.5 text-lg leading-none">{icon}</span>}
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-100">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function roleById(snapshot: GuildSnapshot | null, id: string | null): SnapshotRole | null {
  return id ? (snapshot?.roles.find((role) => role.id === id) ?? null) : null;
}

export function channelById(snapshot: GuildSnapshot | null, id: string | null): SnapshotChannel | null {
  return id ? (snapshot?.channels.find((channel) => channel.id === id) ?? null) : null;
}

export const CHANNEL_ICON: Record<string, string> = { text: "#", news: "📢", voice: "🔊", stage: "🎙️", category: "📁", forum: "💬" };

/** A settings value as a person reads it (history). */
export function describeValue(value: unknown, snapshot: GuildSnapshot | null): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const role = roleById(snapshot, value);
    if (role) return `@${role.name}`;
    const channel = channelById(snapshot, value);
    if (channel) return `${channel.type === "category" ? "📁 " : "#"}${channel.name}`;
    return /^\d{15,25}$/.test(value) ? `#${value} (deleted)` : value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "none";
    return value
      .map((entry) => (typeof entry === "object" && entry && "name" in entry ? String((entry as { name: unknown }).name) : describeValue(entry, snapshot)))
      .join(", ");
  }
  return JSON.stringify(value);
}

/** Readable name for a settings path ("modes.TFR.ping_role" → "TFR · ping role"). */
export function describePath(path: string): string {
  return path
    .replace(/^modes\./, "")
    .replace(/^branches\./, "")
    .replace(/\.ranks\./, " · ")
    .replace(/_/g, " ")
    .replace(/\./g, " · ");
}

/** Close a popover on outside click / Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export type CreateState = { phase: "idle" } | { phase: "working" } | { phase: "error"; message: string };

/** "Create for me": ask the bot to make a role / channel and wait for it. */
export function useCreateItem(serverId: string, onCreated: (id: string) => void, refresh: () => Promise<void>) {
  const [state, setState] = useState<CreateState>({ phase: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const create = useCallback(
    async (body: CreateItemBody) => {
      setState({ phase: "working" });
      const response = await fetch(`/api/servers/${serverId}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => null);
      const queued = (await response?.json().catch(() => null)) as { request_id?: string; error?: string } | null;
      if (!response?.ok || !queued?.request_id) {
        setState({ phase: "error", message: queued?.error ?? "Couldn't reach the website — try again." });
        return;
      }
      const started = Date.now();
      while (alive.current && Date.now() - started < 90_000) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const poll = await fetch(`/api/servers/${serverId}/requests/${queued.request_id}`, { cache: "no-store" }).catch(() => null);
        const status = (await poll?.json().catch(() => null)) as ScheduleRequestStatus | null;
        if (status?.status === "done") {
          await refresh();
          const created = status.result?.setup?.created;
          if (created?.id) onCreated(created.id);
          if (alive.current) setState({ phase: "idle" });
          return;
        }
        if (status?.status === "error") {
          if (alive.current) setState({ phase: "error", message: status.error ?? "GameMaster couldn't do that." });
          return;
        }
      }
      if (alive.current) setState({ phase: "error", message: "GameMaster hasn't answered — is the bot online? Try again in a minute." });
    },
    [serverId, onCreated, refresh],
  );
  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { state, create, reset };
}

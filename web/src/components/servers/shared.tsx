"use client";

import {
  Bot,
  Check,
  CircleAlert,
  CircleCheck,
  Drama,
  Folder,
  Gamepad2,
  Hash,
  IdCard,
  Info,
  Medal,
  Megaphone,
  MessagesSquare,
  Mic,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Tag,
  Ticket,
  TriangleAlert,
  Volume2,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { TankIcon } from "@/components/schedule/ModeIcon";
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

export const inputClass = "gm-input w-full text-sm";

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
      <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-100">
        {label}
        {required && <span className="gm-tag h-[18px] bg-brand-400/15 px-2 text-[10.5px] text-brand-400">Required</span>}
      </p>
      {children}
      {hint && <p className="text-xs leading-snug text-ink-400">{hint}</p>}
      {issues.map((issue) => {
        const Icon = issue.level === "error" ? CircleAlert : TriangleAlert;
        return (
          <p
            key={issue.path + issue.message}
            className={`flex gap-1.5 text-xs ${issue.level === "error" ? "text-rose-300" : "text-yellow-300"}`}
          >
            <Icon aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span>
              <Rich text={issue.message} />
            </span>
          </p>
        );
      })}
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
          className="gm-btn gm-btn-secondary h-9 w-9 p-0"
        >
          <Minus aria-hidden strokeWidth={2} />
        </button>
        <input maxLength={12}
          inputMode="decimal"
          aria-label={label}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit((event.target as HTMLInputElement).value);
          }}
          className="gm-input w-20 text-center text-sm font-semibold"
        />
        <button
          type="button"
          aria-label={`More ${label}`}
          onClick={() => commit(String(value + step))}
          className="gm-btn gm-btn-secondary h-9 w-9 p-0"
        >
          <Plus aria-hidden strokeWidth={2} />
        </button>
        {suffix && <span className="text-xs text-ink-400">{suffix}</span>}
      </div>
    </Field>
  );
}

const CALLOUT: Record<"info" | "warn" | "error" | "ok", { box: string; icon: LucideIcon; tint: string }> = {
  info: { box: "bg-sky-950/50 shadow-[inset_3px_0_0_var(--color-sky-300)]", icon: Info, tint: "text-sky-300" },
  warn: { box: "bg-yellow-950/40 shadow-[inset_3px_0_0_var(--color-yellow-300)]", icon: TriangleAlert, tint: "text-yellow-300" },
  error: { box: "bg-rose-950/50 shadow-[inset_3px_0_0_var(--color-rose-300)]", icon: CircleAlert, tint: "text-rose-300" },
  ok: { box: "bg-emerald-950/50 shadow-[inset_3px_0_0_var(--color-emerald-300)]", icon: CircleCheck, tint: "text-emerald-300" },
};

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warn" | "error" | "ok"; title?: ReactNode; children: ReactNode }) {
  const style = CALLOUT[tone];
  const Icon = style.icon;
  return (
    <div className={`gm-cut flex gap-2.5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-300 [--cut:9px] ${style.box}`}>
      <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${style.tint}`} strokeWidth={1.75} />
      <div className="min-w-0">
        {title && <p className="mb-0.5 text-[13px] font-semibold text-ink-100">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** One block of a settings step: a green line icon, a title, an optional note and a corner slot. */
export function Card({
  title,
  subtitle,
  icon: Icon,
  right,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: IconComponent;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="gm-cut bg-ink-950 p-4 [--cut:10px]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon && <Icon aria-hidden className="mt-0.5 h-[17px] w-[17px] shrink-0 text-brand-400" strokeWidth={1.75} />}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** A line icon component (Lucide's, or the tank drawn in their style). */
export type IconComponent = ComponentType<LucideProps>;

/** Each setup step's line icon. */
export const STEP_ICON: Record<StepId, IconComponent> = {
  welcome: Bot,
  basics: Tag,
  staff: ShieldCheck,
  branches: Medal,
  roles: IdCard,
  channels: Hash,
  modes: Gamepad2,
  features: Sparkles,
  tickets: Ticket,
  review: Check,
};

/** A host branch's icon: masks for Roleplay, the tank for Historical. */
export const BRANCH_ICON: Record<"RP" | "HIST", IconComponent> = { RP: Drama, HIST: TankIcon };

export function roleById(snapshot: GuildSnapshot | null, id: string | null): SnapshotRole | null {
  return id ? (snapshot?.roles.find((role) => role.id === id) ?? null) : null;
}

export function channelById(snapshot: GuildSnapshot | null, id: string | null): SnapshotChannel | null {
  return id ? (snapshot?.channels.find((channel) => channel.id === id) ?? null) : null;
}

/** A Discord channel type's line icon. */
export const CHANNEL_ICON: Record<string, LucideIcon> = {
  text: Hash,
  news: Megaphone,
  voice: Volume2,
  stage: Mic,
  category: Folder,
  forum: MessagesSquare,
};

/** A settings value as a person reads it (history). */
export function describeValue(value: unknown, snapshot: GuildSnapshot | null): string {
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const role = roleById(snapshot, value);
    if (role) return `@${role.name}`;
    const channel = channelById(snapshot, value);
    if (channel) return `${channel.type === "category" ? "" : "#"}${channel.name}`;
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
        setState({ phase: "error", message: queued?.error ?? "Couldn't reach the website. Try again." });
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
      if (alive.current) setState({ phase: "error", message: "GameMaster hasn't answered. Is the bot online? Try again in a minute." });
    },
    [serverId, onCreated, refresh],
  );
  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { state, create, reset };
}

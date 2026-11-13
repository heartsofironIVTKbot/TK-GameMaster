"use client";

import {
  Bot,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Dices,
  Dot,
  Filter,
  Gamepad2,
  Gavel,
  Mail,
  Repeat,
  Settings,
  Star,
  Tag,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AuditCategory, AuditEvent, AuditPage } from "@/lib/auditTypes";
import { detectTimeZone, formatInZone, formatRelative } from "@/lib/timeEngine";
import { useNow, useRefreshTick } from "@/components/attendance/labels";
import { Spinner } from "@/components/schedule/ui";

/** The audit feed (the /audit page and a player's History on the Database page). */

/** Each category's line icon and colour. Typed by the category list, so a new
 *  category without an icon fails the build (a missing "casino" icon crashed
 *  the whole /audit page, 2026-11-13). */
export const CATEGORY_ICON: Record<AuditCategory, { icon: LucideIcon; tone: string }> = {
  reservation: { icon: CalendarCheck, tone: "text-sky-300" },
  roster: { icon: Repeat, tone: "text-sky-300" },
  game: { icon: Gamepad2, tone: "text-emerald-300" },
  draft: { icon: Target, tone: "text-violet-300" },
  moderation: { icon: Gavel, tone: "text-rose-300" },
  host: { icon: Star, tone: "text-yellow-300" },
  roles: { icon: Tag, tone: "text-ink-300" },
  message: { icon: Mail, tone: "text-ink-300" },
  settings: { icon: Settings, tone: "text-yellow-300" },
  casino: { icon: Dices, tone: "text-amber-300" },
  system: { icon: Bot, tone: "text-ink-300" },
};
export const FALLBACK_ICON = { icon: Dot, tone: "text-ink-500" };

/** A category's icon, or a plain dot for one this page doesn't know (never a crash). */
export function categoryIcon(category: string): { icon: LucideIcon; tone: string } {
  return (CATEGORY_ICON as Record<string, { icon: LucideIcon; tone: string }>)[category] ?? FALLBACK_ICON;
}

const SOURCE_LABEL: Record<string, string> = { web: "Website", bot: "Bot", discord: "Discord", casino: "Casino site" };

interface Feed {
  key: string;
  events: AuditEvent[];
  next: number | null;
  counts: Partial<Record<string, number>>;
  error: string | null;
}

/**
 * Loads `/api/audit?<query>` and re-checks the first page every `refreshMs`
 * while the tab is visible (new rows merge in on top). `loadMore` appends
 * the next older page.
 */
export function useAuditFeed(query: string, refreshMs = 15_000) {
  const [tick, refresh] = useRefreshTick(refreshMs);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/audit?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (AuditPage & { error?: string }) | null;
        if (cancelled) return;
        if (!response.ok || !body?.events) {
          setFeed((previous) => ({
            key: query,
            events: previous?.key === query ? previous.events : [],
            next: previous?.key === query ? previous.next : null,
            counts: previous?.counts ?? {},
            error: body?.error ?? "Couldn't load the audit log.",
          }));
          return;
        }
        setFeed((previous) => {
          if (previous?.key !== query || previous.events.length <= body.events.length) {
            return { key: query, events: body.events, next: body.next_before, counts: body.counts ?? {}, error: null };
          }
          // Older pages are loaded: keep them and put the new rows on top.
          const seen = new Set(body.events.map((event) => event.id));
          return {
            key: query,
            events: [...body.events, ...previous.events.filter((event) => !seen.has(event.id))],
            next: previous.next,
            counts: body.counts ?? previous.counts,
            error: null,
          };
        });
      })
      .catch(() => {
        if (!cancelled) setFeed((previous) => (previous ? { ...previous, error: "Network error. Trying again." } : null));
      });
    return () => {
      cancelled = true;
    };
  }, [query, tick]);

  const current = feed?.key === query ? feed : null;
  const loadMore = () => {
    if (!current?.next || loadingMore) return;
    setLoadingMore(true);
    fetch(`/api/audit?${query}${query ? "&" : ""}before=${current.next}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (AuditPage & { error?: string }) | null;
        setFeed((previous) => {
          if (!previous || previous.key !== query) return previous;
          if (!response.ok || !body?.events) return { ...previous, error: body?.error ?? "Couldn't load older events." };
          const seen = new Set(previous.events.map((event) => event.id));
          return {
            ...previous,
            events: [...previous.events, ...body.events.filter((event) => !seen.has(event.id))],
            next: body.next_before,
            error: null,
          };
        });
      })
      .catch(() => setFeed((previous) => (previous ? { ...previous, error: "Network error. Try again." } : previous)))
      .finally(() => setLoadingMore(false));
  };

  // The chip counts don't depend on the filters: keep the last ones while a new filter loads.
  return { feed: current, counts: feed?.counts ?? {}, loading: current === null, loadingMore, loadMore, refresh };
}

function DetailValue({ value }: { value: unknown }) {
  if (value == null || value === "") return <span className="text-ink-500">none</span>;
  if (typeof value === "object") {
    return <span className="break-all font-mono text-[11px] text-ink-300">{JSON.stringify(value)}</span>;
  }
  return <span className="break-words text-ink-200">{String(value)}</span>;
}

function AuditRow({
  event,
  zone,
  now,
  onPerson,
}: {
  event: AuditEvent;
  zone: string;
  now: number;
  onPerson?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = categoryIcon(event.category);
  const Icon = meta.icon;
  const details = Object.entries(event.details ?? {}).filter(([, value]) => value != null && value !== "");
  const person = (id: string | null, name: string | null, role: string) =>
    id ? (
      <span className="inline-flex items-center gap-1">
        <a
          href={`/database?player=${id}`}
          className="font-semibold text-brand-300 hover:underline"
          title={`Open ${name ?? id}'s record`}
          onClick={(click) => click.stopPropagation()}
        >
          {name ?? id}
        </a>
        {onPerson && (
          <button
            type="button"
            onClick={(click) => {
              click.stopPropagation();
              onPerson(id);
            }}
            className="inline-flex items-center gap-0.5 px-1 text-[11px] text-ink-500 hover:text-ink-100"
            title={`Only show actions by or on ${name ?? id}`}
          >
            <Filter aria-hidden className="h-3 w-3" strokeWidth={1.75} />
            filter
          </button>
        )}
        <span className="text-ink-600">({role})</span>
      </span>
    ) : null;

  return (
    <li className="gm-cut bg-ink-900 [--cut:7px]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-ink-800"
      >
        <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${meta.tone}`} strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] text-ink-100">{event.summary}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
            <span title={formatInZone(event.created_at * 1000, zone, { dateStyle: "full", timeStyle: "medium" })}>
              {formatInZone(event.created_at * 1000, zone, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
              })}
              , {formatRelative(event.created_at * 1000, now)}
            </span>
            <span>
              {event.category} / {event.action}
            </span>
            <span>{SOURCE_LABEL[event.source] ?? event.source}</span>
          </span>
        </span>
        {open ? (
          <ChevronDown aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" strokeWidth={1.75} />
        ) : (
          <ChevronRight aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" strokeWidth={1.75} />
        )}
      </button>
      {open && (
        <div className="space-y-1.5 px-3 pb-3 pl-10 text-xs">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {person(event.actor_id, event.actor_name, "by")}
            {person(event.target_id, event.target_name, "player")}
            {event.game_id && (
              <a href={`/games?game=${event.game_id}`} className="font-semibold text-sky-300 hover:underline">
                Game {event.game_id}
              </a>
            )}
          </div>
          {details.length > 0 && (
            <dl className="gm-cut grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 bg-ink-950 p-2.5 [--cut:6px]">
              {details.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-ink-500">{key}</dt>
                  <dd>
                    <DetailValue value={value} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </li>
  );
}

export default function AuditList({
  feed,
  loading,
  loadingMore,
  loadMore,
  onPerson,
  empty = "No actions recorded yet. New actions show up here within seconds.",
}: {
  feed: { events: AuditEvent[]; next: number | null; error: string | null } | null;
  loading: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  onPerson?: (id: string) => void;
  empty?: string;
}) {
  const [zone] = useState(detectTimeZone);
  const now = useNow(30_000);
  return (
    <div>
      {feed?.error && (
        <p className="gm-cut mb-2 bg-rose-950 px-3 py-2 text-[13px] text-rose-200 [--cut:8px]">{feed.error}</p>
      )}
      {loading && (
        <div className="flex items-center gap-2 px-2 py-6 text-[13px] text-ink-400">
          <Spinner className="h-3.5 w-3.5 text-brand-300" /> Loading…
        </div>
      )}
      {feed && feed.events.length === 0 && !feed.error && (
        <p className="px-2 py-8 text-center text-[13px] text-ink-500">{empty}</p>
      )}
      {feed && feed.events.length > 0 && (
        <ul className="space-y-[3px]">
          {feed.events.map((event) => (
            <AuditRow key={event.id} event={event} zone={zone} now={now} onPerson={onPerson} />
          ))}
        </ul>
      )}
      {feed?.next && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="gm-btn gm-btn-secondary"
          >
            {loadingMore && <Spinner className="h-3 w-3" />}Load more
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GLASS, Spinner } from "@/components/schedule/ui";
import { TICKET_KINDS } from "@/lib/ticketAccess";
import type { TicketListPage, TicketSummary } from "@/lib/ticketTypes";
import { LoginPrompt, STATUS_STYLE, TicketsShell, when } from "./TicketsShell";

/**
 * /tickets — closed tickets: your own, plus the kinds your roles handle (the
 * same people who could see the ticket channel in Discord).
 */

const INPUT =
  "rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none";

interface State {
  key: string;
  tickets: TicketSummary[];
  next: string | null;
  error: string | null;
  anonymous: boolean;
}

export default function TicketsApp() {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [state, setState] = useState<State | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const key = params.toString();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tickets?${key}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (TicketListPage & { error?: string }) | null;
        if (cancelled) return;
        if (response.status === 401) setState({ key, tickets: [], next: null, error: null, anonymous: true });
        else if (!response.ok || !body?.tickets) {
          setState({ key, tickets: [], next: null, error: body?.error ?? "Couldn't load the tickets.", anonymous: false });
        } else setState({ key, tickets: body.tickets, next: body.next_before, error: null, anonymous: false });
      })
      .catch(() => {
        if (!cancelled) setState({ key, tickets: [], next: null, error: "Network error — try again.", anonymous: false });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = state?.key === key ? state : null;
  const loadMore = () => {
    if (!current?.next || loadingMore) return;
    setLoadingMore(true);
    fetch(`/api/tickets?${key}${key ? "&" : ""}before=${encodeURIComponent(current.next)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as TicketListPage | null;
        setState((previous) =>
          previous && previous.key === key && body?.tickets
            ? { ...previous, tickets: [...previous.tickets, ...body.tickets], next: body.next_before }
            : previous,
        );
      })
      .finally(() => setLoadingMore(false));
  };

  if (current?.anonymous) {
    return (
      <TicketsShell subtitle="GameMaster · Closed tickets">
        <LoginPrompt next="/tickets" />
      </TicketsShell>
    );
  }

  return (
    <TicketsShell subtitle="GameMaster · Closed tickets">
      <section className={`flex flex-wrap items-center gap-2 rounded-3xl p-4 ${GLASS}`}>
        <select value={kind} onChange={(event) => setKind(event.target.value)} className={INPUT} aria-label="Ticket type">
          <option value="">All types</option>
          {Object.entries(TICKET_KINDS).map(([value, spec]) => (
            <option key={value} value={value}>
              {spec.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={INPUT} aria-label="Status">
          <option value="">Resolved and unresolved</option>
          <option value="Resolved">Resolved</option>
          <option value="Unresolved">Unresolved</option>
        </select>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or ticket number"
          className={`${INPUT} min-w-[220px] flex-1`}
          aria-label="Search tickets"
        />
      </section>

      <section className={`rounded-3xl p-3 sm:p-4 ${GLASS}`}>
        {current?.error && (
          <p className="mb-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{current.error}</p>
        )}
        {!current && (
          <div className="flex items-center gap-2 px-2 py-6 text-xs text-slate-400">
            <Spinner className="h-3.5 w-3.5 text-amber-300" /> Loading…
          </div>
        )}
        {current && !current.error && current.tickets.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-slate-500">
            {key ? "No tickets match these filters." : "No closed tickets to show yet. Tickets appear here once they're closed."}
          </p>
        )}
        {current && current.tickets.length > 0 && (
          <ul className="overflow-hidden rounded-2xl border border-white/5 bg-slate-950/30">
            {current.tickets.map((ticket) => (
              <li key={ticket.id} className="border-b border-white/5 last:border-b-0">
                <Link href={`/tickets/${ticket.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-white/[0.03]">
                  <span className="font-mono text-xs text-slate-500">#{String(ticket.number).padStart(4, "0")}</span>
                  <span className="text-sm font-semibold text-slate-100">{ticket.kind_label}</span>
                  <span className="text-xs text-slate-400">
                    by {ticket.mine ? "you" : (ticket.opener_name ?? ticket.opener_id)}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[ticket.status] ?? ""}`}>
                    {ticket.status}
                  </span>
                  <span className="ml-auto text-[11px] text-slate-500">
                    closed {when(ticket.closed_at, true)}
                    {ticket.guild_name ? ` · ${ticket.guild_name}` : ""} · {ticket.message_count} messages
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {current?.next && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-200 hover:border-amber-300/40 hover:text-white disabled:opacity-60"
            >
              {loadingMore && <Spinner className="h-3 w-3" />}Load more
            </button>
          </div>
        )}
      </section>
      <p className="px-2 text-[11px] text-slate-500">
        Only tickets closed since this page went live are here. Older ones are in the Discord transcript channels. If a
        message shows as &ldquo;text not available&rdquo;, the bot couldn&apos;t read it in Discord.
      </p>
    </TicketsShell>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search, Ticket } from "lucide-react";
import { Spinner } from "@/components/schedule/ui";
import { TICKET_KINDS } from "@/lib/ticketAccess";
import type { TicketListPage, TicketSummary } from "@/lib/ticketTypes";
import { STATUS_STYLE, TicketsLogin, TicketsShell, when } from "./TicketsShell";

/**
 * /tickets — closed tickets: your own, plus the kinds your roles handle (the
 * same people who could see the ticket channel in Discord).
 */

const INPUT = "gm-input h-[34px] min-h-0 text-[13px]";

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
        if (!cancelled) setState({ key, tickets: [], next: null, error: "Network error. Try again.", anonymous: false });
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

  if (current?.anonymous) return <TicketsLogin next="/tickets" />;

  return (
    <TicketsShell subtitle="Closed tickets you can read">
      <div>
        <div className="flex items-center gap-2.5">
          <Ticket aria-hidden className="h-5 w-5 text-brand-400" strokeWidth={1.75} />
          <h1 className="gm-title text-[30px]">Closed tickets</h1>
        </div>
        <p className="mt-1 text-[13px] text-ink-400">Your own tickets, and the kinds your roles handle on the server.</p>
      </div>

      <section className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-ink-500" strokeWidth={1.75} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or ticket number"
            className={`${INPUT} w-full pl-8`}
            aria-label="Search tickets"
          />
        </label>
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
      </section>

      <section>
        {current?.error && <p className="gm-cut mb-2 bg-rose-950 px-3 py-2 text-[13px] text-rose-200 [--cut:8px]">{current.error}</p>}
        {!current && (
          <div className="flex items-center gap-2 px-2 py-6 text-[13px] text-ink-400">
            <Spinner className="h-3.5 w-3.5 text-brand-300" /> Loading…
          </div>
        )}
        {current && !current.error && current.tickets.length === 0 && (
          <div className="gm-plate px-4 py-10 text-center text-[13px] text-ink-400">
            {key ? "No tickets match these filters." : "No closed tickets to show yet. Tickets appear here once they're closed."}
          </div>
        )}
        {current && current.tickets.length > 0 && (
          <ul className="space-y-1">
            {current.tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="gm-cut grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 bg-ink-900 px-3.5 py-2.5 text-[13px] transition-colors [--cut:8px] hover:bg-ink-800 md:grid-cols-[64px_minmax(0,180px)_minmax(0,1fr)_110px_auto]"
                >
                  <span className="hidden text-ink-500 md:block">#{String(ticket.number).padStart(4, "0")}</span>
                  <span className="min-w-0 truncate font-semibold text-ink-100">
                    <span className="text-ink-500 md:hidden">#{String(ticket.number).padStart(4, "0")} </span>
                    {ticket.kind_label}
                  </span>
                  <span className="hidden min-w-0 truncate text-ink-400 md:block">by {ticket.mine ? "you" : (ticket.opener_name ?? ticket.opener_id)}</span>
                  <span className={`justify-self-end md:justify-self-start ${STATUS_STYLE[ticket.status] ?? "gm-tag bg-ink-800 text-ink-300"}`}>{ticket.status}</span>
                  <span className="col-span-2 text-xs text-ink-500 md:col-span-1 md:text-right">
                    Closed {when(ticket.closed_at, true)}
                    {ticket.guild_name ? `, ${ticket.guild_name}` : ""}, {ticket.message_count} messages
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {current?.next && (
          <div className="mt-3 flex justify-center">
            <button type="button" onClick={loadMore} disabled={loadingMore} className="gm-btn gm-btn-secondary">
              {loadingMore && <Spinner className="h-3 w-3" />}Load more
            </button>
          </div>
        )}
      </section>
      <p className="px-1 text-xs text-ink-500">
        Only tickets closed since this page went live are here. Older ones are in the Discord transcript channels servers used before. If a
        message shows as &ldquo;text not available&rdquo;, the bot couldn&apos;t read it in Discord.
      </p>
    </TicketsShell>
  );
}

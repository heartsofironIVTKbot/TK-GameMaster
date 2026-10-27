"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GLASS, Spinner } from "@/components/schedule/ui";
import type { TicketDetail, TicketFile, TicketMessage } from "@/lib/ticketTypes";
import { LoginPrompt, STATUS_STYLE, TicketsShell, when } from "./TicketsShell";

/** /tickets/<id> — one closed ticket, laid out like the Discord channel was. */

function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Discord markup → readable text (mentions become names from this ticket). */
function plain(text: string, names: Map<string, string>): string {
  return text
    .replace(/<@!?(\d+)>/g, (_, id: string) => `@${names.get(id) ?? "someone"}`)
    .replace(/<@&\d+>/g, "@role")
    .replace(/<#\d+>/g, "#channel")
    .replace(/<a?(:\w+:)\d+>/g, "$1")
    .replace(/<t:(\d+)(?::\w)?>/g, (_, at: string) => when(Number(at), true))
    .replace(/\*\*|__/g, "");
}

const COLORS = ["bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-teal-500"];
function colorOf(id: string): string {
  let sum = 0;
  for (const char of id) sum = (sum + char.charCodeAt(0)) % 997;
  return COLORS[sum % COLORS.length];
}

function FileChip({ ticketId, file }: { ticketId: string; file: TicketFile }) {
  const url = `/api/tickets/${ticketId}/files/${file.id}`;
  if (file.image) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; not for the image optimizer */}
        <img src={url} alt={file.filename} className="max-h-72 max-w-full rounded-lg border border-white/10" loading="lazy" />
      </a>
    );
  }
  if (!file.kept) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-500"
        title="Too big to keep (over 8 MB), the download failed, or it's older than 180 days"
      >
        📎 {file.filename} · {sizeLabel(file.bytes)} · file not kept
      </span>
    );
  }
  return (
    <a
      href={url}
      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-1.5 text-xs text-sky-200 hover:border-sky-300/40"
    >
      📎 {file.filename} · {sizeLabel(file.bytes)} ⬇
    </a>
  );
}

function Message({ ticketId, message, names }: { ticketId: string; message: TicketMessage; names: Map<string, string> }) {
  return (
    <li className="flex gap-3 px-3 py-2.5">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white ${
          message.is_bot ? "bg-indigo-500" : colorOf(message.author_id)
        }`}
        aria-hidden
      >
        {message.author_name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-bold text-white">{message.author_name}</span>
          {message.is_bot && <span className="rounded bg-indigo-500 px-1 text-[9px] font-black text-white">BOT</span>}
          <span className="text-[11px] text-slate-500">{when(message.created_at, true)}</span>
        </p>
        {message.content ? (
          <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{plain(message.content, names)}</p>
        ) : message.embeds.length === 0 && message.files.length === 0 ? (
          <p className="text-sm italic text-slate-500">[message text not available]</p>
        ) : null}
        {message.embeds.map((embed, index) => (
          <div key={index} className="max-w-xl rounded-lg border-l-4 border-indigo-400 bg-slate-950/50 px-3 py-2">
            {embed.title && <p className="text-sm font-bold text-white">{plain(embed.title, names)}</p>}
            {embed.description && (
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-300">{plain(embed.description, names)}</p>
            )}
            {embed.fields.map((field, fieldIndex) => (
              <div key={fieldIndex} className="mt-1.5">
                <p className="text-[11px] font-bold text-slate-200">{plain(field.name, names)}</p>
                <p className="whitespace-pre-wrap text-xs text-slate-300">{plain(field.value, names)}</p>
              </div>
            ))}
          </div>
        ))}
        {message.files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.files.map((file) => (
              <FileChip key={file.id} ticketId={ticketId} file={file} />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export default function TicketView() {
  const ticketId = String(useParams<{ id: string }>().id ?? "");
  const [state, setState] = useState<{ detail: TicketDetail | null; error: string | null; anonymous: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tickets/${ticketId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (TicketDetail & { error?: string }) | null;
        if (cancelled) return;
        if (response.status === 401) setState({ detail: null, error: null, anonymous: true });
        else if (!response.ok || !body?.ticket) {
          setState({
            detail: null,
            error: response.status === 404 ? "This ticket doesn't exist, or it isn't one you can read." : (body?.error ?? "Couldn't load the ticket."),
            anonymous: false,
          });
        } else setState({ detail: body, error: null, anonymous: false });
      })
      .catch(() => {
        if (!cancelled) setState({ detail: null, error: "Network error — try again.", anonymous: false });
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  const detail = state?.detail ?? null;
  const ticket = detail?.ticket;
  const names = new Map((detail?.messages ?? []).map((message) => [message.author_id, message.author_name]));
  if (ticket?.opener_name) names.set(ticket.opener_id, ticket.opener_name);

  return (
    <TicketsShell subtitle={ticket ? ticket.channel_name : "GameMaster · Closed ticket"}>
      {state?.anonymous && <LoginPrompt next={`/tickets/${ticketId}`} />}
      {!state && (
        <div className="flex items-center gap-2 px-2 py-6 text-xs text-slate-400">
          <Spinner className="h-3.5 w-3.5 text-amber-300" /> Loading the ticket…
        </div>
      )}
      {state?.error && (
        <div className={`rounded-3xl p-6 text-center ${GLASS}`}>
          <p className="text-sm text-slate-300">{state.error}</p>
          <Link href="/tickets" className="mt-3 inline-block text-xs font-bold text-amber-300 hover:underline">
            ← All tickets
          </Link>
        </div>
      )}
      {ticket && detail && (
        <>
          <section className={`space-y-2 rounded-3xl p-4 sm:p-5 ${GLASS}`}>
            <Link href="/tickets" className="text-[11px] font-bold text-slate-400 hover:text-white">
              ← All tickets
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-black text-white">
                {ticket.kind_label} <span className="font-mono text-base text-slate-500">#{String(ticket.number).padStart(4, "0")}</span>
              </h1>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[ticket.status] ?? ""}`}>
                {ticket.status}
              </span>
            </div>
            <dl className="grid gap-x-6 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
              <div>
                <dt className="inline text-slate-500">Opened by </dt>
                <dd className="inline text-slate-200">{ticket.mine ? "you" : (ticket.opener_name ?? ticket.opener_id)}</dd>
                <dd className="inline"> · {when(ticket.opened_at, true)}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Closed by </dt>
                <dd className="inline text-slate-200">{ticket.closed_by_name ?? "—"}</dd>
                <dd className="inline"> · {when(ticket.closed_at, true)}</dd>
              </div>
              {ticket.close_reason && (
                <div className="sm:col-span-2">
                  <dt className="inline text-slate-500">Why </dt>
                  <dd className="inline text-slate-200">{ticket.close_reason}</dd>
                </div>
              )}
              {ticket.guild_name && (
                <div>
                  <dt className="inline text-slate-500">Server </dt>
                  <dd className="inline text-slate-200">{ticket.guild_name}</dd>
                </div>
              )}
            </dl>
          </section>
          <section className={`rounded-3xl p-2 sm:p-3 ${GLASS}`}>
            {detail.messages.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-slate-500">No messages were saved for this ticket.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {detail.messages.map((message) => (
                  <Message key={message.position} ticketId={ticket.id} message={message} names={names} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </TicketsShell>
  );
}

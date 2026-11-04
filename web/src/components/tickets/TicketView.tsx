"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { Spinner } from "@/components/schedule/ui";
import type { TicketDetail, TicketFile, TicketMessage } from "@/lib/ticketTypes";
import { STATUS_STYLE, TicketsLogin, TicketsShell, when } from "./TicketsShell";

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

const COLORS = ["bg-sky-700", "bg-emerald-700", "bg-brand-700", "bg-rose-700", "bg-violet-700", "bg-teal-700"];
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
        <img src={url} alt={file.filename} className="max-h-72 max-w-full border border-ink-800" loading="lazy" />
      </a>
    );
  }
  if (!file.kept) {
    return (
      <span
        className="gm-cut inline-flex h-8 items-center gap-2 bg-ink-950 px-3 text-xs text-ink-500 shadow-[inset_0_0_0_1px_var(--color-ink-800)] [--cut:7px]"
        title="Too big to keep (over 8 MB), the download failed, or it's older than 180 days"
      >
        <FileText aria-hidden className="h-4 w-4" strokeWidth={1.75} />
        {file.filename}, {sizeLabel(file.bytes)}, file not kept
      </span>
    );
  }
  return (
    <a
      href={url}
      className="gm-cut inline-flex h-8 items-center gap-2 bg-ink-950 px-3 text-xs text-ink-100 shadow-[inset_0_0_0_1px_var(--color-ink-700)] [--cut:7px] hover:bg-ink-800"
    >
      <FileText aria-hidden className="h-4 w-4 text-ink-400" strokeWidth={1.75} />
      {file.filename}, {sizeLabel(file.bytes)}
      <Download aria-hidden className="h-4 w-4 text-ink-400" strokeWidth={1.75} />
    </a>
  );
}

function Message({ ticketId, message, names }: { ticketId: string; message: TicketMessage; names: Map<string, string> }) {
  return (
    <li className="flex gap-3 px-4 py-2.5">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
          message.is_bot ? "bg-[#5865F2]" : colorOf(message.author_id)
        }`}
        aria-hidden
      >
        {message.author_name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold text-ink-100">{message.author_name}</span>
          {message.is_bot && <span className="gm-cut bg-[#5865F2] px-1.5 text-[10px] font-bold text-white [--cut:3px]">BOT</span>}
          <span className="text-[11px] text-ink-500">{when(message.created_at, true)}</span>
        </p>
        {message.content ? (
          <p className="whitespace-pre-wrap break-words text-[13.5px] text-ink-300">{plain(message.content, names)}</p>
        ) : message.embeds.length === 0 && message.files.length === 0 ? (
          <p className="text-sm italic text-ink-500">[message text not available]</p>
        ) : null}
        {message.embeds.map((embed, index) => (
          <div key={index} className="gm-cut max-w-xl bg-ink-950 px-3 py-2 shadow-[inset_3px_0_0_#5865F2] [--cut:6px]">
            {embed.title && <p className="text-sm font-semibold text-ink-100">{plain(embed.title, names)}</p>}
            {embed.description && (
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink-300">{plain(embed.description, names)}</p>
            )}
            {embed.fields.map((field, fieldIndex) => (
              <div key={fieldIndex} className="mt-1.5">
                <p className="text-[11px] font-bold text-ink-200">{plain(field.name, names)}</p>
                <p className="whitespace-pre-wrap text-xs text-ink-300">{plain(field.value, names)}</p>
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
        if (!cancelled) setState({ detail: null, error: "Network error. Try again.", anonymous: false });
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  const detail = state?.detail ?? null;
  const ticket = detail?.ticket;
  const names = new Map((detail?.messages ?? []).map((message) => [message.author_id, message.author_name]));
  if (ticket?.opener_name) names.set(ticket.opener_id, ticket.opener_name);

  if (state?.anonymous) return <TicketsLogin next={`/tickets/${ticketId}`} />;

  return (
    <TicketsShell subtitle={ticket ? ticket.channel_name : "Closed ticket"}>
      {!state && (
        <div className="flex items-center gap-2 px-2 py-6 text-[13px] text-ink-400">
          <Spinner className="h-3.5 w-3.5 text-brand-300" /> Loading the ticket…
        </div>
      )}
      {state?.error && (
        <div className="gm-plate mx-auto mt-6 max-w-md p-6 text-center">
          <p className="text-sm text-ink-300">{state.error}</p>
          <Link href="/tickets" className="gm-btn gm-btn-secondary mt-4">
            <ArrowLeft aria-hidden strokeWidth={1.75} />
            All tickets
          </Link>
        </div>
      )}
      {ticket && detail && (
        <>
          <Link href="/tickets" className="gm-btn gm-btn-quiet -ml-2 h-[30px] px-2 text-[12.5px] [--cut:7px]">
            <ArrowLeft aria-hidden strokeWidth={1.75} />
            All tickets
          </Link>
          <section className="gm-plate p-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="gm-title text-[30px] sm:text-[34px]">{ticket.kind_label}</h1>
              <span className="text-[15px] text-ink-500">#{String(ticket.number).padStart(4, "0")}</span>
              <span className={STATUS_STYLE[ticket.status] ?? "gm-tag bg-ink-800 text-ink-300"}>{ticket.status}</span>
            </div>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-[12.5px] text-ink-400 sm:grid-cols-2">
              <div>
                <dt className="inline text-ink-500">Opened by </dt>
                <dd className="inline font-semibold text-ink-100">{ticket.mine ? "you" : (ticket.opener_name ?? ticket.opener_id)}</dd>
                <dd className="inline">, {when(ticket.opened_at, true)}</dd>
              </div>
              <div>
                <dt className="inline text-ink-500">Closed by </dt>
                <dd className="inline font-semibold text-ink-100">{ticket.closed_by_name ?? "nobody saved"}</dd>
                <dd className="inline">, {when(ticket.closed_at, true)}</dd>
              </div>
              {ticket.close_reason && (
                <div className="sm:col-span-2">
                  <dt className="inline text-ink-500">Why: </dt>
                  <dd className="inline text-ink-300">{ticket.close_reason}</dd>
                </div>
              )}
              {ticket.guild_name && (
                <div>
                  <dt className="inline text-ink-500">Server </dt>
                  <dd className="inline text-ink-300">{ticket.guild_name}</dd>
                </div>
              )}
            </dl>
          </section>
          <section className="gm-plate py-1.5">
            {detail.messages.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-ink-500">No messages were saved for this ticket.</p>
            ) : (
              <ul className="divide-y divide-ink-800">
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

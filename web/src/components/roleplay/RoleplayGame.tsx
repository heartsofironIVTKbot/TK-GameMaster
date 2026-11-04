"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Avatar from "@/components/database/Avatar";
import { ArrowLeft, ScrollText, Search } from "lucide-react";
import { Spinner } from "@/components/schedule/ui";
import { searchTerms, type RpGameDetail, type RpLine, type RpPlayer } from "@/lib/rpArchiveTypes";
import { Flag, ModeBadge, RpHeader, ServerChip, VerdictBadge, playedOn, words } from "./shared";

/**
 * /roleplay/<game> — one graded game, public: the AI's story recap, every
 * player's result, and the roleplay itself as a readable, searchable log.
 */

const PAGE_LINES = 400;

/** A steady colour per nation tag (for speaker names in the log). */
function tagColour(tag: string): string {
  let hash = 0;
  for (const char of tag) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 75% 72%)`;
}

/** Wraps the search words in <mark>. */
function Highlight({ text, terms }: { text: string; terms: string[] }): ReactNode {
  if (terms.length === 0) return text;
  const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="bg-violet-400/30 px-0.5 text-ink-100">
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export default function RoleplayGame() {
  const id = String(useParams<{ id: string }>().id ?? "");
  const [state, setState] = useState<{ id: string; game: RpGameDetail | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/roleplay/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (RpGameDetail & { error?: string }) | null;
        if (cancelled) return;
        if (!response.ok || !body?.card) setState({ id, game: null, error: body?.error ?? "This game couldn't be loaded." });
        else setState({ id, game: body, error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ id, game: null, error: "Can't reach the server. Check your connection." });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const game = state?.id === id ? state.game : null;

  return (
    <div className="min-h-screen w-full bg-ink-950 text-ink-100">
      <RpHeader>
        <Link href="/roleplay" className="gm-btn gm-btn-quiet h-[30px] px-2.5 text-[12.5px] [--cut:7px]">
          <ArrowLeft aria-hidden strokeWidth={1.75} />
          All games
        </Link>
      </RpHeader>
      <main className="mx-auto max-w-[1300px] space-y-6 px-4 py-6 sm:px-6">
        {!state || state.id !== id ? (
          <div className="flex items-center gap-2 px-2 py-10 text-sm text-ink-400">
            <Spinner className="h-4 w-4 text-violet-300" /> Loading the game…
          </div>
        ) : !game ? (
          <div className="gm-plate flex flex-col items-center p-10 text-center">
            <ScrollText aria-hidden className="h-9 w-9 text-violet-300" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-semibold text-ink-100">{state.error}</p>
            <Link href="/roleplay" className="gm-btn gm-btn-secondary mt-4">
              <ArrowLeft aria-hidden strokeWidth={1.75} />
              Back to the archive
            </Link>
          </div>
        ) : (
          <GameView game={game} />
        )}
      </main>
    </div>
  );
}

function GameView({ game }: { game: RpGameDetail }) {
  const { card } = game;
  const [focusTag, setFocusTag] = useState<string | null>(null);

  return (
    <>
      <section className="gm-plate gm-plate-rp p-5 sm:px-8 sm:py-7">
        <div className="flex flex-wrap items-center gap-2">
          <ModeBadge mode={card.mode} />
          <span className="text-xs text-ink-400">{playedOn(card.ts)}</span>
        </div>
        <h1 className="gm-title mt-3 text-[36px] sm:text-[48px]">{card.name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <ServerChip name={card.server_name} icon={card.server_icon_url} />
          {card.host_name && <span className="text-xs text-ink-400">hosted by {card.host_name}</span>}
        </div>
        {card.summary && (
          <blockquote className="mt-5 max-w-3xl border-l-[3px] border-violet-300/70 pl-4 text-[15px] italic leading-relaxed text-ink-200" data-tour="rp.story">
            {card.summary}
          </blockquote>
        )}
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <Stat label="players" value={String(card.players)} />
          <Stat label="words of roleplay" value={words(card.ic_words)} />
          <Stat label="rewarded" value={String(card.rewarded)} />
          {game.files.length > 1 && <Stat label="log files (one game)" value={String(game.files.length)} />}
        </div>
      </section>

      <section data-tour="rp.players">
        <h2 className="gm-title px-1 text-[26px]">The players</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {game.players.map((player) => (
            <PlayerCard
              key={player.key}
              player={player}
              onRead={() => {
                setFocusTag(player.tag);
                document.getElementById("rp-log")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          ))}
        </div>
      </section>

      <LogView game={game} focusTag={focusTag} onFocusTag={setFocusTag} />

      <p className="px-1 pb-6 text-xs leading-relaxed text-ink-500">
        Graded {playedOn(game.graded_at)}. The AI scores how good the roleplay is; the bot counts the in-character words and
        applies the server&apos;s rules; the host gives the rewards.
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="gm-cut bg-ink-950 px-3 py-1.5 text-ink-400 [--cut:7px]">
      <b className="font-display text-[19px] font-extrabold text-ink-100">{value}</b> {label}
    </span>
  );
}

function PlayerCard({ player, onRead }: { player: RpPlayer; onRead: () => void }) {
  const [more, setMore] = useState(false);
  const shown = more ? player.snippets : player.snippets.slice(0, 1);
  const share = player.words > 0 ? Math.round((player.ic_words / player.words) * 100) : 0;
  return (
    <article className={`gm-plate flex flex-col p-4 sm:p-[18px] ${player.verdict.kind === "no_rp" ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3">
        <Avatar url={player.avatar_url} name={player.name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-100">{player.name}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-ink-400">
            <Flag tag={player.tag} className="h-3.5 w-5" />
            {player.nation}
            {player.role === "COOP" ? ", co-op" : ""}
            {player.left_early ? ", left early" : ""}
          </p>
        </div>
        <span className="flex flex-col items-end gap-1">
          <VerdictBadge verdict={player.verdict} />
          {player.given && <span className="text-[11px] font-semibold text-emerald-300">Given</span>}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-ink-400">
        <div>
          <p className="flex justify-between">
            <span>In character</span>
            <b className="text-ink-200">{words(player.ic_words)}</b>
          </p>
          <div className="mt-1 h-1.5 bg-ink-800">
            <div className="h-full bg-sky-300" style={{ width: `${share}%` }} />
          </div>
        </div>
        <div>
          <p className="flex justify-between">
            <span>Creativity</span>
            <b className="text-ink-200">{player.creativity}/10</b>
          </p>
          <div className="mt-1 h-1.5 bg-ink-800">
            <div className="h-full bg-violet-400" style={{ width: `${player.creativity * 10}%` }} />
          </div>
        </div>
      </div>

      {player.summary && <p className="mt-3 text-[13px] leading-relaxed text-ink-300">{player.summary}</p>}
      {player.why && <p className="mt-1 text-xs text-ink-500">{player.why}</p>}

      {shown.length > 0 && (
        <div className="mt-3 space-y-2">
          {shown.map((line) => (
            <blockquote key={line} className="border-l-2 border-violet-300/50 pl-3 text-[13px] italic leading-relaxed text-ink-200">
              “{line}”
            </blockquote>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-center gap-3 pt-4">
        {player.snippets.length > 1 && (
          <button type="button" onClick={() => setMore((value) => !value)} className="text-xs font-semibold text-ink-400 hover:text-ink-100">
            {more ? "Fewer quotes" : `${player.snippets.length - 1} more quote${player.snippets.length > 2 ? "s" : ""}`}
          </button>
        )}
        {player.tag && (
          <button type="button" onClick={onRead} className="ml-auto text-xs font-semibold text-violet-300 hover:text-violet-200">
            Read all of {player.nation}
          </button>
        )}
      </div>
    </article>
  );
}

function LogView({ game, focusTag, onFocusTag }: { game: RpGameDetail; focusTag: string | null; onFocusTag: (tag: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [hideOoc, setHideOoc] = useState(true);
  const [limit, setLimit] = useState(PAGE_LINES);
  const terms = useMemo(() => searchTerms(query), [query]);

  // Nations in the log, most lines first.
  const nations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of game.lines) if (line.tag && !line.ooc) counts.set(line.tag, (counts.get(line.tag) ?? 0) + 1);
    const names = new Map(game.players.map((player) => [player.tag, player.nation]));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count, name: names.get(tag) ?? tag }));
  }, [game]);

  const shown = useMemo(
    () =>
      game.lines.filter(
        (line) =>
          (!hideOoc || !line.ooc || (line.tag === null && line.text.startsWith("====="))) &&
          (!focusTag || line.tag === focusTag) &&
          terms.every((term) => `${line.speaker ?? ""} ${line.text}`.toLowerCase().includes(term)),
      ),
    [game.lines, hideOoc, focusTag, terms],
  );

  // Fresh filters show the first page again (render-time reset).
  const filterKey = `${query}|${hideOoc}|${focusTag}`;
  const [seenKey, setSeenKey] = useState(filterKey);
  if (seenKey !== filterKey) {
    setSeenKey(filterKey);
    setLimit(PAGE_LINES);
  }

  return (
    <section id="rp-log" className="scroll-mt-20 border border-ink-800 bg-ink-900" data-tour="rp.log">
      <div className="sticky top-[57px] z-10 border-b border-ink-800 bg-ink-950 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="gm-title mr-2 text-[24px]">The roleplay</h2>
          <label className="relative min-w-[180px] flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" strokeWidth={1.75} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 80))}
              placeholder="Search the log"
              aria-label="Search the log"
              className="gm-input h-[32px] min-h-0 w-full pl-8 text-[13px]"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-300">
            <input type="checkbox" checked={hideOoc} onChange={(event) => setHideOoc(event.target.checked)} className="h-3.5 w-3.5 accent-violet-400" />
            Hide out-of-character
          </label>
        </div>
        {nations.length > 0 && (
          <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
            <NationChip active={!focusTag} onClick={() => onFocusTag(null)}>
              Everyone
            </NationChip>
            {nations.map((nation) => (
              <NationChip key={nation.tag} active={focusTag === nation.tag} onClick={() => onFocusTag(focusTag === nation.tag ? null : nation.tag)}>
                <Flag tag={nation.tag} className="h-3 w-[18px]" />
                {nation.name}
                <span className="text-ink-500">{nation.count}</span>
              </NationChip>
            ))}
          </div>
        )}
      </div>

      <div className="px-2 py-3 sm:px-4">
        {game.lines.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-ink-500">The log for this game isn&apos;t on the website.</p>
        ) : shown.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-ink-500">No lines match.</p>
        ) : (
          <ol className="font-[450]">
            {shown.slice(0, limit).map((line, index) => (
              <LogLine key={line.n} line={line} terms={terms} fileChanged={index > 0 && shown[index - 1].file !== line.file} files={game.files} />
            ))}
          </ol>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-3 text-xs text-ink-500">
          <span>
            Showing {Math.min(limit, shown.length).toLocaleString()} of {shown.length.toLocaleString()} lines
            {game.truncated ? " (the log is very long; only its start is on the website)" : ""}
          </span>
          {shown.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((value) => value + PAGE_LINES)}
              className="gm-btn gm-btn-secondary h-[30px] px-3 text-[12.5px] [--cut:7px]"
            >
              Show {Math.min(PAGE_LINES, shown.length - limit)} more
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function NationChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`gm-cut flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-xs font-semibold transition-colors [--cut:6px] ${
        active ? "bg-violet-400 text-ink-950" : "bg-ink-950 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
      }`}
    >
      {children}
    </button>
  );
}

function LogLine({
  line,
  terms,
  fileChanged,
  files,
}: {
  line: RpLine;
  terms: string[];
  fileChanged: boolean;
  files: RpGameDetail["files"];
}) {
  if (line.tag === null && line.text.startsWith("=====")) return null;
  return (
    <>
      {fileChanged && (
        <li className="my-3 flex items-center gap-3 px-2 text-xs font-semibold text-sky-300">
          <span className="h-px flex-1 bg-sky-300/25" />
          Part {line.file}: {files[line.file - 1]?.filename ?? ""} (rehost)
          <span className="h-px flex-1 bg-sky-300/25" />
        </li>
      )}
      <li
        id={`L${line.n}`}
        className={`group flex gap-3 px-2 py-1 hover:bg-ink-800/50 ${line.ooc ? "text-xs text-ink-500" : "text-[13.5px] leading-relaxed text-ink-200"}`}
      >
        <span className="w-10 shrink-0 select-none pt-0.5 text-right text-[10px] tabular-nums text-ink-600">{line.n}</span>
        {line.tag ? (
          <span className="flex w-36 shrink-0 items-start gap-1.5 truncate pt-0.5 sm:w-44">
            <Flag tag={line.tag} className="mt-0.5 h-3 w-[18px]" />
            <span className="truncate text-xs font-semibold" style={{ color: tagColour(line.tag) }} title={line.speaker ?? line.tag}>
              {line.speaker || line.tag}
            </span>
          </span>
        ) : (
          <span className="w-36 shrink-0 sm:w-44" />
        )}
        <span className="min-w-0 flex-1 break-words">
          <Highlight text={line.text} terms={terms} />
        </span>
      </li>
    </>
  );
}

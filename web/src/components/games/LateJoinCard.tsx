"use client";

import { UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { GameControl } from "@/lib/gameControlTypes";
import type { DirectoryMember } from "@/lib/scheduleTypes";
import Avatar from "@/components/database/Avatar";
import { Segmented, Spinner } from "@/components/schedule/ui";
import { BotText, CardTitle } from "./labels";
import { useBotRequest } from "./useBotRequest";

/**
 * Add a late player to a running game (formerly /late_join): the bot puts
 * them on the nation (or a filler slot), gives them the Gamer Pass and a voice
 * channel, marks them as a late join for attendance and DMs them.
 */

type SlotKind = "nation" | "filler";

function memberName(member: DirectoryMember): string {
  return member.ingame_nickname || member.display_name || member.username || member.discord_id;
}

export default function LateJoinCard({ game, onChanged }: { game: GameControl; onChanged: () => void }) {
  const request = useBotRequest(onChanged);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; players: DirectoryMember[] } | null>(null);
  const [player, setPlayer] = useState<DirectoryMember | null>(null);
  const [kind, setKind] = useState<SlotKind>("nation");
  const [nation, setNation] = useState("");
  const [fillerName, setFillerName] = useState("Filler");
  /** Who the last request was for (the form clears after a success). */
  const [joining, setJoining] = useState<string | null>(null);

  const needle = query.trim();
  useEffect(() => {
    if (needle.length < 2) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`/api/live/players?q=${encodeURIComponent(needle)}`, { cache: "no-store" })
        .then((response) => response.json() as Promise<{ players?: DirectoryMember[] }>)
        .then((body) => {
          if (!cancelled) setResults({ query: needle, players: body.players ?? [] });
        })
        .catch(() => {
          if (!cancelled) setResults({ query: needle, players: [] });
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [needle]);
  const searching = needle.length >= 2 && results?.query !== needle;
  const shown = needle.length >= 2 && results?.query === needle ? results.players : [];

  const reserved = new Set(game.roster.map((entry) => entry.slot));
  const locked = new Set(game.access.locked_nations);
  const known = game.nations ? [...game.nations.majors, ...game.nations.minors] : [];
  const free = known.filter((name) => !reserved.has(name) && !locked.has(name));
  const nationOk = !game.nations || known.some((name) => name === nation.trim());
  const taken = kind === "nation" && reserved.has(nation.trim());
  const slotOk = kind === "nation" ? nation.trim() !== "" && nationOk && !taken : fillerName.trim() !== "";
  const listId = `latejoin-${game.id}`;

  // Once the bot has added them, clear the form for the next one (render-time reset).
  const doneId = request.state.phase === "done" ? request.state.status.request_id : null;
  const [clearedFor, setClearedFor] = useState<string | null>(null);
  if (doneId && doneId !== clearedFor) {
    setClearedFor(doneId);
    setPlayer(null);
    setNation("");
  }

  const send = (force: boolean) => {
    if (!player) return;
    setJoining(memberName(player));
    void request.submit({
      action: "roster_assign",
      payload: {
        thread_id: game.storage_key,
        user_id: player.discord_id,
        kind,
        nation: kind === "nation" ? nation.trim() : null,
        filler_name: kind === "filler" ? fillerName.trim() : null,
        force,
      },
    });
  };
  const slotLabel = kind === "nation" ? nation.trim() || "a nation" : "a filler slot";

  return (
    <section data-tour="games.lateJoin" className="gm-plate p-4 sm:p-[18px]">
      <CardTitle icon={UserPlus} title="Late join" />
      <p className="mt-1 text-sm text-ink-400">
        Add a player to the running game. They get the nation, the Gamer Pass and a voice channel, and show as a late join on the
        Attendance page.
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-400">Player</p>
          {player ? (
            <div className="flex items-center gap-2.5 gm-cut [--cut:9px] border border-violet-300/40 bg-violet-400/10 px-2.5 py-2">
              <Avatar url={player.avatar_url} name={memberName(player)} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink-100">{memberName(player)}</span>
                {player.username && <span className="block truncate text-[11px] text-ink-400">@{player.username}</span>}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPlayer(null);
                  request.reset();
                }}
                className="gm-cut [--cut:5px] px-2 py-1 text-xs font-bold text-ink-300 hover:bg-ink-800 hover:text-ink-100"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value.slice(0, 64))}
                placeholder="Search name, @handle or Discord ID"
                aria-label="Search for the player"
                className="gm-input w-full text-sm "
              />
              <ul className="mt-1.5 max-h-56 space-y-1 overflow-y-auto">
                {searching && (
                  <li className="flex items-center gap-2 px-2 py-1.5 text-xs text-ink-400">
                    <Spinner className="h-3 w-3" /> Searching…
                  </li>
                )}
                {!searching && needle.length >= 2 && shown.length === 0 && (
                  <li className="px-2 py-1.5 text-xs text-ink-500">No members match.</li>
                )}
                {shown.map((member) => (
                  <li key={member.discord_id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlayer(member);
                        setQuery("");
                        request.reset();
                      }}
                      className="flex w-full items-center gap-2.5 gm-cut [--cut:7px] border border-transparent px-2 py-1.5 text-left hover:border-ink-800 hover:bg-ink-950"
                    >
                      <Avatar url={member.avatar_url} name={memberName(member)} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink-100">{memberName(member)}</span>
                        <span className="block truncate text-[11px] text-ink-500">
                          {member.username ? `@${member.username}` : member.discord_id}
                          {!member.verified && " · not verified"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-400">Slot</p>
            <Segmented<SlotKind>
              ariaLabel="Slot type"
              size="sm"
              value={kind}
              onChange={setKind}
              options={[
                { value: "nation", label: "Nation" },
                { value: "filler", label: "Filler" },
              ]}
            />
          </div>
          {kind === "nation" ? (
            <div>
              <input
                value={nation}
                onChange={(event) => setNation(event.target.value.slice(0, 128))}
                list={listId}
                placeholder="Free nation…"
                aria-label="Nation"
                className="gm-input w-full text-sm "
              />
              <datalist id={listId}>
                {free.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {nation.trim() && !nationOk && <p className="mt-1 text-[11px] text-brand-200">Not a nation in {game.mode}.</p>}
              {taken && <p className="mt-1 text-[11px] text-brand-200">Taken — remove that player first.</p>}
            </div>
          ) : (
            <input
              value={fillerName}
              onChange={(event) => setFillerName(event.target.value.slice(0, 40))}
              placeholder="Filler name"
              aria-label="Filler name"
              className="gm-input w-full text-sm "
            />
          )}
          <button
            type="button"
            disabled={!player || !slotOk || request.busy}
            onClick={() => send(false)}
            className="gm-btn gm-btn-primary h-11 w-full [--cut:10px]"
          >
            {request.busy && <Spinner className="h-4 w-4" />}Add {player ? memberName(player) : "player"} as {slotLabel}
          </button>
        </div>
      </div>

      {request.state.phase === "confirm" && (
        <div className="mt-4 gm-cut [--cut:9px] border border-brand-400/40 bg-brand-500/10 px-3 py-2.5 text-xs text-brand-50">
          <p className="font-bold">The bot found something to check first:</p>
          <ul className="mt-1 space-y-0.5">
            {(request.state.status.result?.warnings ?? []).map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => send(true)} className="gm-cut [--cut:5px] bg-brand-400 px-3 py-1 font-bold text-ink-950 hover:bg-brand-300">
              Add anyway
            </button>
            <button type="button" onClick={request.reset} className="gm-cut [--cut:5px] border border-white/20 px-3 py-1 font-bold text-ink-100 hover:bg-ink-800">
              Cancel
            </button>
          </div>
        </div>
      )}
      {request.state.phase === "done" && (
        <div className="gm-fade-up mt-4 flex items-start gap-2 gm-cut [--cut:9px] border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-50">
          <p className="flex-1 font-bold">
            {joining ?? "The player"} joined as{" "}
            {String(request.state.status.result?.slot_key ?? "their slot").replace(/^_FILL_/, "").replace(/_/g, " ")}
            {request.state.status.result?.late_join ? " — they got the Gamer Pass, a voice channel and a DM." : "."}
          </p>
          <button type="button" onClick={request.reset} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {request.state.phase === "error" && (
        <div className="mt-4 flex items-start gap-2 gm-cut [--cut:9px] border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          <span className="flex-1">
            <BotText text={request.state.message} />
          </span>
          <button type="button" onClick={request.reset} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {(request.state.phase === "sending" || request.state.phase === "waiting") && (
        <p className="mt-4 flex items-center gap-2 text-xs text-ink-400">
          <Spinner className="h-3.5 w-3.5 text-violet-300" /> The bot is adding them (pass, voice channel, DM)…
        </p>
      )}
    </section>
  );
}

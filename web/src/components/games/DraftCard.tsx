"use client";

import Link from "next/link";
import { useState } from "react";
import PreferenceBadge from "@/components/draft/PreferenceBadge";
import { useDraftRequest } from "@/components/draft/useDraft";
import { GLASS, Spinner } from "@/components/schedule/ui";
import { CaptainPicker } from "@/components/schedule/setup/DraftSection";
import { draftTeamOf } from "@/lib/draft";
import type { GameControl } from "@/lib/gameControlTypes";
import { formatRelative } from "@/lib/timeEngine";

/**
 * A draft game's controls on the Games page (formerly /start_draft and
 * /empty_draft_pool): who's in the pool and what they asked for, the teams
 * and their captains, start the draft (coin toss) and finish it (clearing
 * whoever is left). Captains pick — and the host can place anyone — on the
 * game's map.
 */
export default function DraftCard({ game, now, onChanged }: { game: GameControl; now: number; onChanged: () => void }) {
  const request = useDraftRequest(onChanged);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [changing, setChanging] = useState<string | null>(null);
  const draft = game.draft;
  if (!draft) return null;
  const send = (body: Record<string, unknown>) => void request.submit({ thread_id: game.id, ...body });
  const turn = draft.teams.find((team) => team.key === draft.current_turn) ?? null;
  // Roster slots are display names ("Italy (Co-op)") — compare the nation part.
  const placed = (teamKey: string) =>
    game.roster.filter((player) => draftTeamOf(draft, player.slot.split(" + ")[0].replace(/ \(Co-op[^)]*\)$/, ""))?.key === teamKey)
      .length;
  const state = request.state;
  const canManage = game.can_manage;

  return (
    <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Draft</p>
          <p className="mt-1 text-sm text-slate-300">
            {draft.phase === "ENLISTING" &&
              `Sign-ups are open — ${draft.pool.length}${draft.pool_cap ? `/${draft.pool_cap}` : ""} in the pool. Players join from the map link in the announcement.`}
            {draft.phase === "DRAFTING" &&
              (turn
                ? `Drafting — ${turn.name}'s turn (${turn.captain_name ?? "captain"}), ${draft.picks_remaining} pick(s) left. ${draft.pool.length} still in the pool.`
                : "Drafting.")}
            {draft.phase === "COMPLETE" && "The draft is complete — the game can be started."}
          </p>
          {draft.coin_winner && draft.phase !== "ENLISTING" && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              🪙 {draft.teams.find((team) => team.key === draft.coin_winner)?.name} won the coin toss.
            </p>
          )}
        </div>
        <Link
          href={`/?game=${game.id}`}
          className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 hover:border-amber-300/40 hover:text-white"
        >
          🗺️ Open the draft on the map
        </Link>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {draft.teams.map((team) => (
          <div
            key={team.key}
            className={`rounded-2xl border p-3 ${
              draft.phase === "DRAFTING" && team.key === draft.current_turn ? "border-amber-300/60 bg-amber-400/10" : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <div className="flex items-center gap-2">
              <p className="flex-1 truncate text-sm font-black text-white">🚩 {team.name}</p>
              <span className="text-[11px] text-slate-400">{placed(team.key)} placed</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {(team.groups ?? ["Old Allies / Axis sides"]).join(", ")} · {team.majors.length + team.minors.length} nations
            </p>
            {changing === team.key ? (
              <div className="mt-2">
                <CaptainPicker
                  captainId={null}
                  captainName={null}
                  otherCaptainId={draft.teams.find((other) => other.key !== team.key)?.captain_id ?? null}
                  onPick={(member) => {
                    setChanging(null);
                    if (member) send({ action: "captain", team: team.key, user_id: member.discord_id });
                  }}
                />
                <button type="button" onClick={() => setChanging(null)} className="mt-1 text-[11px] font-bold text-slate-400 hover:text-white">
                  Cancel
                </button>
              </div>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-200">
                🎖️ {team.captain_name ?? `#${team.captain_id}`}
                {canManage && draft.phase !== "COMPLETE" && (
                  <button
                    type="button"
                    onClick={() => setChanging(team.key)}
                    disabled={request.busy}
                    className="text-[11px] font-bold text-slate-400 hover:text-white disabled:opacity-40"
                  >
                    Change
                  </button>
                )}
              </p>
            )}
          </div>
        ))}
      </div>

      {canManage && draft.phase !== "COMPLETE" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {draft.phase === "ENLISTING" && (
            <button
              type="button"
              onClick={() => send({ action: "start" })}
              disabled={request.busy || draft.pool.length === 0}
              className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              title={draft.pool.length === 0 ? "Nobody is in the pool yet" : undefined}
            >
              {request.busy && <Spinner className="h-4 w-4" />}🚨 Start the draft
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (confirmFinish) {
                setConfirmFinish(false);
                send({ action: "finish" });
              } else {
                setConfirmFinish(true);
              }
            }}
            onBlur={() => setConfirmFinish(false)}
            disabled={request.busy}
            className={`rounded-xl px-4 py-2.5 text-sm font-black disabled:opacity-40 ${
              confirmFinish ? "bg-rose-500 text-white" : "border border-white/10 bg-white/5 text-slate-200 hover:border-white/25"
            }`}
          >
            {confirmFinish ? `Click again — clear ${draft.pool.length} from the pool` : "🏁 Finish the draft"}
          </button>
          <p className="w-full text-[11px] text-slate-500">
            Start closes sign-ups and tosses the coin (when it&apos;s on). Finish clears whoever is left in the pool (they get a
            DM) so the game can start.
          </p>
        </div>
      )}

      {state.phase !== "idle" && (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-xs ${
            state.phase === "error"
              ? "border border-rose-400/40 bg-rose-500/10 text-rose-100"
              : state.phase === "done"
                ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-50"
                : "text-slate-400"
          }`}
        >
          {state.phase === "sending" && "Sending…"}
          {state.phase === "waiting" && "The bot is applying it…"}
          {state.phase === "error" && state.message}
          {state.phase === "done" && (
            <>
              <b>{state.title}</b> — {state.summary}
            </>
          )}
        </p>
      )}

      <div className="mt-4">
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Pool ({draft.pool.length})</p>
        {draft.pool.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody in the pool.</p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {draft.pool.map((entry) => (
              <li key={entry.user_id} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{entry.name}</span>
                  <PreferenceBadge preference={entry.preference} size="xs" />
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => send({ action: "remove", user_id: entry.user_id })}
                      disabled={request.busy}
                      className="text-xs text-slate-500 hover:text-rose-300 disabled:opacity-40"
                      aria-label={`Remove ${entry.name} from the pool`}
                      title="Remove from the pool (they get a DM)"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {draft.notes[entry.user_id] && (
                  <p className="mt-1 text-xs italic text-slate-300">“{draft.notes[entry.user_id]}”</p>
                )}
                {entry.joined_at > 0 && (
                  <p className="mt-0.5 text-[10px] text-slate-500">joined {formatRelative(entry.joined_at * 1000, now)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

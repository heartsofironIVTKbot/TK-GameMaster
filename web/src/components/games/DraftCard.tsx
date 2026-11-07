"use client";

import { Swords, X } from "lucide-react";
import { CardTitle } from "./labels";
import Link from "next/link";
import { useState } from "react";
import PreferenceBadge from "@/components/draft/PreferenceBadge";
import { useDraftRequest } from "@/components/draft/useDraft";
import { Spinner } from "@/components/schedule/ui";
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
    <section data-tour="games.draft" className="gm-plate p-4 sm:p-[18px]">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle icon={Swords} title="Draft" />
          <p className="mt-1 text-sm text-ink-300">
            {draft.phase === "ENLISTING" &&
              `Sign-ups are open — ${draft.pool.length}${draft.pool_cap ? `/${draft.pool_cap}` : ""} in the pool. Players join from the map link in the announcement.`}
            {draft.phase === "DRAFTING" &&
              (turn
                ? `Drafting — ${turn.name}'s turn (${turn.captain_name ?? "captain"}), ${draft.picks_remaining} pick(s) left. ${draft.pool.length} still in the pool.`
                : "Drafting.")}
            {draft.phase === "COMPLETE" && "The draft is complete — the game can be started."}
          </p>
          {draft.coin_winner && draft.phase !== "ENLISTING" && (
            <p className="mt-0.5 text-[11px] text-ink-500">
              {draft.teams.find((team) => team.key === draft.coin_winner)?.name} won the coin toss.
            </p>
          )}
        </div>
        <Link
          href={`/map?game=${game.id}`}
          className="shrink-0 gm-cut [--cut:9px] border border-ink-800 bg-ink-800 px-3 py-2 text-xs font-bold text-ink-200 hover:border-brand-300/40 hover:text-ink-100"
        >
          Open the draft on the map
        </Link>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {draft.teams.map((team) => (
          <div
            key={team.key}
            className={`gm-cut [--cut:12px] border p-3 ${
              draft.phase === "DRAFTING" && team.key === draft.current_turn ? "border-brand-300/60 bg-brand-400/10" : "border-ink-800 bg-ink-950"
            }`}
          >
            <div className="flex items-center gap-2">
              <p className="flex-1 truncate text-sm font-bold text-ink-100">{team.name}</p>
              <span className="text-[11px] text-ink-400">{placed(team.key)} placed</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-ink-500">
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
                <button type="button" onClick={() => setChanging(null)} className="mt-1 text-[11px] font-bold text-ink-400 hover:text-ink-100">
                  Cancel
                </button>
              </div>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-xs text-ink-200">
                Captain {team.captain_name ?? `#${team.captain_id}`}
                {canManage && draft.phase !== "COMPLETE" && (
                  <button
                    type="button"
                    onClick={() => setChanging(team.key)}
                    disabled={request.busy}
                    className="text-[11px] font-bold text-ink-400 hover:text-ink-100 disabled:opacity-40"
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
              className="gm-btn gm-btn-primary h-9 px-4 text-[13px] disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400"
              title={draft.pool.length === 0 ? "Nobody is in the pool yet" : undefined}
            >
              {request.busy && <Spinner className="h-4 w-4" />}Start the draft
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
            className={`gm-cut [--cut:9px] px-4 py-2.5 text-sm font-bold disabled:opacity-40 ${
              confirmFinish ? "bg-rose-500 text-ink-100" : "border border-ink-800 bg-ink-800 text-ink-200 hover:border-ink-600"
            }`}
          >
            {confirmFinish ? `Click again to clear ${draft.pool.length} from the pool` : "Finish the draft"}
          </button>
          <p className="w-full text-[11px] text-ink-500">
            Start closes sign-ups and tosses the coin (when it&apos;s on). Finish clears whoever is left in the pool (they get a
            DM) so the game can start.
          </p>
        </div>
      )}

      {state.phase !== "idle" && (
        <p
          className={`mt-3 gm-cut [--cut:9px] px-3 py-2 text-xs ${
            state.phase === "error"
              ? "border border-rose-400/40 bg-rose-500/10 text-rose-100"
              : state.phase === "done"
                ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-50"
                : "text-ink-400"
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
        <p className="mb-2 text-xs font-semibold text-ink-400">Pool ({draft.pool.length})</p>
        {draft.pool.length === 0 ? (
          <p className="text-sm text-ink-500">Nobody in the pool.</p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {draft.pool.map((entry) => (
              <li key={entry.user_id} className="gm-cut [--cut:9px] border border-ink-800 bg-ink-950 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-100">{entry.name}</span>
                  <PreferenceBadge preference={entry.preference} size="xs" />
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => send({ action: "remove", user_id: entry.user_id })}
                      disabled={request.busy}
                      className="text-xs text-ink-500 hover:text-rose-300 disabled:opacity-40"
                      aria-label={`Remove ${entry.name} from the pool`}
                      title="Remove from the pool (they get a DM)"
                    >
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {draft.notes[entry.user_id] && (
                  <p className="mt-1 text-xs italic text-ink-300">“{draft.notes[entry.user_id]}”</p>
                )}
                {entry.joined_at > 0 && (
                  <p className="mt-0.5 text-[10px] text-ink-500">joined {formatRelative(entry.joined_at * 1000, now)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

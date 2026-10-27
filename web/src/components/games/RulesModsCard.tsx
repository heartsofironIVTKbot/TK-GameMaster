"use client";

import { useState } from "react";
import ResourceListEditor from "@/components/presets/ResourceListEditor";
import { GLASS, Spinner } from "@/components/schedule/ui";
import type { GameControl } from "@/lib/gameControlTypes";
import { PRESET_LIMITS, type ResourceEntry } from "@/lib/presetTypes";
import { validateResourceList } from "@/lib/presetValidation";
import { RequestResult } from "./AccessCard";
import { useBotRequest } from "./useBotRequest";

type Kind = "mods" | "rules";

/**
 * A game's rules and mods (formerly /post_mods and /post_rules): the lists
 * behind its Rules and Mods buttons. Editing one replaces the whole list.
 */
export default function RulesModsCard({ game, onChanged }: { game: GameControl; onChanged: () => void }) {
  const request = useBotRequest(onChanged);
  const [draft, setDraft] = useState<{ kind: Kind; entries: ResourceEntry[] } | null>(null);

  // Close the editor once the bot has applied the change (render-time adjust).
  const doneId = request.state.phase === "done" ? request.state.status.request_id : null;
  const [closedFor, setClosedFor] = useState<string | null>(null);
  if (doneId && doneId !== closedFor) {
    setClosedFor(doneId);
    setDraft(null);
  }

  const limit = (kind: Kind) => (kind === "mods" ? PRESET_LIMITS.mods : PRESET_LIMITS.gameRules);
  const check = draft ? validateResourceList(draft.entries, limit(draft.kind), draft.kind === "mods" ? "mods" : "rulesets") : null;
  const unchanged = draft ? JSON.stringify(draft.entries) === JSON.stringify(game.resources[draft.kind]) : true;

  const column = (kind: Kind) => {
    const entries = game.resources[kind];
    const isMods = kind === "mods";
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-bold text-white">
            {isMods ? "🛠️ Mods" : "📖 Rules"} <span className="text-xs font-semibold text-slate-500">({entries.length})</span>
          </p>
          {game.can_manage && !draft && (
            <button
              type="button"
              disabled={request.busy}
              onClick={() => {
                request.reset();
                setDraft({ kind, entries: entries.map((entry) => ({ ...entry })) });
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:border-amber-300/40 disabled:opacity-40"
            >
              ✏️ Edit
            </button>
          )}
        </div>
        {entries.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">{isMods ? "No mods listed." : "No rulesets listed."}</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {entries.map((entry, index) => (
              <li key={`${entry.link}-${index}`} className="truncate text-xs">
                <span className="text-slate-500">{isMods ? "🔗" : "📜"} </span>
                <a href={entry.link} target="_blank" rel="noreferrer" className="font-semibold text-sky-200 hover:underline">
                  {entry.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <section className={`rounded-3xl p-4 sm:p-6 ${GLASS}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Rules &amp; mods</p>
      <p className="mt-1 text-sm text-slate-300">
        What the game&apos;s Rules and Mods buttons list. Changes show up there right away.
      </p>
      {game.preset && (
        <p className="mt-1 text-[11px] text-slate-500">Set from the preset “{game.preset.name ?? "custom"}” when it was scheduled.</p>
      )}

      {draft ? (
        <div className="gm-fade-up mt-4 space-y-3">
          <ResourceListEditor
            kind={draft.kind}
            entries={draft.entries}
            standard={[]}
            allowStandard={false}
            limit={limit(draft.kind)}
            disabled={request.busy}
            onChange={(entries) => setDraft({ kind: draft.kind, entries: entries ?? [] })}
            note={draft.kind === "rules" && game.resources.casino ? "Casino game — keep the casino rules on the list." : undefined}
          />
          {check && !check.ok && <p className="text-xs text-rose-300">{check.error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={request.busy || !check?.ok || unchanged}
              onClick={() =>
                void request.submit({
                  action: "game_resources",
                  payload: { thread_id: game.id, resource: draft.kind, entries: check?.ok ? check.value : [] },
                })
              }
              className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {request.busy && <Spinner className="h-4 w-4" />}
              Save &amp; update the {draft.kind === "mods" ? "mods" : "rules"} post
            </button>
            <button
              type="button"
              disabled={request.busy}
              onClick={() => {
                setDraft(null);
                request.reset();
              }}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-300 hover:text-white disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {column("rules")}
          {column("mods")}
        </div>
      )}
      <RequestResult state={request.state} onDismiss={request.reset} />
    </section>
  );
}

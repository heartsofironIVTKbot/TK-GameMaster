"use client";

import { useMemo, useState } from "react";
import {
  draftChoiceOf,
  draftSlots,
  draftTeamOf,
  type DraftPlacer,
  type DraftPoolEntry,
  type DraftSlot,
  type LobbyDraft,
} from "@/lib/draft";
import { useEscape } from "./useDraft";

const GROUPS: { kind: DraftSlot["kind"]; title: string }[] = [
  { kind: "major", title: "👑 Majors" },
  { kind: "coop", title: "🤝 Co-ops" },
  { kind: "minor", title: "🏳️ Minors" },
  { kind: "filler", title: "🧩 Filler" },
];

/**
 * Put a pool player on a slot — one dialog for both roles: the captain on the
 * clock picks from their team's free slots (that uses the pick); the host can
 * place them anywhere playable without using a turn. A captain who is also
 * the host sees everything, with their team's slots marked.
 */
export default function DraftPickDialog({
  draft,
  entry,
  note,
  placer,
  reserved,
  locked,
  busy,
  onConfirm,
  onClose,
}: {
  draft: LobbyDraft;
  entry: DraftPoolEntry;
  note: string | null;
  placer: DraftPlacer;
  reserved: ReadonlySet<string>;
  locked: ReadonlySet<string>;
  busy: boolean;
  onConfirm: (slot: DraftSlot, action: "pick" | "assign") => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<DraftSlot | null>(null);
  useEscape(onClose, busy);
  const team = placer.pickTeam ? draft.teams.find((entryTeam) => entryTeam.key === placer.pickTeam) ?? null : null;
  const pickKeys = useMemo(
    () => new Set(team ? draftSlots(draft, reserved, locked, team.key).map((slot) => slot.key) : []),
    [draft, reserved, locked, team],
  );
  const slots = useMemo(
    () => draftSlots(draft, reserved, locked, placer.canManage ? null : (team?.key ?? "")),
    [draft, reserved, locked, placer.canManage, team],
  );
  const needle = query.trim().toLowerCase();
  const shown = needle ? slots.filter((slot) => slot.label.toLowerCase().includes(needle)) : slots;
  const preferred = draftChoiceOf(entry.preference);
  const both = Boolean(team && placer.canManage);
  const actionFor = (slot: DraftSlot): "pick" | "assign" => (pickKeys.has(slot.key) ? "pick" : "assign");

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-pick-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="gm-fade-up flex max-h-[min(720px,calc(100vh-32px))] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/60">
        <div className="border-b border-white/10 px-6 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
                {team ? `${team.name} pick${both ? " · or place anywhere" : ""}` : "Host placement"}
              </p>
              <h2 id="draft-pick-title" className="mt-1 truncate text-xl font-black text-white">
                {entry.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-300">
            Wants: <b className="text-amber-200">{entry.preference}</b>
            {note ? (
              <>
                {" "}
                · <span className="italic text-slate-200">“{note}”</span>
              </>
            ) : null}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {both
              ? `★ = ${team?.name}'s slots — choosing one uses your pick. Anything else is a host placement; the turn doesn't change.`
              : team
                ? `Your team's free slots. Choosing one uses your pick.`
                : "You can place them anywhere playable — the captains' turns don't change."}
          </p>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="🔎 Find a nation…"
            className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300/50 focus:outline-none"
          />
        </div>

        <div className="roster-scroll flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {slots.length === 0 && <p className="text-sm text-slate-400">No free slots left{team && !placer.canManage ? ` for ${team.name}` : ""}.</p>}
          {GROUPS.map((group) => {
            const items = shown.filter((slot) => slot.kind === group.kind);
            if (items.length === 0) return null;
            return (
              <div key={group.kind}>
                <p className={`mb-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${group.kind === preferred ? "text-amber-300" : "text-slate-500"}`}>
                  {group.title}
                  {group.kind === preferred && " · what they asked for"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((slot) => {
                    const active = picked?.key === slot.key;
                    const owner = placer.canManage ? draftTeamOf(draft, slot.key) : null;
                    const mineSlot = both && pickKeys.has(slot.key);
                    return (
                      <button
                        key={slot.key}
                        type="button"
                        onClick={() => setPicked(slot)}
                        disabled={busy}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                          active
                            ? "border-amber-300 bg-amber-400 text-slate-950"
                            : mineSlot
                              ? "border-amber-300/40 bg-amber-400/10 text-amber-50 hover:border-amber-300/70"
                              : "border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/30"
                        }`}
                      >
                        {mineSlot && "★ "}
                        {slot.label}
                        {owner && <span className={`ml-1 text-[10px] ${active ? "text-slate-800" : "text-slate-500"}`}>· {owner.name}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 bg-slate-950/40 px-6 py-4">
          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
            {picked
              ? `${entry.name} → ${picked.label}${both ? (actionFor(picked) === "pick" ? " (your pick)" : " (host placement)") : ""}`
              : "Choose a slot"}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-300 hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!picked || busy}
            onClick={() => picked && onConfirm(picked, actionFor(picked))}
            className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {busy ? "Working…" : picked && actionFor(picked) === "pick" ? "Draft" : "Place"}
          </button>
        </div>
      </div>
    </div>
  );
}

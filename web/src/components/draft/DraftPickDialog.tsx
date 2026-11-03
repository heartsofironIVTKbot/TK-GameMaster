"use client";

import { Search, Star, X } from "lucide-react";
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
import PreferenceBadge, { DRAFT_ICONS } from "./PreferenceBadge";
import { useEscape } from "./useDraft";

const GROUPS: { kind: DraftSlot["kind"]; title: string }[] = [
  { kind: "major", title: "Majors" },
  { kind: "coop", title: "Co-ops" },
  { kind: "minor", title: "Minors" },
  { kind: "filler", title: "Filler" },
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
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-ink-950/75 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-pick-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="gm-plate gm-fade-up flex max-h-[min(720px,calc(100vh-24px))] w-full max-w-[540px] flex-col bg-ink-950 [--cut:16px]">
        <div className="relative border-b border-ink-800 px-5 pb-3.5 pt-4">
          <button type="button" onClick={onClose} disabled={busy} className="gm-btn gm-btn-quiet absolute right-3 top-3 h-8 w-8 p-0" aria-label="Close">
            <X aria-hidden />
          </button>
          <p className="pr-10 text-xs text-ink-400">
            {team ? `${team.name}'s pick${both ? ", or place anywhere as the host" : ""}` : "Host placement"}
          </p>
          <h2 id="draft-pick-title" className="gm-title mt-0.5 truncate pr-10 text-[30px]">
            Place {entry.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PreferenceBadge preference={entry.preference} />
            {note && <span className="min-w-0 text-[12.5px] italic text-ink-300">“{note}”</span>}
          </div>
          <p className="mt-2 text-xs text-ink-500">
            {both
              ? `Starred slots are ${team?.name}'s: choosing one uses your pick. Anything else is a host placement and the turn doesn't change.`
              : team
                ? "Your team's free slots. Choosing one uses your pick."
                : "You can place them anywhere playable. The captains' turns don't change."}
          </p>
          <label className="gm-field mt-3">
            <Search aria-hidden className="h-4 w-4 shrink-0" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a nation" aria-label="Find a nation" />
          </label>
        </div>

        <div className="roster-scroll flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          {slots.length === 0 && (
            <p className="text-sm text-ink-400">No free slots left{team && !placer.canManage ? ` for ${team.name}` : ""}.</p>
          )}
          {GROUPS.map((group) => {
            const items = shown.filter((slot) => slot.kind === group.kind);
            if (items.length === 0) return null;
            const Icon = DRAFT_ICONS[group.kind];
            return (
              <div key={group.kind}>
                <p className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold ${group.kind === preferred ? "text-brand-400" : "text-ink-500"}`}>
                  <Icon aria-hidden className="h-3.5 w-3.5" />
                  <span>
                    {group.title}
                    {group.kind === preferred && <span className="font-medium">, what they asked for</span>}
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
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
                        className={`gm-cut flex min-h-9 min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-left text-[13px] transition-colors [--cut:7px] ${
                          active
                            ? "bg-brand-400 font-semibold text-brand-950"
                            : mineSlot
                              ? "bg-[oklch(20%_0.035_146)] text-ink-100 hover:bg-[oklch(24%_0.04_146)]"
                              : "bg-ink-900 text-ink-100 hover:bg-ink-800"
                        }`}
                      >
                        {mineSlot && <Star aria-label="Your team's slot" className={`h-3 w-3 shrink-0 ${active ? "" : "text-brand-400"}`} />}
                        <span className="min-w-0">
                          <span className="block truncate">{slot.label}</span>
                          {owner && <span className={`block truncate text-[11px] ${active ? "text-brand-950/70" : "text-ink-500"}`}>{owner.name}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 border-t border-ink-800 px-5 py-3.5">
          <span className="min-w-0 flex-1 truncate text-xs text-ink-400">
            {picked
              ? `${entry.name} on ${picked.label}${both ? (actionFor(picked) === "pick" ? " (your pick)" : " (host placement)") : ""}`
              : "Choose a slot"}
          </span>
          <button type="button" onClick={onClose} disabled={busy} className="gm-btn gm-btn-quiet h-10">
            Cancel
          </button>
          <button
            type="button"
            disabled={!picked || busy}
            onClick={() => picked && onConfirm(picked, actionFor(picked))}
            className="gm-btn gm-btn-primary h-[42px] px-5 font-display text-lg font-extrabold uppercase tracking-[0.02em] [--cut:9px]"
          >
            {busy ? "Working…" : picked && actionFor(picked) === "pick" ? "Pick" : "Place"}
          </button>
        </div>
      </div>
    </div>
  );
}

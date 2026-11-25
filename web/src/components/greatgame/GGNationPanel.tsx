"use client";

import { useState } from "react";
import CountryDetailsDrawer from "@/components/CountryDetailsDrawer";
import type { GGState } from "@/lib/greatGame/model";
import { X } from "lucide-react";
import { Flag, hexA, nationName, teamById } from "./ggUi";
import type { GGViewerInfo } from "./useGreatGame";

/**
 * The right drawer: the live map's own nation drawer, unchanged (leader,
 * stats, spirits), with the Great Game's action under it: "Ban <nation>"
 * during bans and "Lock in <nation>" during the draft, for the captain on the
 * clock and the organizers. Everyone else sees who has the nation.
 */

type Act = (body: Record<string, unknown>) => Promise<string | null>;

/** Height of the Great Game card at the top of the drawer. */
const CARD_H = 206;

export default function GGNationPanel({
  state,
  viewer,
  tag,
  act,
  onClose,
}: {
  state: GGState;
  viewer: GGViewerInfo;
  tag: string;
  act: Act;
  onClose: () => void;
}) {
  const [minimized, setMinimized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = nationName(state, tag);
  const owner = state.teams.find((team) => team.major === tag || team.picks.includes(tag)) ?? null;
  const bannedBy = state.teams.find((team) => team.ban === tag) ?? null;
  const turn = teamById(state, state.turn.team);
  const canAct = Boolean(turn) && (viewer.organizer || viewer.captainOf === turn?.id) && !state.paused;
  const inPool = state.config.pool.includes(tag);
  const free = inPool && !owner && !bannedBy;
  const mode = state.phase === "bans" ? "ban" : state.phase === "draft" ? "pick" : null;

  let status: { text: string; color: string };
  if (owner) status = { text: `${owner.name}${owner.major === tag ? "'s major" : ""}`, color: owner.color };
  else if (bannedBy) status = { text: `Banned by ${bannedBy.name}`, color: "#ff3b3b" };
  else if (!inPool) status = { text: "Not in the Great Game pool", color: "var(--gg-fg-3)" };
  else status = { text: mode === "ban" ? "In the pool · bannable" : mode === "pick" ? "In the pool · free to pick" : "In the pool", color: "var(--gg-ok)" };

  return (
    <div className="absolute inset-x-0 bottom-0 top-[28px] z-[1000]" style={{ pointerEvents: "none" }}>
      {/* The nation's details (the live map's drawer), below the Great Game card. */}
      <div className="absolute bottom-0 right-0" style={{ pointerEvents: "auto", top: minimized ? 0 : CARD_H, width: minimized ? 48 : 380 }}>
        <CountryDetailsDrawer
          selected={{ tag, name, slot_key: null }}
          selectionKind="pending"
          statusTag={null}
          ownerLabel={null}
          minimized={minimized}
          scenarioId="road_to_56"
          onToggleMinimized={() => setMinimized((value) => !value)}
          onClose={onClose}
        />
      </div>
      {!minimized && (
        <div
          className="gg-nation-card absolute right-0 z-[1001] w-[380px] p-4"
          style={{ pointerEvents: "auto", top: 56, height: CARD_H }}
          role="region"
          aria-label={`${name}: Great Game`}
        >
          <div className="mb-2.5 flex items-center gap-3">
            <Flag tag={tag} w={44} h={28} />
            <span className="gg-disp min-w-0 flex-1 truncate" style={{ fontWeight: 900, fontSize: 24, lineHeight: 1 }}>
              {name}
            </span>
            <button type="button" className="gg-btn h-8 min-h-0 px-2" onClick={onClose} aria-label="Close">
              <X size={15} aria-hidden />
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]" style={{ background: hexA("#1a1030", 0.9), border: "1px solid var(--gg-line)" }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: status.color }} />
            <span>
              {name}: <b style={{ color: status.color }}>{status.text}</b>
            </span>
          </div>
          {mode && canAct && free && (
            <button
              type="button"
              className={`gg-btn gg-btn-big mt-3 w-full ${mode === "ban" ? "gg-btn-danger" : "gg-btn-primary"}`}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await act({ kind: mode === "ban" ? "ban.set" : "pick.set", tag });
                setBusy(false);
                setError(result);
                if (!result) onClose();
              }}
            >
              {mode === "ban" ? `Ban ${name}` : `Lock in ${name}`}
            </button>
          )}
          {mode && canAct && free && turn && viewer.captainOf !== turn.id && (
            <p className="mt-2 text-xs" style={{ color: "var(--gg-fg-3)" }}>
              You&apos;re an organizer: this {mode === "ban" ? "bans" : "picks"} for {turn.name}, on their turn.
            </p>
          )}
          {mode && !canAct && turn && (
            <p className="mt-2 text-xs" style={{ color: "var(--gg-fg-3)" }}>
              {turn.name} is on the clock. Only their captain and the organizers can {mode === "ban" ? "ban" : "pick"}.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs" style={{ color: "#ff9b9b" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

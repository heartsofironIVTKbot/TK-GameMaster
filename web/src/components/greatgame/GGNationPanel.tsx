"use client";

import { useState } from "react";
import CountryDetailsDrawer from "@/components/CountryDetailsDrawer";
import type { GGState } from "@/lib/greatGame/model";
import { Flag, nationName, teamById } from "./ggUi";
import type { GGViewerInfo } from "./useGreatGame";

/**
 * A selected nation, the way the live map shows one: the live nation drawer
 * on the right (leader, stats, spirits) with the Great Game status as its
 * header chip, and the action at the bottom centre over the map, like the
 * live map's Reserve button: a status plate and a big glowing "Ban <nation>"
 * during bans or "Lock in <nation>" during the draft, for the captain on the
 * clock and the organizers. Everyone else sees the status plate only.
 */

type Act = (body: Record<string, unknown>) => Promise<string | null>;

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

  // The status: one line on the plate, and the drawer's header chip.
  let status: { text: string; color: string; chip: string };
  if (owner) status = { text: `${owner.name}${owner.major === tag ? "'s major" : ""}`, color: owner.color, chip: "bg-sky-950/80 text-sky-200" };
  else if (bannedBy) status = { text: `Banned by ${bannedBy.name}`, color: "#ff3b3b", chip: "bg-rose-950/80 text-rose-300" };
  else if (state.config.majors.includes(tag)) status = { text: "Major · handed out on the reel", color: "var(--gg-cyan)", chip: "bg-sky-950/80 text-sky-200" };
  else if (!inPool) status = { text: "Locked · not part of the draft", color: "var(--gg-fg-3)", chip: "bg-ink-800 text-ink-300" };
  else
    status = {
      text: mode === "ban" ? "In the pool · bannable" : mode === "pick" ? "In the pool · free to pick" : "In the pool",
      color: "var(--gg-ok)",
      chip: "bg-emerald-950/80 text-emerald-300",
    };
  const showAction = mode && canAct && free && turn;

  return (
    <>
      <div className="absolute inset-x-0 bottom-0 top-[28px] z-[1000]" style={{ pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <CountryDetailsDrawer
            selected={{ tag, name, slot_key: null }}
            selectionKind="pending"
            statusTag={{ label: status.text, className: status.chip }}
            ownerLabel={null}
            minimized={minimized}
            scenarioId="road_to_56"
            onToggleMinimized={() => setMinimized((value) => !value)}
            onClose={onClose}
          />
        </div>
      </div>

      {/* The action, bottom centre over the map (like the live map's Reserve button). */}
      <div className="gg-dock" role="region" aria-label={`${name}: Great Game`}>
        <p className="gg-dock-plate">
          <Flag tag={tag} w={26} h={17} />
          <span>
            {name}: <b style={{ color: status.color }}>{status.text}</b>
          </span>
        </p>
        {showAction && (
          <div className={`gg-dock-glow ${mode === "ban" ? "is-ban" : ""}`}>
            <span aria-hidden className="gg-dock-halo" />
            <span aria-hidden className="gg-dock-halo" />
            <span aria-hidden className="gg-dock-halo" />
            <button
              type="button"
              className={`gg-dock-btn ${mode === "ban" ? "is-ban" : ""}`}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await act({ kind: mode === "ban" ? "ban.set" : "pick.set", tag });
                setBusy(false);
                setError(result);
                if (!result) onClose();
              }}
            >
              {busy ? (mode === "ban" ? "Banning…" : "Locking in…") : mode === "ban" ? `Ban ${name}` : `Lock in ${name}`}
            </button>
          </div>
        )}
        {showAction && viewer.captainOf !== turn.id && (
          <p className="gg-dock-note">
            You&apos;re an organizer: this {mode === "ban" ? "bans" : "picks"} for {turn.name}, on their turn.
          </p>
        )}
        {mode && free && !canAct && turn && (
          <p className="gg-dock-note">
            {turn.name} {mode === "ban" ? "ban" : "pick"} now. Only their captain and the organizers can {mode === "ban" ? "ban" : "pick"}.
          </p>
        )}
        {error && (
          <p role="alert" className="gg-dock-note" style={{ color: "#ff9b9b" }}>
            {error}
          </p>
        )}
      </div>
    </>
  );
}

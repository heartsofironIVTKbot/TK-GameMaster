"use client";

import dynamic from "next/dynamic";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useCallback, useState } from "react";
import { turnDeadline } from "@/lib/greatGame/engine";
import GGControlPanel from "./GGControlPanel";
import GGLog from "./GGLog";
import GGNationPanel from "./GGNationPanel";
import GGRandomizers, { ANIM_MS } from "./GGRandomizers";
import GGTeamStack, { finalText } from "./GGTeamStack";
import { scratchHeld } from "./ggScratch";
import GGBanSlam from "./GGBanSlam";
import GGFinale from "./GGFinale";
import GGLineupBoard from "./GGLineupBoard";
import GGPoolPanel from "./GGPoolPanel";
import GGTopBar from "./GGTopBar";
import { AvatarsContext } from "./ggUi";
import { useGreatGame, useTick } from "./useGreatGame";

const GGMap = dynamic(() => import("./GGMap"), { ssr: false });

/**
 * The Great Game draft room (/greatgame/<event>): the map in the middle, the
 * top bar with the pennant, the team stack on the left, the nation drawer on
 * the right, the randomizers over the map in steps 1 to 4, and for
 * organizers the controls. Everything shared comes live from the server.
 */
export default function GGApp({ slug }: { slug: string }) {
  const game = useGreatGame(slug);
  const { state, viewer, error, considering, act, consider, reveal, serverNow, demo, avatars } = game;
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<"log" | "controls" | null>(null);
  // The team drawer: shown by default, except during the drum and the reel,
  // whose stage has its own team box (it can still be opened).
  const [drawerChoice, setDrawerChoice] = useState<{ map: boolean | null; stage: boolean | null }>({ map: null, stage: null });
  const onStage = state?.phase === "drum" || state?.phase === "wheel" || state?.phase === "vice" || state?.phase === "recruits";
  const drawerOpen = (onStage ? drawerChoice.stage : drawerChoice.map) ?? !onStage;
  const setDrawerOpen = (open: boolean) => setDrawerChoice((choice) => ({ ...choice, [onStage ? "stage" : "map"]: open }));
  const now = serverNow();
  // Re-render 5 times a second only while something counts: a turn clock or a draw animation.
  const counting = Boolean(
    state && (turnDeadline(state) !== null || (state.last_draw && now - state.last_draw.at < (ANIM_MS[state.last_draw.kind] ?? 0) + 1000)),
  );
  useTick(counting ? 200 : 0);

  const canAct = Boolean(
    state && viewer && state.turn.team && (viewer.organizer || viewer.captainOf === state.turn.team) && (state.phase === "bans" || state.phase === "draft"),
  );

  const select = useCallback(
    (tag: string | null) => {
      setSelected(tag);
      if (tag) setPanel(null);
      // The glow follows the captain's look; a nation they can't take (a major, outside the pool) clears it.
      if (canAct) consider(tag && state?.config.pool.includes(tag) ? tag : "");
    },
    [canAct, consider, state?.config.pool],
  );

  if (error) {
    return (
      <main className="gg flex items-center justify-center p-6">
        <div className="gg-panel max-w-md rounded-2xl p-8 text-center">
          <div className="gg-brush text-5xl">The Great Game</div>
          <p className="mt-4" style={{ color: "var(--gg-fg-2)" }}>
            {error.message}
          </p>
          {error.status === 401 && (
            <a className="gg-btn gg-btn-primary gg-btn-big mt-6 px-8" href={`/api/auth/login?next=${encodeURIComponent(`/greatgame/${slug}`)}`}>
              Log in with Discord
            </a>
          )}
        </div>
      </main>
    );
  }
  if (!state || !viewer) {
    return (
      <main className="gg flex items-center justify-center">
        <div className="gg-brush text-5xl">The Great Game</div>
      </main>
    );
  }

  const animating = state.last_draw ? now - state.last_draw.at < (ANIM_MS[state.last_draw.kind] ?? 0) : false;

  return (
    <AvatarsContext.Provider value={avatars}>
    <main className="gg" data-animating={animating || undefined}>
      <div className="absolute inset-0">
        <GGMap state={state} considering={considering} selected={selected} onSelect={select} />
      </div>

      <GGRandomizers state={state} viewer={viewer} act={act} now={now} clock={serverNow} avatars={avatars} scratch={game.scratch} sendScratch={game.sendScratch} hover={game.hover} sendHover={game.sendHover} />

      <GGTopBar
        state={state}
        now={now}
        scratchTeam={scratchHeld(state, game.scratch, now)?.team ?? null}
        onOpenLog={() => setPanel(panel === "log" ? null : "log")}
        onOpenControls={viewer.organizer ? () => setPanel(panel === "controls" ? null : "controls") : null}
        right={
          demo ? (
            <select
              aria-label="Act as (preview only)"
              className="gg-input h-9 w-[150px] text-xs"
              value={viewer.id}
              onChange={async (event) => {
                await fetch(`/api/greatgame/${slug}/act-as`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: event.target.value }) });
                await game.reload();
              }}
            >
              {state.config.people.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} ({entry.role})
                </option>
              ))}
            </select>
          ) : (
            <span className="hidden max-w-[140px] truncate text-xs sm:inline" style={{ color: "var(--gg-fg-2)" }} title={`${viewer.name} · ${viewer.role}`}>
              {viewer.name}
            </span>
          )
        }
      />

      {/* Left drawer: the team stack. */}
      {drawerOpen ? (
        <aside
          className="gg-scroll absolute bottom-0 left-0 top-[86px] z-[1060] w-[min(340px,100%)] pb-6"
          style={{ background: "#0e081e", borderRight: "1px solid var(--gg-line-2)", boxShadow: "4px 0 24px rgba(0,0,0,.45)" }}
          aria-label="Teams"
        >
          <button type="button" className="gg-btn absolute right-2 top-3 h-8 min-h-0 px-2" onClick={() => setDrawerOpen(false)} aria-label="Hide the teams">
            <PanelLeftClose size={16} />
          </button>
          <GGTeamStack state={state} viewer={viewer} act={act} />
        </aside>
      ) : (
        <button type="button" className="gg-btn absolute left-3 top-[100px] z-[1060]" onClick={() => setDrawerOpen(true)}>
          <PanelLeftOpen size={16} aria-hidden /> Teams
        </button>
      )}

      {/* During the bans and the draft: the minors still free, on the right (a selected nation shows its drawer instead). */}
      {(state.phase === "bans" || state.phase === "draft") && !selected && !panel && <GGPoolPanel state={state} onSelect={select} />}
      <GGBanSlam state={state} now={now} />
      {state.phase === "assign" && !selected && !panel && <GGLineupBoard state={state} viewer={viewer} act={act} />}
      {state.phase === "locked" && !panel && <GGFinale state={state} viewer={viewer} now={now} reveal={reveal} copyText={finalText(state)} />}
      {selected && !panel && <GGNationPanel key={selected} state={state} viewer={viewer} tag={selected} act={act} onClose={() => select(null)} />}
      {panel === "log" && <GGLog state={state} organizer={viewer.organizer} act={act} onClose={() => setPanel(null)} />}
      {panel === "controls" && viewer.organizer && <GGControlPanel state={state} act={act} reveal={reveal} onClose={() => setPanel(null)} now={now} viewers={game.viewers} live={game.live} />}

      {!game.live && (
        <div className="gg-panel absolute bottom-4 left-1/2 z-[1300] -translate-x-1/2 rounded-full px-4 py-2 text-xs" role="status">
          Reconnecting to the live draft…
        </div>
      )}
    </main>
    </AvatarsContext.Provider>
  );
}

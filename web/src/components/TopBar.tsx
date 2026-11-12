"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Puzzle, ScrollText, Wrench } from "lucide-react";
import ResourceLinksDialog, { type ResourceKind } from "@/components/ResourceLinksDialog";
import type { ResourceEntry } from "@/lib/presetTypes";
import { BrandMark, MenuButton, ViewerAvatar } from "@/components/site/SiteMenu";
import { useViewer } from "@/components/site/viewer";

interface TopBarProps {
  /** Discord server / lobby display name. */
  lobbyName?: string;
  /** Active mod / scenario tag. The map follows the selected game, so
   *  there's no mode picker. */
  scenarioName?: string;
  /** When the game starts ("Starts Wednesday 11:58 UTC"). */
  sessionTime?: string;
  /** The game has started. */
  inProgress?: boolean;
  /** The selected game's own rules and mods (the Rules / Mods pop-ups); null while loading. */
  resources?: { mods: ResourceEntry[]; rules: ResourceEntry[] } | null;
  /** No game is selected (the pop-ups say so). */
  noGame?: boolean;
  /** Hosts only: the live map host tools switch. */
  hostTools?: { enabled: boolean; isStaff?: boolean; onToggle: () => void } | null;
}

/**
 * The map's top bar: the GameMaster mark and site menu, the game's Rules and
 * Mods, the Host Tool for hosts, the game in the middle and the viewer (or
 * Log in) on the right. The selected nation's own controls sit in its panel
 * (CountryDetailsDrawer). Phones get icon buttons and a game strip below.
 */
export default function TopBar({
  lobbyName = "GameMaster",
  scenarioName = "Vanilla",
  sessionTime = "Start time to be announced",
  inProgress = false,
  resources = null,
  noGame = false,
  hostTools = null,
}: TopBarProps) {
  const viewer = useViewer();
  // The game's own lists in a pop-up (they used to open the HOI4 wiki / Workshop, never the game's).
  const [dialog, setDialog] = useState<ResourceKind | null>(null);
  const closeDialog = useCallback(() => setDialog(null), []);
  const game = (
    <>
      <span className="gm-cut flex h-[21px] shrink-0 items-center bg-ink-800 px-2.5 text-[11.5px] font-semibold text-ink-300 [--cut:6px]">
        {scenarioName}
      </span>
      {inProgress ? (
        <span className="gm-tag gm-tag-dot bg-rose-950/70 text-rose-300">In progress</span>
      ) : (
        <span className="hidden truncate sm:inline">{sessionTime}</span>
      )}
    </>
  );

  return (
    <header className="absolute left-0 right-0 top-0 z-[1000] border-b border-ink-800 bg-ink-950">
      <div className="grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 sm:px-3 lg:grid-cols-[1fr_auto_1fr]">
        {/* Left: the mark, the site menu, the game's Rules / Mods and the Host Tool. */}
        <div className="flex min-w-0 items-center gap-1.5 justify-self-start">
          <Link href="/" aria-label="GameMaster: home" className="mr-0.5">
            <BrandMark size={30} />
          </Link>
          <MenuButton current="map" className="hidden sm:inline-flex" />
          <span className="mx-1.5 hidden h-6 w-px bg-ink-800 sm:block" aria-hidden />
          <button
            type="button"
            onClick={() => setDialog("rules")}
            data-tour="map.rules map.rulesMods"
            title="This game's rules"
            aria-label="Rules"
            aria-haspopup="dialog"
            className="gm-btn gm-btn-secondary w-9 px-0 md:w-auto md:px-3.5"
          >
            <ScrollText aria-hidden />
            <span className="hidden md:inline">Rules</span>
          </button>
          <button
            type="button"
            onClick={() => setDialog("mods")}
            data-tour="map.rulesMods"
            title="The mods to subscribe to"
            aria-label="Mods"
            aria-haspopup="dialog"
            className="gm-btn gm-btn-secondary w-9 px-0 md:w-auto md:px-3.5"
          >
            <Puzzle aria-hidden />
            <span className="hidden md:inline">Mods</span>
          </button>
          {hostTools && (
            <button
              type="button"
              onClick={hostTools.onToggle}
              aria-pressed={hostTools.enabled}
              data-host-tool-button
              data-tour="map.hostTool"
              title="Host Tool: drag players onto nations, swap, add co-ops and fillers, remove players"
              aria-label="Host tool"
              className={`gm-btn w-9 px-0 md:w-auto md:px-3 ${hostTools.enabled ? "gm-btn-primary" : "gm-btn-quiet"}`}
            >
              <Wrench aria-hidden />
              <span className="hidden md:inline">Host tool</span>
            </button>
          )}
        </div>

        {/* Centre: the game (wide screens; phones get the strip below). */}
        <div data-tour="map.gameInfo" className="hidden min-w-0 flex-col items-center text-center sm:flex">
          <span className="gm-title w-full truncate text-[22px]">{lobbyName}</span>
          <span className="mt-1 flex min-w-0 max-w-full items-center justify-center gap-2 text-xs text-ink-400">{game}</span>
        </div>

        {/* Right: the viewer, or Log in; the menu on phones. */}
        <div className="flex min-w-0 items-center gap-2 justify-self-end">
          {viewer?.loggedIn && (
            <Link href="/profile" title={viewer.name ? `${viewer.name}: my profile` : "My profile"} className="hidden sm:block">
              <ViewerAvatar viewer={viewer} />
            </Link>
          )}
          {viewer && !viewer.loggedIn && (
            <a href="/api/auth/login" className="gm-btn hidden h-8 bg-[#5865F2] px-3 text-xs text-white hover:bg-[#4752c4] sm:inline-flex">
              Log in
            </a>
          )}
          <MenuButton current="map" label={false} className="sm:hidden" />
        </div>
      </div>

      {/* Phones: the game on its own strip. */}
      <div data-tour="map.gameInfo" className="flex h-10 items-center justify-between gap-3 border-t border-ink-800 px-3 sm:hidden">
        <span className="gm-title min-w-0 truncate text-lg">{lobbyName}</span>
        <span className="flex shrink-0 items-center gap-2 text-[11.5px] text-ink-400">{game}</span>
      </div>
      {dialog && (
        <ResourceLinksDialog
          key={`${dialog}-${resources ? resources[dialog].length : "loading"}`}
          kind={dialog}
          entries={resources?.[dialog] ?? []}
          loading={!noGame && !resources}
          noGame={noGame}
          onClose={closeDialog}
        />
      )}
    </header>
  );
}

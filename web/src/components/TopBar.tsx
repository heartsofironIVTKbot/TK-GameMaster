"use client";

import Link from "next/link";
import { Puzzle, ScrollText, Wrench } from "lucide-react";
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
  /** URL opened in a new tab by the "Rules" button. */
  rulesUrl?: string;
  /** URL opened in a new tab by the "Mods" button. */
  modsUrl?: string;
  /** Hosts only: the live map host tools switch. */
  hostTools?: { enabled: boolean; isStaff?: boolean; onToggle: () => void } | null;
}

const DEFAULT_RULES_URL = "https://hoi4.paradoxwikis.com/";
const DEFAULT_MODS_URL = "https://steamcommunity.com/app/394360/workshop/";

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
  rulesUrl = DEFAULT_RULES_URL,
  modsUrl = DEFAULT_MODS_URL,
  hostTools = null,
}: TopBarProps) {
  const viewer = useViewer();
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
          <Link href="/" aria-label="GameMaster: the map" className="mr-0.5">
            <BrandMark size={30} />
          </Link>
          <MenuButton current="map" className="hidden sm:inline-flex" />
          <span className="mx-1.5 hidden h-6 w-px bg-ink-800 sm:block" aria-hidden />
          <a
            href={rulesUrl}
            data-tour="map.rules map.rulesMods"
            target="_blank"
            rel="noopener noreferrer"
            title="This game's rules"
            aria-label="Rules"
            className="gm-btn gm-btn-secondary w-9 px-0 md:w-auto md:px-3.5"
          >
            <ScrollText aria-hidden />
            <span className="hidden md:inline">Rules</span>
          </a>
          <a
            href={modsUrl}
            data-tour="map.rulesMods"
            target="_blank"
            rel="noopener noreferrer"
            title="The mods to subscribe to"
            aria-label="Mods"
            className="gm-btn gm-btn-secondary w-9 px-0 md:w-auto md:px-3.5"
          >
            <Puzzle aria-hidden />
            <span className="hidden md:inline">Mods</span>
          </a>
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
    </header>
  );
}

"use client";

import { MenuButton } from "@/components/site/SiteMenu";
import type { SelectionKind } from "@/lib/types";

interface TopBarProps {
  /** Discord server / lobby display name (line 1). */
  lobbyName?: string;
  /** Active mod / scenario tag (line 2). The map follows the selected game, so
   *  there's no mode picker. */
  scenarioName?: string;
  /** Scheduled game host time (line 3). */
  sessionTime?: string;
  /** URL opened in a new tab by the "Rules" button. */
  rulesUrl?: string;
  /** URL opened in a new tab by the "Mods" button. */
  modsUrl?: string;
  /** Currently inspected nation (drives the right-hand status chip). */
  selection?: { nationName: string; kind: SelectionKind } | null;
  /** Whether the country details drawer is collapsed. */
  drawerMinimized?: boolean;
  /** Toggle the drawer between full and collapsed (the ◀/▶ arrow). */
  onToggleDrawer?: () => void;
  /** Close the drawer entirely (the ✕ button). */
  onCloseDrawer?: () => void;
  /** Hosts only: the live map host tools switch. */
  hostTools?: { enabled: boolean; isStaff?: boolean; onToggle: () => void } | null;
}

const CHIP_STYLES: Record<SelectionKind, string> = {
  pending: "border-yellow-300/60 bg-yellow-300/15 text-yellow-200",
  self: "border-emerald-300/60 bg-emerald-300/15 text-emerald-200",
  locked: "border-rose-400/60 bg-rose-400/15 text-rose-200",
  coop: "border-sky-300/60 bg-sky-300/15 text-sky-200",
};

const CHIP_LABELS: Record<SelectionKind, string> = {
  pending: "Pending claim",
  self: "Your nation",
  locked: "Reserved",
  coop: "Co-Op available",
};

const DEFAULT_RULES_URL = "https://hoi4.paradoxwikis.com/";
const DEFAULT_MODS_URL = "https://steamcommunity.com/app/394360/workshop/";

const BUTTON =
  "flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800/80 px-2.5 py-1.5 text-xs font-bold text-ink-200 transition hover:bg-ink-700 sm:px-3.5 sm:py-2 sm:text-sm";

/**
 * The map's top bar: the site menu (every page, host pages included), the
 * game's Rules and Mods, the Host Tool for hosts, the game in the middle and
 * the selected nation on the right. Phones get icon buttons and a shorter
 * game line.
 */
export default function TopBar({
  lobbyName = "GameMaster · HOI4",
  scenarioName = "Vanilla",
  sessionTime = "Session Start: TBA",
  rulesUrl = DEFAULT_RULES_URL,
  modsUrl = DEFAULT_MODS_URL,
  selection = null,
  drawerMinimized = false,
  onToggleDrawer,
  onCloseDrawer,
  hostTools = null,
}: TopBarProps) {
  return (
    <header className="absolute left-0 right-0 top-0 z-[1000] h-20 border-b border-white/10 bg-ink-950/40 shadow-2xl backdrop-blur-md">
      <div className="grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:gap-4 sm:px-6 lg:grid-cols-[1fr_auto_1fr]">
        {/* Left: menu, the game's Rules / Mods (breathing glow + light sweep,
            see globals.css topbar-btn-*), and the Host Tool for hosts. */}
        <div className="flex min-w-0 items-center gap-1.5 justify-self-start sm:gap-2.5">
          <MenuButton current="map" className="sm:py-2 sm:text-sm" />
          <a
            href={rulesUrl}
            data-tour="map.rules map.rulesMods"
            target="_blank"
            rel="noopener noreferrer"
            title="This game's rules"
            className={`topbar-btn-rules topbar-btn-shine ${BUTTON}`}
          >
            📜<span className="hidden md:inline">Rules</span>
          </a>
          <a
            href={modsUrl}
            data-tour="map.rulesMods"
            target="_blank"
            rel="noopener noreferrer"
            title="The mods to subscribe to"
            className={`topbar-btn-mods topbar-btn-shine ${BUTTON}`}
          >
            🧩<span className="hidden md:inline">Mods</span>
          </a>
          {hostTools && (
            <button
              type="button"
              onClick={hostTools.onToggle}
              aria-pressed={hostTools.enabled}
              data-host-tool-button
              data-tour="map.hostTool"
              title="Host Tool: drag players onto nations, swap, add co-ops and fillers, remove players"
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition sm:px-3.5 sm:py-2 sm:text-sm ${
                hostTools.enabled
                  ? "border-brand-300 bg-brand-400 text-ink-950 shadow-lg shadow-brand-500/30"
                  : "border-ink-700 bg-ink-800/80 text-ink-200 hover:border-brand-400/60 hover:bg-ink-700"
              }`}
            >
              🛠️<span className="hidden md:inline">Host Tool</span>
            </button>
          )}
        </div>

        {/* Centre: the game. */}
        <div data-tour="map.gameInfo" className="flex min-w-0 flex-col items-center text-center leading-tight">
          <span className="w-full truncate text-xs font-bold text-ink-100 sm:text-sm">{lobbyName}</span>
          <span className="mt-0.5 truncate text-[11px] font-semibold text-brand-400 sm:text-xs">{scenarioName}</span>
          <span className="mt-0.5 hidden truncate text-[11px] text-ink-400 sm:block">{sessionTime}</span>
        </div>

        {/* Right: the selected nation, above its details panel. */}
        <div className="flex min-w-0 items-center gap-2 justify-self-end">
          {selection && (
            <>
              <span
                className={`hidden rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wide md:inline-block lg:px-4 lg:py-2 lg:text-sm ${CHIP_STYLES[selection.kind]}`}
              >
                {CHIP_LABELS[selection.kind]}
              </span>
              <span className="hidden max-w-[160px] truncate text-sm font-semibold text-ink-200 xl:block">{selection.nationName}</span>
              <button
                type="button"
                aria-label={drawerMinimized ? "Expand country details" : "Minimize country details"}
                title={drawerMinimized ? "Expand country details" : "Minimize country details"}
                className="rounded-md border border-ink-700 bg-ink-800/80 px-2.5 py-2 text-sm text-ink-300 transition-colors hover:border-ink-500 hover:text-white"
                onClick={onToggleDrawer}
              >
                {drawerMinimized ? "◀" : "▶"}
              </button>
              <button
                type="button"
                aria-label="Close country details"
                title="Close country details"
                className="rounded-md border border-ink-700 bg-ink-800/80 px-2.5 py-2 text-sm text-ink-300 transition-colors hover:border-rose-500 hover:text-white"
                onClick={onCloseDrawer}
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

"use client";

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
  /** Hosts only: the live map host tools switch (also shows the host pages). */
  hostTools?: { enabled: boolean; isStaff?: boolean; onToggle: () => void } | null;
}

/** Host pages, shown in the top bar to hosts only. */
const HOST_LINKS: { href: string; label: string; title: string; staffOnly?: boolean }[] = [
  { href: "/schedule", label: "🗓️ Schedule", title: "Schedule — host calendar" },
  { href: "/database", label: "🗂️ Database", title: "Database — search players, give and take commends, warnings, bans and Dishonored" },
  { href: "/games", label: "🎮 Games", title: "Games — start, end and cancel games" },
  { href: "/attendance", label: "🎯 Attendance", title: "Attendance — live voice samples, corrections and the audit log for started games" },
  { href: "/servers", label: "⚙️ Servers", title: "Servers — add GameMaster to a server and set up its roles, channels and game modes" },
  { href: "/tickets", label: "🎫 Tickets", title: "Tickets — read closed tickets you opened or your role handles" },
  { href: "/audit", label: "📜 Audit", title: "Audit log — every action on the server, searchable (Host Management only)", staffOnly: true },
];

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
    <header className="absolute top-0 left-0 right-0 z-[1000] h-20 border-b border-white/10 bg-slate-950/30 shadow-2xl backdrop-blur-md">
      <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center px-6">
        {/* Left: Rules / Mods (breathing glow + a light sweep, see globals.css
            topbar-btn-*) and My profile for everyone; host pages for hosts. */}
        <div className="flex flex-row items-center gap-3 justify-self-start">
          <a
            href={rulesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="topbar-btn-rules topbar-btn-shine rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700"
          >
            📜 Rules
          </a>
          <a
            href={modsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="topbar-btn-mods topbar-btn-shine rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700"
          >
            🧩 Mods
          </a>
          <a
            href="/profile"
            title="My profile — your games, attendance, commends, warnings and roles"
            className="rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-amber-400/60 hover:bg-slate-700"
          >
            👤 My profile
          </a>
          {hostTools &&
            HOST_LINKS.filter((link) => !link.staffOnly || hostTools.isStaff).map((link) => (
              <a
                key={link.href}
                href={link.href}
                title={link.title}
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-amber-400/60 hover:bg-slate-700"
              >
                {link.label}
              </a>
            ))}
          {hostTools && (
            <button
              type="button"
              onClick={hostTools.onToggle}
              aria-pressed={hostTools.enabled}
              data-host-tool-button
              title="Drag players onto nations, swap, add co-ops and fillers, remove players"
              className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
                hostTools.enabled
                  ? "border-amber-300 bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/30"
                  : "border-slate-700 bg-slate-800/80 text-slate-200 hover:border-amber-400/60 hover:bg-slate-700"
              }`}
            >
              🛠️ Host Tool
            </button>
          )}
        </div>

        {/* Center: 3-line lobby information */}
        <div className="flex flex-col items-center leading-tight">
          <span className="text-sm font-bold text-slate-200">{lobbyName}</span>
          <span className="mt-0.5 text-xs font-semibold text-amber-400">
            {scenarioName}
          </span>
          <span className="mt-0.5 text-[11px] text-slate-400">{sessionTime}</span>
        </div>

        {/* Right: selection status chip + drawer controls, shown above the
            country drawer so the inspected nation's state is always visible. */}
        <div className="flex items-center gap-3 justify-self-end">
          {selection && (
            <>
              <span
                className={`inline-block rounded-lg border px-4 py-2 text-base font-bold uppercase tracking-wide ${CHIP_STYLES[selection.kind]}`}
              >
                {CHIP_LABELS[selection.kind]}
              </span>
              <span className="max-w-[180px] truncate text-sm font-semibold text-slate-200">
                {selection.nationName}
              </span>
              <button
                type="button"
                aria-label={drawerMinimized ? "Expand country details" : "Minimize country details"}
                title={drawerMinimized ? "Expand country details" : "Minimize country details"}
                className="rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                onClick={onToggleDrawer}
              >
                {drawerMinimized ? "◀" : "▶"}
              </button>
              <button
                type="button"
                aria-label="Close country details"
                title="Close country details"
                className="rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-2 text-sm text-slate-300 transition-colors hover:border-rose-500 hover:text-white"
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

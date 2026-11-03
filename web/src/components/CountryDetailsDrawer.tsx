"use client";

// This drawer renders inline-SVG data-URI portraits/spirit icons and flagcdn
// flags, none of which benefit from Next's image optimizer, so plain <img>
// is intentional here.
/* eslint-disable @next/next/no-img-element */

import { ChevronDown, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  DEFAULT_SCENARIO,
  SCENARIOS,
  getCountryData,
  placeholderFlag,
  type CountryScenarioData,
  type NationalSpirit,
  type NationalSpiritEffect,
  type ScenarioId,
} from "@/data/scenarioData";
import type {
  AuthUser,
  GameLobby,
  LobbyReservation,
  NationFeatureProps,
  SelectionKind,
} from "@/lib/types";

interface CountryDetailsDrawerProps {
  selected: NationFeatureProps;
  selectionKind: SelectionKind;
  ownerLabel: string | null;
  authUser: AuthUser | null;
  mySlot: LobbyReservation | null;
  games: GameLobby[];
  selectedThread: string;
  /** Collapsed state, owned by the page so the top bar arrow can toggle it. */
  minimized: boolean;
  /** Active scenario id (drives the scraped country data lookup). */
  scenarioId: ScenarioId;
  onSelectThread: (threadId: string) => void;
  onToggleMinimized: () => void;
  /** Close the panel (clears the selection). */
  onClose: () => void;
}

/** How the selected nation stands for the viewer: the tag in the panel's header. */
const SELECTION_TAGS: Record<SelectionKind, { label: string; className: string }> = {
  pending: { label: "Pending claim", className: "bg-yellow-950/80 text-yellow-200" },
  self: { label: "Your nation", className: "bg-emerald-950/80 text-emerald-300" },
  locked: { label: "Reserved", className: "bg-rose-950/80 text-rose-300" },
  coop: { label: "Co-op available", className: "bg-sky-950/80 text-sky-200" },
};

/** Muted tints for the number boxes: game data, not status (brown civilian,
 *  green military / army, blue naval, red air). */
const TONES: Record<"brown" | "green" | "blue" | "red", { bg: string; line: string; text: string }> = {
  brown: { bg: "oklch(24% 0.035 60)", line: "oklch(40% 0.06 60)", text: "oklch(80% 0.07 65)" },
  green: { bg: "oklch(23% 0.04 145)", line: "oklch(40% 0.07 145)", text: "oklch(82% 0.09 145)" },
  blue: { bg: "oklch(23% 0.04 245)", line: "oklch(40% 0.07 245)", text: "oklch(80% 0.08 240)" },
  red: { bg: "oklch(23% 0.045 20)", line: "oklch(41% 0.08 20)", text: "oklch(80% 0.09 20)" },
};

function NumberBox({ value, label, note, tone }: { value: number; label: string; note: string; tone: keyof typeof TONES }) {
  const colors = TONES[tone];
  return (
    <div
      className="gm-plate px-1.5 pb-2 pt-2.5 text-center [--cut:10px]"
      style={{ backgroundColor: colors.bg, "--line": colors.line } as CSSProperties}
    >
      <p className="font-display text-[30px] font-extrabold leading-none text-ink-100">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs font-semibold" style={{ color: colors.text }}>
        {label}
      </p>
      <p className="text-[11px] text-ink-500">{note}</p>
    </div>
  );
}

/** The seven HOI4 major powers: USA, UK, SOV, FRA, GER, ITA, JAP. */
const MAJOR_TAGS = new Set(["USA", "ENG", "SOV", "FRA", "GER", "ITA", "JAP"]);

const IDEOLOGY_META = [
  { key: "democratic", label: "Democratic", color: "#3b82f6" },
  { key: "fascism", label: "Fascism", color: "#b45309" },
  { key: "communism", label: "Communism", color: "#dc2626" },
  { key: "nonAligned", label: "Non-Aligned", color: "#6b7280" },
] as const;

const RESOURCE_META = [
  { key: "oil", label: "Oil", color: "#38bdf8" },
  { key: "aluminum", label: "Aluminum", color: "#cbd5e1" },
  { key: "rubber", label: "Rubber", color: "#4ade80" },
  { key: "tungsten", label: "Tungsten", color: "#a78bfa" },
  { key: "steel", label: "Steel", color: "#facc15" },
  { key: "chromium", label: "Chromium", color: "#fb7185" },
  { key: "coal", label: "Coal", color: "#71717a" },
] as const;

type Segment = { value: number; color: string; label?: string };

function conicGradient(segments: Segment[]): string {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return "#1e293b";
  let acc = 0;
  const stops = segments.map((segment) => {
    const start = acc;
    acc += (segment.value / total) * 100;
    return `${segment.color} ${start}% ${acc}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function Donut({
  segments,
  size = 112,
  thickness = 14,
  hole = "bg-ink-950",
  children,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
  /** The centre's colour: the same as what the pie sits on. */
  hole?: string;
  children?: ReactNode;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size, background: conicGradient(segments) }}
    >
      <div
        className={`absolute flex flex-col items-center justify-center rounded-full ${hole}`}
        style={{
          top: thickness,
          right: thickness,
          bottom: thickness,
          left: thickness,
        }}
      >
        {children ??
          (total === 0 ? <span className="text-xs text-ink-500">—</span> : null)}
      </div>
    </div>
  );
}

function ownerHandle(ownerLabel: string | null): string {
  if (!ownerLabel) return "another player";
  return ownerLabel.startsWith("Discord user ") ? ownerLabel : `@${ownerLabel}`;
}

/** Dark silhouette avatar shown when a leader portrait is missing. */
function LeaderPortrait({ scenario }: { scenario: CountryScenarioData }) {
  // Track which source failed (not just a boolean): the component instance
  // persists when the user swaps nations, and a sticky `failed` flag from a
  // previous 404 would wrongly hide the next nation's real portrait.
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source =
    scenario.leader.portraitUrl || `/assets/portraits/${scenario.tag}.png`;
  const failed = failedSource === source;
  if (!source || failed) {
    return (
      <div className="gm-cut flex h-[70px] w-14 shrink-0 items-center justify-center bg-ink-800 [--cut:7px]">
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-ink-500"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={source}
      alt={scenario.leader.name}
      className="gm-cut h-[70px] w-14 shrink-0 object-cover [--cut:7px]"
      onError={() => setFailedSource(source)}
    />
  );
}

/** HOI4-style shield glyph used as the spirit icon fallback. */
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2 4 5v6c0 5 3.4 8.8 8 11 4.6-2.2 8-6 8-11V5l-8-3Z" />
    </svg>
  );
}

/** Spirit badge icon: real PNG when available, else the shield fallback. */
function SpiritIcon({ spirit, className }: { spirit: NationalSpirit; className?: string }) {
  // Same sticky-state guard as LeaderPortrait: remember which URL failed so
  // a new icon (different nation) retries instead of inheriting the failure.
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const failed = failedSource === spirit.iconUrl;
  if (!spirit.iconUrl || failed) {
    return <ShieldIcon className={className ?? "h-4 w-4 text-ink-400"} />;
  }
  return (
    <img
      src={spirit.iconUrl}
      alt=""
      className={className ?? "h-4 w-4 rounded-sm"}
      onError={() => setFailedSource(spirit.iconUrl ?? null)}
    />
  );
}

/** Prettify a raw modifier key when no localised label exists. */
function prettifyModifierKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Format one spirit effect the way the HOI4 tooltip does. */
function formatNumber(value: number, decimals: number): string {
  const factor = 10 ** Math.max(0, Math.min(4, decimals));
  const rounded = Math.round(value * factor) / factor;
  return String(Number(rounded.toFixed(decimals)));
}

function formatSpiritEffect(effect: NationalSpiritEffect): {
  label: string;
  value: string;
  positive: boolean | null;
  yellow: boolean;
} {
  let label = effect.label.includes("_")
    ? prettifyModifierKey(effect.label)
    : effect.label;
  if (typeof effect.value === "string") {
    return { label, value: effect.value, positive: null, yellow: false };
  }
  const percent = effect.percent ?? false;
  if (percent && label.endsWith(" factor")) {
    label = label.slice(0, -" factor".length);
  }
  const scale = percent === true ? 100 : 1;
  const decimals =
    effect.decimals ?? (percent === false ? 2 : 1);
  const scaled = effect.value * scale;
  const suffix = percent === false ? "" : "%";
  // The game's ``Y=`` flag: positive values show in yellow with NO plus
  // sign; negative values fall through to the normal colour logic below.
  const yellow = effect.yellow === true && scaled > 0;
  const sign =
    yellow || effect.kind === "neutral"
      ? ""
      : scaled >= 0
        ? "+"
        : "";
  const value = `${sign}${formatNumber(scaled, decimals)}${suffix}`;
  if (yellow || effect.kind === "neutral") {
    return { label, value, positive: null, yellow };
  }
  const positive = effect.kind === "bad" ? scaled < 0 : scaled >= 0;
  return { label, value, positive, yellow: false };
}

/** Text colour for one formatted effect (null = neutral, uncoulored). */
function effectColor(positive: boolean | null, yellow: boolean): string {
  if (yellow) return "text-yellow-300";
  if (positive === null) return "text-ink-200";
  return positive ? "text-emerald-400" : "text-red-400";
}

/** HOI4-style tooltip card: name, modifier effects, and description. */
function SpiritDetailCard({ spirit }: { spirit: NationalSpirit | null }) {
  if (!spirit) return null;
  const effects = (spirit.effects ?? []).filter(
    (effect) =>
      effect.value !== 0 &&
      effect.value !== "0" &&
      effect.value !== "0.0" &&
      !(typeof effect.value === "string" && /^[-+]?0+\.?0*$/.test(effect.value.trim())),
  );
  const traits = spirit.traits ?? [];
  return (
    <div className="gm-plate mt-2 p-3">
      <div className="flex items-center gap-2.5">
        <SpiritIcon spirit={spirit} className="h-8 w-8 object-contain" />
        <p className="text-sm font-semibold leading-snug text-ink-100">
          {spirit.name}
        </p>
      </div>
      {effects.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {effects.map((effect) => {
            const formatted = formatSpiritEffect(effect);
            return (
              <li
                key={effect.key}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="text-ink-300">{formatted.label}</span>
                <span
                  className={`font-mono font-semibold tabular-nums ${effectColor(
                    formatted.positive,
                    formatted.yellow,
                  )}`}
                >
                  {formatted.value}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {traits.map((trait) => (
        <div key={trait.id} className="mt-2.5">
          <p className="text-xs font-semibold text-ink-200">
            {trait.name}
          </p>
          <ul className="mt-1 space-y-1">
            {trait.effects
              .filter(
                (effect) =>
                  effect.value !== 0 &&
                  effect.value !== "0" &&
                  effect.value !== "0.0",
              )
              .map((effect) => {
                const formatted = formatSpiritEffect(effect);
                return (
                  <li
                    key={effect.key}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <span className="text-ink-300">{formatted.label}</span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${effectColor(
                        formatted.positive,
                        formatted.yellow,
                      )}`}
                    >
                      {formatted.value}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      {spirit.description && (
        <p className="mt-2.5 text-xs leading-relaxed text-ink-400">
          {spirit.description}
        </p>
      )}
    </div>
  );
}

function StatBar({ label, value, barClass }: { label: string; value: number; barClass: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="flex items-center justify-between gap-1 text-xs text-ink-400">
        {label}
        <span className="font-semibold tabular-nums text-ink-100">{clamped}%</span>
      </div>
      <div className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full bg-ink-800">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export default function CountryDetailsDrawer({
  selected,
  selectionKind,
  ownerLabel,
  authUser,
  mySlot,
  games,
  selectedThread,
  minimized,
  scenarioId = DEFAULT_SCENARIO,
  onSelectThread,
  onToggleMinimized,
  onClose,
}: CountryDetailsDrawerProps) {
  const scenario: CountryScenarioData = useMemo(
    () => getCountryData(selected.tag, selected.name, scenarioId),
    [selected, scenarioId],
  );

  const [hoveredSpiritId, setHoveredSpiritId] = useState<string | null>(null);
  // Phones: which nation's full details are open ("More about").
  const [expandedFor, setExpandedFor] = useState<string | null>(null);

  const isMajor = MAJOR_TAGS.has(scenario.tag);

  // Ideology wheel: total-conversion scenarios (Kaiserreich) ship a registry
  // of their own parties with names + colours; legacy datasets fall back to
  // the four vanilla families.
  const ideologyRegistry = SCENARIOS[scenarioId]?.ideologies;
  const ideologySegments: Segment[] = ideologyRegistry
    ? Object.entries(ideologyRegistry)
        .map(([key, info]) => ({
          value: scenario.ideology.breakdown[key] ?? 0,
          color: info.color,
          label: info.name,
        }))
        .filter((segment) => segment.value > 0)
    : IDEOLOGY_META.map((meta) => ({
        value: scenario.ideology.breakdown[meta.key] ?? 0,
        color: meta.color,
        label: meta.label,
      }));

  const resourceSegments: Segment[] = RESOURCE_META.map((meta) => ({
    value: scenario.resources[meta.key],
    color: meta.color,
    label: meta.label,
  }));

  const status = SELECTION_TAGS[selectionKind];
  const flag = (
    <img
      src={scenario.flagUrl || `/assets/flags/${scenario.tag}.png`}
      alt={`${scenario.name} flag`}
      className="gm-cut h-9 w-14 shrink-0 object-cover [--cut:6px]"
      onError={(event) => {
        event.currentTarget.src = placeholderFlag(scenario.tag);
      }}
    />
  );

  if (minimized) {
    return (
      <aside className="country-drawer absolute right-0 top-14 z-[1000] hidden w-12 flex-col items-center gap-3 border-l border-ink-800 bg-ink-950 py-3 text-ink-100 sm:flex">
        <button
          type="button"
          aria-label="Open the nation panel"
          title="Open the nation panel"
          className="gm-btn gm-btn-quiet h-8 w-8 p-0"
          onClick={onToggleMinimized}
        >
          <PanelRightOpen aria-hidden />
        </button>
        <img
          src={scenario.flagUrl || `/assets/flags/${scenario.tag}.png`}
          alt={`${scenario.name} flag`}
          className="h-6 w-9 object-cover outline outline-1 outline-white/10"
          onError={(event) => {
            event.currentTarget.src = placeholderFlag(scenario.tag);
          }}
        />
        <span className="text-[11px] font-semibold text-ink-400 [writing-mode:vertical-rl]">{scenario.name}</span>
      </aside>
    );
  }

  const expanded = expandedFor === scenario.tag;
  const totalResources = resourceSegments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <aside
      data-tour="map.details"
      className={`country-drawer absolute inset-x-0 bottom-0 z-[1000] flex max-h-[calc(100%-9.5rem)] flex-col border-t border-ink-800 bg-ink-950 pb-28 text-ink-100 sm:inset-x-auto sm:right-0 sm:top-14 sm:max-h-none sm:w-[380px] sm:border-l sm:border-t-0 sm:pb-0`}
    >
      {/* Header: flag, name, Major / Minor and how this nation stands for
          you; fold (wide screens) and close. */}
      <div className="flex items-center gap-3 border-b border-ink-800 py-3.5 pl-4 pr-2.5">
        {flag}
        <div className="min-w-0 flex-1">
          <h2 className="gm-title truncate text-[26px]">{scenario.name}</h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="gm-tag bg-ink-800 text-ink-300">{isMajor ? "Major power" : "Minor nation"}</span>
            <span className={`gm-tag gm-tag-dot ${status.className}`}>{status.label}</span>
          </p>
        </div>
        <div className="flex shrink-0 self-start">
          <button
            type="button"
            aria-label="Fold the nation panel"
            title="Fold the panel"
            className="gm-btn gm-btn-quiet hidden h-8 w-8 p-0 sm:inline-flex"
            onClick={onToggleMinimized}
          >
            <PanelRightClose aria-hidden />
          </button>
          <button type="button" aria-label="Close the nation panel" title="Close" className="gm-btn gm-btn-quiet h-8 w-8 p-0" onClick={onClose}>
            <X aria-hidden />
          </button>
        </div>
      </div>

      {/* Phones: the sheet stays short until "More about" opens the rest. */}
      <button
        type="button"
        onClick={() => setExpandedFor(expanded ? null : scenario.tag)}
        aria-expanded={expanded}
        className="gm-btn gm-btn-quiet mx-2.5 my-1.5 h-8 self-start px-2 sm:hidden"
      >
        {expanded ? "Less" : `More about ${scenario.name}`}
        <ChevronDown aria-hidden className={expanded ? "rotate-180" : ""} />
      </button>

      {/* Body */}
      <div className={`${expanded ? "block" : "hidden"} min-h-0 flex-1 space-y-[18px] overflow-y-auto p-4 sm:block`}>
        {/* Leader & ideology */}
        <section className="gm-plate p-3">
          <div className="flex items-center gap-3">
            <LeaderPortrait scenario={scenario} />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] text-ink-500">Leader</p>
              <p className="text-[15px] font-semibold leading-tight text-ink-100">{scenario.leader.name}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-400">{scenario.ideology.name}</p>
            </div>
            <Donut segments={ideologySegments} size={76} thickness={9} hole="bg-ink-900">
              <span className="font-display text-xl font-extrabold leading-none text-ink-100">
                {scenario.ideology.rulingPartyShare}%
              </span>
              <span className="text-[10.5px] text-ink-400">ruling</span>
            </Donut>
          </div>

          {/* Stability & War Support */}
          <div className="mt-3 grid grid-cols-2 gap-3.5">
            <StatBar label="Stability" value={scenario.stability} barClass="bg-sky-300" />
            <StatBar label="War support" value={scenario.warSupport} barClass="bg-[oklch(66%_0.09_60)]" />
          </div>
        </section>

        {/* National spirits */}
        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-500">National spirits</h3>
          {scenario.nationalSpirits.length === 0 ? (
            <p className="text-xs text-ink-500">No national spirits.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {scenario.nationalSpirits.map((spirit) => (
                  <div
                    key={spirit.id}
                    className={`gm-cut h-12 w-12 cursor-help p-1 transition-colors [--cut:8px] ${
                      hoveredSpiritId === spirit.id ? "bg-ink-700" : "bg-ink-800"
                    }`}
                    onMouseEnter={() => setHoveredSpiritId(spirit.id)}
                    onMouseLeave={() =>
                      setHoveredSpiritId((current) =>
                        current === spirit.id ? null : current,
                      )
                    }
                  >
                    <SpiritIcon spirit={spirit} className="h-full w-full object-contain" />
                  </div>
                ))}
              </div>
              {hoveredSpiritId !== null && (
                <SpiritDetailCard
                  spirit={
                    scenario.nationalSpirits.find(
                      (spirit) => spirit.id === hoveredSpiritId,
                    ) ?? null
                  }
                />
              )}
            </>
          )}
        </section>

        {/* Industrial capacity */}
        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-500">Industrial capacity</h3>
          <div className="grid grid-cols-3 gap-2">
            <NumberBox value={scenario.industry.civilianFactories} label="Civilian" note="factories" tone="brown" />
            <NumberBox value={scenario.industry.militaryFactories} label="Military" note="factories" tone="green" />
            <NumberBox value={scenario.industry.navalDockyards} label="Dockyards" note="naval" tone="blue" />
          </div>
        </section>

        {/* Resources */}
        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-500">Resources</h3>
          <div className="flex items-center gap-[18px]">
            <Donut segments={resourceSegments} size={112} thickness={15}>
              <span className="text-[10.5px] text-ink-400">Total</span>
              <span className="font-display text-xl font-extrabold leading-none text-ink-100">{totalResources}</span>
            </Donut>
            <ul className="flex-1 space-y-1">
              {RESOURCE_META.map((meta) => (
                <li key={meta.key} className="flex items-center gap-2 text-[12.5px] text-ink-300">
                  <span className="inline-block h-[9px] w-[9px] rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                  <span className="ml-auto font-semibold tabular-nums text-ink-100">{scenario.resources[meta.key]}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Armed forces */}
        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-500">Armed forces</h3>
          <div className="grid grid-cols-3 gap-2">
            <NumberBox value={scenario.armedForces.divisions} label="Divisions" note="army" tone="green" />
            <NumberBox value={scenario.armedForces.totalWarships} label="Warships" note="navy" tone="blue" />
            <NumberBox value={scenario.armedForces.totalAircraft} label="Aircraft" note="air force" tone="red" />
          </div>
        </section>

        {/* Locked / Co-Op notices */}
        {selectionKind === "locked" && (
          <p className="gm-plate bg-rose-950/50 p-2.5 text-xs text-rose-100 [--line:color-mix(in_oklab,var(--color-rose-400)_30%,transparent)]">
            This nation is already taken by {ownerHandle(ownerLabel)} in this lobby.
          </p>
        )}
        {selectionKind === "coop" && (
          <p className="gm-plate bg-sky-950/50 p-2.5 text-xs text-sky-100 [--line:color-mix(in_oklab,var(--color-sky-300)_35%,transparent)]">
            This major power is held by {ownerHandle(ownerLabel)}. You can ask to co-op it.
          </p>
        )}
      </div>

      {/* Signed in: which lobby the map shows. The reserve / unreserve
          actions live in the glowing button MapViewer draws over the map. */}
      {authUser && (
        <div data-tour="map.gamePicker" className={`${expanded ? "block" : "hidden"} border-t border-ink-800 p-4 sm:block`}>
          <label htmlFor="game-select" className="mb-1 block text-xs text-ink-400">
            Game lobby
          </label>
          <div className="gm-field">
            <select
              id="game-select"
              value={selectedThread}
              onChange={(event) => onSelectThread(event.target.value)}
              disabled={games.length === 0}
            >
              {games.length === 0 && <option value="">No active lobbies</option>}
              {games.map((game) => (
                <option key={game.thread_id} value={game.thread_id}>
                  {game.game_started ? "In progress: " : ""}
                  {game.thread_name ?? game.mode ?? game.thread_id}
                </option>
              ))}
            </select>
          </div>
          {selectionKind === "self" && mySlot && (
            <p className="mt-2 text-xs text-emerald-300">
              You hold <span className="font-medium">{mySlot.slot_key}</span> in this lobby.
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

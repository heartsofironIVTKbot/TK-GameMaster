"use client";

// This drawer renders inline-SVG data-URI portraits/spirit icons and flagcdn
// flags, none of which benefit from Next's image optimizer, so plain <img>
// is intentional here.
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState, type ReactNode } from "react";
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
  children,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size, background: conicGradient(segments) }}
    >
      <div
        className="absolute flex flex-col items-center justify-center rounded-full bg-slate-900"
        style={{
          top: thickness,
          right: thickness,
          bottom: thickness,
          left: thickness,
        }}
      >
        {children ??
          (total === 0 ? <span className="text-xs text-slate-500">—</span> : null)}
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
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800">
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-slate-500"
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
      className="h-16 w-16 shrink-0 rounded-md border border-slate-700 object-cover"
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
    return <ShieldIcon className={className ?? "h-4 w-4 text-slate-400"} />;
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
  if (positive === null) return "text-slate-200";
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
    <div className="mt-2 rounded-lg border border-amber-400/25 bg-slate-950/90 p-3 shadow-xl">
      <div className="flex items-center gap-2.5">
        <SpiritIcon spirit={spirit} className="h-8 w-8 rounded-sm object-cover" />
        <p className="text-sm font-semibold leading-snug text-amber-300">
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
                <span className="text-slate-300">{formatted.label}</span>
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
          <p className="text-xs font-bold uppercase tracking-wide text-slate-200">
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
                    <span className="text-slate-300">{formatted.label}</span>
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
        <p className="mt-2.5 text-xs leading-relaxed text-slate-400">
          {spirit.description}
        </p>
      )}
    </div>
  );
}

function StatBar({
  icon,
  label,
  value,
  barClass,
}: {
  icon: string;
  label: string;
  value: number;
  barClass: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-1 text-xs">
        <span className="font-medium text-slate-300">
          <span aria-hidden="true" className="mr-1">
            {icon}
          </span>
          {label}
        </span>
        <span className="font-mono font-semibold tabular-nums text-slate-100">
          {clamped}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${clamped}%` }}
        />
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
}: CountryDetailsDrawerProps) {
  const scenario: CountryScenarioData = useMemo(
    () => getCountryData(selected.tag, selected.name, scenarioId),
    [selected, scenarioId],
  );

  const [hoveredSpiritId, setHoveredSpiritId] = useState<string | null>(null);

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

  if (minimized) {
    return (
      <aside className="country-drawer absolute right-0 top-20 z-[1000] flex w-12 flex-col items-center gap-3 border-l border-slate-800 bg-slate-900/95 py-3 text-slate-100 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          aria-label="Expand country details"
          title="Expand country details"
          className="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          onClick={onToggleMinimized}
        >
          ◀
        </button>
        <img
          src={scenario.flagUrl || `/assets/flags/${scenario.tag}.png`}
          alt={`${scenario.name} flag`}
          className="h-6 w-9 rounded-sm border border-slate-700 object-cover"
          onError={(event) => {
            event.currentTarget.src = placeholderFlag(scenario.tag);
          }}
        />
        <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 [writing-mode:vertical-rl]">
          {scenario.name}
        </span>
      </aside>
    );
  }

  return (
    <aside className="country-drawer absolute bottom-0 right-0 top-20 z-[1000] flex w-[380px] flex-col border-l border-slate-800 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur-md">
      {/* Header: flag + name + Major/Minor badge. The selection chip and
          the minimize/close controls live in the top bar (TopBar.tsx). */}
      <div className="border-b border-slate-800 p-4">
        <div className="flex items-center gap-3">
          <img
            src={scenario.flagUrl || `/assets/flags/${scenario.tag}.png`}
            alt={`${scenario.name} flag`}
            className="h-9 w-14 shrink-0 rounded-sm border border-slate-700 object-cover"
            onError={(event) => {
              event.currentTarget.src = placeholderFlag(scenario.tag);
            }}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-tight">
              {scenario.name}
            </h2>
            <span
              className={`mt-0.5 inline-block rounded-full border px-2 py-px text-[10px] font-semibold uppercase tracking-wide ${
                isMajor
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                  : "border-slate-600 bg-slate-800/70 text-slate-400"
              }`}
            >
              {isMajor ? "Major Power" : "Minor Nation"}
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Leader & ideology */}
        <section className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="flex items-center gap-3">
            <LeaderPortrait scenario={scenario} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">
                Leader
              </p>
              <p className="truncate text-sm font-semibold">
                {scenario.leader.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {scenario.ideology.name}
              </p>
            </div>
            <Donut segments={ideologySegments} size={72} thickness={9}>
              <span className="text-sm font-bold leading-none">
                {scenario.ideology.rulingPartyShare}%
              </span>
              <span className="text-[9px] uppercase tracking-wide text-slate-400">
                Ruling
              </span>
            </Donut>
          </div>

          {/* Stability & War Support */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <StatBar
              icon="⚖️"
              label="Stability"
              value={scenario.stability}
              barClass="bg-emerald-400"
            />
            <StatBar
              icon="⚔️"
              label="War Support"
              value={scenario.warSupport}
              barClass="bg-amber-400"
            />
          </div>
        </section>

        {/* National spirits */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            National Spirits
          </h3>
          {scenario.nationalSpirits.length === 0 ? (
            <p className="text-xs text-slate-500">No national spirits.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {scenario.nationalSpirits.map((spirit) => (
                  <div
                    key={spirit.id}
                    className={`h-12 w-12 cursor-help overflow-hidden rounded-md border bg-slate-800/80 shadow-sm transition-colors ${
                      hoveredSpiritId === spirit.id
                        ? "border-amber-400/80"
                        : "border-slate-700"
                    }`}
                    onMouseEnter={() => setHoveredSpiritId(spirit.id)}
                    onMouseLeave={() =>
                      setHoveredSpiritId((current) =>
                        current === spirit.id ? null : current,
                      )
                    }
                  >
                    <SpiritIcon spirit={spirit} className="h-full w-full object-cover" />
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
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Industrial Capacity
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                [
                  "Civilian",
                  scenario.industry.civilianFactories,
                  "border-amber-800/70 bg-amber-950/50",
                ],
                [
                  "Military",
                  scenario.industry.militaryFactories,
                  "border-green-800/70 bg-green-950/50",
                ],
                [
                  "Dockyards",
                  scenario.industry.navalDockyards,
                  "border-blue-800/70 bg-blue-950/50",
                ],
              ] as const
            ).map(([label, value, tone]) => (
              <div
                key={label}
                className={`rounded-lg border p-2.5 text-center ${tone}`}
              >
                <p className="text-xl font-bold tabular-nums">{value}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Resources */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Resources
          </h3>
          <div className="flex items-center gap-4">
            <Donut segments={resourceSegments} size={112} thickness={16}>
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                Total
              </span>
              <span className="text-lg font-bold tabular-nums">
                {resourceSegments.reduce((sum, segment) => sum + segment.value, 0)}
              </span>
            </Donut>
            <ul className="flex-1 space-y-1.5">
              {RESOURCE_META.map((meta) => (
                <li
                  key={meta.key}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="flex items-center gap-2 text-slate-300">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: meta.color }}
                    />
                    {meta.label}
                  </span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {scenario.resources[meta.key]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Armed forces */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Armed Forces
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-green-400/50 bg-green-300/20 p-2.5 text-center">
              <p className="text-xl font-bold tabular-nums">
                {scenario.armedForces.divisions.toLocaleString()}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-200">
                Army
              </p>
              <p className="text-[9px] text-green-200/60">Divisions</p>
            </div>
            <div className="rounded-lg border border-sky-400/50 bg-sky-300/20 p-2.5 text-center">
              <p className="text-xl font-bold tabular-nums">
                {scenario.armedForces.totalWarships.toLocaleString()}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200">
                Navy
              </p>
              <p className="text-[9px] text-sky-200/60">Warships</p>
            </div>
            <div className="rounded-lg border border-rose-400/50 bg-rose-300/20 p-2.5 text-center">
              <p className="text-xl font-bold tabular-nums">
                {scenario.armedForces.totalAircraft.toLocaleString()}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
                Air Force
              </p>
              <p className="text-[9px] text-rose-200/60">Aircraft</p>
            </div>
          </div>
        </section>

        {/* Locked / Co-Op notices */}
        {selectionKind === "locked" && (
          <p className="rounded-md border border-rose-400/30 bg-rose-400/10 p-2.5 text-xs text-rose-100">
            This nation is already taken by {ownerHandle(ownerLabel)} in this
            lobby.
          </p>
        )}
        {selectionKind === "coop" && (
          <p className="rounded-md border border-sky-300/40 bg-sky-300/10 p-2.5 text-xs text-sky-100">
            This major power is held by {ownerHandle(ownerLabel)}. You can ask
            to co-op it.
          </p>
        )}
      </div>

      {/* Bottom bar: lobby picker only. The reserve / unreserve actions live
          in the glowing bottom-center button rendered by MapViewer. */}
      <div className="border-t border-slate-800 p-4">
        {authUser ? (
          <>
            <label
              htmlFor="game-select"
              className="mb-1 block text-xs text-slate-400"
            >
              Game lobby
            </label>
            <select
              id="game-select"
              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
              value={selectedThread}
              onChange={(event) => onSelectThread(event.target.value)}
              disabled={games.length === 0}
            >
              {games.length === 0 && (
                <option value="">No active lobbies</option>
              )}
              {games.map((game) => (
                <option key={game.thread_id} value={game.thread_id}>
                  {game.game_started ? "🔴 In progress · " : ""}
                  {game.thread_name ?? game.mode ?? game.thread_id}
                </option>
              ))}
            </select>
            {selectionKind === "self" && mySlot && (
              <p className="mt-2 text-xs text-emerald-400">
                ✓ You hold{" "}
                <span className="font-medium">{mySlot.slot_key}</span> in this
                lobby.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-400">
            Login with Discord to reserve a nation.
          </p>
        )}
      </div>
    </aside>
  );
}

/* eslint-disable @next/next/no-img-element */
import type { CSSProperties, ReactNode } from "react";
import { UK_1936 } from "./ukNation";

/**
 * The map's nation panel for the front page's demo: the same markup as
 * CountryDetailsDrawer (header, leader and ideology ring, stability and war
 * support, national spirits, industry, resources, armed forces), fed with the
 * United Kingdom's 1936 data. A copy, not the real component: that one loads
 * every scenario's data, far too heavy for the front page.
 */

const IDEOLOGY_META = [
  { key: "democratic", color: "#3b82f6" },
  { key: "fascism", color: "#b45309" },
  { key: "communism", color: "#dc2626" },
  { key: "nonAligned", color: "#6b7280" },
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

const TONES: Record<"brown" | "green" | "blue" | "red", { bg: string; line: string; text: string }> = {
  brown: { bg: "oklch(24% 0.035 60)", line: "oklch(40% 0.06 60)", text: "oklch(80% 0.07 65)" },
  green: { bg: "oklch(23% 0.04 145)", line: "oklch(40% 0.07 145)", text: "oklch(82% 0.09 145)" },
  blue: { bg: "oklch(23% 0.04 245)", line: "oklch(40% 0.07 245)", text: "oklch(80% 0.08 240)" },
  red: { bg: "oklch(23% 0.045 20)", line: "oklch(41% 0.08 20)", text: "oklch(80% 0.09 20)" },
};

type Segment = { value: number; color: string };

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

function Donut({ segments, size, thickness, hole = "bg-ink-950", children }: { segments: Segment[]; size: number; thickness: number; hole?: string; children: ReactNode }) {
  return (
    <div className="relative shrink-0 rounded-full" style={{ width: size, height: size, background: conicGradient(segments) }}>
      <div className={`absolute flex flex-col items-center justify-center rounded-full ${hole}`} style={{ inset: thickness }}>
        {children}
      </div>
    </div>
  );
}

function NumberBox({ value, label, note, tone }: { value: number; label: string; note: string; tone: keyof typeof TONES }) {
  const colors = TONES[tone];
  return (
    <div className="gm-plate px-1.5 pb-2 pt-2.5 text-center [--cut:10px]" style={{ backgroundColor: colors.bg, "--line": colors.line } as CSSProperties}>
      <p className="font-display text-[26px] font-extrabold leading-none text-ink-100">{value.toLocaleString("en-US")}</p>
      <p className="mt-1 text-xs font-semibold" style={{ color: colors.text }}>
        {label}
      </p>
      <p className="text-[11px] text-ink-500">{note}</p>
    </div>
  );
}

function StatBar({ label, value, barClass }: { label: string; value: number; barClass: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-1 text-xs text-ink-400">
        {label}
        <span className="font-semibold tabular-nums text-ink-100">{value}%</span>
      </div>
      <div className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full bg-ink-800">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function NationCard({ status }: { status: "pending" | "self" }) {
  const nation = UK_1936;
  const ideology = IDEOLOGY_META.map((meta) => ({ value: nation.ideology.breakdown[meta.key], color: meta.color }));
  const resources = RESOURCE_META.map((meta) => ({ value: nation.resources[meta.key], color: meta.color }));
  const total = resources.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <>
      <div className="flex items-center gap-3 border-b border-ink-800 py-3.5 pl-4 pr-2.5">
        <img src={nation.flagUrl} alt="" className="gm-cut h-9 w-14 shrink-0 object-cover [--cut:6px]" />
        <div className="min-w-0 flex-1">
          <p className="gm-title truncate text-[26px]">{nation.name}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="gm-tag bg-ink-800 text-ink-300">Major power</span>
            {status === "pending" ? (
              <span className="gm-tag gm-tag-dot bg-yellow-950/80 text-yellow-200">Pending claim</span>
            ) : (
              <span className="gm-tag gm-tag-dot bg-emerald-950/80 text-emerald-300">Your nation</span>
            )}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-[18px] overflow-hidden p-4">
        <section className="gm-plate p-3">
          <div className="flex items-center gap-3">
            <img src={nation.leader.portraitUrl} alt="" className="gm-cut h-[70px] w-14 shrink-0 object-cover [--cut:7px]" />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] text-ink-500">Leader</p>
              <p className="text-[15px] font-semibold leading-tight text-ink-100">{nation.leader.name}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-400">{nation.ideology.name}</p>
            </div>
            <Donut segments={ideology} size={76} thickness={9} hole="bg-ink-900">
              <span className="font-display text-xl font-extrabold leading-none text-ink-100">{nation.ideology.rulingPartyShare}%</span>
              <span className="text-[10.5px] text-ink-400">ruling</span>
            </Donut>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3.5">
            <StatBar label="Stability" value={nation.stability} barClass="bg-sky-300" />
            <StatBar label="War support" value={nation.warSupport} barClass="bg-[oklch(66%_0.09_60)]" />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-500">National spirits</h3>
          <div className="flex flex-wrap gap-2">
            {nation.spirits.map((spirit) => (
              <div key={spirit.id} title={spirit.name} className="gm-cut h-12 w-12 bg-ink-800 p-1 [--cut:8px]">
                <img src={spirit.iconUrl} alt="" className="h-full w-full object-contain" />
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-500">Industrial capacity</h3>
          <div className="grid grid-cols-3 gap-2">
            <NumberBox value={nation.industry.civilianFactories} label="Civilian" note="factories" tone="brown" />
            <NumberBox value={nation.industry.militaryFactories} label="Military" note="factories" tone="green" />
            <NumberBox value={nation.industry.navalDockyards} label="Dockyards" note="naval" tone="blue" />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-500">Resources</h3>
          <div className="flex items-center gap-[18px]">
            <Donut segments={resources} size={104} thickness={14}>
              <span className="text-[10.5px] text-ink-400">Total</span>
              <span className="font-display text-xl font-extrabold leading-none text-ink-100">{total}</span>
            </Donut>
            <ul className="flex-1 space-y-1">
              {RESOURCE_META.map((meta) => (
                <li key={meta.key} className="flex items-center gap-2 text-[12.5px] text-ink-300">
                  <span className="inline-block h-[9px] w-[9px] rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                  <span className="ml-auto font-semibold tabular-nums text-ink-100">{nation.resources[meta.key]}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-500">Armed forces</h3>
          <div className="grid grid-cols-3 gap-2">
            <NumberBox value={nation.armedForces.divisions} label="Divisions" note="army" tone="green" />
            <NumberBox value={nation.armedForces.totalWarships} label="Warships" note="navy" tone="blue" />
            <NumberBox value={nation.armedForces.totalAircraft} label="Aircraft" note="air force" tone="red" />
          </div>
        </section>
      </div>
    </>
  );
}

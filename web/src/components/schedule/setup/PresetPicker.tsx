"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { presetSummary, type GamePreset } from "@/lib/presetTypes";
import { modeOption } from "@/lib/scheduleOptions";
import { SectionCard, Spinner } from "../ui";

/**
 * Game setup: load one of the server's presets for the picked mode. Loading
 * copies its nation groups, nation locks, who can reserve, rules and mods
 * into the form (everything stays editable here; the preset itself doesn't
 * change).
 */
export default function PresetPicker({
  mode,
  presetId,
  presetName,
  onApply,
  onClear,
}: {
  mode: string;
  presetId: string | null;
  presetName: string | null;
  onApply: (preset: GamePreset) => void;
  onClear: () => void;
}) {
  const [list, setList] = useState<{ mode: string; presets: GamePreset[] | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!mode) return undefined;
    let cancelled = false;
    fetch(`/api/presets?mode=${encodeURIComponent(mode)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { presets?: GamePreset[]; error?: string } | null;
        if (!cancelled) setList({ mode, presets: body?.presets ?? null, error: response.ok ? null : (body?.error ?? "Couldn't load presets.") });
      })
      .catch(() => {
        if (!cancelled) setList({ mode, presets: null, error: "Network error — presets didn't load." });
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (!mode) return null;
  const current = list?.mode === mode ? list : null;
  const presets = current?.presets ?? [];

  return (
    <SectionCard
      icon="🧩"
      title="Preset"
      subtitle={`Load a saved ${modeOption(mode)?.label ?? mode} setup — nation groups, locks, rules and mods.`}
      right={
        <Link href={`/presets/new?mode=${encodeURIComponent(mode)}`} className="text-[11px] font-bold text-amber-300 hover:text-amber-200">
          ＋ New
        </Link>
      }
    >
      {presetName && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-emerald-100">✓ {presetName}</span>
          {presetId && (
            <Link href={`/presets/edit?id=${presetId}`} className="text-[11px] font-semibold text-emerald-200/80 hover:text-white">
              View
            </Link>
          )}
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-2 py-0.5 text-[11px] font-bold text-slate-300 hover:bg-white/10 hover:text-white"
            title="Use the mode's standard groups, rules and mods again (locks and access stay as they are)"
          >
            Remove
          </button>
        </div>
      )}
      {!current ? (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Spinner className="h-3.5 w-3.5 text-amber-300" /> Loading presets…
        </p>
      ) : current.error ? (
        <p className="text-xs text-rose-300">{current.error}</p>
      ) : presets.length === 0 ? (
        <p className="text-xs text-slate-400">
          No presets for this mode yet —{" "}
          <Link href="/presets?view=library" className="font-semibold text-sky-300 hover:underline">
            browse the public library
          </Link>{" "}
          or make one.
        </p>
      ) : (
        <ul className="roster-scroll max-h-64 space-y-1.5 overflow-y-auto">
          {presets.map((preset) => {
            const loaded = preset.preset_id === presetId;
            return (
              <li key={preset.preset_id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{preset.name}</span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {presetSummary(preset.data).join(" · ")} · by {preset.created_by_name ?? "a host"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onApply(preset)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-black transition ${
                    loaded ? "bg-white/5 text-slate-400 hover:text-white" : "bg-amber-400 text-slate-950 hover:bg-amber-300"
                  }`}
                  title="Replaces this form's nation locks, access, nation groups, rules and mods"
                >
                  {loaded ? "Reload" : "Load"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

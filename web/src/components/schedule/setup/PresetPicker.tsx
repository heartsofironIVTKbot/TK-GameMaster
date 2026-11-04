"use client";

import { BadgeCheck, Layers, Plus, Star } from "lucide-react";
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
      icon={Layers}
      title="Preset"
      subtitle={`Loads a saved ${modeOption(mode)?.label ?? mode} setup: nations, locks, rules and mods.`}
      right={
        <Link href={`/presets/new?mode=${encodeURIComponent(mode)}`} className="gm-btn gm-btn-quiet h-7 px-2 text-xs [--cut:6px]">
          <Plus aria-hidden strokeWidth={2} /> New
        </Link>
      }
    >
      {!current ? (
        <p className="flex items-center gap-2 text-xs text-ink-400">
          <Spinner className="h-3.5 w-3.5 text-brand-400" /> Loading presets…
        </p>
      ) : current.error ? (
        <p className="text-xs text-rose-300">{current.error}</p>
      ) : presets.length === 0 && !presetName ? (
        <p className="text-xs text-ink-400">
          No presets for this mode yet, so the game lists the whole map.{" "}
          <Link href="/presets?view=library" className="font-semibold text-sky-300 hover:underline">
            Browse the public library
          </Link>{" "}
          or make one.
        </p>
      ) : (
        <ul className="roster-scroll max-h-64 space-y-1 overflow-y-auto">
          {presetName && !presets.some((preset) => preset.preset_id === presetId) && (
            <li className="gm-cut flex items-center gap-2 bg-ink-950 px-2.5 py-2 shadow-[inset_3px_0_0_var(--color-brand-400)] [--cut:8px]">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-100">{presetName}</span>
              <span className="text-[11px] text-brand-400">Loaded</span>
              <button type="button" onClick={onClear} className="gm-btn gm-btn-quiet h-7 px-2.5 text-xs [--cut:6px]" title={CLEAR_TITLE}>
                Remove
              </button>
            </li>
          )}
          {presets.map((preset) => {
            const loaded = preset.preset_id === presetId;
            return (
              <li
                key={preset.preset_id}
                className={`gm-cut flex items-center gap-2 bg-ink-950 px-2.5 py-2 [--cut:8px] ${loaded ? "shadow-[inset_3px_0_0_var(--color-brand-400)]" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-ink-100">
                    {preset.name}
                    {preset.is_default && (
                      <Star aria-label="Loads first for this mode" className="h-3.5 w-3.5 shrink-0 fill-current text-brand-400" strokeWidth={1.75} />
                    )}
                    {preset.official && (
                      <BadgeCheck aria-label="GameMaster's preset" className="h-3.5 w-3.5 shrink-0 text-brand-400" strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-400">
                    {loaded ? "Loaded: " : ""}
                    {presetSummary(preset.data)
                      .map((fact) => fact.text)
                      .join(", ")}
                  </span>
                </span>
                {loaded ? (
                  <>
                    {presetId && (
                      <Link href={`/presets/edit?id=${presetId}`} className="gm-btn gm-btn-quiet h-7 px-2 text-xs [--cut:6px]">
                        View
                      </Link>
                    )}
                    <button type="button" onClick={onClear} className="gm-btn gm-btn-quiet h-7 px-2.5 text-xs [--cut:6px]" title={CLEAR_TITLE}>
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onApply(preset)}
                    className="gm-btn gm-btn-secondary h-7 shrink-0 px-2.5 text-xs [--cut:6px]"
                    title="Replaces this form's nation locks, access, nation groups, rules and mods"
                  >
                    Load
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

const CLEAR_TITLE = "Go back to the whole map and the usual rules and mods (locks and access stay as they are)";

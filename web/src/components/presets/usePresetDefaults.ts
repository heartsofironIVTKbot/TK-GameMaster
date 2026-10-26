"use client";

import { useEffect, useState } from "react";
import type { PresetDefaults } from "@/lib/presetTypes";

/** Every mode's standard groups, nations, rules and mods (GET /api/presets/defaults). */
export function usePresetDefaults(): { defaults: PresetDefaults | null; error: string | null } {
  const [state, setState] = useState<{ defaults: PresetDefaults | null; error: string | null }>({
    defaults: null,
    error: null,
  });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/presets/defaults", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (PresetDefaults & { error?: string }) | null;
        if (cancelled) return;
        if (!response.ok || !body?.modes) setState({ defaults: null, error: body?.error ?? "Couldn't load the mode lists." });
        else setState({ defaults: body, error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ defaults: null, error: "Network error — reload to try again." });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

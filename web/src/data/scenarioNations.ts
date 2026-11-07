/**
 * Per-scenario nation data, loaded on demand.
 *
 * Each ``scenarios/*.json`` file (scraped by ``scripts/hoi4_scraper.py``) is
 * its own chunk, fetched only when a page asks for that scenario. Together
 * they are about 17 MB, so bundling them all into one page made phones slow
 * and could crash the tab. The light metadata (labels, map URLs, tag
 * aliases) stays in ``scenarioData.ts``, which has no JSON imports.
 *
 * Use ``useScenarioNations(id)`` in components: it starts the load and
 * re-renders once the data is in. ``getCountryData`` is synchronous and
 * serves the deterministic placeholder until then.
 */

import { useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_SCENARIO,
  SCENARIOS,
  buildFallback,
  type CountryScenarioData,
  type IdeologyInfo,
  type ScenarioId,
} from "./scenarioData";

export interface ScenarioNations {
  /** Scraped nations keyed by the scenario's own country tag. */
  nations: Record<string, CountryScenarioData>;
  /** Ruling-party registry (scraped ``common/ideologies``): names + colours
      for the ideology wheel. Absent on legacy datasets: the drawer falls
      back to the four vanilla families. */
  ideologies?: Record<string, IdeologyInfo>;
}

type JsonModule = { default: unknown };

// One literal import per file, so the bundler makes one chunk per scenario.
const LOADERS: Record<ScenarioId, () => Promise<JsonModule>> = {
  vanilla_1936: () => import("./scenarios/vanilla_1936.json"),
  road_to_56: () => import("./scenarios/road_to_56.json"),
  kaiserreich: () => import("./scenarios/kaiserreich.json"),
  modern_md: () => import("./scenarios/modern_md.json"),
  modern_nv: () => import("./scenarios/modern_nv.json"),
  modern_tfr: () => import("./scenarios/modern_tfr.json"),
  tfb: () => import("./scenarios/tfb.json"),
  oak: () => import("./scenarios/oak.json"),
  horst: () => import("./scenarios/horst.json"),
  bffu: () => import("./scenarios/bffu.json"),
};

const loaded = new Map<ScenarioId, ScenarioNations>();
const pending = new Map<ScenarioId, Promise<ScenarioNations>>();
const listeners = new Set<() => void>();

/** The scraper writes ``{ nations, ideologies }``; older datasets are flat tag maps. */
function normalise(raw: unknown): ScenarioNations {
  const data = raw as { nations?: Record<string, CountryScenarioData>; ideologies?: Record<string, IdeologyInfo> };
  if (data && typeof data === "object" && data.nations && typeof data.nations === "object") {
    return { nations: data.nations, ideologies: data.ideologies };
  }
  return { nations: (raw ?? {}) as Record<string, CountryScenarioData> };
}

/** Load (once) and cache a scenario's nations. A failed load can be retried. */
export function loadScenarioNations(id: ScenarioId): Promise<ScenarioNations> {
  const ready = loaded.get(id);
  if (ready) return Promise.resolve(ready);
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;
  const loader = LOADERS[id];
  if (!loader) return Promise.resolve({ nations: {} });
  const promise = loader()
    .then((module) => {
      const data = normalise(module.default);
      loaded.set(id, data);
      pending.delete(id);
      for (const listener of listeners) listener();
      return data;
    })
    .catch((error: unknown) => {
      pending.delete(id);
      throw error;
    });
  pending.set(id, promise);
  return promise;
}

/** The cached nations for a scenario, or null when not loaded yet. */
export function peekScenarioNations(id: ScenarioId | null | undefined): ScenarioNations | null {
  return id ? loaded.get(id) ?? null : null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A scenario's nations: null until loaded (and for a null id). */
export function useScenarioNations(id: ScenarioId | null | undefined): ScenarioNations | null {
  const data = useSyncExternalStore(
    subscribe,
    () => peekScenarioNations(id),
    () => null,
  );
  useEffect(() => {
    if (!id) return;
    loadScenarioNations(id).catch((error: unknown) => {
      console.warn(`Could not load the ${id} nation data`, error);
    });
  }, [id]);
  return data;
}

/** Resolve the scenario data for a tag: scraped entry first, then defaults.
 *
 * ``tag`` is the MAP feature tag (always the canonical map's). Scenarios
 * whose country tags differ (the modern variants) remap it through
 * ``tagAliases`` before the lookup, so clicking mainland China shows PRC
 * data instead of NV/TFR's Taiwan (CHI) entry. Until the scenario's data has
 * loaded (see ``useScenarioNations``) this returns the placeholder.
 *
 * Pass the hook's result as ``data`` inside a memo so the memo depends on
 * it; without it the module cache is read.
 */
export function getCountryData(
  tag: string,
  name?: string,
  scenario: ScenarioId = DEFAULT_SCENARIO,
  data?: ScenarioNations | null,
): CountryScenarioData {
  const definition = SCENARIOS[scenario];
  if (!definition) return buildFallback(tag, (name ?? tag).trim() || tag);
  const key = definition.tagAliases?.[tag] ?? tag;
  const scraped = (data ?? loaded.get(scenario))?.nations[key];
  if (scraped) return scraped;
  return buildFallback(tag, (name ?? key).trim() || tag);
}

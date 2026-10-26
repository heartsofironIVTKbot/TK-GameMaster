/**
 * HOI4 scenario data: country metadata for the map dashboard.
 *
 * Nation entries are scraped from the real game files by
 * ``scripts/hoi4_scraper.py`` and bundled here as ``scenarios/*.json``
 * (keyed by 3-letter country tag). The Road to 56 set is scraped with
 * ``--mod-path <Rt56 mod dir>``; its images live under ``/assets_rt56`` and
 * its map under ``/maps/road_to_56.geojson``. Kaiserreich, the three
 * modern-day variants (Millennium Dawn / Novum Vexillum / The Fire Rises)
 * and the historical quartet (Their Finest Bruh / Hearts of Oak 2 /
 * Horstorical / BFFU) follow the same pattern. The modern variants share
 * ONE canonical map (``/maps/modern.geojson``, Millennium Dawn's) and
 * differ only in drawer data; ``tagAliases`` per scenario bridges their tag
 * differences. The historical mods each ship their own map, including grey
 * "Void" features for deliberately ownerless states (never regenerate any
 * of the JSONs by hand).
 * Any tag missing from the selected scraped set is served by
 * ``getCountryData`` through a deterministic fallback, so the country
 * inspector always has something to render without crashing.
 */

import scrapedVanilla1936 from "./scenarios/vanilla_1936.json";
import scrapedRoadTo56 from "./scenarios/road_to_56.json";
import scrapedKaiserreich from "./scenarios/kaiserreich.json";
import scrapedModernMD from "./scenarios/modern_md.json";
import scrapedModernNV from "./scenarios/modern_nv.json";
import scrapedModernTFR from "./scenarios/modern_tfr.json";
import scrapedTFB from "./scenarios/tfb.json";
import scrapedOAK from "./scenarios/oak.json";
import scrapedHORST from "./scenarios/horst.json";
import scrapedBFFU from "./scenarios/bffu.json";
import { modeOption } from "@/lib/scheduleOptions";

/** Party share map keyed by the game's own party keys — the four vanilla
 * families (democratic/fascism/communism/nonAligned) or a total-conversion
 * mod's own parties (Kaiserreich's syndicalist, social_conservative, ...). */
export type IdeologyBreakdown = Record<string, number>;

export interface IdeologyInfo {
  /** Display name, e.g. "Social Conservative". */
  name: string;
  /** Party colour (hex) from ``common/ideologies``. */
  color: string;
  /** The four-family bucket this party belongs to. */
  family: "democratic" | "fascism" | "communism" | "nonAligned";
}

export interface NationalSpiritEffect {
  /** Raw HOI4 modifier key (e.g. "stability_factor"). */
  key: string;
  /** Localised display name from MODIFIER_<key> (may be the raw key). */
  label: string;
  /** Numeric value or an unresolved variable reference string. */
  value: number | string;
  /** Display scale: true = fraction shown as *100%, "direct" = the raw
      value already is the percentage (e.g. *_intel_to_others = -25 for
      -25%), false/undefined = plain value. */
  percent?: boolean | "direct";
  /** Colour semantics from the game's tooltip: "good" = positive is green,
      "bad" = positive is a malus (red), "neutral" = shown without colour. */
  kind?: "good" | "bad" | "neutral";
  /** Game ``Y=`` tooltip flag: a positive value shows in yellow WITHOUT a
      plus sign; a negative value uses the engine's own good/bad table
      (e.g. consumer goods -10% is green, recruitable population -0.3% is
      red). */
  yellow?: boolean;
  /** Decimal places shown in-game (undefined/null = derive from percent). */
  decimals?: number | null;
}

export interface NationalSpiritTrait {
  id: string;
  name: string;
  effects: NationalSpiritEffect[];
}

export interface NationalSpirit {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  /** Modifier effects shown in the tooltip ("what it gives"). */
  effects?: NationalSpiritEffect[];
  /** Country-leader traits granted by the spirit (e.g. Popular Figurehead). */
  traits?: NationalSpiritTrait[];
}

export interface IndustrialCapacity {
  civilianFactories: number;
  militaryFactories: number;
  navalDockyards: number;
}

export interface Resources {
  oil: number;
  aluminum: number;
  rubber: number;
  tungsten: number;
  steel: number;
  chromium: number;
  coal: number;
}

export interface ArmedForces {
  /** Fielded divisions. */
  divisions: number;
  /** Fielded manpower, in individual men (not thousands). */
  fieldManpower: number;
  totalWarships: number;
  totalAircraft: number;
}

export interface CountryScenarioData {
  name: string;
  tag: string;
  flagUrl: string;
  leader: {
    name: string;
    portraitUrl: string;
  };
  ideology: {
    /** Ruling ideology display name (e.g. "Fascism", "Social Conservative"). */
    name: string;
    /** Ruling party share of parliament, 0-100. */
    rulingPartyShare: number;
    breakdown: IdeologyBreakdown;
  };
  /** National stability, 0-100 (%). */
  stability: number;
  /** War support, 0-100 (%). */
  warSupport: number;
  nationalSpirits: NationalSpirit[];
  industry: IndustrialCapacity;
  resources: Resources;
  armedForces: ArmedForces;
}

export const VANILLA_1936_LABEL = "Vanilla";
export const ROAD_TO_56_LABEL = "Road to 56";
export const KAISERREICH_LABEL = "Kaiserreich";
export const MODERN_MD_LABEL = "Millennium Dawn";
export const MODERN_NV_LABEL = "Novum Vexillum";
export const MODERN_TFR_LABEL = "The Fire Rises";
export const TFB_LABEL = "Their Finest Bruh";
export const OAK_LABEL = "Hearts of Oak 2";
export const HORST_LABEL = "Horstorical MP";
export const BFFU_LABEL = "BFFU 2";
/** One canonical modern map shared by the three modern-day scenarios. */
export const MODERN_GROUP_LABEL = "Modern Day";
/** Group of vanilla-based historical multiplayer mods (each own map). */
export const HISTORICAL_GROUP_LABEL = "Historical";

/** Scenario identifiers. Keep in sync with the SCENARIOS registry below. */
export type ScenarioId =
  | "vanilla_1936"
  | "road_to_56"
  | "kaiserreich"
  | "modern_md"
  | "modern_nv"
  | "modern_tfr"
  | "tfb"
  | "oak"
  | "horst"
  | "bffu";

/** Scenario grouping: variants of one group share a TopBar sub-toggle. */
export type ScenarioGroup = "classic" | "modern" | "historical";

/**
 * Scenarios selectable on the dashboard. Each entry bundles the scraped
 * country metadata, the generated nation map (``scripts/svg_to_geojson.py``)
 * and a display label. Both datasets come from ``scripts/hoi4_scraper.py`` —
 * The Road to 56 set is scraped with ``--mod-path <rt56 dir>`` and its assets
 * live under ``/assets_rt56`` (never regenerate either JSON by hand).
 */

/**
 * Map-tag remaps for the modern variants (see ``ScenarioDefinition.tagAliases``).
 *
 * The canonical modern map is Millennium Dawn's. Novum Vexillum renames many
 * tags for the same real-world territory (INS for Indonesia, NGA for Nigeria,
 * PRC for mainland China while its CHI is Taiwan/ROC), so clicking those
 * nations must resolve to the NV entry. The Fire Rises shares most of those
 * renames but diverges elsewhere (alternate-history factions), so only the
 * confident same-territory mappings are listed; unmapped tags render the
 * deterministic fallback card instead of wrong country data.
 */
const NV_TAG_ALIASES: Record<string, string> = {
  // China split: map CHI = mainland, map TAI = Taiwan/ROC.
  CHI: "PRC",
  TAI: "CHI",
  // NV reuses several MD tags for DIFFERENT territories — these redirect the
  // map tag to NV's tag for the same real-world territory.
  AFG: "TAL", // Afghanistan (NV's AFG is the Northern Alliance faction)
  BAR: "BRB", // Barbados (NV's BAR is Bahrain)
  CAM: "CMR", // Cameroon (NV's CAM is Cambodia)
  MAL: "MLI", // Mali (NV's MAL is Malaysia)
  MAU: "MRT", // Mauritania (NV's MAU is Mauritius)
  MRT: "MAU", // Mauritius (swap with above)
  MAC: "MCU", // Macau (NV's MAC is Macedonia)
  SHA: "WES", // Sahrawi (NV's SHA is Shanghai)
  SMA: "SAN", // San Marino (NV's SMA is Samogitia)
  JUB: "JVA", // Allied Somali Forces (NV's JUB is Jubaland)
  // Same territory, different tag spelling.
  IND: "INS", // Indonesia
  NIG: "NGA", // Nigeria
  NRY: "NOR", // Norway
  MAY: "MAL", // Malaysia
  TNZ: "TZN", // Tanzania
  MOZ: "MZB", // Mozambique
  TRK: "TMS", // Turkmenistan
  AZE: "AZR", // Azerbaijan
  FAO: "FAI", // Faroe Islands
  SWA: "SWZ", // Swaziland
  STK: "SKN", // Saint Kitts and Nevis
  TUL: "TUV", // Tuvalu
  GRA: "GND", // Grenada
  ANT: "BAS", // Antigua and Barbuda
  BFA: "VOL", // Burkina Faso
  CDI: "IVO", // Côte d'Ivoire
  VIE: "VIN", // Vietnam
  CNG: "RCG", // Republic of the Congo
  DRC: "COG", // DR Congo
  NKO: "PRK", // North Korea
  AGL: "ANG", // Angola
  ADO: "AND", // Andorra
  BEN: "DAH", // Benin
  BHR: "BAR", // Bahrain
  BUR: "BRD", // Burundi
  CBD: "CAM", // Cambodia
  DMI: "DMN", // Dominica
  EGU: "EQG", // Equatorial Guinea
  FYR: "MAC", // North Macedonia
  GAH: "GHA", // Ghana
  GUB: "GNB", // Guinea-Bissau
  GUI: "GNA", // Guinea
  GUY: "GYA", // Guyana
  HKG: "HKN", // Hong Kong
  KAR: "KRN", // Karen State
  MIC: "FSM", // Micronesia
  MLV: "MOL", // Moldova
  MNC: "MOC", // Monaco
  NAM: "NMB", // Namibia
  NKR: "NGK", // Artsakh
  NPM: "NEP", // Nepal (map tag is the Maoist faction; NV has unified Nepal)
  PAP: "PNG", // Papua New Guinea
  PAU: "PLU", // Palau
  SIN: "SIG", // Singapore
  SRI: "SRL", // Sri Lanka
  VER: "CAB", // Cabo Verde
  WAA: "WAS", // Wa State
};

const TFR_TAG_ALIASES: Record<string, string> = {
  // China split: map CHI = mainland, map TAI = Taiwan/ROC.
  CHI: "PRC",
  TAI: "CHI",
  // TFR repurposes many MD tags (alternate-history factions): redirect the
  // map tag to TFR's tag for the same territory where one exists.
  ABK: "KKP", // Abkhazia (TFR's ABK is the Sadrist Movement)
  CAM: "CMR", // Cameroon (TFR's CAM is Cambodia)
  MAL: "MLI", // Mali (TFR's MAL is Malaysia)
  MAU: "MRT", // Mauritania (TFR's MAU is Mauritius)
  MRT: "MAU", // Mauritius (swap with above)
  SHA: "WES", // Sahrawi (TFR's SHA is the Chinese Red Army)
  VER: "CAB", // Cabo Verde (TFR's VER is a US military command)
  GRA: "GND", // Grenada (TFR's GRA is Georgia)
  KAR: "KNU", // Karen State (TFR's KAR is Galicia)
  IND: "INS", // Indonesia
  NIG: "NGA", // Nigeria
  NRY: "NOR", // Norway
  MAY: "MAL", // Malaysia
  AZE: "AZR", // Azerbaijan
  TRK: "TMS", // Turkmenistan
  MOZ: "MZB", // Mozambique
  NAM: "NMB", // Namibia
  MLV: "MOL", // Moldova
  BFA: "VOL", // Burkina Faso
  BEN: "DAH", // Benin
  BUR: "BRD", // Burundi
  CBD: "CAM", // Cambodia
  EGU: "EQG", // Equatorial Guinea
  GUB: "GNB", // Guinea-Bissau
  GUI: "GNA", // Guinea
  GUY: "GYA", // Guyana
  NKR: "NGK", // Artsakh
  MIC: "FSM", // Micronesia
  TNZ: "TZN", // Tanzania
  VIE: "VIN", // Vietnam
  SRI: "SRL", // Sri Lanka
  HKG: "HKN", // Hong Kong
  FYR: "MAC", // North Macedonia
  SIN: "SIG", // Singapore
  PAP: "PNG", // Papua New Guinea
  WAA: "WAT", // Wa State
  NKO: "PRK", // North Korea
  NPM: "NEP", // Nepal
  CNG: "RCG", // Republic of the Congo
  DRC: "COG", // DR Congo
  GAH: "GHA", // Ghana
};
export interface ScenarioDefinition {
  id: ScenarioId;
  label: string;
  mapUrl: string;
  nations: Record<string, CountryScenarioData>;
  /** Ruling-party registry (scraped ``common/ideologies``): names + colours
      for the ideology wheel. Absent on legacy datasets — the drawer falls
      back to the four vanilla families. */
  ideologies?: Record<string, IdeologyInfo>;
  /** Display group: variants of one group appear as a single TopBar entry
      with a small sub-toggle (modern: MD/NV/TFR share one map; historical:
      TFB/OAK/HORST/BFFU each ship their own map). */
  group?: ScenarioGroup;
  /** Map-tag remap for scenarios whose country tags differ from the shared
      map's tags. Keyed by MAP tag -> scenario nation key (e.g. NV's PRC is
      mainland China, which the canonical map tags CHI, so ``CHI: "PRC"``). */
  tagAliases?: Record<string, string>;
}

export const SCENARIOS: Record<ScenarioId, ScenarioDefinition> = {
  vanilla_1936: {
    id: "vanilla_1936",
    label: VANILLA_1936_LABEL,
    mapUrl: "/maps/vanilla.geojson",
    nations: scrapedVanilla1936 as unknown as Record<string, CountryScenarioData>,
  },
  road_to_56: {
    id: "road_to_56",
    label: ROAD_TO_56_LABEL,
    mapUrl: "/maps/road_to_56.geojson",
    nations: scrapedRoadTo56 as unknown as Record<string, CountryScenarioData>,
  },
  kaiserreich: {
    id: "kaiserreich",
    label: KAISERREICH_LABEL,
    mapUrl: "/maps/kaiserreich.geojson",
    // The scraper writes ``{ nations, ideologies }``; older datasets are
    // flat tag maps (no registry — the drawer falls back to the vanilla
    // families).
    nations: (
      (scrapedKaiserreich as { nations?: Record<string, CountryScenarioData> })
        .nations ?? scrapedKaiserreich
    ) as unknown as Record<string, CountryScenarioData>,
    ideologies: (scrapedKaiserreich as { ideologies?: Record<string, IdeologyInfo> })
      .ideologies,
  },
  // The three modern-day scenarios share ONE canonical map (Millennium
  // Dawn's — the 2-of-3 consensus winner and the only one whose world
  // dimensions match the classic maps, so the camera math is identical).
  // Only the drawer data (names/leaders/spirits/resources/ideologies)
  // differs per variant; ``tagAliases`` bridges tags that differ from the
  // canonical map (e.g. mainland China is CHI on the map but PRC in NV/TFR).
  modern_md: {
    id: "modern_md",
    label: MODERN_MD_LABEL,
    group: "modern",
    mapUrl: "/maps/modern.geojson",
    nations: (
      (scrapedModernMD as { nations?: Record<string, CountryScenarioData> })
        .nations ?? scrapedModernMD
    ) as unknown as Record<string, CountryScenarioData>,
    ideologies: (scrapedModernMD as { ideologies?: Record<string, IdeologyInfo> })
      .ideologies,
  },
  modern_nv: {
    id: "modern_nv",
    label: MODERN_NV_LABEL,
    group: "modern",
    mapUrl: "/maps/modern.geojson",
    nations: (
      (scrapedModernNV as { nations?: Record<string, CountryScenarioData> })
        .nations ?? scrapedModernNV
    ) as unknown as Record<string, CountryScenarioData>,
    ideologies: (scrapedModernNV as { ideologies?: Record<string, IdeologyInfo> })
      .ideologies,
    tagAliases: NV_TAG_ALIASES,
  },
  modern_tfr: {
    id: "modern_tfr",
    label: MODERN_TFR_LABEL,
    group: "modern",
    mapUrl: "/maps/modern.geojson",
    nations: (
      (scrapedModernTFR as { nations?: Record<string, CountryScenarioData> })
        .nations ?? scrapedModernTFR
    ) as unknown as Record<string, CountryScenarioData>,
    ideologies: (scrapedModernTFR as { ideologies?: Record<string, IdeologyInfo> })
      .ideologies,
    tagAliases: TFR_TAG_ALIASES,
  },
  // The historical group: four vanilla-based multiplayer mods, each with its
  // own map (their state sets differ: TFB/BFFU ~1090 states, OAK 847,
  // HORST 700) and its own void areas (OAK voids 39 states, HORST 1).
  tfb: {
    id: "tfb",
    label: TFB_LABEL,
    group: "historical",
    mapUrl: "/maps/tfb.geojson",
    nations: (
      (scrapedTFB as { nations?: Record<string, CountryScenarioData> })
        .nations ?? scrapedTFB
    ) as unknown as Record<string, CountryScenarioData>,
    ideologies: (scrapedTFB as { ideologies?: Record<string, IdeologyInfo> })
      .ideologies,
  },
  oak: {
    id: "oak",
    label: OAK_LABEL,
    group: "historical",
    mapUrl: "/maps/oak.geojson",
    nations: (
      (scrapedOAK as { nations?: Record<string, CountryScenarioData> })
        .nations ?? scrapedOAK
    ) as unknown as Record<string, CountryScenarioData>,
    ideologies: (scrapedOAK as { ideologies?: Record<string, IdeologyInfo> })
      .ideologies,
  },
  horst: {
    id: "horst",
    label: HORST_LABEL,
    group: "historical",
    mapUrl: "/maps/horst.geojson",
    nations: (
      (scrapedHORST as { nations?: Record<string, CountryScenarioData> })
        .nations ?? scrapedHORST
    ) as unknown as Record<string, CountryScenarioData>,
    ideologies: (scrapedHORST as { ideologies?: Record<string, IdeologyInfo> })
      .ideologies,
  },
  bffu: {
    id: "bffu",
    label: BFFU_LABEL,
    group: "historical",
    mapUrl: "/maps/bffu.geojson",
    nations: (
      (scrapedBFFU as { nations?: Record<string, CountryScenarioData> })
        .nations ?? scrapedBFFU
    ) as unknown as Record<string, CountryScenarioData>,
    ideologies: (scrapedBFFU as { ideologies?: Record<string, IdeologyInfo> })
      .ideologies,
  },
};

export const DEFAULT_SCENARIO: ScenarioId = "vanilla_1936";

export const SCENARIO_OPTIONS = (
  Object.keys(SCENARIOS) as ScenarioId[]
).map((id) => ({ id, label: SCENARIOS[id].label }));

/** Options for the TopBar's main scenario select: the classic scenarios plus
 * one entry per variant group ("Modern Day", "Historical") that fans out
 * into the variant sub-toggle. */
export const SCENARIO_SELECT_OPTIONS = [
  ...SCENARIO_OPTIONS.filter((option) => SCENARIOS[option.id].group === undefined),
  { id: "modern" as const, label: MODERN_GROUP_LABEL },
  { id: "historical" as const, label: HISTORICAL_GROUP_LABEL },
];

/** Sub-toggle variants shown when the active scenario is in a group. */
export function groupVariantOptions(group: ScenarioGroup) {
  return SCENARIO_OPTIONS.filter(
    (option) => SCENARIOS[option.id].group === group,
  );
}

/** The default variant selected when the user picks a group entry. */
export const GROUP_DEFAULTS: Record<Exclude<ScenarioGroup, "classic">, ScenarioId> = {
  modern: "modern_md",
  historical: "tfb",
};

/** The active scenario's group (undefined for the classic scenarios). */
export function scenarioGroupOf(id: ScenarioId): ScenarioGroup | undefined {
  return SCENARIOS[id]?.group;
}

/**
 * Lobby ``mode`` strings (bot-side MODE_CONFIG names) per scenario id.
 * The bot's "Roleplay" mode is the Road to 56 mode — its MODE_CONFIG links
 * the Road to 56 Workshop mod — and everything else that resolves to the
 * Roleplay family falls back to it too.
 */
const MODE_ALIASES: Record<ScenarioId, string[]> = {
  vanilla_1936: ["vanilla", "historical"],
  road_to_56: ["road to 56", "r56", "roleplay"],
  kaiserreich: ["kaiserreich", "kr"],
  modern_md: ["millennium dawn"],
  modern_nv: ["novum vexillum"],
  modern_tfr: ["the fire rises", "fire rises"],
  tfb: ["their finest bruh", "tfb"],
  oak: ["heart of oak", "hearts of oak", "oak"],
  horst: ["horstorical", "horst"],
  bffu: ["bffu"],
};

/** Aliases every mode of a family contains — matched only after the mod names. */
const GENERIC_MODE_ALIASES = new Set(["roleplay", "historical"]);

/**
 * Resolve a lobby ``mode`` string to a scenario id.
 *
 * The bot's own mode names come first (the calendar's mode list says which
 * map each one uses). Other strings: explicit mod names win (Road to 56 /
 * R56, Kaiserreich / KR, the modern-day trio, the historical quartet
 * TFB/OAK/HORST/BFFU), then any Roleplay-family mode maps to Road to 56 (the
 * bot's Roleplay mode IS the Rt56 mode) and Historical modes to Vanilla.
 */
export function scenarioIdFromMode(mode: string | null | undefined): ScenarioId | null {
  if (!mode) return null;
  const exact = modeOption(mode.trim())?.scenarioId;
  if (exact) return exact;
  const folded = mode.trim().toLowerCase();
  for (const generic of [false, true]) {
    for (const id of Object.keys(MODE_ALIASES) as ScenarioId[]) {
      const aliases = MODE_ALIASES[id].filter((alias) => GENERIC_MODE_ALIASES.has(alias) === generic);
      if (aliases.some((alias) => folded.includes(alias))) return id;
    }
  }
  return null;
}

// --- Small, dependency-free image helpers ---------------------------------

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Deterministic hue for a tag/name, used to tint fallback placeholders. */
function seedHue(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return hash;
}

function seedColor(seed: string): string {
  return `hsl(${seedHue(seed)}, 42%, 30%)`;
}

/** Generic flag badge (coloured band + tag text) used when no flag exists. */
export function placeholderFlag(tag: string): string {
  const color = seedColor(tag);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="96" viewBox="0 0 160 96">` +
    `<rect width="160" height="96" fill="${color}"/>` +
    `<rect width="160" height="24" fill="rgba(0,0,0,0.28)"/>` +
    `<rect y="72" width="160" height="24" fill="rgba(0,0,0,0.28)"/>` +
    `<text x="80" y="57" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">${tag}</text>` +
    `</svg>`;
  return svgDataUri(svg);
}

function placeholderPortrait(name: string, seed: string): string {
  const color = seedColor(seed);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0))
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" fill="${color}"/>` +
    `<text x="48" y="60" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#f8fafc" text-anchor="middle">${initials}</text>` +
    `</svg>`;
  return svgDataUri(svg);
}

// --- Scraped dataset -------------------------------------------------------

// Scenario data lives in the SCENARIOS registry above; getCountryData looks
// nations up per selected scenario.

// --- Fallback generator for unlisted tags ----------------------------------

function buildFallback(tag: string, name: string): CountryScenarioData {
  return {
    name,
    tag,
    flagUrl: placeholderFlag(tag),
    leader: {
      name: "Unknown Leader",
      portraitUrl: placeholderPortrait(name, tag),
    },
    ideology: {
      name: "Non-Aligned",
      rulingPartyShare: 100,
      breakdown: { democratic: 0, fascism: 0, communism: 0, nonAligned: 100 },
    },
    stability: 50,
    warSupport: 30,
    nationalSpirits: [],
    industry: { civilianFactories: 2, militaryFactories: 1, navalDockyards: 0 },
    resources: { oil: 0, aluminum: 0, rubber: 0, tungsten: 0, steel: 1, chromium: 0, coal: 0 },
    armedForces: { divisions: 5, fieldManpower: 60_000, totalWarships: 0, totalAircraft: 10 },
  };
}

/** Resolve the scenario data for a tag: scraped entry first, then defaults.
 *
 * ``tag`` is the MAP feature tag (always the canonical map's). Scenarios
 * whose country tags differ (the modern variants) remap it through
 * ``tagAliases`` before the lookup, so clicking mainland China shows PRC
 * data instead of NV/TFR's Taiwan (CHI) entry.
 */
export function getCountryData(
  tag: string,
  name?: string,
  scenario: ScenarioId = DEFAULT_SCENARIO,
): CountryScenarioData {
  const definition = SCENARIOS[scenario];
  if (!definition) return buildFallback(tag, (name ?? tag).trim() || tag);
  const key = definition.tagAliases?.[tag] ?? tag;
  const scraped = definition.nations[key];
  if (scraped) return scraped;
  return buildFallback(tag, (name ?? key).trim() || tag);
}

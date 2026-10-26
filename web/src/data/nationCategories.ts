/**
 * Nation grouping for the Reservation Board drawer.
 *
 * The historical mods (Their Finest Bruh, Hearts of Oak, Horstorical, BFFU)
 * group by FACTION (ported from the bot's ``NATION_CATEGORIES`` table in
 * bot.py.py — Axis / Allies / Comintern / GEACPS). Everything else —
 * Vanilla, Road to 56, Kaiserreich and the modern trio — groups
 * GEOGRAPHICALLY: majors on top, then Europe, Middle East (modern-day maps
 * only), Asia, Oceania, North America, South America and Africa. The region
 * of each nation is computed from its map geometry (see ``regionForPoint``),
 * so no per-nation table is needed for the ~230-nation modern maps.
 */

import type { ScenarioId } from "@/data/scenarioData";
import type { RegionId } from "@/lib/types";
import tagToSlotJson from "@/lib/tag_to_slot.json";

const tagToSlot = tagToSlotJson as Record<string, string>;

export interface FactionTier {
  label: "Majors" | "Important Minors" | "Minors";
  names: string[];
}

export interface FactionGroup {
  name: string;
  tiers: FactionTier[];
}

/** The bot's faction rosters (bot.py.py NATION_CATEGORIES), keyed by
 * scenario. Only the HISTORICAL mods group by faction — Vanilla, Road to 56,
 * Kaiserreich and the modern trio group geographically. Nation names are
 * the bot's reservation slot names. */
export const FACTION_CATEGORIES: Partial<Record<ScenarioId, FactionGroup[]>> = {
  tfb: [
    {
      name: "Allies",
      tiers: [
        { label: "Majors", names: ["United Kingdom", "USA"] },
        { label: "Important Minors", names: ["France", "British Raj"] },
        {
          label: "Minors",
          names: [
            "Canada", "South Africa", "Australia", "New Zealand", "Brazil",
            "Mexico", "Netherlands",
          ],
        },
      ],
    },
    {
      name: "Comintern",
      tiers: [
        { label: "Majors", names: ["Soviet Union"] },
        { label: "Minors", names: ["Mongolia"] },
      ],
    },
    {
      name: "Axis",
      tiers: [
        { label: "Majors", names: ["Germany", "Italy"] },
        { label: "Important Minors", names: ["Bulgaria", "Spain"] },
        {
          label: "Minors",
          names: [
            "Romania", "Finland", "Hungary", "Vichy France", "Yugoslavia",
          ],
        },
      ],
    },
    {
      name: "GEACPS",
      tiers: [
        { label: "Majors", names: ["Japan"] },
        { label: "Important Minors", names: ["Manchukuo"] },
        { label: "Minors", names: ["Siam"] },
      ],
    },
  ],
  oak: [
    {
      name: "Allies",
      tiers: [
        { label: "Majors", names: ["United Kingdom", "USA", "Soviet Union"] },
        { label: "Important Minors", names: ["France", "British Raj", "China"] },
        {
          label: "Minors",
          names: [
            "Canada", "South Africa", "Australia", "New Zealand", "Poland",
            "Rep Spain",
          ],
        },
      ],
    },
    {
      name: "Axis",
      tiers: [
        { label: "Majors", names: ["Germany", "Italy", "Japan"] },
        { label: "Important Minors", names: ["Spain", "Romania", "Manchuria"] },
        {
          label: "Minors",
          names: ["Hungary", "Bulgaria", "Vichy France", "Slovakia"],
        },
      ],
    },
  ],
  horst: [
    {
      name: "Allies",
      tiers: [
        { label: "Majors", names: ["USA", "United Kingdom"] },
        {
          label: "Important Minors",
          names: [
            "France", "Canada", "South Africa", "British Raj", "Brazil",
            "Australia", "Netherlands",
          ],
        },
        { label: "Minors", names: ["Norway", "Poland"] },
      ],
    },
    {
      name: "Comintern",
      tiers: [
        { label: "Majors", names: ["Soviet Union"] },
        { label: "Minors", names: ["Mongolia"] },
      ],
    },
    {
      name: "Axis",
      tiers: [
        { label: "Majors", names: ["Germany", "Italy"] },
        {
          label: "Important Minors",
          names: ["Croatia", "Hungary", "Romania", "Bulgaria", "Spain"],
        },
        { label: "Minors", names: ["Finland", "Slovakia", "Vichy France"] },
      ],
    },
    {
      name: "GEACPS",
      tiers: [{ label: "Majors", names: ["Japan"] }],
    },
    {
      name: "United Front",
      tiers: [{ label: "Majors", names: ["China"] }],
    },
  ],
  // BFFU mirrors Their Finest Bruh's roster (same country files).
  bffu: [
    {
      name: "Allies",
      tiers: [
        { label: "Majors", names: ["United Kingdom", "USA"] },
        { label: "Important Minors", names: ["France", "British Raj"] },
        {
          label: "Minors",
          names: [
            "Canada", "South Africa", "Australia", "New Zealand", "Brazil",
            "Mexico", "Netherlands",
          ],
        },
      ],
    },
    {
      name: "Comintern",
      tiers: [
        { label: "Majors", names: ["Soviet Union"] },
        { label: "Minors", names: ["Mongolia"] },
      ],
    },
    {
      name: "Axis",
      tiers: [
        { label: "Majors", names: ["Germany", "Italy"] },
        { label: "Important Minors", names: ["Bulgaria", "Spain"] },
        {
          label: "Minors",
          names: [
            "Romania", "Finland", "Hungary", "Vichy France", "Yugoslavia",
          ],
        },
      ],
    },
    {
      name: "GEACPS",
      tiers: [
        { label: "Majors", names: ["Japan"] },
        { label: "Important Minors", names: ["Manchukuo"] },
        { label: "Minors", names: ["Siam"] },
      ],
    },
  ],
};

/** Historical roster display order (the user's convention: Axis first). */
export const FACTION_ORDER = ["Axis", "Allies", "Comintern", "GEACPS"];

// --- Name matching ---------------------------------------------------------

/** Loose canonical form of a country name for roster matching. */
export function canonicalName(name: string): string {
  const ascii = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const bare = ascii.replace(/[^a-z0-9]/g, "");
  return NAME_ALIASES[bare] ?? bare;
}

/** Bot slot names vs in-game country display names that differ. */
const NAME_ALIASES: Record<string, string> = {
  germanreich: "germany",
  germanempire: "germany",
  japaneseempire: "japan",
  empireofjapan: "japan",
  secondbrazilianrepublic: "brazil",
  unitedstatesofbrazil: "brazil",
  brazilianempire: "brazil",
  usa: "unitedstates",
  unitedstatesofamerica: "unitedstates",
  uk: "unitedkingdom",
  greatbritain: "unitedkingdom",
  ussr: "sovietunion",
  unionofsovietsocialistrepublics: "sovietunion",
  britishraj: "raj",
  britishindia: "raj",
  saf: "southafrica",
  repspain: "spanishrepublic",
  republicanspain: "spanishrepublic",
  manchuria: "manchukuo",
  manchoukuo: "manchukuo",
  chinesesoviet: "chinesesovietrepublic",
  mongol: "mongolia",
  mongolianpeoplesrepublic: "mongolia",
  siam: "thailand",
  kingdomofitaly: "italy",
  thirdfrenchrepublic: "france",
  frenchrepublic: "france",
  kingdomofhungary: "hungary",
  tsardomofbulgaria: "bulgaria",
  kingdomofbulgaria: "bulgaria",
  kingdomofromania: "romania",
  republicoffinland: "finland",
  kingdomofyugoslavia: "yugoslavia",
  kingdomofnorway: "norway",
  secondpolishrepublic: "poland",
  holland: "netherlands",
  slovakrepublic: "slovakia",
  independentstateofcroatia: "croatia",
  nationalistspain: "spain",
  spanishstate: "spain",
  republicofchina: "china",
  nationalistchina: "china",
};

/** All canonical keys a map nation answers to: its tag's bot slot name, its
 * map slot key and its display name. */
export function nationMatchKeys(tag: string, slotKey: string, name: string): Set<string> {
  const keys = new Set<string>([
    canonicalName(slotKey || name),
    canonicalName(name),
  ]);
  const slot = tagToSlot[tag];
  if (slot) keys.add(canonicalName(slot));
  return keys;
}

// --- Geographic regions (map pixel space) ----------------------------------

export const REGION_ORDER: RegionId[] = [
  "Europe",
  "Middle East",
  "Asia",
  "Oceania",
  "North America",
  "South America",
  "Africa",
  "Other",
];

/**
 * Explicit tag -> region tables.
 *
 * The nearest-anchor heuristic could not cover every edge case (colonial
 * blobs, small Pacific nations, the game map's cropped-pole projection),
 * so every tag of every scenario map is now explicitly assigned a region.
 * The classic table serves Vanilla / Road to 56 / Kaiserreich (no Middle
 * East region — its nations fall to Asia, Egypt to Africa); the modern
 * table overrides for the modern-day trio, which does have a Middle East.
 */
const REGION_BY_TAG: Record<string, RegionId> = {
  // North America
  ANT: "North America", BAH: "North America", BAR: "North America",
  BLZ: "North America", CAN: "North America", COS: "North America",
  CUB: "North America", DOM: "North America", ELS: "North America",
  GRA: "North America", GRN: "North America", GUA: "North America",
  HAI: "North America", HON: "North America", IMP: "North America",
  JAM: "North America", MEX: "North America", NIC: "North America",
  PAN: "North America", STK: "North America", STL: "North America",
  STV: "North America", TRI: "North America", USA: "North America",
  WIF: "North America", DMI: "North America",
  // South America
  ARG: "South America", BOL: "South America", BRA: "South America",
  CHL: "South America", COL: "South America", ECU: "South America",
  FOP: "South America", GUY: "South America", PAR: "South America",
  PRU: "South America", SUR: "South America", URG: "South America",
  VEN: "South America",
  // Europe
  ADO: "Europe", ADR: "Europe", ALB: "Europe", AUS: "Europe",
  BAT: "Europe", BEL: "Europe", BLR: "Europe", BOS: "Europe",
  BUL: "Europe", CRO: "Europe", CZE: "Europe", DDR: "Europe",
  DEN: "Europe", EST: "Europe", FIN: "Europe", GAL: "Europe",
  GRE: "Europe", HLS: "Europe", HOL: "Europe", HUN: "Europe",
  ICE: "Europe", IRE: "Europe", ITA: "Europe", KOS: "Europe",
  LAT: "Europe", LIE: "Europe", LIT: "Europe", LUX: "Europe",
  MNC: "Europe", MNT: "Europe", NOR: "Europe", NRY: "Europe",
  POL: "Europe", POR: "Europe", ROM: "Europe", RUS: "Europe",
  SER: "Europe", SLO: "Europe", SMA: "Europe", SOV: "Europe",
  SPA: "Europe", SPN: "Europe", SPR: "Europe", SRD: "Europe",
  SRI: "Europe", SWE: "Europe", SWI: "Europe", UKR: "Europe",
  YUG: "Europe",
  // Majors (the roster lists them under "Majors" first) + mod-specific tags:
  // Danzig, San Marino (Road to 56), Papal States (Kaiserreich — the modern
  // map's PAP is Papua New Guinea, see MODERN_REGION_BY_TAG), Vichy France
  // (Horstorical EFR, BFFU VIC).
  ENG: "Europe", FRA: "Europe", GER: "Europe", DNZ: "Europe",
  SAN: "Europe", PAP: "Europe", EFR: "Europe", VIC: "Europe",
  // Asia (classic: no separate Middle East region)
  AFG: "Asia", ARM: "Asia", AZE: "Asia", AZR: "Asia", BAN: "Asia",
  BHU: "Asia", BRM: "Asia", BUK: "Asia", CHI: "Asia", CYP: "Asia",
  FNG: "Asia", FRI: "Asia", GDC: "Asia", GEA: "Asia", GEO: "Asia",
  GSM: "Asia", GXC: "Asia", HBC: "Asia", HKG: "Asia", HND: "Asia",
  HNN: "Asia", IRQ: "Asia", JAP: "Asia", JBS: "Asia", JOR: "Asia",
  KAZ: "Asia", KHI: "Asia", KHM: "Asia", KOR: "Asia", KUM: "Asia",
  KUW: "Asia", KYR: "Asia", LAO: "Asia", LEC: "Asia", LEP: "Asia",
  MAC: "Asia", MAN: "Asia", MEN: "Asia", MLD: "Asia", MON: "Asia",
  MPL: "Asia", NEP: "Asia", NKO: "Asia", NPM: "Asia", NXM: "Asia",
  OMA: "Asia", PAK: "Asia", PAL: "Asia", PER: "Asia", PRC: "Asia",
  QIE: "Asia", RAJ: "Asia", SAU: "Asia", SHD: "Asia", SHX: "Asia",
  SIA: "Asia", SIC: "Asia", SIK: "Asia", SND: "Asia", SZC: "Asia",
  TAI: "Asia", TAJ: "Asia", TAN: "Asia", TIB: "Asia", TRK: "Asia",
  TUR: "Asia", UZB: "Asia", VIE: "Asia", CBD: "Asia", KAC: "Asia",
  KAR: "Asia", SHN: "Asia", TML: "Asia", WAA: "Asia", XIC: "Asia",
  XSM: "Asia", YEM: "Asia", YUN: "Asia",
  PRF: "Asia", // Kaiserreich's Princely Federation (India)
  // Oceania
  ACE: "Oceania", AST: "Oceania", BRU: "Oceania", DEI: "Oceania",
  FIJ: "Oceania", IND: "Oceania", INS: "Oceania", KIR: "Oceania",
  MAL: "Oceania", MAR: "Oceania", MAY: "Oceania", MIC: "Oceania",
  NAU: "Oceania", NZL: "Oceania", PAU: "Oceania", PHI: "Oceania",
  SAM: "Oceania", SIN: "Oceania", SOL: "Oceania", TON: "Oceania",
  TUL: "Oceania", VAN: "Oceania",
  // Africa
  AFA: "Africa", AFR: "Africa", AGL: "Africa", AIA: "Africa",
  ALG: "Africa", ANG: "Africa", BEN: "Africa", BFA: "Africa",
  BOT: "Africa", BUR: "Africa", CAM: "Africa", CAR: "Africa",
  CDI: "Africa", CHA: "Africa", CNG: "Africa", COG: "Africa",
  COM: "Africa", DJI: "Africa", DRC: "Africa", EGU: "Africa",
  EGY: "Africa", ERI: "Africa", ETH: "Africa", GAB: "Africa",
  GAH: "Africa", GAM: "Africa", GUB: "Africa", GUI: "Africa",
  JUB: "Africa", KEN: "Africa", LBA: "Africa", LES: "Africa",
  LIB: "Africa", LUR: "Africa", MAD: "Africa", MAF: "Africa",
  MAU: "Africa", MLC: "Africa", MLW: "Africa", MOR: "Africa",
  MOZ: "Africa", MRT: "Africa", NAM: "Africa", NFA: "Africa",
  NGR: "Africa", NIG: "Africa", PUN: "Africa", RCD: "Africa",
  RWA: "Africa", SAO: "Africa", SEN: "Africa", SEY: "Africa",
  SHA: "Africa", SIE: "Africa", SML: "Africa", SNA: "Africa",
  SOM: "Africa", SSU: "Africa", SUD: "Africa", SWA: "Africa",
  SWS: "Africa", TNZ: "Africa", TOG: "Africa", TUN: "Africa",
  UGA: "Africa", UNI: "Africa", VER: "Africa", ZAM: "Africa",
  ZIM: "Africa", SAF: "Africa",
};

/** Modern-day trio overrides: the Middle East exists as its own region,
 * the Caucasus goes to Europe, and several Pacific/East-Asian nations move
 * to Oceania. */
const MODERN_REGION_BY_TAG: Record<string, RegionId> = {
  // Middle East
  AFG: "Middle East", ARM: "Middle East", AZE: "Middle East",
  BHR: "Middle East", CYP: "Middle East", EGY: "Middle East",
  HAM: "Middle East", IEK: "Middle East", IRQ: "Middle East",
  ISR: "Middle East", JOR: "Middle East", KUR: "Middle East",
  KUW: "Middle East", LEB: "Middle East", NCY: "Middle East",
  OMA: "Middle East", PAL: "Middle East", PER: "Middle East",
  PUK: "Middle East", QAT: "Middle East", SAU: "Middle East",
  SYR: "Middle East", TAL: "Middle East", TUR: "Middle East",
  UAE: "Middle East", YEM: "Middle East", HEZ: "Middle East",
  // Caucasus + Eastern Europe -> Europe
  ABK: "Europe", CHE: "Europe", GEO: "Europe", MLV: "Europe",
  NKR: "Europe", PMR: "Europe", SOO: "Europe",
  // Modern-map tags missing from the classic table.
  FAO: "Europe", FYR: "Europe", LIC: "Europe", MLT: "Europe",
  SLV: "Europe",
  PAP: "Oceania", // Papua New Guinea (the classic table's PAP is the Papal States)
  // Sri Lanka is a country in Asia on modern maps (the KR tag is Italy).
  SRI: "Asia",
};

/** One nation's entry for region classification. */
export interface NationCentroidEntry {
  tag: string;
  slotKey: string;
  name: string;
  x: number;
  y: number;
  /** World width in map units (kept for compatibility). */
  worldWidth: number;
}

/**
 * Classify every nation into its region via the explicit tables.
 */
export function classifyRegions(
  entries: NationCentroidEntry[],
  includeMiddleEast: boolean,
): Map<string, RegionId> {
  const result = new Map<string, RegionId>();
  for (const entry of entries) {
    const region = includeMiddleEast
      ? (MODERN_REGION_BY_TAG[entry.tag] ?? REGION_BY_TAG[entry.tag])
      : REGION_BY_TAG[entry.tag];
    if (entry.tag === "SOV" || entry.tag === "RUS") {
      result.set(entry.tag, "Europe");
    } else {
      result.set(entry.tag, region ?? "Other");
    }
  }
  return result;
}

/**
 * Simplified display name for the Reservation Board: "Spanish Republic" ->
 * "Spain", "Empire of Japan" -> "Japan". Honorific prefixes are stripped;
 * "United Kingdom" / "United States (of America)" are kept as the only
 * exceptions, along with a few curated names.
 */
const SHORT_NAME_PREFIXES = [
  "kingdom of the",
  "kingdom of",
  "republic of the",
  "republic of",
  "empire of",
  "sultanate of",
  "tsardom of",
  "principality of",
  "grand duchy of",
  "commonwealth of",
  "dominion of",
  "federal republic of",
  "democratic republic of",
  "democratic people's republic of",
  "people's republic of",
  "islamic republic of",
  "arab republic of",
  "hashemite kingdom of",
  "oriental republic of",
  "bolivarian republic of",
  "independent state of",
  "state of",
  "united states of",
  "socialist republic of",
  "federative republic of",
  "plurinational state of",
  "republic of the union of",
  "federal state of",
  "imperial state of",
  "mandate of",
  "free city of",
  "mutawakkilite kingdom of",
];

const SHORT_NAME_OVERRIDES: Record<string, string> = {
  "united kingdom": "United Kingdom",
  "united kingdom of great britain and northern ireland": "United Kingdom",
  "united states": "United States",
  "united states of america": "United States",
  "u.s.a": "United States",
  "usa": "United States",
  "soviet union": "Soviet Union",
  "union of soviet socialist republics": "Soviet Union",
  "german reich": "Germany",
  "japanese empire": "Japan",
  "empire of japan": "Japan",
  "albanian kingdom": "Albania",
  "free mandate of palestine": "Mandate of Palestine",
  "spanish republic": "Spain",
  "republican spain": "Spain",
  "rep spain": "Spain",
  "nationalist spain": "Spain",
  "spanish state": "Spain",
  "british raj": "British Raj",
  "second brazilian republic": "Brazil",
  "united states of brazil": "Brazil",
  "chinese soviet republic": "Chinese Soviet Republic",
  "republic of china": "China",
  "russian federation": "Russia",
  "french republic": "France",
  "third french republic": "France",
  "kingdom of italy": "Italy",
  "federal state of austria": "Austria",
  "hellenic republic": "Greece",
  "kingdom of greece": "Greece",
  "portuguese republic": "Portugal",
  "swiss confederation": "Switzerland",
  "argentine republic": "Argentina",
  "united mexican states": "Mexico",
  "united states of venezuela": "Venezuela",
  "imperial state of iran": "Iran",
  "mandate of palestine": "Palestine",
  "mutawakkilite kingdom of yemen": "Yemen",
  "mongolian people's republic": "Mongolia",
  "tuvan people's republic": "Tuva",
  "ethiopian empire": "Ethiopia",
  "czechoslovak republic": "Czechoslovakia",
  "free city of danzig": "Danzig",
  "sultanate of muscat and oman": "Oman",
  "kingdom of egypt": "Egypt",
  "kingdom of romania": "Romania",
  "kingdom of hungary": "Hungary",
  "kingdom of bulgaria": "Bulgaria",
  "tsardom of bulgaria": "Bulgaria",
  "kingdom of yugoslavia": "Yugoslavia",
  "kingdom of belgium": "Belgium",
  "kingdom of norway": "Norway",
  "kingdom of denmark": "Denmark",
  "kingdom of sweden": "Sweden",
  "kingdom of iraq": "Iraq",
  "kingdom of afghanistan": "Afghanistan",
  "republic of turkey": "Turkey",
  "republic of finland": "Finland",
  "second polish republic": "Poland",
};

function toTitleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  const key = words.join(" ").toLowerCase();
  const override = SHORT_NAME_OVERRIDES[key];
  if (override) return override;
  for (const prefix of SHORT_NAME_PREFIXES) {
    if (key.startsWith(prefix + " ") || key === prefix) {
      const rest = key.slice(prefix.length).trim();
      return rest ? toTitleCase(rest) : toTitleCase(key);
    }
  }
  return toTitleCase(key);
}

/** The seven majors for the "Majors" section (plus KR's Russia). */
export function majorTagsFor(scenarioId: ScenarioId): Set<string> {
  if (scenarioId === "kaiserreich") {
    // KR majors: the Central Powers bloc — German Empire, Commune of France,
    // Union of Britain, USA, Japan, Russian Republic, Austrian Empire and
    // the Ottoman Empire. Austrian Italy (ITA) is NOT a major there.
    return new Set(["GER", "FRA", "ENG", "USA", "JAP", "RUS", "AUS", "TUR"]);
  }
  return new Set(["USA", "ENG", "SOV", "FRA", "GER", "ITA", "JAP"]);
}

// --- Board display names ---------------------------------------------------

/** Per-scenario display-name overrides for the Reservation Board. */
const BOARD_NAME_OVERRIDES: Partial<Record<ScenarioId, Record<string, string>>> = {
  kaiserreich: {
    GER: "German Empire",
    JAP: "Japanese Empire",
    RUS: "Russian Republic",
    FRA: "French Republic",
    NFA: "French Republic",
    AUS: "Austrian Empire",
  },
};

/** Global tag display overrides (any scenario). */
const BOARD_TAG_OVERRIDES: Record<string, string> = {
  KOR: "South Korea",
  NKO: "North Korea",
};

/** Display name used in the Reservation Board: per-scenario overrides, then
 * global tag overrides, then the simplified honorific-stripped name. */
export function boardDisplayName(
  scenarioId: ScenarioId,
  tag: string,
  name: string,
): string {
  const scenarioOverride = BOARD_NAME_OVERRIDES[scenarioId]?.[tag];
  if (scenarioOverride) return scenarioOverride;
  const tagOverride = BOARD_TAG_OVERRIDES[tag];
  if (tagOverride) return tagOverride;
  return shortName(name);
}

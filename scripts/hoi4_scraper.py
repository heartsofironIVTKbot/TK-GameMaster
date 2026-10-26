#!/usr/bin/env python3
"""Scrape Hearts of Iron IV game files into the dashboard's scenario JSON.

Parses a base HOI4 installation (and optionally a mod laid over it) into the
exact shape of the ``CountryScenarioData`` TypeScript interface in
``web/src/data/scenarioData.ts``, keyed by 3-letter country tag::

    {
      "GER": {
        "name": "German Reich",
        "tag": "GER",
        "flagUrl": "/assets/flags/GER.png",
        "leader": { "name": "Adolf Hitler", "portraitUrl": "/assets/portraits/GER.png" },
        "ideology": {
          "name": "Fascism",
          "rulingPartyShare": 100,
          "breakdown": { "democratic": 0, "fascism": 100, "communism": 0, "nonAligned": 0 }
        },
        "stability": 80,          # %, 0-100 (HOI4 stores 0-1 fractions)
        "warSupport": 60,         # %, 0-100
        "nationalSpirits": [
          { "id": "GER_general_staff", "name": "General Staff",
            "description": "...", "iconUrl": "/assets/spirits/GER_general_staff.png" }
        ],
        "industry": { "civilianFactories": 32, "militaryFactories": 28, "navalDockyards": 8 },
        "resources": { "oil": 0, "aluminum": 30, "rubber": 0, "tungsten": 0,
                       "steel": 450, "chromium": 40, "coal": 0 },
        "armedForces": { "divisions": 36, "fieldManpower": 800000,
                         "totalWarships": 36, "totalAircraft": 900 },
        "capital": 64             # extra field: province id (not in the web interface)
      }
    }

What it reads
-------------
- ``history/states/*.txt``      — buildings (industrial_complex / arms_factory /
  dockyard) and all 7 resources, aggregated per ``owner`` tag.
- ``history/countries/*.txt``   — capital, set_stability, set_war_support,
  set_politics (parties + ruling_party), add_ideas (scalar or block, including
  DLC-conditional ones; date-gated ``1939.1.1 = { ... }`` blocks are excluded
  so only true 1936 starting ideas count), add_dynamic_modifier (DLC spirits
  attached as dynamic modifiers), set_oob / set_naval_oob / set_air_oob, and
  ``recruit_character`` order (used to pick the starting leader).
- ``common/characters/{TAG}.txt`` — starting leader: ``name`` (localisation
  key) and ``portraits.*.large`` (GFX sprite key, resolved through
  ``interface/*.gfx`` SpriteType definitions to the real texture path). The
  first ``recruit_character`` whose ``country_leader`` ideology matches the
  ruling party family and whose role is active at 1936.1.1 (``expire`` /
  ``activation`` dates) wins.
- ``common/ideas/*.txt`` + ``common/dynamic_modifiers/*.txt`` + localisation
  — national spirit names/descriptions/icons (ideas are nested inside
  categories, e.g. ``ideas = { country = { general_staff = { ... } } }``).
- ``history/units/*.txt``       — division counts and field manpower. Division
  templates are defined *inline* at the top of the land OOB files; per-battalion
  manpower comes from ``common/units/*.txt`` (``sub_units = { infantry = {
  manpower = 1000 ... } }``). Ships are counted from the naval OOB
  (``units = { fleet = { task_force = { ship = {...} } } }``) and aircraft from
  the air OOB (``air_wings = { n = { <airframe> = { amount = X } } }``).

Assets (``gfx/``) are copied/converted (DDS via imageio, TGA via Pillow) into
``--output-assets``::

    <output-assets>/flags/{TAG}.png
    <output-assets>/portraits/{TAG}.png
    <output-assets>/spirits/{SPIRIT_ID}.png

Mod support
-----------
``--mod-path`` may point at a mod *directory* or at its ``.mod`` descriptor
file (the descriptor's ``path = "..."`` line is honoured). Mod files shadow
base-game files with the same filename (standard HOI4 replace semantics),
and ``replace_path="<folder>"`` descriptor entries are honoured too — for a
replaced folder the base game's files are ignored entirely (Road to 56
replaces ``history/states`` with its own renumbered 1143-state set).

Scenarios that share asset filenames with vanilla should get their own
asset root and URL prefix (``--output-assets`` / ``--url-prefix``), e.g.
Road to 56 assets land in ``web/public/assets_rt56`` and the JSON references
``/assets_rt56/...`` URLs.

DLC support
-----------
Installed DLC folders (``<hoi4>/dlc/*``) are mounted as content roots between
the base game and the mod: base < DLC < mod, later roots shadowing earlier
ones. This matters for textures (leader portraits, flags, spirit icons) that
ship only inside DLC packs. Packs with doubled folder layouts
(``dlc/<name>/<name>/...``) are mounted at their inner content root.

Examples
--------
Install dependencies (once)::

    py -m pip install -r scripts/requirements.txt

Base game only (Vanilla 1936):

    py scripts/hoi4_scraper.py ^
        --hoi4-path "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hearts of Iron IV" ^
        --output-json web/src/data/scenarios/vanilla_1936.json ^
        --output-assets web/public/assets ^
        --url-prefix /assets

With the Road to 56 Workshop mod (id 820260968):

    py scripts/hoi4_scraper.py ^
        --hoi4-path "C:\\...\\common\\Hearts of Iron IV" ^
        --mod-path "C:\\...\\mod\\ugc_820260968.mod" ^
        --output-json web/src/data/scenarios/road_to_56.json ^
        --output-assets web/public/assets_rt56 ^
        --url-prefix /assets_rt56

Then regenerate the nation map with::

    py scripts/svg_to_geojson.py ^
        --mapping scripts/road_to_56_mapping.json ^
        --states-dir scripts/hoi4_files/road_to_56 ^
        --output web/public/maps/road_to_56.geojson ^
        --no-overrides ^
        --colors-file scripts/raw_assets/nation_colors/colors.txt ^
                      scripts/raw_assets/nation_colors_rt56/colors.txt ^
        --countries-file scripts/raw_assets/nation_colors/00_countries.txt ^
                        scripts/raw_assets/nation_colors_rt56/r56_countries.txt
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image  # type: ignore
except ImportError:  # pragma: no cover
    Image = None

try:
    import imageio.v2 as imageio  # type: ignore
except ImportError:  # pragma: no cover
    imageio = None


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PUBLIC_URL_PREFIX = "/assets"
# Fallback manpower per division when a template cannot be resolved.
DEFAULT_DIVISION_MANPOWER = 9000

RESOURCE_ALIASES = {
    "oil": "oil",
    "steel": "steel",
    "aluminium": "aluminum",  # HOI4 uses British spelling in state files
    "aluminum": "aluminum",
    "rubber": "rubber",
    "tungsten": "tungsten",
    "chromium": "chromium",
    "coal": "coal",  # present only in some mods (e.g. Road to 56)
}

INDUSTRY_KEYS = {
    "industrial_complex": "civilianFactories",
    "arms_factory": "militaryFactories",
    "dockyard": "navalDockyards",
}

# Country-history blocks that scope effects to STATES, not the country itself
# (``every_owned_state = { add_dynamic_modifier = ... }``). Anything inside
# them is a state modifier and must never leak into the starting spirits or
# the stability/war-support math (Paraguay's river navy, Brazil's neglected
# state modifier, ...).
STATE_SCOPE_KEYS = {
    "every_owned_state",
    "every_core_state",
    "every_state",
    "every_controlled_state",
    "every_neighbor_state",
    "every_neighbor_country",
    "random_owned_state",
    "random_core_state",
    "random_owned_controlled_state",
    "random_state",
    "all_core_state",
    # ``create_dynamic_country`` blocks are templates for countries created
    # mid-game (KR's Spain defines its socialist/carlist variants here);
    # their contents must never leak into the original country's start data.
    # Same for ``save_global_event_target_as`` bookkeeping blocks.
    "create_dynamic_country",
    "save_global_event_target_as",
}

# ``pride_of_the_fleet_country`` static modifier: a country whose 1936 naval
# OOB names a pride of the fleet ship gets +5% war support.
PRIDE_OF_THE_FLEET_WAR_SUPPORT = 0.05

# Trial of Allegiance's on_startup grants ``USA_monroe_doctrine_idea`` to every
# 1936 country whose capital lies in the Americas (the Caribbean tags are
# listed explicitly by the game because their capitals are not on the
# north_america continent). USA itself starts with the enforcer idea instead.
MONROE_DOCTRINE_IDEA = "USA_monroe_doctrine_idea"
MONROE_DOCTRINE_TAGS = {
    "ARG", "BOL", "BRA", "CAN", "CHL", "COL", "COS", "CUB", "DOM", "ECU",
    "ELS", "GUA", "HAI", "HON", "MEX", "NIC", "PAN", "PAR", "PRU", "URG",
    "VEN",
}

# Ideas whose picture/icon is a generic placeholder are hidden from the
# in-game national spirits list (e.g. JAP's faction-balance tier ideas) UNLESS
# a real ``GFX_idea_<id>`` sprite exists (e.g. PER's GoE resistance spirits).
PLACEHOLDER_ICON_RE = re.compile(r"PLACEHOLDER", re.IGNORECASE)

PARTY_ALIASES = {
    "democratic": "democratic",
    "fascism": "fascism",
    "communism": "communism",
    "neutrality": "nonAligned",
    # Kaiserreich's own ideology set (the mod replaces common/ideologies):
    # the liberal/socialist families bucket into the four dashboard
    # families the same way KR's own tooltips group them.
    "social_democrat": "democratic",
    "social_liberal": "democratic",
    "market_liberal": "democratic",
    "social_conservative": "democratic",
    "authoritarian_democrat": "nonAligned",
    "paternal_autocrat": "nonAligned",
    "national_populist": "fascism",
    "syndicalist": "communism",
    "radical_socialist": "communism",
    "totalist": "communism",
    # The Fire Rises' own ideology set (replaces common/ideologies).
    "totalitarian_socialist": "communism",
    "communist": "communism",
    "libertarian_socialist": "communism",
    "conservative": "democratic",
    "nationalist": "fascism",
    "fascist": "fascism",
    "national_socialist": "fascism",
}
PARTY_NAMES = {
    "democratic": "Democracy",
    "fascism": "Fascism",
    "communism": "Communism",
    "nonAligned": "Non-Aligned",
}
PARTY_HOI4_KEY = {
    "democratic": "democratic",
    "fascism": "fascism",
    "communism": "communism",
    "nonAligned": "neutrality",
}

# Character `country_leader.ideology` values are sub-ideologies (nazism,
# stalinism, ...); map them back to the four ruling-party families.
SUB_IDEOLOGY_MAP = {
    "nazism": "fascism",
    "falangism": "fascism",
    "rexism": "fascism",
    "fascism": "fascism",
    "fascism_ideology": "fascism",
    "stalinism": "communism",
    "leninism": "communism",
    "marxism": "communism",
    "anarchism": "communism",
    "communism": "communism",
    "trotskyism": "communism",
    "conservatism": "democratic",
    "liberalism": "democratic",
    "socialism": "democratic",
    "social_democrat": "democratic",
    "democratic": "democratic",
    "despotism": "nonAligned",
    "oligarchy": "nonAligned",
    "centrism": "nonAligned",
    "moderatism": "nonAligned",
    "absolutism": "nonAligned",
    "theocracy": "nonAligned",
    "reactionism": "nonAligned",
    "neutrality": "nonAligned",
    "non_aligned": "nonAligned",
    "paternal_autocrat": "nonAligned",
    "authoritarian": "nonAligned",
    # Kaiserreich ideologies (both the party -ist keys and the -ism forms
    # used by characters/country_leader roles).
    "syndicalist": "communism",
    "syndicalism": "communism",
    "radical_socialist": "communism",
    "radical_socialism": "communism",
    "totalist": "communism",
    "totalism": "communism",
    "social_democrat": "democratic",
    "social_democracy": "democratic",
    "social_liberal": "democratic",
    "social_liberalism": "democratic",
    "market_liberal": "democratic",
    "market_liberalism": "democratic",
    "social_conservative": "democratic",
    "social_conservatism": "democratic",
    "authoritarian_democrat": "nonAligned",
    "authoritarian_democracy": "nonAligned",
    "paternal_autocracy": "nonAligned",
    "national_populist": "fascism",
    "national_populism": "fascism",
    # The Fire Rises' parties (also used as character country_leader
    # ideologies).
    "totalitarian_socialist": "communism",
    "communist": "communism",
    "libertarian_socialist": "communism",
    "conservative": "democratic",
    "nationalist": "fascism",
    "fascist": "fascism",
    "national_socialist": "fascism",
}

EMPTY_IDEOLOGY = {"democratic": 0, "fascism": 0, "communism": 0, "nonAligned": 0}
EMPTY_RESOURCES = {
    "oil": 0,
    "aluminum": 0,
    "rubber": 0,
    "tungsten": 0,
    "steel": 0,
    "chromium": 0,
    "coal": 0,
}
EMPTY_INDUSTRY = {"civilianFactories": 0, "militaryFactories": 0, "navalDockyards": 0}

# Game define INFRASTRUCTURE_RESOURCE_BONUS: each infrastructure level adds a
# +15% multiplicative bonus to the state's resource output.
INFRASTRUCTURE_RESOURCE_BONUS = 0.15

# Game define BASE_STABILITY_PARTY_POPULARITY_FACTOR: the stability bonus from
# the ruling party's popularity scales from 0% at 0% popularity to +15% at
# 100% popularity (share * this factor).
BASE_STABILITY_PARTY_POPULARITY_FACTOR = 0.15

# Standard economy / trade / conscription laws — never shown as national
# spirits (they are generic game mechanics, not unique country flavour).
LAW_IDEAS = {
    # Economy laws
    "civilian_economy", "early_mobilization", "partial_economic_mobilisation",
    "war_economy", "total_mobilization", "undisturbed_isolation", "isolation",
    # Trade laws
    "free_trade", "export_focus", "limited_exports", "closed_economy",
    # Conscription laws
    "disarmed_nation", "volunteer_only", "limited_conscription",
    "extensive_conscription", "service_by_requirement", "all_adults_serve",
    "scraping_the_barrel",
}

# Cap on starting national spirits kept per country (the badge row stays tidy).
MAX_SPIRITS = 10

ASSET_EXTENSIONS = (".dds", ".tga", ".png", ".jpg", ".jpeg", ".bmp", ".webp")

TAG_RE = re.compile(r"^[A-Z0-9]{3}$")
_MOD_PATH_RE = re.compile(r'^\s*path\s*=\s*"([^"]+)"\s*$', re.MULTILINE)
# ``replace_path="<folder>"`` lines in a mod descriptor: the game drops the
# base version of that folder entirely and loads only the mod's (e.g. Road to
# 56 replaces ``history/states`` with its own renumbered state set).
_REPLACE_PATH_RE = re.compile(
    r'^\s*replace_path\s*=\s*"([^"]+)"\s*$', re.MULTILINE
)
_LOC_LINE_RE = re.compile(
    r'^\s*([A-Za-z0-9_\.\-]+)(?::\d*)?\s*"(.*)"\s*(?:#.*)?\s*$'
)
_LOC_COLOR_RE = re.compile(r"§[A-Za-z0-9!]")
_LOC_ICON_RE = re.compile(r"£[A-Za-z0-9_]+")
# Modifier tooltip format: ``$RIGHT|+=%1$`` — flag, then a tail of ``%``
# (fraction -> *100%) / ``%%`` (already-percent) and optional decimal count.
_MODIFIER_TT_RE = re.compile(
    r"^\s*\$([A-Za-z0-9_]+)\$:?\s*\$RIGHT\|(.)=([^$]*)\$"
)
# Blocks keyed this way fire later in a campaign and never count as 1936 start.
DATE_KEY_RE = re.compile(r"^\d{4}\.\d{1,2}\.\d{1,2}(\.\d+)?$")

# Bare numeric keys are state-id blocks (``1032 = { add_dynamic_modifier ... }``)
# holding state-scoped effects, never country-level starting data.
NUMERIC_KEY_RE = re.compile(r"^\d+$")

# HOI4 dates look like ``"1936.1.1.1"`` = year.month.day.hour.
_HOI4_DATE_RE = re.compile(r"^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?$")
GAME_START_DATE = (1936, 1, 1, 1)


# ---------------------------------------------------------------------------
# Clausewitz brace-syntax parser
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> list[str]:
    """Split Clausewitz text into tokens: strings, atoms, and ``{ } =``."""
    tokens: list[str] = []
    index = 0
    length = len(text)
    while index < length:
        char = text[index]
        if char in " \t\r\n":
            index += 1
        elif char == "#":
            while index < length and text[index] != "\n":
                index += 1
        elif char == '"':
            index += 1
            buffer: list[str] = []
            while index < length and text[index] != '"':
                if text[index] == "\\" and index + 1 < length:
                    buffer.append(text[index + 1])
                    index += 2
                else:
                    buffer.append(text[index])
                    index += 1
            tokens.append("".join(buffer))
            index += 1
        elif char in "{}=":
            tokens.append(char)
            index += 1
        else:
            start = index
            while index < length and text[index] not in " \t\r\n{}=#":
                index += 1
            tokens.append(text[start:index])
    return tokens


def parse_clausewitz(text: str) -> list:
    """Parse Clausewitz text into a list of ``(key, value)`` pairs.

    Values are strings or nested lists of pairs. Repeated keys keep all of
    their occurrences (e.g. one ``state = { ... }`` block per state).
    """
    tokens = _tokenize(text)
    total = len(tokens)
    position = 0

    def parse_value():
        nonlocal position
        token = tokens[position]
        if token == "{":
            position += 1
            return parse_items()
        position += 1
        return token

    def parse_items():
        nonlocal position
        items: list = []
        while position < total and tokens[position] != "}":
            if position + 2 < total and tokens[position + 1] == "=":
                key = tokens[position]
                position += 2
                items.append((key, parse_value()))
            else:
                items.append((None, parse_value()))
        if position < total:
            position += 1  # consume the closing brace
        return items

    return parse_items()


def find_first(items, key):
    for item_key, value in items:
        if item_key == key:
            return value
    return None


def find_all(items, key):
    return [value for item_key, value in items if item_key == key]


def find_first_deep(items, key):
    """Find the first value for ``key`` anywhere in the tree, in document order.

    Country history files nest many fields inside ``if = { ... }`` blocks
    (``IF = { limit = {...} set_stability = 0.7 ELSE = {...} }``), so a
    top-level search misses them. Depth-first, document-order search returns
    the first (usually non-DLC) variant.
    """
    for item_key, value in items:
        if item_key == key:
            return value
        if is_block(value):
            found = find_first_deep(value, key)
            if found is not None:
                return found
    return None


def find_all_deep(items, key):
    """Return every value for ``key`` anywhere in the tree (document order)."""
    results: list = []
    for item_key, value in items:
        if item_key == key:
            results.append(value)
        if is_block(value):
            results.extend(find_all_deep(value, key))
    return results


def is_block(value) -> bool:
    return isinstance(value, list)


def to_number(value, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if re.fullmatch(r"[-+]?\d+", text):
        try:
            return float(int(text))
        except ValueError:
            return default
    try:
        return float(text)
    except ValueError:
        return default


def read_text_safe(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8-sig", errors="ignore")
    except OSError:
        return ""


# ---------------------------------------------------------------------------
# File resolution (base game + mod overlay)
# ---------------------------------------------------------------------------

def resolve_mod_dir(mod_arg: str | None, base: Path) -> Path | None:
    """Resolve ``--mod-path`` to a mod root directory (or None if unusable)."""
    if not mod_arg:
        return None
    candidate = Path(mod_arg)
    if candidate.is_dir():
        return candidate.resolve()
    if candidate.is_file():
        match = _MOD_PATH_RE.search(read_text_safe(candidate))
        if match:
            relative = Path(match.group(1))
            if relative.is_absolute() and relative.is_dir():
                return relative
            for root in (candidate.parent, base):
                joined = (root / relative).resolve()
                if joined.is_dir():
                    return joined
    return None


def mod_replace_paths(mod_arg: str | None, mod_dir: Path | None) -> frozenset[str]:
    """Parse ``replace_path`` entries from a mod's descriptor file(s).

    Reads both the ``--mod-path`` argument (when it is a ``.mod`` descriptor)
    and the mod root's own ``descriptor.mod``. Returned subpaths are
    normalized to forward slashes and lowercased.
    """
    paths: set[str] = set()
    candidates: list[Path] = []
    if mod_arg:
        arg_path = Path(mod_arg)
        if arg_path.is_file():
            candidates.append(arg_path)
    if mod_dir is not None:
        candidates.append(mod_dir / "descriptor.mod")
    for candidate in candidates:
        text = read_text_safe(candidate)
        for match in _REPLACE_PATH_RE.finditer(text):
            paths.add(match.group(1).replace("\\", "/").strip("/").lower())
    return frozenset(paths)


def roots_for_subpath(
    subpath: str, base: Path, mod: Path | None, replace_paths: frozenset[str]
) -> list[Path]:
    """Content roots for ``subpath``, honouring mod ``replace_path`` entries.

    When a mod declares ``replace_path="<folder>"`` the game ignores the base
    version of that folder entirely (later roots — DLC packs, then the mod —
    still load). Without a mod the set is empty and this is a no-op.
    """
    roots = active_roots(base, mod)
    if not replace_paths or mod is None or len(roots) < 2:
        return roots
    key = subpath.replace("\\", "/").strip("/").lower()
    replaced = any(
        key == replaced_path or key.startswith(replaced_path + "/")
        for replaced_path in replace_paths
    )
    if replaced:
        # Drop the base root (roots[0]); DLC packs + the mod remain.
        return roots[1:]
    return roots


def active_roots(base: Path, mod: Path | None) -> list[Path]:
    """Content roots in override order: base game, DLC packs, then mod.

    The game mounts every ``dlc/*`` folder between the base files and user
    mods. Later roots shadow earlier ones, so DLC textures win over base and
    the mod wins over everything. Some packs (e.g. No Compromise, No
    Surrender) ship with their content nested one level deeper
    (``dlc/<name>/<name>/...``); the inner folder is mounted in that case.
    """
    roots = [base]
    dlc_dir = base / "dlc"
    if dlc_dir.is_dir():
        for path in sorted(entry for entry in dlc_dir.iterdir() if entry.is_dir()):
            inner = path / path.name
            roots.append(inner if inner.is_dir() else path)
    if mod is not None:
        roots.append(mod)
    return roots


def merged_files(
    subpath: str,
    base: Path,
    mod: Path | None,
    pattern: str = "*.txt",
    replace_paths: frozenset[str] = frozenset(),
) -> list[Path]:
    """List files under ``<subpath>``; later roots shadow same-named files."""
    by_name: dict[str, Path] = {}
    for root in roots_for_subpath(subpath, base, mod, replace_paths):
        directory = root / subpath
        if not directory.is_dir():
            continue
        for path in directory.glob(pattern):
            by_name[path.name.lower()] = path
    return sorted(by_name.values())


def resolve_asset(
    rel_path: str,
    base: Path,
    mod: Path | None,
    replace_paths: frozenset[str] = frozenset(),
) -> Path | None:
    """Resolve an in-game asset path (``gfx/...``) to a real file.

    Searches in override order (mod, then DLC packs, then base) so DLC-only
    textures are found. When the mod declares ``replace_path`` for the
    asset's folder (Kaiserreich replaces ``gfx/flags`` and ``gfx/leaders``),
    base-game files at that path are ignored like the game does.
    """
    relative = Path(str(rel_path).replace("\\", "/").strip("/"))
    for root in reversed(
        roots_for_subpath(str(relative.parent), base, mod, replace_paths)
    ):
        full = root / relative
        if full.is_file():
            return full
        for extension in ASSET_EXTENSIONS:
            alternative = full.with_suffix(extension)
            if alternative.is_file():
                return alternative
    return None


# ---------------------------------------------------------------------------
# Localisation + GFX sprite index
# ---------------------------------------------------------------------------

def load_localisation(base: Path, mod: Path | None) -> dict[str, str]:
    """Collect ``*_l_english.yml`` entries (later roots override earlier)."""
    entries: dict[str, str] = {}
    for root in active_roots(base, mod):
        directory = root / "localisation"
        if not directory.is_dir():
            continue
        for path in sorted(directory.rglob("*.yml")):
            if "l_english" not in path.name.lower():
                continue
            for line in read_text_safe(path).splitlines():
                match = _LOC_LINE_RE.match(line)
                if not match:
                    continue
                key = match.group(1)
                value = match.group(2).replace("\\n", " ")
                value = _LOC_COLOR_RE.sub("", value)
                value = _LOC_ICON_RE.sub("", value)
                entries[key] = value
    # Resolve nested ``$key$`` references (e.g. a value that is just
    # ``$BEL_chasseurs_ardennais_ns$`` or text containing several tokens like
    # ``$JAP_imperial_influence_tier_2$ $JAP_army_faction$``) so the dashboard
    # never shows raw keys.
    token_re = re.compile(r"\$([A-Za-z0-9_\.\-]+)\$")

    def resolve(value: str, depth: int = 0) -> str:
        if depth >= 5:
            return value

        def replace(match):
            inner = entries.get(match.group(1))
            return resolve(inner, depth + 1) if inner else match.group(0)

        return token_re.sub(replace, value)

    for key, value in list(entries.items()):
        entries[key] = resolve(value)
    # Resolve scripted country tokens (``[GER.GetNameDefCap]``) that the game
    # fills in at runtime; known tag-name forms resolve to the tag's own
    # localised name and anything else is stripped rather than shown raw.
    bracket_re = re.compile(
        r"\[([A-Z]{3})\.(GetNameDefCap|GetNameDef|GetName|GetAdjective)\]",
        re.IGNORECASE,
    )
    generic_bracket_re = re.compile(
        r"\[\s*(?:Root|ROOT|From|FROM|This|THIS|Prev|PREV)\.(?:Get\w+)\s*\]"
    )
    for key, value in list(entries.items()):
        def replace_bracket(match):
            tag = match.group(1)
            form = match.group(2).lower()
            if form == "getadjective":
                return entries.get(f"{tag}_ADJ") or entries.get(tag) or tag
            return entries.get(tag) or tag

        entries[key] = generic_bracket_re.sub(
            "", bracket_re.sub(replace_bracket, value)
        )
    return entries


def load_scripted_localisation(
    base: Path, mod: Path | None, replace_paths: frozenset[str] = frozenset()
) -> dict[str, list[dict]]:
    """Index ``defined_text`` blocks from ``common/scripted_localisation``.

    Mods (e.g. Road to 56) localise many names through scripted localisation:
    the localisation entry holds ``[GER_army_scripted]`` and the actual
    display key depends on game rules/flags. Each ``defined_text`` block maps
    its name to a list of ``text`` entries:

    ``{"tag": TAG|None, "loc_key": str, "not_rule": bool, "has_rule": bool}``

    ``not_rule`` marks the common "default game rule" branch
    (``trigger = { NOT = { has_game_rule = ... } }``) — the branch players
    see without changing game rules.
    """
    index: dict[str, list[dict]] = {}
    for path in merged_files(
        "common/scripted_localisation", base, mod, replace_paths=replace_paths
    ):
        for defined in find_all(
            parse_clausewitz(read_text_safe(path)), "defined_text"
        ):
            if not is_block(defined):
                continue
            name = find_first(defined, "name")
            if not name:
                continue
            entries: list[dict] = []
            for text_block in find_all(defined, "text"):
                if not is_block(text_block):
                    continue
                loc_key = find_first(text_block, "localization_key")
                if loc_key is None:
                    continue
                trigger = find_first(text_block, "trigger")
                tag = None
                not_rule = False
                has_rule = False
                if is_block(trigger):
                    tag = find_first(trigger, "tag")
                    if tag is None:
                        tag = find_first(trigger, "original_tag")
                    has_rule = find_first(trigger, "has_game_rule") is not None
                    not_block = find_first(trigger, "NOT")
                    if is_block(not_block) and find_first(
                        not_block, "has_game_rule"
                    ) is not None:
                        not_rule = True
                entries.append(
                    {
                        "tag": str(tag).upper() if tag else None,
                        "loc_key": str(loc_key),
                        "not_rule": not_rule,
                        "has_rule": has_rule,
                    }
                )
            if entries:
                index.setdefault(str(name), []).extend(entries)
    return index


def resolve_scripted_name(
    key: str, tag: str, scripted_index: dict[str, list[dict]], loc: dict[str, str]
) -> str | None:
    """Resolve a ``defined_text`` key to its game-start display name.

    Preference order: the default-game-rule branch (``NOT has_game_rule``),
    the branch whose trigger matches this country's tag, an untriggered
    branch, then the first entry as a best effort.
    """
    entries = scripted_index.get(key)
    if not entries:
        return None
    for entry in entries:
        if entry["not_rule"]:
            return loc.get(entry["loc_key"])
    for entry in entries:
        if entry["tag"] == tag:
            return loc.get(entry["loc_key"])
    for entry in entries:
        if entry["tag"] is None and not entry["has_rule"]:
            return loc.get(entry["loc_key"])
    return loc.get(entries[0]["loc_key"])


def load_modifier_tooltips(base: Path, mod: Path | None) -> dict[str, dict]:
    """Parse the game's ``<key>_tt`` tooltip entries into display metadata.

    The engine encodes each modifier's exact display rules in localisation
    tooltip entries, e.g. ``stability_factor_tt: " $MODIFIER_STABILITY_FACTOR$:
    $RIGHT|+=%1$"`` — the label key, the colour flag (``+`` normal, ``-``
    inverted, ``Y``/``W`` neutral, ``R``/``G`` always red/green) and the value
    format (``%`` = fraction shown as *100%, ``%%`` = already a percentage,
    trailing digit = decimal places). Parsed from the RAW files: the resolved
    localisation dict would have replaced the ``$MODIFIER_...$`` reference.
    """
    tooltips: dict[str, dict] = {}
    for root in active_roots(base, mod):
        directory = root / "localisation"
        if not directory.is_dir():
            continue
        for path in sorted(directory.rglob("*.yml")):
            if "l_english" not in path.name.lower():
                continue
            for line in read_text_safe(path).splitlines():
                match = _LOC_LINE_RE.match(line)
                if not match or not match.group(1).endswith("_tt"):
                    continue
                value = match.group(2)
                format_match = _MODIFIER_TT_RE.search(value)
                if not format_match:
                    continue
                label_ref, flag, tail = format_match.groups()
                if "%%" in tail:
                    percent: bool | str = "direct"  # raw value is the %
                elif "%" in tail:
                    percent = True
                else:
                    percent = False
                digits = re.sub(r"[^0-9]", "", tail)
                tooltips[match.group(1)[:-3]] = {
                    "label_key": label_ref,
                    "inverted": flag == "-",
                    "neutral": flag in ("W", "0"),
                    "yellow": flag == "Y",
                    "always_bad": flag == "R",
                    "always_good": flag == "G",
                    "percent": percent,
                    "decimals": int(digits) if digits else None,
                }
    return tooltips


def load_sprite_index(base: Path, mod: Path | None) -> dict[str, str]:
    """Map GFX sprite names to texture paths from ``interface/*.gfx``.

    Sprite definitions usually live inside a top-level ``spriteTypes`` block
    (``SpriteType = { name = "..." texturefile = "..." }``).
    """
    sprites: dict[str, str] = {}
    files: list[Path] = []
    for root in active_roots(base, mod):
        directory = root / "interface"
        if directory.is_dir():
            files.extend(sorted(directory.rglob("*.gfx")))
    for path in files:
        for value in iter_blocks(parse_clausewitz(read_text_safe(path)), "SpriteType"):
            name = find_first(value, "name")
            texturefile = find_first(value, "texturefile")
            if texturefile is None:
                texturefile = find_first(value, "textureFile")
            if name and texturefile:
                sprites[str(name)] = str(texturefile)
    return sprites


def load_sub_ideologies(
    base: Path, mod: Path | None, replace_paths: frozenset[str] = frozenset()
) -> dict[str, str]:
    """Map sub-ideologies (nazism, stalinism, ...) to their party family.

    Derived from ``common/ideologies/*.txt``: each family block
    (``democratic = { types = { liberalism = {...} ... } }``) lists its
    sub-ideologies inside ``types``. This keeps the mapping in sync with the
    game's actual ideology tree (e.g. ``japan_militarism_ideology`` under
    neutrality, ``emperor_fascism`` under fascism) instead of a hardcoded
    list. SUB_IDEOLOGY_MAP remains as a fallback for anything uncovered.
    """
    merged = dict(SUB_IDEOLOGY_MAP)
    for path in merged_files(
        "common/ideologies", base, mod, replace_paths=replace_paths
    ):
        root = find_first(parse_clausewitz(read_text_safe(path)), "ideologies")
        if not is_block(root):
            continue
        for family, family_block in root:
            # Vanilla families are democratic/fascism/communism/neutrality;
            # total-conversion mods (Kaiserreich) define their own parties
            # (syndicalist, social_conservative, ...). PARTY_ALIASES buckets
            # both sets into the four dashboard families.
            canonical = PARTY_ALIASES.get(family)
            if canonical is None or not is_block(family_block):
                continue
            types = find_first(family_block, "types")
            if not is_block(types):
                continue
            for sub_key, sub_value in types:
                if sub_key:
                    merged[str(sub_key)] = canonical
    return merged


def load_ideology_parties(
    base: Path, mod: Path | None, replace_paths: frozenset[str] = frozenset()
) -> dict[str, str]:
    """Map every ideology key (party or sub-ideology) to its parent party.

    ``common/ideologies`` defines parties with a ``types`` block listing their
    sub-ideologies (vanilla: ``fascism = { types = { nazism = {...} } }``;
    Kaiserreich: ``syndicalist = { types = { syndicalist_subtype = {} } }``).
    The game only lets a ``country_leader`` whose ideology is a sub-ideology
    of the ruling party lead that country, so this table (ideology key -> raw
    party name) drives precise leader matching.
    """
    mapping: dict[str, str] = {}
    for path in merged_files(
        "common/ideologies", base, mod, replace_paths=replace_paths
    ):
        root = find_first(parse_clausewitz(read_text_safe(path)), "ideologies")
        if not is_block(root):
            continue
        for party, party_block in root:
            if not party or not is_block(party_block):
                continue
            party_key = str(party)
            mapping[party_key] = party_key
            types = find_first(party_block, "types")
            if is_block(types):
                for sub_key, _ in types:
                    if sub_key:
                        mapping[str(sub_key)] = party_key
    return mapping


def load_ideology_info(
    base: Path,
    mod: Path | None,
    loc: dict[str, str],
    replace_paths: frozenset[str] = frozenset(),
) -> dict[str, dict]:
    """Registry of every ruling party: ``{name, color, family}``.

    Total conversions (Kaiserreich) replace the four vanilla ideologies with
    their own parties (syndicalist, social_conservative, ...); the dashboard
    renders the *actual* party breakdown instead of the four-family collapse.
    Names come from the party's own loc key (``syndicalist: "Syndicalist"``)
    and colours from the ``color = { R G B }`` block.
    """
    registry: dict[str, dict] = {}
    for path in merged_files(
        "common/ideologies", base, mod, replace_paths=replace_paths
    ):
        root = find_first(parse_clausewitz(read_text_safe(path)), "ideologies")
        if not is_block(root):
            continue
        for party, party_block in root:
            if not party or not is_block(party_block):
                continue
            party_key = str(party)
            canonical = PARTY_ALIASES.get(party_key)
            if canonical is None:
                continue
            color_block = find_first(party_block, "color")
            color = "#888888"
            if is_block(color_block):
                components = [
                    to_number(component, default=0.0)
                    for _, component in color_block
                    if component is not None
                ]
                if len(components) >= 3:
                    r, g, b = components[:3]
                    if any(component > 1.0 for component in components[:3]):
                        r, g, b = (min(255, int(component)) for component in components[:3])
                    else:
                        r, g, b = (
                            min(255, int(round(component * 255)))
                            for component in components[:3]
                        )
                    color = f"#{r:02X}{g:02X}{b:02X}"
            registry[party_key] = {
                "name": loc.get(party_key) or party_key,
                "color": color,
                "family": canonical,
            }
    return registry


# ---------------------------------------------------------------------------
# common/scripted_effects — start-time spirit grants (Kaiserreich's
# Mitteleuropa membership, the Legation Cities open-door ideas, ...)
# ---------------------------------------------------------------------------

def load_scripted_effects(
    base: Path, mod: Path | None, replace_paths: frozenset[str] = frozenset()
) -> dict[str, list]:
    """Index ``common/scripted_effects``: effect name -> block contents."""
    effects: dict[str, list] = {}
    for path in merged_files(
        "common/scripted_effects", base, mod, replace_paths=replace_paths
    ):
        for name, block in parse_clausewitz(read_text_safe(path)):
            if name and is_block(block):
                effects[str(name)] = block
    return effects


# Tags the game's ``is_american_tag`` scripted trigger matches at the 1936
# start (used to evaluate start-time limits like Kaiserreich's open-door
# grant). Kept intentionally conservative: only tags present in a KR game.
AMERICAN_TAGS = {
    "USA", "CEN", "MEX", "CUB", "HAI", "DOM", "GUA", "ELS", "HON", "NIC",
    "COS", "PAN", "COL", "VEN", "ECU", "PRU", "BOL", "CHL", "ARG", "URG",
    "PAR", "BRA", "CAN", "IMP", "AST", "NZL",
}


def _eval_start_trigger(
    limit, scope_tag: str, all_tags: set[str], grants: dict
) -> bool:
    """Evaluate a history/effect ``limit`` block at the 1936.1.1 start.

    Supports the trigger subset start-time grants actually use: AND/OR/NOT
    lists, ``tag``/``original_tag`` membership, ``is_american_tag``,
    ``has_dlc`` (all owned DLCs count as enabled), ``has_idea`` against the
    grants collected so far, and ``date`` comparisons. Unknown triggers
    default to True (inclusive) — start grants are additions, and the known
    KR patterns are covered exactly.
    """
    if not is_block(limit):
        return True
    for key, value in limit:
        key_l = str(key).lower()
        if key_l == "and":
            return _eval_start_trigger(value, scope_tag, all_tags, grants)
        if key_l == "or":
            return any(
                _eval_start_trigger([(inner_key, inner_value)], scope_tag, all_tags, grants)
                if not is_block(inner_value)
                else _eval_start_trigger(inner_value, scope_tag, all_tags, grants)
                for inner_key, inner_value in value
            ) if is_block(value) else False
        if key_l == "not":
            return not _eval_start_trigger(value, scope_tag, all_tags, grants)
        if key_l in ("tag", "original_tag"):
            if str(value).upper() != scope_tag:
                return False
        elif key_l == "is_american_tag":
            is_american = scope_tag in AMERICAN_TAGS
            if (str(value).lower() == "yes") != is_american:
                return False
        elif key_l == "has_dlc":
            continue
        elif key_l == "has_idea":
            if str(value) not in grants.get(scope_tag, {}).get("ideas", set()):
                return False
        elif key_l == "date":
            match = re.match(r"([<>])=?\s*(\d{4})\.(\d{1,2})\.(\d{1,2})", str(value))
            if match:
                operator = match.group(1)
                target = tuple(int(part) for part in match.group(2, 3, 4)) + (0,)
                if operator == ">" and not GAME_START_DATE > target:
                    return False
                if operator == ">=" and not GAME_START_DATE >= target:
                    return False
                if operator == "<" and not GAME_START_DATE < target:
                    return False
                if operator == "<=" and not GAME_START_DATE <= target:
                    return False
        # Unknown scalar/bool triggers are treated as satisfied.
    return True


def collect_external_grants(
    country_files: list[Path],
    scripted_effects: dict[str, list],
    all_tags: set[str],
) -> dict[str, dict]:
    """Collect start-active ``add_ideas`` / ``add_dynamic_modifier`` grants
    that reach countries through scripted effects and scope switches.

    Kaiserreich grants "Member of Mitteleuropa" from GER's history via
    ``GER_add_to_mitteleuropa`` + an ``every_country`` tag list, and the
    Legation Cities hand every council member (USA, GER, ...) their
    "Fruits of the Open Door" idea via scope-switched calls
    (``USA = { LEC_add_to_legation_council = yes }`` in LEC's file). The
    regular per-country walk cannot see these, so this pre-pass walks every
    history file once with scope awareness and returns per-tag grants that
    are merged into each nation's spirit list.
    """
    grants: dict[str, dict] = {
        tag: {"ideas": set(), "dynmods": []} for tag in all_tags
    }

    def walk(items: list, scope: str, depth: int) -> None:
        if depth > 24:
            return
        pairs = list(items)
        index = 0
        total = len(pairs)
        while index < total:
            item_key, value = pairs[index]
            index += 1
            key_text = str(item_key)
            if key_text in scripted_effects:
                walk(scripted_effects[key_text], scope, depth + 1)
                continue
            if key_text in all_tags and is_block(value):
                walk(value, key_text, depth + 1)
                continue
            if key_text == "every_country" and is_block(value):
                limit = find_first(value, "limit")
                kept = [
                    (child_key, child_value)
                    for child_key, child_value in value
                    if str(child_key) != "limit"
                ]
                for tag in sorted(all_tags):
                    if _eval_start_trigger(limit, tag, all_tags, grants):
                        walk(kept, tag, depth + 1)
                continue
            if key_text == "if" and is_block(value):
                # if / else_if / else chain: walk only the first true branch.
                limit = find_first(value, "limit")
                kept = [
                    (child_key, child_value)
                    for child_key, child_value in value
                    if str(child_key) != "limit"
                ]
                matched = _eval_start_trigger(limit, scope, all_tags, grants)
                if not matched:
                    # else_if / else are siblings of the ``if`` pair; consume
                    # them one at a time until a branch matches.
                    while index < total:
                        sibling_key = str(pairs[index][0]).lower()
                        sibling_value = pairs[index][1]
                        if sibling_key == "else_if":
                            index += 1
                            sib_limit = find_first(sibling_value, "limit")
                            if _eval_start_trigger(
                                sib_limit, scope, all_tags, grants
                            ):
                                kept = [
                                    (grand_key, grand_value)
                                    for grand_key, grand_value in sibling_value
                                    if str(grand_key) != "limit"
                                ]
                                matched = True
                                break
                        elif sibling_key == "else":
                            index += 1
                            kept = (
                                sibling_value
                                if is_block(sibling_value)
                                else []
                            )
                            matched = True
                            break
                        else:
                            break
                if matched:
                    walk(kept, scope, depth + 1)
                continue
            if key_text == "add_ideas":
                if is_block(value):
                    for _, idea_id in value:
                        if idea_id:
                            grants[scope]["ideas"].add(str(idea_id))
                else:
                    grants[scope]["ideas"].add(str(value))
                continue
            if key_text == "add_dynamic_modifier" and is_block(value):
                modifier = find_first(value, "modifier")
                if modifier and str(modifier) not in grants[scope]["dynmods"]:
                    grants[scope]["dynmods"].append(str(modifier))
                continue
            if not is_block(value):
                continue
            if key_text in STATE_SCOPE_KEYS or NUMERIC_KEY_RE.match(key_text):
                continue
            date = parse_game_date(item_key)
            if date is not None:
                if date <= GAME_START_DATE:
                    walk(value, scope, depth + 1)
                continue
            walk(value, scope, depth + 1)

    for path in country_files:
        tag = path.stem.split()[0].upper() if path.stem else ""
        if not TAG_RE.match(tag):
            continue
        walk(parse_clausewitz(read_text_safe(path)), tag, 0)
    return grants


# ---------------------------------------------------------------------------
# history/states — industry + resources per owner tag
# ---------------------------------------------------------------------------

def state_start_owner(history: list) -> str | None:
    """The tag that owns this state at the 1936.1.1 game start.

    The base ``owner`` plus every start-active transfer effect:
    ``transfer_state_to = TAG`` / ``transfer_state = TAG`` (vanilla) and the
    Road-to-56 pattern ``TAG = { transfer_state = PREV }`` inside DLC-gated
    start-date blocks.
    """
    owner = find_first(history, "owner")
    owner = str(owner).upper() if owner else None
    for effect_key, effect_value in collect_start_state_effects(history):
        candidate = None
        if effect_key in ("transfer_state_to", "transfer_state") and effect_value:
            candidate = str(effect_value).upper()
        elif (
            effect_key
            and TAG_RE.match(str(effect_key))
            and is_block(effect_value)
            and find_first(effect_value, "transfer_state") is not None
        ):
            # ``NXM = { transfer_state = PREV }`` — PREV is the block's own
            # scope, i.e. the keyed tag.
            candidate = str(effect_key).upper()
        if candidate and TAG_RE.match(candidate):
            owner = candidate
    return owner


def parse_states(state_files: list[Path]):
    """Aggregate factories and resources per owner tag across all states.

    Resource amounts follow the game's own formula: every state's resources
    are multiplied by ``1 + 0.15 × infrastructure``
    (``INFRASTRUCTURE_RESOURCE_BONUS``), and refineries add 1 rubber each
    (``local_resources_rubber``; their oil line is disabled in 1.19). State
    history can also transfer ownership at game start: ``1936.1.1 = {
    transfer_state_to = SIC }`` blocks (DLC-aware) hand NCNS Chinese warlord
    states to their real owners, and dated ``buildings`` blocks add factories
    that would otherwise be missed.
    """
    aggregated: dict[str, dict] = {}
    state_count = 0
    for path in state_files:
        for key, value in parse_clausewitz(read_text_safe(path)):
            if key != "state" or not is_block(value):
                continue
            state_count += 1
            history = find_first(value, "history")
            if not is_block(history):
                continue
            owner = state_start_owner(history)
            if not owner:
                continue
            # Base buildings plus any added by start-date blocks; ownership
            # transfers inside those blocks override the base owner (handled
            # by state_start_owner above).
            building_pairs: list = []
            for effect_key, effect_value in collect_start_state_effects(history):
                if effect_key == "buildings" and is_block(effect_value):
                    for pair_key, pair_value in effect_value:
                        building_pairs.append((pair_key, pair_value))
                        # Province-scoped sub-blocks (``6521 = { landmark_x =
                        # {...} }``) hold landmarks and other per-province
                        # buildings; flatten one level so they count too.
                        if is_block(pair_value):
                            building_pairs.extend(pair_value)
            infra_level = 0
            refineries = 0
            for pair_key, pair_value in building_pairs:
                if pair_key == "infrastructure":
                    infra_level = max(infra_level, int(to_number(pair_value)))
                elif pair_key == "synthetic_refinery":
                    refineries += int(to_number(pair_value))
            entry = aggregated.setdefault(
                owner,
                {
                    "industry": dict(EMPTY_INDUSTRY),
                    "resources": dict(EMPTY_RESOURCES),
                    "refineries": 0,
                    "landmarks": set(),
                },
            )
            for pair_key, pair_value in building_pairs:
                if pair_key and str(pair_key).startswith("landmark_"):
                    entry["landmarks"].add(str(pair_key))
            for building_key, json_key in INDUSTRY_KEYS.items():
                for pair_key, pair_value in building_pairs:
                    if pair_key == building_key:
                        entry["industry"][json_key] += int(to_number(pair_value))
            entry["refineries"] += refineries
            # Resources live directly on the state block (NOT inside history).
            resources = find_first(value, "resources")
            if is_block(resources):
                multiplier = 1.0 + INFRASTRUCTURE_RESOURCE_BONUS * infra_level
                for resource_key, resource_value in resources:
                    canonical = RESOURCE_ALIASES.get(resource_key)
                    if canonical:
                        entry["resources"][canonical] += (
                            int(to_number(resource_value)) * multiplier
                        )
    # Refineries add 1 rubber each (their oil line is disabled in 1.19).
    for entry in aggregated.values():
        refineries = entry.pop("refineries", 0)
        if refineries:
            entry["resources"]["rubber"] += refineries
        entry["resources"] = {
            resource_key: round(resource_value)
            for resource_key, resource_value in entry["resources"].items()
        }
    return aggregated, state_count


def parse_landmark_modifiers(base: Path, mod: Path | None) -> dict[str, dict]:
    """Index landmark buildings' ``country_modifiers`` blocks.

    Götterdämmerung landmarks (``common/buildings/01_landmark_buildings.txt``)
    grant country modifiers to the state controller, e.g. the Eiffel Tower
    gives FRA +5% stability and the Berlin Reichstag gives GER +5%. The game
    applies them to countries that CONTROL the landmark at game start — the
    same modifiers the stability tooltip lists.
    """
    landmarks: dict[str, dict] = {}
    for path in merged_files("common/buildings", base, mod):
        root = find_first(parse_clausewitz(read_text_safe(path)), "buildings")
        if not is_block(root):
            continue
        for key, value in root:
            if not key or not is_block(value):
                continue
            country_modifiers = find_first(value, "country_modifiers")
            if not is_block(country_modifiers):
                continue
            modifiers = find_first(country_modifiers, "modifiers")
            if not is_block(modifiers):
                continue
            enable = find_first(country_modifiers, "enable_for_controllers")
            enabled_tags = {
                str(tag).upper()
                for _, tag in (enable if is_block(enable) else [])
                if tag
            }
            landmarks[str(key)] = {
                "enabled_tags": enabled_tags,
                "modifiers": modifiers,
            }
    return landmarks


# ---------------------------------------------------------------------------
# history/countries — politics, stability, war support, ideas, OOBs
# ---------------------------------------------------------------------------

def _walk_start_active(items: list, on_pair) -> None:
    """Walk history pairs, invoking ``on_pair(key, value)`` for effects that
    apply at the 1936.1.1 game start.

    - Date-keyed blocks fire their contents only when their date is at or
      before game start: ``1936.1.1 = { ... }`` blocks apply (e.g. state
      transfers to the NCNS Chinese warlords), ``1939.1.1`` blocks don't.
    - Bare numeric state-id blocks (``1032 = { ... }``) hold state-scoped
      effects and are skipped.
    - State-scope wrappers (``every_owned_state``, ``every_core_state``,
      ``random_owned_state``, ...) scope their contents to individual states;
      the whole subtree is skipped so state modifiers never leak into the
      country-level starting data.
    - ``IF = { limit = { has_dlc = ... } }`` branches count (all DLC packs
      present on disk are treated as enabled, matching the game running with
      owned DLCs) while their ``ELSE`` branches are skipped. Paradox files
      use both forms: ``ELSE`` as a child key inside ``IF`` and ``ELSE`` as
      a sibling pair. Non-DLC-gated conditionals keep both branches.
    """
    pairs = list(items)
    index = 0
    total = len(pairs)
    while index < total:
        item_key, value = pairs[index]
        if str(item_key) in STATE_SCOPE_KEYS:
            index += 1
            continue
        on_pair(item_key, value)
        if not is_block(value):
            index += 1
            continue
        date = parse_game_date(item_key)
        if date is not None:
            if date <= GAME_START_DATE:
                _walk_start_active(value, on_pair)
            index += 1
            continue
        if NUMERIC_KEY_RE.match(str(item_key)):
            index += 1
            continue
        if str(item_key).upper() == "IF":
            limit = find_first(value, "limit")
            if not is_block(limit):
                limit = []
            dlc_gated = any(
                str(limit_key).lower() == "has_dlc" for limit_key, _ in limit
            )
            negated = any(
                str(limit_key).lower() == "not"
                and is_block(limit_value)
                and any(
                    str(inner_key).lower() == "has_dlc" for inner_key, _ in limit_value
                )
                for limit_key, limit_value in limit
            )
            if dlc_gated and not negated:
                # Keep the IF branch, drop its ELSE branch (child or sibling).
                kept = [
                    (child_key, child_value)
                    for child_key, child_value in value
                    if str(child_key).upper() != "ELSE"
                ]
                _walk_start_active(kept, on_pair)
                if (
                    index + 1 < total
                    and str(pairs[index + 1][0]).upper() == "ELSE"
                ):
                    index += 1  # consume and skip the ELSE sibling
            elif negated:
                # ``IF = { limit = { NOT = { has_dlc = ... } } }`` content only
                # applies without the DLC — all owned DLCs are enabled, so
                # keep just its ELSE branch if one exists.
                else_branches = [
                    (child_key, child_value)
                    for child_key, child_value in value
                    if str(child_key).upper() == "ELSE"
                ]
                for _, else_block in else_branches:
                    if is_block(else_block):
                        _walk_start_active(else_block, on_pair)
                if (
                    index + 1 < total
                    and str(pairs[index + 1][0]).upper() == "ELSE"
                    and is_block(pairs[index + 1][1])
                ):
                    _walk_start_active(pairs[index + 1][1], on_pair)
                    index += 1
            else:
                _walk_start_active(value, on_pair)
            index += 1
            continue
        _walk_start_active(value, on_pair)
        index += 1


def _conditional_aware(items: list, key: str, extract) -> list[str]:
    """Collect entries for ``key`` that apply at the 1936 start date.

    ``extract(value)`` turns one matched value into a list of strings.
    Date blocks after game start, bare numeric state-id blocks, and
    ``has_dlc`` ``ELSE`` branches are excluded (see ``_walk_start_active``).
    """
    collected: list[str] = []

    def on_pair(item_key, value):
        if item_key == key:
            collected.extend(extract(value))

    _walk_start_active(items, on_pair)
    return collected


def collect_start_state_effects(items: list) -> list:
    """Flat effect pairs from a state-history block active at 1936.1.1.

    Used for ``history/states``: the base-level pairs plus any dated blocks
    at/before game start (``1936.1.1 = { transfer_state_to = SIC ... }``)
    with ``has_dlc`` ``ELSE`` branches dropped.
    """
    collected: list = []
    _walk_start_active(items, lambda key, value: collected.append((key, value)))
    return collected


def _scalar_values(value) -> list[str]:
    if is_block(value):
        return [str(v) for _, v in value if v]
    return [str(value)] if value else []


def collect_add_ideas(items: list) -> list[str]:
    """Collect ``add_ideas`` entries that apply at the 1936 start date.

    Scalar or block ``add_ideas`` entries count. Blocks keyed by an absolute
    game date (``1939.1.1 = { ... }``) fire later in a campaign, so they are
    skipped entirely — ideas added mid-game (e.g. SOV's ``SOV_tula_arms_plant``
    designer in 1939) must not leak into the starting spirits.
    """
    return _conditional_aware(items, "add_ideas", _scalar_values)


def collect_timed_ideas(items: list) -> list[str]:
    """Collect ``add_timed_idea`` entries that apply at the 1936 start.

    Some starting national spirits are attached as timed ideas (e.g. Turkey's
    ``TUR_first_five_year_plan`` for 837 days); they display as regular
    spirits until their timer runs out.
    """
    def extract(value) -> list[str]:
        if not is_block(value):
            return []
        idea = find_first(value, "idea")
        return [str(idea)] if idea else []

    return _conditional_aware(items, "add_timed_idea", extract)


def collect_recruits(items: list) -> list[str]:
    """Collect ``recruit_character`` entries that apply at the 1936 start.

    Same policy as ``collect_add_ideas``: dated blocks are skipped and
    ``IF has_dlc ... ELSE`` pairs keep only the DLC-enabled branch, so the
    recruit order reflects the actual game start (e.g. CHI recruits Chiang
    Kai-shek before the NCNS-``ELSE``-only Zhang Xueliang).
    """
    return _conditional_aware(items, "recruit_character", _scalar_values)


def collect_dynamic_modifiers(items: list) -> list[str]:
    """Collect ``add_dynamic_modifier.modifier`` keys applying at 1936 start.

    Modern DLC content attaches starting spirits via dynamic modifiers (e.g.
    CHI's NCNS spirits: ``add_dynamic_modifier = { modifier =
    CHI_corruption_in_the_administration }``) instead of ``add_ideas``.
    Callers filter these against known idea definitions.
    """
    def extract(value) -> list[str]:
        if not is_block(value):
            return []
        modifier = find_first(value, "modifier")
        return [str(modifier)] if modifier else []

    return _conditional_aware(items, "add_dynamic_modifier", extract)


def collect_variables(items: list) -> dict[str, float]:
    """Collect ``set_variable = { key = value }`` entries active at start.

    Dynamic-modifier effects reference these variables (e.g.
    ``consumer_goods_factor = CHI_corruption_consumer_goods``); later
    ``set_variable`` assignments win, matching document order.
    """
    variables: dict[str, float] = {}

    def on_pair(item_key, value):
        if item_key == "set_variable" and is_block(value):
            for var_key, var_value in value:
                if var_key:
                    variables[str(var_key)] = to_number(var_value)

    _walk_start_active(items, on_pair)
    return variables


def _collect_start_scalars(items: list, keys: tuple) -> dict[str, object | None]:
    """Last start-active value per scalar key (later assignments win).

    Unlike ``find_first_deep`` — which returns the FIRST occurrence and can
    grab a non-DLC fallback value — this walks the same DLC/date-aware logic
    as the rest of the scraper and keeps the last write per key, matching how
    the game applies ``set_stability``/``set_war_support`` (document order).
    """
    collected: dict[str, list] = {key: [] for key in keys}

    def on_pair(item_key, value):
        if item_key in collected:
            collected[item_key].append(value)

    _walk_start_active(items, on_pair)
    return {
        key: (values[-1] if values else None) for key, values in collected.items()
    }


def collect_created_leaders(items: list) -> list:
    """``create_country_leader`` blocks that apply at the 1936.1.1 start.

    DLC/date-aware (see ``_walk_start_active``): Kaiserreich's USA/ENG files
    create "dummy" leaders for other tags (civil-war factions) that are still
    start-active, but leaders tucked away behind future dates or disabled DLC
    branches are skipped.
    """
    found: list = []

    def on_pair(item_key, value):
        if item_key == "create_country_leader" and is_block(value):
            found.append(value)

    _walk_start_active(items, on_pair)
    return found


def collect_cosmetic_tag(items: list) -> str | None:
    """The start-active cosmetic tag (``set_cosmetic_tag``), last write wins.

    Kaiserreich names many countries through cosmetic tags (Poland ->
    ``POL_kingdom``, Austria -> ``AUS_empire``, the Ottomans ->
    ``TUR_ottoman_empire``); the game looks up loc keys under the cosmetic
    tag instead of the raw tag.
    """
    found: list = []

    def on_pair(item_key, value):
        if item_key in ("set_cosmetic_tag", "cosmetic_tag") and value:
            found.append(str(value))

    _walk_start_active(items, on_pair)
    return found[-1] if found else None


def collect_start_politics(items: list) -> tuple[list, list]:
    """Start-active ``set_politics`` / ``set_popularities`` (last write wins).

    ``find_first_deep`` would grab blocks inside ``create_dynamic_country``
    templates (Kaiserreich's Spain defines its socialist/carlist variants
    there); the start-active walk skips those and keeps DLC/date handling
    consistent with the rest of the scraper.
    """
    politics: list = []
    popularities: list = []

    def on_pair(item_key, value):
        if item_key == "set_politics" and is_block(value):
            politics.append(value)
        elif item_key == "set_popularities" and is_block(value):
            popularities.append(value)

    _walk_start_active(items, on_pair)
    return (
        politics[-1] if politics else [],
        popularities[-1] if popularities else [],
    )


def parse_country_history(path: Path) -> dict:
    items = parse_clausewitz(read_text_safe(path))
    # Country files nest many fields inside `if` / `IF ... ELSE` blocks, so
    # search depth-first (document order) rather than top-level only.
    politics, popularities = collect_start_politics(items)
    capital = find_first_deep(items, "capital")
    scalars = _collect_start_scalars(
        items,
        ("set_stability", "stability", "set_war_support", "war_support"),
    )
    stability = scalars["set_stability"]
    if stability is None:
        stability = scalars["stability"]
    war_support = scalars["set_war_support"]
    if war_support is None:
        war_support = scalars["war_support"]
    return {
        "capital": int(to_number(capital)) if capital is not None else None,
        "set_politics": politics,
        "set_popularities": popularities,
        "stability_raw": stability,
        "war_support_raw": war_support,
        "ideas": collect_add_ideas(items) + collect_timed_ideas(items),
        "dynamic_modifiers": collect_dynamic_modifiers(items),
        "variables": collect_variables(items),
        "created_leaders": collect_created_leaders(items),
        "cosmetic_tag": collect_cosmetic_tag(items),
        "recruited": collect_recruits(items),
        "land_oob": find_first_deep(items, "set_oob") or find_first_deep(items, "oob"),
        "naval_oob": find_first_deep(items, "set_naval_oob"),
        "air_oob": find_first_deep(items, "set_air_oob"),
    }


def extract_ideology(politics, popularities, variables=None, party_names=None):
    """Return ``(display_name, ruling_share, breakdown, canonical, raw)``.

    Party shares come either from ``set_politics.parties`` (nested blocks with
    ``popularity``) or from a flat top-level ``set_popularities = { democratic
    = 35 ... }`` block. The ruling party comes from ``set_politics.ruling_party``
    (``canonical`` = the four-family bucket; ``raw`` = the exact key the mod
    uses, e.g. Kaiserreich's ``social_conservative``).
    ``breakdown`` uses the game's own party keys — the four vanilla families
    in base-game files, Kaiserreich's ten parties in KR — so the dashboard
    can render the real ideology wheel. ``display_name`` is the ruling
    party's name from ``party_names`` (the ideology registry), falling back
    to the family name. Popularity values may be country-variable references
    (e.g. Iran's ``neutrality = PER_neutrality_popularity``), resolved
    through the country's starting ``set_variable`` map.
    """
    variables = variables or {}
    party_names = party_names or {}
    family_breakdown = dict(EMPTY_IDEOLOGY)
    raw_shares: dict[str, float] = {}
    ruling = find_first(politics, "ruling_party") if is_block(politics) else None
    raw_ruling = str(ruling) if ruling else None
    parties = find_first(politics, "parties") if is_block(politics) else None

    def resolve_share(value) -> float:
        if _is_numeric(value):
            return to_number(value)
        return variables.get(str(value).strip(), 0.0)

    raw_shares: dict[str, float] = {}
    if is_block(parties):
        for key, value in parties:
            canonical = PARTY_ALIASES.get(key)
            if not canonical or not is_block(value):
                continue
            popularity = resolve_share(find_first(value, "popularity"))
            share = max(0.0, min(100.0, float(popularity)))
            raw_shares[str(key)] = share
            # Several parties can share one dashboard family (Kaiserreich's
            # ten parties collapse into four), so shares must accumulate.
            family_breakdown[canonical] += int(round(share))
    elif is_block(popularities):
        for key, value in popularities:
            canonical = PARTY_ALIASES.get(key)
            if canonical:
                share = max(0.0, min(100.0, float(resolve_share(value))))
                raw_shares[str(key)] = share
                family_breakdown[canonical] += int(round(share))
    ruling_canonical = PARTY_ALIASES.get(str(ruling)) if ruling else None
    if ruling_canonical is None or family_breakdown[ruling_canonical] <= 0:
        ruling_canonical = max(
            family_breakdown, key=lambda candidate: family_breakdown[candidate]
        )
    if sum(family_breakdown.values()) <= 0:
        family_breakdown[ruling_canonical] = 100
        raw_shares[str(ruling) if ruling else ruling_canonical] = 100.0
    # The ruling share mirrors the game's highlighted party, not the family
    # bucket (KR USA: 13% social_liberal ruling within a 68% democratic
    # field), falling back to the family share when unknown.
    ruling_share = raw_shares.get(str(ruling)) if ruling else None
    if ruling_share is None or ruling_share <= 0:
        ruling_share = float(family_breakdown[ruling_canonical])
    breakdown = {
        key: int(round(share)) for key, share in raw_shares.items()
    }
    ruling_name = (
        party_names.get(str(ruling), {}).get("name")
        if ruling
        else None
    ) or PARTY_NAMES[ruling_canonical]
    return (
        ruling_name,
        int(round(ruling_share)),
        breakdown,
        ruling_canonical,
        raw_ruling,
    )


def to_percent(raw_value, default: int = 50) -> int:
    """HOI4 stores stability/war support as 0-1 fractions; convert to 0-100."""
    if raw_value is None:
        return default
    number = to_number(raw_value, default=float(default))
    if number <= 1.0:
        number *= 100.0
    return max(0, min(100, int(round(number))))


# ---------------------------------------------------------------------------
# --- history/countries — create_country_leader (starting leader) ------------

def _strip_subtype(ideology: str) -> str:
    """Kaiserreich appends ``_subtype`` to character ideologies."""
    if ideology.endswith("_subtype"):
        return ideology[: -len("_subtype")]
    return ideology


def leader_ideology_match(
    ideology, raw_ruling, ruling_canonical, sub_ideologies, ideology_parties
) -> str | None:
    """Return ``"exact"``, ``"family"`` or None for a ``country_leader`` ideology.

    Exact = the ideology is a sub-ideology of the actual ruling party
    (Kaiserreich's ``syndicalist_subtype`` under a ``syndicalist`` government).
    Family = it belongs to the same dashboard family (vanilla's
    ``conservatism`` under ``democratic``).
    """
    if not ideology:
        return None
    if raw_ruling and ideology_parties.get(ideology) == raw_ruling:
        return "exact"
    if (
        sub_ideologies.get(ideology) == ruling_canonical
        or sub_ideologies.get(_strip_subtype(ideology)) == ruling_canonical
    ):
        return "family"
    return None


# Kaiserreich's January-1936 intro events replace the placeholder
# "Assorted Leaders" council with the historical warlord within the first
# days of the game (YUN.introgame.001 on Jan 4, GXC.earlygame.802, ...). The
# in-game country screen shows these leaders for virtually the whole
# scenario, so the 1936 snapshot uses them directly.
KR_INTRO_LEADER_OVERRIDES = {
    "YUN": "YUN_tang_jiyao",
    "SZC": "SZC_yang_sen",
    "GXC": "GXC_lu_yuguang",
}

# Rare mod-authored character files comment out ``name`` AND never ship a
# matching localisation key (Novum Vexillum's Niger/Roraima). The commented-
# out literal is the only source of truth, so hardcode those fallbacks.
CHARACTER_NAME_OVERRIDES = {
    "ngr_mahamadou_issoufou": "Mahamadou Issoufou",
    "ror_neudo_campos": "Neudo Campos",
}


def resolve_starting_leader(
    created_leaders,
    character_index,
    tag,
    ruling_canonical,
    raw_ruling,
    sub_ideologies,
    ideology_parties,
    loc,
    sprites,
    recruited=None,
    base=None,
    mod=None,
    replace_paths=frozenset(),
) -> dict:
    """Resolve the 1936.1.1 starting leader across every character pool.

    Candidates come from three pools, tried in this order:

    1. ``create_country_leader`` blocks in the country history file,
    2. characters recruited via ``recruit_character`` (recruit order is the
       game's precedence), and
    3. this tag's own characters from ``common/characters`` in file order.

    Within that structure matching is tiered the way the game resolves
    leaders: an *exact* ruling-party sub-ideology first (Kaiserreich's
    ``syndicalist_subtype`` under a ``syndicalist`` government; vanilla's
    ``conservatism`` under ``democratic``), then the dashboard family
    (``social_democrat`` under ``social_liberal``), then any active leader
    role. Kaiserreich's USA/ENG files create "dummy" leaders for *other*
    tags (civil-war factions) — those never win because the true ruling
    party's exact match is found in the recruit pool first (ENG: Tom Mann
    over the GBR dummies; USA: Al Smith over Olson's non-ruling party).

    ``expire``/``activation`` dates are honoured so election candidates whose
    roles only begin at inauguration are skipped.
    """

    def parse_created(block) -> dict | None:
        if not is_block(block):
            return None
        name = find_first(block, "name")
        picture = find_first(block, "picture")
        ideology = find_first(block, "ideology")
        if not ideology:
            return None
        traits_block = find_first(block, "traits")
        portrait = None
        if picture:
            portrait = resolve_portrait(
                picture, sprites, base, mod, replace_paths=replace_paths
            )
        raw_name = str(name) if name else ""
        return {
            "name": loc.get(raw_name, raw_name),
            "portrait": portrait,
            "ideology": str(ideology),
            "expire": find_first(block, "expire"),
            "activation": find_first(block, "activation"),
            "traits": (
                [
                    str(item_key) if item_key else str(item_value)
                    for item_key, item_value in traits_block
                    if item_key or item_value
                ]
                if is_block(traits_block)
                else []
            ),
        }

    def match_quality(candidate) -> str | None:
        return leader_ideology_match(
            candidate["ideology"],
            raw_ruling,
            ruling_canonical,
            sub_ideologies,
            ideology_parties,
        )

    def active(candidate) -> bool:
        return active_at_game_start(candidate.get("expire"), candidate.get("activation"))

    def pick(candidate) -> dict:
        return {
            "name": candidate["name"],
            "portrait": candidate["portrait"],
            "traits": candidate["traits"],
        }

    created = []
    created_expired = []
    for block in created_leaders:
        candidate = parse_created(block)
        if candidate is None:
            continue
        if active(candidate):
            created.append(candidate)
        else:
            created_expired.append(candidate)
    recruited_ids = [str(item).lower() for item in (recruited or [])]
    recruits = [
        candidate
        for char_id in recruited_ids
        for candidate in character_index.get(char_id, [])
    ]
    # Kaiserreich intro-event leaders (see KR_INTRO_LEADER_OVERRIDES): the
    # named character joins the pool ahead of the placeholder council.
    override_id = KR_INTRO_LEADER_OVERRIDES.get(tag)
    if override_id:
        override_candidates = character_index.get(override_id.lower(), [])
        recruits = override_candidates + recruits
    prefix = tag.lower() + "_"
    own = [
        candidate
        for char_id, entries in character_index.items()
        if char_id.startswith(prefix)
        for candidate in entries
    ]
    pools = (("created", created), ("recruits", recruits), ("own", own))

    for match in ("exact", "family"):
        for _, pool in pools:
            for candidate in pool:
                if active(candidate) and match_quality(candidate) == match:
                    return pick(candidate)
    # No party match at all: first active leader role, then first candidate.
    for _, pool in pools:
        for candidate in pool:
            if active(candidate):
                return pick(candidate)
    # Expired created leaders as a last resort: Millennium Dawn's USA keeps
    # Bill Clinton (whose create_country_leader block carries an already-
    # passed ``expire``) as the visible 2000-start leader, and no character
    # replaces him. Match by party first, then take the first block.
    if created_expired:
        for match in ("exact", "family"):
            for candidate in created_expired:
                if match_quality(candidate) == match:
                    return pick(candidate)
        return pick(created_expired[0])
    for _, pool in pools:
        if pool:
            return pick(pool[0])
    return {"name": "", "portrait": None, "traits": []}


# --- common/characters — starting leader
# ---------------------------------------------------------------------------

def parse_game_date(value) -> tuple[int, ...] | None:
    """Parse a HOI4 date (``"1936.1.1.1"``) into a comparable tuple."""
    if value is None:
        return None
    text = str(value).strip().strip('"')
    match = _HOI4_DATE_RE.match(text)
    if not match:
        return None
    return tuple(int(group) for group in match.groups() if group is not None)


def active_at_game_start(expire=None, activation=None) -> bool:
    """True when a ``country_leader`` role is active on 1936.1.1.

    A role is active unless its ``expire`` has passed or its ``activation``
    lies in the future. Missing dates count as always-active.
    """
    expiry = parse_game_date(expire)
    if expiry is not None and expiry <= GAME_START_DATE:
        return False
    activation_date = parse_game_date(activation)
    if activation_date is not None and activation_date > GAME_START_DATE:
        return False
    return True


def resolve_portrait(
    reference,
    sprites: dict[str, str],
    base=None,
    mod=None,
    replace_paths: frozenset[str] = frozenset(),
) -> str | None:
    """Resolve a leader portrait reference to a game asset path (or None).

    References come in three flavours: a GFX sprite key (``GFX_portrait_...``),
    a direct texture path (``gfx/leaders/GER/hitler.dds``), or — Millennium
    Dawn's convention — a bare filename (``bill_clinton.dds``) stored in the
    mod's ``portraits/`` or ``gfx/leaders/`` folders.
    """
    if not reference:
        return None
    reference = str(reference)
    sprite_path = sprites.get(reference)
    if sprite_path:
        return sprite_path
    if "/" in reference or "\\" in reference:
        return reference
    name = reference.replace("\\", "/").rsplit("/", 1)[-1]
    if not name.lower().endswith((".dds", ".tga", ".png", ".jpg", ".jpeg", ".webp")):
        return None
    for template in (f"portraits/{name}", f"gfx/leaders/{name}"):
        resolved = resolve_asset(template, base, mod, replace_paths=replace_paths)
        if resolved:
            return resolved
    # Last resort: scan the game roots for the filename (cached per name).
    cache = _PORTRAIT_SCAN_CACHE.setdefault((str(base), str(mod)), {})
    if name not in cache:
        found = None
        for root in active_roots(base, mod):
            for folder in ("portraits", "gfx/leaders"):
                directory = root / folder
                if not directory.is_dir():
                    continue
                for candidate in directory.rglob(name):
                    if candidate.is_file():
                        found = candidate
                        break
                if found is not None:
                    break
            if found is not None:
                break
        cache[name] = found
    return cache[name]


_PORTRAIT_SCAN_CACHE: dict = {}


def build_character_index(character_files, loc, sprites, base=None, mod=None, replace_paths=frozenset()) -> dict[str, list[dict]]:
    """Index every ``country_leader``-capable character across all files.

    Keyed by the exact lowercased character id that ``recruit_character``
    lists reference. Character definitions often live in shared files
    (``Warlords_China.txt`` holds the Chinese warlord leaders), so the index
    spans every ``common/characters`` file, not just ``{TAG}.txt``.
    """
    index: dict[str, list[dict]] = {}
    for path in character_files:
        block = find_first(parse_clausewitz(read_text_safe(path)), "characters")
        if not is_block(block):
            continue
        for char_id, char in block:
            if not is_block(char):
                continue
            scopes = find_all(char, "instance")
            if not scopes:
                scopes = [char]
            for scope in scopes:
                if not is_block(scope):
                    continue
                raw_name = find_first(scope, "name")
                if raw_name is None:
                    raw_name = find_first(char, "name")
                if raw_name:
                    name = loc.get(str(raw_name), str(raw_name))
                else:
                    # Some mods (Novum Vexillum, The Fire Rises) comment out
                    # or omit the ``name`` field entirely and rely on the
                    # character id doubling as its localisation key.
                    name = loc.get(str(char_id), str(char_id))
                if name == str(char_id):
                    name = CHARACTER_NAME_OVERRIDES.get(
                        str(char_id).lower(), name
                    )
                portraits = find_first(scope, "portraits")
                gfx_key = None
                if is_block(portraits):
                    # Civilian portraits are the norm; some mods (Kaiserreich's
                    # GEA admiral) only ship an army/navy portrait. Council
                    # characters (KR's Princely Federation) ship only a
                    # ``small`` advisor portrait — use it as a last resort.
                    for variant_key in ("civilian", "army", "navy"):
                        variant = find_first(portraits, variant_key)
                        if is_block(variant):
                            gfx_key = find_first(variant, "large")
                            if gfx_key:
                                break
                    if gfx_key is None:
                        for variant_key in ("civilian", "army", "navy"):
                            variant = find_first(portraits, variant_key)
                            if is_block(variant):
                                gfx_key = find_first(variant, "small")
                                if gfx_key:
                                    break
                portrait = sprites.get(str(gfx_key)) if gfx_key else None
                if portrait is None and gfx_key:
                    portrait = resolve_portrait(
                        gfx_key, sprites, base, mod, replace_paths=replace_paths
                    )
                # A character can hold several ``country_leader`` roles — one
                # per ideology (Kaiserreich's Wilhelm II leads under
                # social_democrat through authoritarian_democrat). Index every
                # role so leader matching can find the right one.
                leader_blocks = find_all(scope, "country_leader")
                indexed = False
                for leader_block in leader_blocks:
                    if not is_block(leader_block):
                        continue
                    ideology = find_first(leader_block, "ideology")
                    if not ideology:
                        # Leader roles without an ideology can never match a
                        # party and are skipped.
                        continue
                    traits_block = find_first(leader_block, "traits")
                    traits = (
                        [
                            str(item_key) if item_key else str(item_value)
                            for item_key, item_value in traits_block
                            if item_key or item_value
                        ]
                        if is_block(traits_block)
                        else []
                    )
                    index.setdefault(str(char_id).lower(), []).append(
                        {
                            "name": name,
                            "portrait": portrait,
                            "ideology": str(ideology),
                            "expire": find_first(leader_block, "expire"),
                            "activation": find_first(leader_block, "activation"),
                            "traits": traits,
                        }
                    )
                    indexed = True
                if not indexed:
                    # Council-led nations (Kaiserreich's Princely Federation)
                    # have no ``country_leader`` at all: their head of state
                    # is the ``second_in_command`` advisor slot. Index it as
                    # an ideology-less fallback so it only ever wins when no
                    # real leader role exists for the tag.
                    sic_block = None
                    for advisor_block in find_all(scope, "advisor"):
                        if not is_block(advisor_block):
                            continue
                        if find_first(advisor_block, "slot") == "second_in_command":
                            sic_block = advisor_block
                            break
                    if sic_block is not None:
                        index.setdefault(str(char_id).lower(), []).append(
                            {
                                "name": name,
                                "portrait": portrait,
                                "ideology": None,
                                "expire": find_first(sic_block, "expire"),
                                "activation": find_first(sic_block, "activation"),
                                "traits": [],
                            }
                        )
    return index


def build_advisor_index(character_files: list[Path]) -> dict[str, list[str]]:
    """Map character ids (and their advisor ``idea_token``s) to trait ids.

    Advisors hired at game start contribute their traits' modifiers to the
    country (e.g. SOV's Yagoda -> ``head_of_the_nkvd_yagoda_initial`` ->
    -5% stability). Both key styles are indexed because countries hire
    advisors either by character id or by the advisor idea token.
    """
    index: dict[str, list[str]] = {}

    def record(char_key: str, traits: list[str]):
        if traits:
            index.setdefault(str(char_key).lower(), [])
            for trait_id in traits:
                if trait_id and str(trait_id).lower() not in index[str(char_key).lower()]:
                    index[str(char_key).lower()].append(str(trait_id).lower())

    for path in character_files:
        block = find_first(parse_clausewitz(read_text_safe(path)), "characters")
        if not is_block(block):
            continue
        for char_id, char in block:
            if not is_block(char):
                continue
            scopes = find_all(char, "instance")
            if not scopes:
                scopes = [char]
            for scope in scopes:
                if not is_block(scope):
                    continue
                for advisor in find_all(scope, "advisor"):
                    if not is_block(advisor):
                        continue
                    traits = find_first(advisor, "traits")
                    trait_ids = [str(k) if k else str(v) for k, v in traits] if is_block(traits) else []
                    record(char_id, trait_ids)
                    token = find_first(advisor, "idea_token")
                    if token:
                        record(token, trait_ids)
    return index



# ---------------------------------------------------------------------------
# common/ideas — national spirit definitions
# ---------------------------------------------------------------------------

def collect_idea_defs(items: list, definitions: dict) -> None:
    """Index every nested ``key = { ... }`` block (ideas live under categories)."""
    for key, value in items:
        if key and is_block(value):
            definitions.setdefault(key, value)
            collect_idea_defs(value, definitions)


def parse_idea_defs(idea_files: list[Path]) -> dict[str, list]:
    definitions: dict[str, list] = {}
    for path in idea_files:
        collect_idea_defs(parse_clausewitz(read_text_safe(path)), definitions)
    return definitions


def resolve_spirit_icon(
    idea_id,
    definition,
    sprites,
    base,
    mod,
    replace_paths: frozenset[str] = frozenset(),
) -> Path | None:
    """Find the icon texture for a national spirit idea.

    Resolution order: the idea definition's own ``icon`` / ``picture`` field
    (either a direct path or a GFX sprite name) unless it is a generic
    placeholder (``PLACEHOLDER_idea_icon``, which the game uses for hidden
    internal modifiers), then the ``GFX_idea_{id}`` sprite from
    ``interface/*.gfx``, then the conventional
    ``gfx/interface/ideas/idea_{id}`` / ``gfx/interface/ideas/{id}`` paths
    (any supported extension). Returns None when no icon exists (vanilla
    ideas share the default ``GFX_idea_unknown`` sprite and are left to the
    UI's shield fallback).
    """
    if definition:
        for field in ("icon", "picture"):
            icon = find_first(definition, field)
            if icon:
                icon_text = str(icon)
                if PLACEHOLDER_ICON_RE.search(icon_text):
                    continue
                resolved = resolve_asset(
                    icon_text, base, mod, replace_paths=replace_paths
                )
                if resolved is None:
                    # Ideas/dynamic modifiers reference GFX sprite names, with
                    # or without the ``GFX_idea_`` / ``GFX_`` prefix.
                    for sprite_key in (
                        icon_text,
                        f"GFX_idea_{icon_text}",
                        f"GFX_{icon_text}",
                    ):
                        sprite_path = sprites.get(sprite_key)
                        if sprite_path:
                            resolved = resolve_asset(
                                sprite_path, base, mod, replace_paths=replace_paths
                            )
                            if resolved:
                                break
                if resolved:
                    return resolved
    sprite = sprites.get(f"GFX_idea_{idea_id}")
    if sprite:
        resolved = resolve_asset(sprite, base, mod, replace_paths=replace_paths)
        if resolved:
            return resolved
    for template in (
        f"gfx/interface/ideas/idea_{idea_id}",
        f"gfx/interface/ideas/{idea_id}",
    ):
        resolved = resolve_asset(template, base, mod, replace_paths=replace_paths)
        if resolved:
            return resolved
    return None


def idea_is_hidden_placeholder(
    idea_id,
    definition,
    sprites,
    base,
    mod,
    replace_paths: frozenset[str] = frozenset(),
) -> bool:
    """True when the game hides this idea from the national spirits list.

    Ideas whose picture/icon is the generic placeholder sprite are internal
    modifiers (e.g. JAP's faction-balance tier ideas) and never show up in the
    spirits list — UNLESS a real ``GFX_idea_<id>`` sprite or conventional
    texture exists, which overrides the placeholder (e.g. PER's GoE resistance
    spirits use ``picture = PLACEHOLDER_idea_icon`` but ship real icons).
    """
    if not is_block(definition):
        return False
    real_picture = False
    for field in ("icon", "picture"):
        icon = find_first(definition, field)
        if icon and not PLACEHOLDER_ICON_RE.search(str(icon)):
            real_picture = True
    if real_picture:
        return False
    if sprites.get(f"GFX_idea_{idea_id}"):
        return False
    return not any(
        resolve_asset(template, base, mod, replace_paths=replace_paths)
        for template in (
            f"gfx/interface/ideas/idea_{idea_id}",
            f"gfx/interface/ideas/{idea_id}",
        )
    )


def dedupe_spirits_by_name(spirits: list[dict]) -> list[dict]:
    """Keep one spirit per display name; later DLC variants win.

    Paradox ships several variants of the same spirit (e.g. HUN's four
    Treaty of Trianon definitions, ITA's hidden idea that renames itself
    after the Military Industry dynamic modifier). The newest variant
    carries the full effect set for the enabled DLCs, so the last
    occurrence per display name wins.
    """
    by_name: dict[str, dict] = {}
    for spirit in spirits:
        name = spirit.get("name")
        if not isinstance(name, str):
            name = str(spirit.get("id") or "")
        by_name[name.casefold()] = spirit
    return list(by_name.values())


def _is_numeric(value) -> bool:
    if isinstance(value, (int, float)):
        return True
    return bool(re.fullmatch(r"[-+]?\d+(\.\d+)?", str(value).strip()))


NON_EFFECT_FIELDS = {
    # Structural fields that never express spirit effects.
    "icon", "picture", "enable", "allowed", "allowed_civil_war", "visible",
    "ai_will_do", "removal_cost", "cancellation_cost", "name", "desc",
    "default", "allowed_to_remove", "cost", "equipment_bonus", "research_bonus",
    "military_industrial_organization", "designer", "political_advisor",
    "theorist", "army_chief", "navy_chief", "air_chief", "high_command",
    "custom_modifier_tooltip", "custom_effect_tooltip", "traits", "rule",
    "available", "idea_token", "allowed_to_remove_in_civil_war", "sprite",
    "random", "disabled_ideas", "type",
}

# ---------------------------------------------------------------------------
# Modifier display metadata.
#
# The engine's percent-scaling and red/green semantics are hardcoded in the
# C++ side (``common/modifier_definitions`` only ships a stub), so the
# rules below are curated from the game's own tooltips:
#
# * ``percent``  — the raw value is a fraction shown as ``*100%``
# * ``kind=bad`` — a POSITIVE value is a malus (red in-game); negative is
#                  a bonus (green). Default is the normal "positive = good".
# ---------------------------------------------------------------------------

# Fraction values displayed as percentages despite not ending in ``_factor``
# or ``_mult`` (e.g. ``conscription = -0.003`` -> "-0.30% Recruitable
# Population", ``air_night_penalty = 0.3`` -> "+30% Night Operations Penalty").
PLAIN_PERCENT_KEYS = {
    "conscription", "attrition", "stability_weekly",
    "air_mission_efficiency", "air_cas_efficiency", "air_escort_efficiency",
    "air_intercept_efficiency", "air_superiority_efficiency", "air_nav_efficiency",
    "air_bombing_targetting", "convoy_escort_efficiency", "screening_efficiency",
    "screening_without_screens", "equipment_capture", "equipment_conversion_speed",
    "compliance_growth", "invasion_preparation", "amphibious_invasion",
    "planning_speed", "mobilization_speed", "naval_invasion_prep_speed",
    "naval_hit_chance", "naval_detection", "naval_coordination",
    "spotting_chance", "intelligence_agency_defense", "navy_visibility",
    "strategic_bomb_visibility", "non_core_manpower", "local_manpower",
    "local_factories", "local_supplies", "local_factory_energy_consumption",
    "equipment_upgrade_xp_cost", "land_equipment_upgrade_xp_cost",
    "air_equipment_upgrade_xp_cost", "license_subject_master_purchase_cost",
    "refit_ic_cost", "refit_speed", "license_production_speed",
    "agency_upgrade_time", "justify_war_goal_time", "enemy_justify_war_goal_time",
    "military_industrial_organization_funds_gain",
    "military_industrial_organization_research_bonus", "land_reinforce_rate",
    "cas_damage_reduction", "army_org_regain", "experience_gain_factor",
    "naval_has_potf_in_combat_attack", "party_popularity_stability_factor",
    "min_export", "surrender_limit", "resistance_target", "resistance_activity",
    "resistance_growth_on_our_occupied_states",
    "resistance_garrison_penetration_chance",
    "resistance_damage_to_garrison_on_our_occupied_states",
}

# Keys where a positive value hurts the country (the engine colours them red
# when positive and green when negative). Suffix/prefix rules below extend
# this set: anything that is a *cost*, *penalty*, *consumption*, *attrition*
# or *intelligence handed to others* follows the same inverted logic.
INVERTED_MODIFIER_KEYS = {
    "air_accidents_factor", "air_fuel_consumption_factor",
    "army_fuel_consumption_factor", "navy_fuel_consumption_factor",
    "factory_energy_consumption", "supply_consumption_factor",
    "out_of_supply_factor", "special_forces_out_of_supply_factor",
    "supply_combat_penalties_on_core_factor", "attrition",
    "heat_attrition_factor", "winter_attrition_factor",
    "justify_war_goal_time", "production_lack_of_resource_penalty_factor",
    "industry_air_damage_factor", "experience_loss_factor",
    "org_loss_when_moving", "strike_force_movement_org_loss",
    "consumer_goods_factor",
    "consumer_goods_expected_value", "country_resource_cost_oil",
    "country_resource_cost_rubber", "navy_visibility",
    "enemy_army_bonus_air_superiority_factor", "reassignment_duration_factor",
    "air_wing_xp_loss_when_killed_factor", "min_export",
}

# Engine-hardcoded labels the game displays even though no ``MODIFIER_...``
# localisation exists (e.g. the London Naval Treaty cost caps). Each entry
# maps the raw key to ``(label, colour kind)``.
MODIFIER_LABEL_OVERRIDES = {
    "production_cost_max_ship_hull_carrier": ("Carrier Max Cost", "neutral"),
    "production_cost_max_ship_hull_cruiser": ("Cruiser Max Cost", "neutral"),
    "production_cost_max_ship_hull_heavy": ("Heavy Ship Max Cost", "neutral"),
}


def _modifier_percent(key: str):
    """Display scale: True = fraction shown as *100%, "direct" = the raw
    value is already the percentage (``*_intel_to_others`` store -25 for
    -25%), False = plain value."""
    if key.endswith("_intel_to_others"):
        return "direct"
    if key.endswith(("_factor", "_mult", "_penalty", "_penalty_factor")):
        return True
    return key in PLAIN_PERCENT_KEYS


def _modifier_inverted(key: str) -> bool:
    """True when a positive value is a malus (red) rather than a bonus."""
    if key in INVERTED_MODIFIER_KEYS:
        return True
    return (
        key.endswith(("_cost_factor", "_penalty", "_penalty_factor",
                      "_consumption_factor", "_attrition_factor",
                      "_intel_to_others", "_to_overlord_factor", "_xp_cost"))
        or key.startswith(("training_time", "resistance_", "production_cost_"))
    )


def extract_idea_effects(definition, variables, loc, tooltips=None) -> list[dict]:
    """Extract the visible ``modifier`` effects of a spirit definition.

    Regular ideas wrap effects in a ``modifier = { ... }`` block; dynamic
    modifiers (e.g. SOV's Five Year Plan, CHI's NCNS spirits) put the effect
    keys directly on the definition. Values that reference country variables
    (``consumer_goods_factor = CHI_corruption_consumer_goods``) are resolved
    through the country's starting ``set_variable`` values; unresolved
    references evaluate to 0 at game start (e.g. GER's MEFO Bills industrial
    variables) and are dropped together with all other zero-valued effects,
    exactly like the in-game tooltip hides zero lines.

    Every effect carries display metadata. ``tooltips`` holds the game's own
    ``<key>_tt`` localisation rules (exact label, colour flag, percent scale
    and decimals); keys without one fall back to the curated
    ``_modifier_percent``/``_modifier_inverted`` tables. ``ai_*`` behaviour
    keys are hidden entirely, mirroring the game.
    """
    if not is_block(definition):
        return []
    modifier = find_first(definition, "modifier")
    if is_block(modifier):
        pairs = modifier
    else:
        # Dynamic-modifier format: effect keys sit directly on the definition.
        pairs = [
            (key, value)
            for key, value in definition
            if key and not is_block(value)
        ]
    effects: list[dict] = []
    for key, value in pairs:
        if not key or is_block(value):
            continue
        key_text = str(key)
        if key_text in NON_EFFECT_FIELDS or key_text.startswith("ai_"):
            continue
        raw = str(value).strip()
        if _is_numeric(raw):
            resolved = to_number(raw)
        else:
            # Unresolved variable references count as 0 at the 1936 start and
            # the game hides zero-valued modifier lines.
            resolved = variables.get(raw, 0.0)
        if isinstance(resolved, (int, float)) and abs(float(resolved)) < 1e-9:
            continue
        tooltip = (tooltips or {}).get(key_text)
        if tooltip:
            label = (
                loc.get(tooltip["label_key"])
                or loc.get(f"MODIFIER_{key_text.upper()}")
                or key_text
            )
            percent = tooltip["percent"]
            decimals = tooltip["decimals"]
            if tooltip["inverted"] or tooltip["always_bad"]:
                kind = "bad"
            elif tooltip["neutral"]:
                kind = "neutral"
            else:
                kind = "good"
            yellow = tooltip["yellow"]
            if yellow:
                # The game's ``Y=`` flag: positive values show in yellow
                # (no plus sign); negative values use the engine's own
                # good/bad table for the key (e.g. consumer goods lower =
                # green, recruitable population lower = red).
                kind = "bad" if _modifier_inverted(key_text) else "good"
        elif f"MODIFIER_{key_text.upper()}" in loc or key_text in MODIFIER_LABEL_OVERRIDES:
            override = MODIFIER_LABEL_OVERRIDES.get(key_text)
            label = (
                override[0]
                if override
                else (loc.get(f"MODIFIER_{key_text.upper()}") or key_text)
            )
            percent = _modifier_percent(key_text)
            decimals = None
            kind = (
                override[1]
                if override
                else ("bad" if _modifier_inverted(key_text) else "good")
            )
            yellow = False
        else:
            # No localisation at all (no `<key>_tt` tooltip entry and no
            # ``MODIFIER_<key>`` label): the game's tooltip never renders
            # this line (e.g. FRA's land_mastery_gain_factor), so skip it.
            continue
        effects.append(
            {
                "key": key_text,
                "label": label,
                "value": resolved,
                "percent": percent,
                "kind": kind,
                "decimals": decimals,
                "yellow": yellow,
            }
        )
    return effects


# ---------------------------------------------------------------------------
# history/units + common/units — armed forces
# ---------------------------------------------------------------------------

def parse_sub_unit_manpower(unit_common_files: list[Path]) -> dict[str, float]:
    """Per-battalion manpower from ``common/units/*.txt`` ``sub_units`` blocks."""
    manpower: dict[str, float] = {}
    for path in unit_common_files:
        for key, value in parse_clausewitz(read_text_safe(path)):
            if key != "sub_units" or not is_block(value):
                continue
            for sub_key, sub_value in value:
                if not is_block(sub_value):
                    continue
                amount = find_first(sub_value, "manpower")
                if amount is not None:
                    manpower[sub_key] = to_number(amount)
    return manpower


def count_grid_cells(grid) -> int:
    """Count battalion cells in a regiment grid (each cell has one x and y)."""
    coordinates = 0
    for key, _ in grid:
        if key in ("x", "y"):
            coordinates += 1
    if coordinates == 0:
        return 0
    return max(1, coordinates // 2)


def parse_unit_templates(unit_files: list[Path], sub_manpower: dict[str, float]) -> dict[str, float | None]:
    """Map division template names to manpower (None when unresolvable).

    Division templates are defined inline at the top of ``history/units``
    land OOB files (``division_template = { name = "..." regiments = {...} }``).
    Unresolvable templates fall back to a per-division default.
    """
    templates: dict[str, float | None] = {}
    for path in unit_files:
        for key, value in parse_clausewitz(read_text_safe(path)):
            if key != "division_template" or not is_block(value):
                continue
            name = find_first(value, "name")
            battalions: list[tuple[str, int]] = []
            for section in ("regiments", "support"):
                grid = find_first(value, section)
                if not is_block(grid):
                    continue
                for sub_key, cells in grid:
                    if not is_block(cells):
                        continue
                    count = count_grid_cells(cells)
                    if count > 0:
                        battalions.append((sub_key, count))
            total = 0.0
            known = False
            for sub_key, count in battalions:
                per_unit = sub_manpower.get(sub_key)
                if per_unit is not None:
                    total += per_unit * count
                    known = True
            templates[str(name) if name else ""] = total if known else None
    return templates


def iter_blocks(items, key):
    """Yield every block with the given key (case-insensitive), any depth."""
    wanted = key.lower()
    for item_key, value in items:
        if item_key and str(item_key).lower() == wanted and is_block(value):
            yield value
        if is_block(value):
            yield from iter_blocks(value, key)


def count_blocks(items, key) -> int:
    return sum(1 for _ in iter_blocks(items, key))


def naval_oob_has_pride_of_fleet(items) -> bool:
    """True when the naval OOB names a ``pride_of_the_fleet`` ship.

    The game applies the ``pride_of_the_fleet_country`` static modifier
    (+5% war support) to countries whose starting fleet marks one ship with
    ``pride_of_the_fleet = yes`` (e.g. GER's Admiral Scheer, ENG's Hood).
    """
    for ship in iter_blocks(items, "ship"):
        if find_first(ship, "pride_of_the_fleet") is not None:
            return True
    return False


def parse_land_units(path: Path, templates: dict[str, float | None]):
    """Return ``(divisions, manpower)`` for one land OOB file."""
    items = parse_clausewitz(read_text_safe(path))
    divisions = 0
    manpower = 0
    for division in iter_blocks(items, "division"):
        divisions += 1
        template_name = find_first(division, "division_template") or find_first(
            division, "template"
        )
        per_division = None
        if template_name:
            per_division = templates.get(str(template_name))
        if per_division is None:
            per_division = DEFAULT_DIVISION_MANPOWER
        factor = to_number(find_first(division, "start_manpower_factor"), default=1.0)
        if factor <= 0:
            factor = 1.0
        manpower += int(round(per_division * factor))
    return divisions, manpower


def count_aircraft(items) -> int:
    """Total planes from ``air_wings`` entries' airframe ``amount`` values."""
    total = 0
    resolved = False
    for wings in iter_blocks(items, "air_wings"):
        for _, wing in wings:
            if not is_block(wing):
                continue
            for child_key, child in wing:
                if "airframe" in str(child_key) and is_block(child):
                    amount = find_first(child, "amount")
                    if amount is not None:
                        total += int(to_number(amount))
                        resolved = True
    if resolved:
        return total
    planes = count_blocks(items, "plane")
    if planes:
        return planes
    wings_count = sum(len(wings) for wings in iter_blocks(items, "air_wings"))
    return wings_count


def find_oob_file(unit_files: list[Path], oob) -> Path | None:
    if not oob:
        return None
    wanted = str(oob).upper()
    for path in unit_files:
        if path.stem.upper() == wanted:
            return path
    return None


def find_unit_files(unit_files: list[Path], tag: str, oob) -> list[Path]:
    if oob:
        direct = find_oob_file(unit_files, oob)
        if direct:
            return [direct]
    return [
        path
        for path in unit_files
        if path.stem.upper() == tag.upper()
        or path.stem.upper().startswith(tag.upper() + "_")
    ]


# ---------------------------------------------------------------------------
# Image assets (DDS/TGA -> PNG)
# ---------------------------------------------------------------------------

def convert_image(source: Path, destination: Path) -> bool:
    """Convert a DDS/TGA/PNG image to a clean RGBA PNG. Best-effort.

    Conversion is deterministic, so an up-to-date PNG is reused instead of
    reconverting (scrapes can otherwise spend minutes on thousands of
    already-converted spirit icons).
    """
    if Image is None or imageio is None:
        return False
    try:
        source_stat = source.stat()
        if destination.exists() and destination.stat().st_mtime >= source_stat.st_mtime:
            return True
        image = _load_image(source)
        if image is None:
            return False
        image = image.convert("RGBA")
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "PNG")
        return True
    except Exception as exc:  # pragma: no cover - conversion is best-effort
        print(f"  [warn] failed to convert {source.name}: {exc}")
        return False


# Flags are upscaled to a standard width with Lanczos resampling so the
# dashboard renders them crisp instead of a stretched 82x52 (or 10x7) source.
FLAG_TARGET_WIDTH = 256


def convert_flag(source: Path, destination: Path) -> bool:
    """Convert a flag to PNG, Lanczos-upscaled to ``FLAG_TARGET_WIDTH`` px."""
    if Image is None or imageio is None:
        return False
    try:
        source_stat = source.stat()
        if destination.exists() and destination.stat().st_mtime >= source_stat.st_mtime:
            return True
        image = _load_image(source)
        if image is None:
            return False
        image = image.convert("RGBA")
        width, height = image.size
        if width > 0 and width < FLAG_TARGET_WIDTH:
            new_height = max(1, round(FLAG_TARGET_WIDTH * height / width))
            image = image.resize((FLAG_TARGET_WIDTH, new_height), Image.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "PNG")
        return True
    except Exception as exc:  # pragma: no cover - conversion is best-effort
        print(f"  [warn] failed to convert {source.name}: {exc}")
        return False


def _load_image(source: Path):
    """Open a DDS (via imageio) or Pillow-supported image file, or None."""
    suffix = source.suffix.lower()
    if suffix == ".dds":
        return Image.fromarray(imageio.imread(str(source)))
    if suffix in (".tga", ".png", ".jpg", ".jpeg", ".bmp", ".webp"):
        return Image.open(source)
    return None


# Cosmetic subject-name lookup aliases: the game's cosmetic keys sometimes
# use the overlord's country *key* instead of its tag (``RAJ_UK_democratic``,
# ``BRM_british_democratic``, ``SYR_mandate``).
OVERLORD_NAME_ALIASES = {
    "ENG": ("ENG", "UK", "british"),
    "FRA": ("FRA", "mandate"),
    "HOL": ("HOL",),
    "JAP": ("JAP",),
    "USA": ("USA",),
    "ITA": ("ITA",),
    "SOV": ("SOV",),
    "GER": ("GER",),
}
PARTY_KEY_CYCLE = ("democratic", "fascism", "communism", "neutrality")

# Dominions (CAN/AST/NZL/SAF) display their plain names in-game even though
# generic subject cosmetic keys (``$OVERLORDADJ$ Australia``) exist.
DOMINION_PLAIN_NAME_TAGS = {"CAN", "AST", "NZL", "SAF"}

# Kaiserreich's China rework displays these warlords by their short names
# ("Sichuan", "Yunnan", "Liangguang") on the map and in menus, not the
# "... Clique" party-name loc variants.
PLAIN_NAME_TAGS = {"SZC", "YUN", "GXC"}


def _party_key_order(raw_ruling, ruling_canonical) -> list[str]:
    """Preferred loc key party suffixes: the exact ruling party first.

    Vanilla names live under the four family keys (``GER_fascism``);
    total-conversion mods (Kaiserreich) use their own party keys
    (``GER_social_conservative: "German Empire"``) — and even *reuse* the
    vanilla keys for other cosmetics (``RUS_fascism`` is a puppet name in KR).
    """
    order: list[str] = []
    if raw_ruling and raw_ruling not in order:
        order.append(raw_ruling)
    canonical = PARTY_HOI4_KEY[ruling_canonical]
    if canonical not in order:
        order.append(canonical)
    for key in PARTY_KEY_CYCLE:
        if key not in order:
            order.append(key)
    return order


def resolve_country_name(tag, ruling_canonical, raw_ruling, cosmetic_tag, overlord_info, overlord_parties, loc) -> str:
    """Best display name for a country, honouring cosmetic + subject names.

    ``set_cosmetic_tag`` replaces the tag in every loc lookup (Kaiserreich:
    ``POL_kingdom``, ``AUS_empire``, ``TUR_ottoman_empire``). Subject countries
    use cosmetic keys keyed on their overlord (``RAJ_UK_democratic: "British
    Raj"``, ``MAN_JAP_fascism_autonomy_*``, ``INS_HOL: "Dutch East Indies"``,
    ``SYR_mandate``, ...). The lookup chain mirrors the game: overlord+party+
    autonomy, overlord+party, overlord, generic subject, then the country's
    own party name.
    """
    name_tag = cosmetic_tag or tag
    party_order = _party_key_order(raw_ruling, ruling_canonical)
    if overlord_info is not None and tag not in DOMINION_PLAIN_NAME_TAGS:
        overlord, autonomy = overlord_info
        alias_list = OVERLORD_NAME_ALIASES.get(overlord, (overlord,))
        ol_raw = overlord_parties.get(overlord)
        ol_canonical = PARTY_ALIASES.get(ol_raw, ruling_canonical)
        ol_order = _party_key_order(ol_raw, ol_canonical)
        keys: list[str] = []
        for alias in alias_list:
            if autonomy:
                # The autonomy state already carries the ``autonomy_`` prefix.
                keys.extend(f"{name_tag}_{alias}_{p}_{autonomy}" for p in ol_order)
            keys.extend(f"{name_tag}_{alias}_{p}" for p in ol_order)
            keys.append(f"{name_tag}_{alias}")
        keys.append(f"{name_tag}_subject")
        keys.extend((f"{name_tag}_{p}" for p in party_order))
        keys.append(name_tag)
        # Fall back to the raw tag chain (cosmetic may not define subject keys).
        keys.extend((f"{tag}_{p}" for p in party_order))
        keys.append(tag)
        for key in keys:
            value = loc.get(key)
            if value:
                adjective = loc.get(f"{overlord}_ADJ") or loc.get(overlord) or overlord
                return value.replace("$OVERLORDADJ$", adjective)
    # Own-name chain: exact ruling party first, then the plain name tag, and
    # only then the remaining party keys. Mods reuse the vanilla family keys
    # for government-change cosmetics (Kaiserreich's ``AUS_democratic`` is
    # "Republic of Austria" while the Empire's ``AUS_empire`` chain resolves
    # to "Austrian Empire"), so the plain tag must win over them. Some tags
    # (KR's Sichuan/Yunnan/Liangguang) always display their plain name.
    if tag in PLAIN_NAME_TAGS:
        plain = loc.get(f"{name_tag}_DEF") or loc.get(name_tag)
        if plain:
            return plain
    chain = (
        [f"{name_tag}_{p}" for p in party_order[:1]]
        + [name_tag]
        + [f"{name_tag}_{p}" for p in party_order[1:]]
    )
    if cosmetic_tag:
        chain += (
            [f"{tag}_{p}" for p in party_order[:1]]
            + [tag]
            + [f"{tag}_{p}" for p in party_order[1:]]
        )
    for key in chain:
        value = loc.get(key)
        if value:
            return value
    return tag


def find_flag(
    tag: str,
    party_key: str,
    base: Path,
    mod: Path | None,
    replace_paths: frozenset[str] = frozenset(),
) -> Path | None:
    """Locate the best flag for a tag, preferring the ruling-ideology flag.

    Modern HOI4 stores full-size flags per ideology (``{TAG}_fascism.tga``,
    ``{TAG}_democratic.tga``, ...); the generic ``{TAG}.tga`` only exists at
    small sizes. Resolution order: ideology flag, generic full-size flag,
    ideology/generic medium, generic small.
    """
    for template in (
        f"gfx/flags/{tag}_{party_key}",
        f"gfx/flags/{tag}",
        f"gfx/flags/medium/{tag}_{party_key}",
        f"gfx/flags/medium/{tag}",
        f"gfx/flags/small/{tag}",
    ):
        for extension in (".tga", ".dds", ".png"):
            resolved = resolve_asset(
                template + extension, base, mod, replace_paths=replace_paths
            )
            if resolved:
                return resolved
    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Scrape HOI4 game files into the dashboard scenario JSON.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--hoi4-path", required=True, help="Base HOI4 installation directory."
    )
    parser.add_argument(
        "--mod-path",
        help="Optional mod directory (or its .mod descriptor file).",
    )
    parser.add_argument(
        "--output-json",
        default="web/src/data/scenarios/vanilla_1936.json",
        help="Target JSON file (default: web/src/data/scenarios/vanilla_1936.json).",
    )
    parser.add_argument(
        "--output-assets",
        default="web/public/assets",
        help="Target image assets directory (default: web/public/assets).",
    )
    parser.add_argument(
        "--url-prefix",
        default=PUBLIC_URL_PREFIX,
        help=(
            "Public URL prefix for the generated asset links "
            f"(default: {PUBLIC_URL_PREFIX}). Use a distinct prefix for "
            "scenarios whose assets share filenames with vanilla, e.g. "
            "/assets_rt56 for Road to 56."
        ),
    )
    parser.add_argument(
        "--start-date",
        default="1936.1.1.1",
        help=(
            "Scenario start date as YYYY.M.D[.H] (default: 1936.1.1.1). "
            "Modern-day total conversions wrap their history in later "
            "date blocks — Millennium Dawn 2000.1.1, Novum Vexillum "
            "2016.6.1, The Fire Rises 2020.1.1."
        ),
    )
    args = parser.parse_args(argv)

    if Image is None or imageio is None:
        print("ERROR: Pillow and imageio are required for asset conversion.")
        print("Install them with:")
        print("    py -m pip install -r scripts/requirements.txt")
        return 1

    # The 1936.1.1 start date drives every date-gated history walk; modern
    # mods wrap their setup in their own start-date blocks.
    global GAME_START_DATE
    requested_start = parse_game_date(args.start_date)
    if requested_start is None:
        print(f"ERROR: bad --start-date {args.start_date!r} (expected YYYY.M.D[.H])")
        return 1
    GAME_START_DATE = requested_start
    print(f"Start date: {args.start_date}")

    base = Path(args.hoi4_path).resolve()
    if not base.is_dir():
        print(f"ERROR: HOI4 path not found: {base}")
        return 1

    mod = resolve_mod_dir(args.mod_path, base)
    if args.mod_path and mod is None:
        print(f"WARNING: could not resolve mod path {args.mod_path!r}; scraping base game only")
    if mod:
        print(f"Mod root: {mod}")
    replace_paths = mod_replace_paths(args.mod_path, mod)
    if replace_paths:
        print(f"Mod replace_path entries: {', '.join(sorted(replace_paths))}")
    url_prefix = args.url_prefix.rstrip("/")

    roots = active_roots(base, mod)
    print(f"Base game: {base}")
    dlc_count = len(roots) - 1 - (1 if mod else 0)
    if dlc_count:
        print(f"Mounted {dlc_count} DLC pack(s) from dlc/")

    # --- Parse the static data tables --------------------------------------
    print("Loading localisation...")
    loc = load_localisation(base, mod)

    print("Indexing scripted localisation...")
    scripted_loc = load_scripted_localisation(
        base, mod, replace_paths=replace_paths
    )
    print(f"  {len(scripted_loc)} defined_text entries")

    def display_name(loc_key, tag) -> str | None:
        """Localise a key, resolving ``[defined_text]`` bracket references.

        Handles ``[GER_army_scripted]`` (current country scope),
        ``[DEN.DEN_r56_army_disorginization_loc]`` (explicit tag scope) and
        ``[Root.getinseconname]`` (root scope) forms, including tokens
        embedded inside longer strings.
        """
        value = loc.get(str(loc_key)) if loc_key else None
        if value is None:
            return None

        def substitute(match):
            inner = match.group(1)
            # State-scoped owner adjective tokens
            # (``[1182.owner.GetAdjective] Dollar``, Millennium Dawn's
            # currency spirits) resolve to the CURRENT country's adjective:
            # the spirit belongs to this country, so the state's owner is
            # this country.
            state_owner = re.fullmatch(
                r"(\d+)\.owner\.GetAdjective", inner, re.IGNORECASE
            )
            if state_owner:
                return loc.get(f"{tag}_ADJ") or loc.get(tag) or tag
            scoped_tag = tag
            scripted_key = inner
            scoped = re.fullmatch(
                r"(?:Root|ROOT|From|FROM|This|THIS|Prev|PREV)\.(.+)", inner
            )
            if scoped:
                scripted_key = scoped.group(1)
            else:
                explicit = re.fullmatch(r"([A-Z0-9]{3})\.(.+)", inner)
                if explicit:
                    scoped_tag = explicit.group(1)
                    scripted_key = explicit.group(2)
            resolved = resolve_scripted_name(
                scripted_key, scoped_tag, scripted_loc, loc
            )
            return resolved if resolved else match.group(0)

        return re.sub(r"\[([A-Za-z0-9_\.]+)\]", substitute, value) or None

    print("Parsing modifier tooltip metadata...")
    tooltips = load_modifier_tooltips(base, mod)
    print(f"  {len(tooltips)} modifier tooltip rules")

    print("Loading GFX sprite index...")
    sprites = load_sprite_index(base, mod)
    print(f"  {len(sprites)} sprites")

    print("Parsing common/ideologies sub-ideologies...")
    sub_ideologies = load_sub_ideologies(
        base, mod, replace_paths=replace_paths
    )
    ideology_parties = load_ideology_parties(
        base, mod, replace_paths=replace_paths
    )
    print(f"  {len(sub_ideologies)} sub-ideology mappings")
    print(f"  {len(ideology_parties)} ideology -> party mappings")

    print("Parsing history/states...")
    state_files = merged_files(
        "history/states", base, mod, replace_paths=replace_paths
    )
    state_stats, state_count = parse_states(state_files)
    print(f"  {state_count} states aggregated for {len(state_stats)} owner tags")

    print("Parsing common/units sub-units...")
    sub_manpower = parse_sub_unit_manpower(merged_files("common/units", base, mod))
    print(f"  {len(sub_manpower)} sub-unit manpower values")

    print("Parsing division templates from history/units...")
    unit_files = merged_files(
        "history/units", base, mod, replace_paths=replace_paths
    )
    templates = parse_unit_templates(unit_files, sub_manpower)
    print(f"  {len(templates)} division templates")

    print("Parsing common/ideas + dynamic modifiers...")
    idea_defs = parse_idea_defs(
        merged_files("common/ideas", base, mod, replace_paths=replace_paths)
    )
    dynamic_defs = parse_idea_defs(
        merged_files(
            "common/dynamic_modifiers", base, mod, replace_paths=replace_paths
        )
    )
    # Dynamic modifiers (e.g. CHI's NCNS starting spirits) are displayed as
    # national spirits in-game; regular idea definitions win shared keys.
    spirit_defs = dict(dynamic_defs)
    spirit_defs.update(idea_defs)
    print(f"  {len(idea_defs)} idea + {len(dynamic_defs)} dynamic-modifier definitions")

    print("Parsing common/country_leader traits...")
    trait_defs = parse_idea_defs(
        merged_files(
            "common/country_leader", base, mod, replace_paths=replace_paths
        )
    )
    print(f"  {len(trait_defs)} leader trait definitions")

    print("Parsing landmark country modifiers...")
    landmark_defs = parse_landmark_modifiers(base, mod)
    print(f"  {len(landmark_defs)} landmark definitions")

    character_files = merged_files(
        "common/characters", base, mod, replace_paths=replace_paths
    )
    print("Indexing common/characters...")
    character_index = build_character_index(
        character_files, loc, sprites, base, mod, replace_paths=replace_paths
    )
    advisor_index = build_advisor_index(character_files)
    print(f"  {sum(len(entries) for entries in character_index.values())} country-leader candidates indexed")
    print(f"  {len(advisor_index)} advisor trait entries indexed")

    print("Indexing common/scripted_effects...")
    scripted_effects = load_scripted_effects(
        base, mod, replace_paths=replace_paths
    )
    print(f"  {len(scripted_effects)} scripted effects")

    print("Building ideology registry...")
    ideology_registry = load_ideology_info(
        base, mod, loc, replace_paths=replace_paths
    )
    print(
        "  ideologies: "
        + ", ".join(f"{key} ({info['name']})" for key, info in ideology_registry.items())
    )

    output_assets = Path(args.output_assets)
    flags_dir = output_assets / "flags"
    portraits_dir = output_assets / "portraits"
    spirits_dir = output_assets / "spirits"

    # --- Scrape each country ------------------------------------------------
    countries = merged_files(
        "history/countries", base, mod, replace_paths=replace_paths
    )
    nations: dict[str, dict] = {}
    asset_counts = {"flags": 0, "portraits": 0, "spirits": 0}
    skipped = 0

    # Pre-pass: subject->overlord mapping (for cosmetic subject names like
    # "British Raj") and every country's ruling party.
    overlords: dict[str, tuple[str, str | None]] = {}
    overlord_parties: dict[str, str] = {}
    all_tags: set[str] = set()
    for path in countries:
        tag = path.stem.split()[0].upper() if path.stem else ""
        if not TAG_RE.match(tag):
            continue
        all_tags.add(tag)
        items = parse_clausewitz(read_text_safe(path))

        def on_pair(item_key, value):
            if item_key == "set_autonomy" and is_block(value):
                target = find_first(value, "target")
                if target:
                    autonomy = find_first(value, "autonomous_state")
                    overlords[str(target).upper()] = (
                        tag,
                        str(autonomy) if autonomy else None,
                    )
            elif item_key == "puppet" and value:
                overlords[str(value).upper()] = (tag, None)

        _walk_start_active(items, on_pair)
        politics, popularities = collect_start_politics(items)
        _, _, _, ruling, raw_ruling = extract_ideology(
            politics,
            popularities,
            collect_variables(items),
            party_names=ideology_registry,
        )
        overlord_parties[tag] = raw_ruling or PARTY_HOI4_KEY[ruling]

    # External spirit grants: scripted effects called from history files can
    # add ideas/dynamic modifiers to *other* countries (Kaiserreich's
    # Mitteleuropa membership and Legation Cities open-door ideas).
    external_grants = collect_external_grants(
        countries, scripted_effects, all_tags
    )
    grant_counts = sum(
        len(grant["ideas"]) + len(grant["dynmods"])
        for grant in external_grants.values()
    )
    print(f"  External scripted-effect grants: {grant_counts} across {len(external_grants)} tags")

    for path in countries:
        tag = path.stem.split()[0].upper() if path.stem else ""
        if not TAG_RE.match(tag):
            skipped += 1
            continue

        history = parse_country_history(path)
        # Trial of Allegiance grants the Monroe Doctrine spirit to every 1936
        # country whose capital lies in the Americas (USA gets the enforcer
        # variant from its own history instead).
        if (
            tag in MONROE_DOCTRINE_TAGS
            and MONROE_DOCTRINE_IDEA in spirit_defs
            and MONROE_DOCTRINE_IDEA not in history["ideas"]
        ):
            history["ideas"].append(MONROE_DOCTRINE_IDEA)
        ideology_name, ruling_share, breakdown, ruling_canonical, raw_ruling = extract_ideology(
            history["set_politics"],
            history["set_popularities"],
            history["variables"],
            party_names=ideology_registry,
        )
        # Starting leader: created leaders, then the recruited character
        # pool, honouring recruit_character order, exact ruling-party
        # ideologies and expire/activation dates so the true 1936 leader wins.
        leader = resolve_starting_leader(
            history["created_leaders"],
            character_index,
            tag,
            ruling_canonical,
            raw_ruling,
            sub_ideologies,
            ideology_parties,
            loc,
            sprites,
            recruited=history["recruited"],
            base=base,
            mod=mod,
            replace_paths=replace_paths,
        )

        # National spirits from add_ideas + DLC dynamic modifiers + common/ideas
        # + localisation. Only entries defined as real ideas/dynamic modifiers
        # count — ``add_ideas`` can also reference CHARACTERS (political
        # advisors like SOV_genrikh_yagoda), which are not spirits. Generic
        # economy/trade/conscription laws are excluded, duplicates removed,
        # and the list is capped at MAX_SPIRITS starting spirits.
        spirits = []
        seen_spirits = set()
        grants = external_grants.get(tag, {})
        spirit_candidates = (
            list(history["ideas"])
            + list(grants.get("ideas", []))
            + [
                modifier
                for modifier in history["dynamic_modifiers"]
                if modifier in spirit_defs
            ]
            + [
                modifier
                for modifier in grants.get("dynmods", [])
                if modifier in spirit_defs
            ]
        )
        for idea_id in spirit_candidates:
            if idea_id in seen_spirits or idea_id in LAW_IDEAS:
                continue
            if idea_id not in spirit_defs:
                continue  # a character (advisor), not a spirit
            seen_spirits.add(idea_id)
            if len(spirits) >= MAX_SPIRITS:
                break
            definition = spirit_defs.get(idea_id)
            # Hidden internal modifiers (picture = PLACEHOLDER_idea_icon with
            # no real GFX sprite, e.g. JAP's faction-balance tier ideas) never
            # appear in the in-game spirits list.
            if is_block(definition) and idea_is_hidden_placeholder(
                idea_id, definition, sprites, base, mod, replace_paths=replace_paths
            ):
                continue
            # Design-company ideas (research_bonus/equipment_bonus without a
            # modifier block, e.g. Turkey's Debt Council industrial concern)
            # live in the Companies tab, never in the national spirit list.
            if (
                is_block(definition)
                and not is_block(find_first(definition, "modifier"))
                and (
                    find_first(definition, "research_bonus") is not None
                    or find_first(definition, "equipment_bonus") is not None
                    or find_first(definition, "designer") is not None
                )
            ):
                continue
            # Hidden alias ideas (``*_ns`` / ``*_fake_ns``) rename themselves
            # after the real spirit they communicate effects for and never
            # show up as their own national spirit.
            if re.search(r"_(fake_)?ns$", idea_id):
                name_key = find_first(definition, "name") if is_block(definition) else None
                if name_key and str(name_key) in spirit_defs:
                    continue
            # Some ideas override their display name via a ``name`` field
            # (e.g. ``trotskyite_plot_nsb`` -> ``trotskyite_plot``). The
            # resolved chain must always end in a string: mod ideas can
            # reference name keys that no loaded localisation defines.
            name_key = find_first(definition, "name") if is_block(definition) else None
            spirit = {
                "id": idea_id,
                "name": (
                    display_name(name_key, tag)
                    or display_name(idea_id, tag)
                    or idea_id
                ),
                "description": (
                    loc.get(f"{name_key}_desc")
                    if name_key
                    else ""
                ) or loc.get(f"{idea_id}_desc") or "",
            }
            effects = extract_idea_effects(definition, history["variables"], loc, tooltips)
            if effects:
                spirit["effects"] = effects
            # Spirit traits (e.g. ENG's george_v -> popular_figurehead): the
            # game lists the trait name plus the trait's own modifier effects.
            traits_block = find_first(definition, "traits") if is_block(definition) else None
            if is_block(traits_block):
                spirit_traits = []
                for _, trait_id in traits_block:
                    if not trait_id:
                        continue
                    trait_id = str(trait_id)
                    trait_def = trait_defs.get(trait_id)
                    trait_effects = (
                        extract_idea_effects(trait_def, history["variables"], loc, tooltips)
                        if is_block(trait_def)
                        else []
                    )
                    spirit_traits.append(
                        {
                            "id": trait_id,
                            "name": display_name(trait_id, tag) or trait_id,
                            "effects": trait_effects,
                        }
                    )
                if spirit_traits:
                    spirit["traits"] = spirit_traits
            icon_source = resolve_spirit_icon(
                idea_id, definition, sprites, base, mod,
                replace_paths=replace_paths,
            )
            if icon_source and convert_image(icon_source, spirits_dir / f"{idea_id}.png"):
                spirit["iconUrl"] = f"{url_prefix}/spirits/{idea_id}.png"
                asset_counts["spirits"] += 1
            spirits.append(spirit)

        spirits = dedupe_spirits_by_name(spirits)

        # Stability & war support: the in-game politics tooltip shows the
        # base value (set_stability / set_war_support) plus every start-active
        # modifier source — the ruling leader's traits, all starting
        # ideas/dynamic modifiers (including generic laws and hidden alias
        # ideas like SOV's trotskyite_plot_nsb), spirit traits (ENG's
        # popular_figurehead), hired advisors' traits (SOV's Yagoda), built
        # landmarks (FRA's Eiffel Tower, GER's Reichstag, ...), the
        # pride-of-the-fleet +5% war support, and the ruling-party-popularity
        # stability bonus (share * BASE_STABILITY_PARTY_POPULARITY_FACTOR).
        # The game floors the displayed value.
        stability_mod = 0.0
        war_support_mod = 0.0

        def add_trait_effects(trait_id) -> None:
            nonlocal stability_mod, war_support_mod
            definition = trait_defs.get(str(trait_id))
            if not is_block(definition):
                return
            for effect in extract_idea_effects(
                definition, history["variables"], loc, tooltips
            ):
                if effect["key"] == "stability_factor":
                    stability_mod += float(effect["value"])
                elif effect["key"] == "war_support_factor":
                    war_support_mod += float(effect["value"])

        modifier_sources = list(history["ideas"]) + [
            modifier
            for modifier in history["dynamic_modifiers"]
            if modifier in spirit_defs
        ]
        for idea_id in set(modifier_sources):
            definition = spirit_defs.get(idea_id)
            if is_block(definition):
                for effect in extract_idea_effects(
                    definition, history["variables"], loc, tooltips
                ):
                    if effect["key"] == "stability_factor":
                        stability_mod += float(effect["value"])
                    elif effect["key"] == "war_support_factor":
                        war_support_mod += float(effect["value"])
                # Spirit traits (e.g. ENG's King George V -> popular_figurehead).
                traits_block = find_first(definition, "traits")
                if is_block(traits_block):
                    for _, trait_id in traits_block:
                        if trait_id:
                            add_trait_effects(trait_id)
            else:
                # Character hired via add_ideas (e.g. SOV's NKVD chief): the
                # advisor role's traits apply to the country.
                for trait_id in advisor_index.get(str(idea_id).lower(), []):
                    add_trait_effects(trait_id)
        for trait_id in leader.get("traits") or []:
            add_trait_effects(trait_id)
        # Landmarks built in states owned by this country at game start.
        for landmark_id in state_stats.get(tag, {}).get("landmarks", set()):
            landmark = landmark_defs.get(landmark_id)
            if not landmark:
                continue
            if landmark["enabled_tags"] and tag not in landmark["enabled_tags"]:
                continue
            stab = find_first(landmark["modifiers"], "stability_factor")
            if stab is not None:
                stability_mod += to_number(stab)
            ws = find_first(landmark["modifiers"], "war_support_factor")
            if ws is not None:
                war_support_mod += to_number(ws)
        # Ruling party popularity bonus: +0% at 0% popularity up to +15% at
        # 100% popularity.
        stability_mod += (
            max(0, min(100, ruling_share)) / 100.0
        ) * BASE_STABILITY_PARTY_POPULARITY_FACTOR

        # The naval OOB is parsed once: ship count for the Armed Forces card
        # plus the pride-of-the-fleet check for the war-support bonus.
        naval_path = find_oob_file(unit_files, history["naval_oob"])
        naval_items = None
        if naval_path:
            naval_items = parse_clausewitz(read_text_safe(naval_path))
            ships = count_blocks(naval_items, "ship")
            if naval_oob_has_pride_of_fleet(naval_items):
                war_support_mod += PRIDE_OF_THE_FLEET_WAR_SUPPORT
        else:
            ships = 0

        # Flag: prefer the ruling-ideology full-size flag, Lanczos-upscaled.
        flag_url = ""
        party_key = raw_ruling or PARTY_HOI4_KEY[ruling_canonical]
        flag_source = find_flag(
            tag, party_key, base, mod, replace_paths=replace_paths
        )
        if flag_source and convert_flag(flag_source, flags_dir / f"{tag}.png"):
            flag_url = f"{url_prefix}/flags/{tag}.png"
            asset_counts["flags"] += 1

        # Leader portrait.
        portrait_url = ""
        if leader["portrait"]:
            portrait_source = resolve_asset(
                leader["portrait"], base, mod, replace_paths=replace_paths
            )
            if portrait_source and convert_image(portrait_source, portraits_dir / f"{tag}.png"):
                portrait_url = f"{url_prefix}/portraits/{tag}.png"
                asset_counts["portraits"] += 1

        # Armed forces.
        divisions = 0
        manpower = 0
        for land_path in find_unit_files(unit_files, tag, history["land_oob"]):
            file_divisions, file_manpower = parse_land_units(land_path, templates)
            divisions += file_divisions
            manpower += file_manpower

        planes = 0
        air_path = find_oob_file(unit_files, history["air_oob"])
        if air_path:
            planes = count_aircraft(parse_clausewitz(read_text_safe(air_path)))

        stats = state_stats.get(tag, {})
        industry = stats.get("industry", dict(EMPTY_INDUSTRY))
        resources = stats.get("resources", dict(EMPTY_RESOURCES))

        # Country display name: subject cosmetic names first ("British Raj",
        # "Dutch East Indies", "Manchukuo"), then the ruling-ideology key.
        leader_name = leader["name"] or ""
        bracket_name = re.fullmatch(r"\[([A-Za-z0-9_\.]+)\]", leader_name)
        if bracket_name:
            resolved_name = resolve_scripted_name(
                bracket_name.group(1), tag, scripted_loc, loc
            )
            if resolved_name:
                leader_name = resolved_name
        nation: dict = {
            "name": resolve_country_name(
                tag,
                ruling_canonical,
                raw_ruling,
                history["cosmetic_tag"],
                overlords.get(tag),
                overlord_parties,
                loc,
            ),
            "tag": tag,
            "flagUrl": flag_url,
            "leader": {"name": leader_name, "portraitUrl": portrait_url},
            "ideology": {
                "name": ideology_name,
                "rulingPartyShare": ruling_share,
                "breakdown": breakdown,
            },
            "stability": max(
                0,
                min(
                    100,
                    int(
                        (
                            to_number(history["stability_raw"], default=0.5)
                            + stability_mod
                        )
                        * 100
                    ),
                ),
            ),
            "warSupport": max(
                0,
                min(
                    100,
                    int(
                        (
                            to_number(history["war_support_raw"], default=0.5)
                            + war_support_mod
                        )
                        * 100
                    ),
                ),
            ),
            "nationalSpirits": spirits,
            "industry": industry,
            "resources": resources,
            "armedForces": {
                "divisions": divisions,
                "fieldManpower": manpower,
                "totalWarships": ships,
                "totalAircraft": planes,
            },
        }
        # Extra field extracted from history/countries (not part of the web
        # TypeScript interface — harmless there, useful for tooling).
        if history["capital"] is not None:
            nation["capital"] = history["capital"]
        nations[tag] = nation

    # --- Write output --------------------------------------------------------
    output_json = Path(args.output_json)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(
        json.dumps(
            {
                "nations": nations,
                "ideologies": ideology_registry,
            },
            indent=2,
            ensure_ascii=False,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"Nations scraped: {len(nations)} (skipped {skipped} non-country files)")
    print(
        f"Assets converted: flags={asset_counts['flags']}, "
        f"portraits={asset_counts['portraits']}, spirits={asset_counts['spirits']}"
    )
    print(f"Wrote {output_json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

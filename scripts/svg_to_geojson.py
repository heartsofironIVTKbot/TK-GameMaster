"""Convert a Hearts of Iron IV state map SVG into a nation-level GeoJSON.

Parses a mapchart SVG (default ``scripts/raw_assets/vanilla.svg``, falling back
to ``1936.svg`` / ``MapChart_Map.svg``) locally with ``xml.etree.ElementTree``,
extracts every ``<path>`` element, and resolves each path's owner tag through
``scripts/vanilla_mapping.json`` (``"state_<id>": "TAG"``). Game-derived SVGs
from ``scripts/build_state_map_svg.py`` (``id="state_<id>"`` paths plus an
``id="ocean"`` background path) match directly against the mapping; the ocean
path's bbox is exported as the FeatureCollection's ``world_bounds``.

Because mapchart path ids are state *names* while the mapping is keyed by
numeric state ids, a name bridge resolves ids through the vanilla state files
in ``scripts/hoi4_files/vanilla/`` (``<id>-<Name>.txt`` filenames plus ``# Name``
comments) and, when present, the mapchart save config in
``scripts/raw_assets/mapchartSave*.txt`` (used to constrain fuzzy matches by
country). Optional manual mappings in ``scripts/mapchart_overrides.json``
(``{"Warszawa": "state_10"}``) are applied before the name bridge and always
win. Every path ends up tagged: paths the name bridge cannot match fall back
to their mapchart save-config country label's majority tag, then to the
nearest tagged neighbor — zero states are left grey.

Each path's ``d`` attribute is converted into flat 2D polygon coordinates.
SVG y grows downward, but Leaflet's ``L.CRS.Simple`` projects latitude onto
``-screen_y``, so every Y coordinate is flipped (``y' = max_y - y``) before
writing — the output GeoJSON is y-up and renders right-side up in Leaflet.

The output is a **nation-level** FeatureCollection: state polygons are grouped
by owner tag and merged (shapely ``unary_union`` when available, otherwise a
combined MultiPolygon) into one Feature per nation with properties
``{tag, name, slot_key, color}``. ``color`` comes from the base-game
``raw_assets/nation_colors/colors.txt`` (``rgb { R G B }`` converted to
``#RRGGBB``), falling back to the mapchart SVG fill for custom tags.

Only the Python standard library is required; shapely is used opportunistically.
"""

import argparse
import json
import math
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from xml.etree import ElementTree as ET

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

INPUT_FILE = SCRIPT_DIR / "raw_assets" / "vanilla.svg"
# Fallback inputs when vanilla.svg is not present (same geometry).
INPUT_FALLBACKS = [
    SCRIPT_DIR / "raw_assets" / "1936.svg",
    SCRIPT_DIR / "raw_assets" / "MapChart_Map.svg",
]
MAPPING_FILE = SCRIPT_DIR / "vanilla_mapping.json"
OUTPUT_FILE = PROJECT_ROOT / "web" / "public" / "maps" / "vanilla.geojson"
VANILLA_STATES_DIR = SCRIPT_DIR / "hoi4_files" / "vanilla"
# Optional manual mappings from mapchart path ids to state ids, applied before
# the name bridge (e.g. {"Warszawa": "state_10"}).
OVERRIDES_FILE = SCRIPT_DIR / "mapchart_overrides.json"
# Tag -> playable country name (also used as the reservation slot key).
TAG_META_FILE = PROJECT_ROOT / "web" / "src" / "lib" / "tag_to_slot.json"
# Base-game country tables: colors.txt maps tags to their HOI4 map colors
# (``rgb { R G B }`` / ``HSV { H S V }``), 00_countries.txt maps tags to
# country file names.
NATION_COLORS_DIR = SCRIPT_DIR / "raw_assets" / "nation_colors"
COLORS_FILE = NATION_COLORS_DIR / "colors.txt"
COUNTRIES_FILE = NATION_COLORS_DIR / "00_countries.txt"

# The seven major powers. Their base-game color is always preserved when
# deduplicating nation colors (a reserved major opens the Co-Op flow in the UI).
MAJOR_TAGS = ("GER", "SOV", "USA", "ENG", "FRA", "ITA", "JAP")

# Ownerless states: mod authors deliberately void states for balance/lag.
# They are exported as one grey, non-interactive "Void" feature and are
# NEVER fuzzy-matched to a neighbour.
VOID_TAG = "VOID"
VOID_NAME = "Void"
VOID_COLOR = "#4b5563"

# Background path emitted by scripts/build_state_map_svg.py: spans the full
# world rectangle. Excluded from state matching/features; its bbox becomes
# the FeatureCollection's ``world_bounds`` so the frontend fits the whole
# world (ocean included) instead of the land extent.
OCEAN_PATH_ID = "ocean"

# Paths nested in these containers are decorative and are never exported.
SKIP_CONTAINERS = {"defs", "pattern", "clippath", "mask", "metadata"}

# --- SVG path "d" attribute parsing -------------------------------------

# One token per command letter or number. Numbers may be signed, decimal, or
# scientific (e.g. "-2.45", ".04", "1e-3").
TOKEN_RE = re.compile(
    r"([AaCcHhLlMmQqSsTtVvZz])|([-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?)"
)

# Commands: (parameter count, implicit command when the command repeats
# without being restated, e.g. "l 1 2 3 4" == "l 1 2" then "l 3 4").
CUBIC_STEPS = 8
QUAD_STEPS = 6
ARC_MIN_STEPS = 8
ARC_MAX_STEP_RAD = math.pi / 12  # at most ~15 degrees per arc segment

STATE_ID_RE = re.compile(r"(?i)^state[\s_\-]*(\d+)$")

# Mapchart emits no-op moveto continuations ("m0 0", "m.01 0") that split a
# single state outline into multiple subpaths. A moveto landing within this
# distance of the current point — while the current ring is still open (no Z)
# — is a continuation of the same outline, not a new ring. Treating it as a
# new ring parses the real outline as a ring nested inside its continuation,
# which later becomes a hole (the Chihuahua/Mexico void bug). Real subpaths
# in this SVG either close with Z first or start >= 0.5 units away.
MOVE_CONT_EPSILON = 0.5

# --- State name bridge ----------------------------------------------------

# State file names look like "1-France.txt", "1013 -Musamdam.txt", or
# "1014 - Bahrain.txt".
STATE_FILE_RE = re.compile(r"^(\d+)\s*-\s*(.+)\.txt$", re.IGNORECASE)

# Display names appear as comments after the localization key, the id, or the
# opening brace, e.g. ``name="STATE_1" # Corsica``.
NAME_COMMENT_RE = re.compile(r'(?m)^\s*name\s*=\s*"[^"]*"\s*#\s*(.+?)\s*$')
ID_COMMENT_RE = re.compile(r'(?m)^\s*id\s*=\s*\d+\s*#\s*(.+?)\s*$')
STATE_COMMENT_RE = re.compile(r'(?m)^\s*state\s*=\s*\{?\s*#\s*(.+?)\s*$')
ANY_COMMENT_RE = re.compile(r"(?m)#\s*(.+?)\s*$")

# Mapchart sometimes uses Japanese direction prefixes where the vanilla state
# files use English words.
DIRECTION_SYNONYMS = {"kita": "north", "minami": "south", "higashi": "east", "nishi": "west"}

# Confidence thresholds for the fuzzy fallback stage.
FUZZY_MIN_RATIO = 0.75
FUZZY_MIN_GAP = 0.06


def normalize_state_name(name):
    """Fold a state name for comparison: strip diacritics, lowercase, and
    collapse punctuation to spaces ("Alsace_Lorraine" -> "alsace lorraine")."""
    name = unicodedata.normalize("NFKD", name)
    name = "".join(char for char in name if not unicodedata.combining(char))
    words = re.sub(r"[^a-z0-9]+", " ", name.lower()).split()
    return " ".join(DIRECTION_SYNONYMS.get(word, word) for word in words)


def parse_state_id(value):
    """Parse an override value (``"state_10"``, ``"10"``, or ``10``) to an int."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        match = STATE_ID_RE.match(value.strip())
        if match:
            return int(match.group(1))
        if value.strip().isdigit():
            return int(value.strip())
    return None


def _local_name(tag):
    """Strip XML namespaces from an ElementTree tag (e.g. ``{svg}path``)."""
    return tag.rsplit("}", 1)[-1].lower() if tag.startswith("{") else tag.lower()


def _point(coords, x, y, relative):
    """Return an absolute point from a 2-value coordinate chunk."""
    dx, dy = coords
    return (x + dx, y + dy) if relative else (dx, dy)


def _finalize_ring(ring, start):
    """Close a ring by appending its start point when missing."""
    if len(ring) >= 3 and ring[-1] != start:
        ring.append(start)
    return ring


def _sample_cubic(p0, c1, c2, p1, steps=CUBIC_STEPS):
    points = []
    for k in range(1, steps + 1):
        t = k / steps
        mt = 1.0 - t
        points.append((
            mt**3 * p0[0] + 3.0 * mt**2 * t * c1[0] + 3.0 * mt * t**2 * c2[0] + t**3 * p1[0],
            mt**3 * p0[1] + 3.0 * mt**2 * t * c1[1] + 3.0 * mt * t**2 * c2[1] + t**3 * p1[1],
        ))
    return points


def _sample_quad(p0, c, p1, steps=QUAD_STEPS):
    points = []
    for k in range(1, steps + 1):
        t = k / steps
        mt = 1.0 - t
        points.append((
            mt**2 * p0[0] + 2.0 * mt * t * c[0] + t**2 * p1[0],
            mt**2 * p0[1] + 2.0 * mt * t * c[1] + t**2 * p1[1],
        ))
    return points


def _sample_arc(x1, y1, rx, ry, phi_deg, large_arc, sweep, x2, y2):
    """Flatten an SVG elliptical arc into sampled points.

    Implements the endpoint-to-center parameterization from the SVG 1.1 spec
    (section F.6.5) and then samples the arc into a polyline.
    """
    if (x1 == x2 and y1 == y2) or rx == 0.0 or ry == 0.0:
        return [(x2, y2)]

    rx, ry = abs(rx), abs(ry)
    phi = math.radians(phi_deg % 360.0)
    cos_phi, sin_phi = math.cos(phi), math.sin(phi)

    # Step 1: move to a coordinate system centered on the chord midpoint.
    dx2, dy2 = (x1 - x2) / 2.0, (y1 - y2) / 2.0
    x1p = cos_phi * dx2 + sin_phi * dy2
    y1p = -sin_phi * dx2 + cos_phi * dy2

    # Radii correction: scale up radii that are too small for the chord.
    scale = math.sqrt(max(0.0, (x1p / rx) ** 2 + (y1p / ry) ** 2))
    if scale > 1.0:
        rx *= scale
        ry *= scale

    # Step 2: compute the center in the rotated coordinate system.
    rx2, ry2 = rx * rx, ry * ry
    x1p2, y1p2 = x1p * x1p, y1p * y1p
    numerator = rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2
    denominator = rx2 * y1p2 + ry2 * x1p2
    coef = math.sqrt(numerator / denominator) if denominator else 0.0
    if bool(large_arc) == bool(sweep):
        coef = -coef
    cxp = coef * (rx * y1p / ry)
    cyp = -coef * (ry * x1p / rx)
    cx = cos_phi * cxp - sin_phi * cyp + (x1 + x2) / 2.0
    cy = sin_phi * cxp + cos_phi * cyp + (y1 + y2) / 2.0

    # Step 3: start angle and sweep angle.
    def angle_between(ux, uy, vx, vy):
        denom = math.hypot(ux, uy) * math.hypot(vx, vy)
        if denom == 0.0:
            return 0.0
        value = max(-1.0, min(1.0, (ux * vx + uy * vy) / denom))
        angle = math.acos(value)
        return -angle if (ux * vy - uy * vx) < 0.0 else angle

    ux, uy = (x1p - cxp) / rx, (y1p - cyp) / ry
    vx, vy = (-x1p - cxp) / rx, (-y1p - cyp) / ry
    theta1 = angle_between(1.0, 0.0, ux, uy)
    delta = angle_between(ux, uy, vx, vy)
    if not sweep and delta > 0.0:
        delta -= 2.0 * math.pi
    elif sweep and delta < 0.0:
        delta += 2.0 * math.pi

    steps = max(ARC_MIN_STEPS, math.ceil(abs(delta) / ARC_MAX_STEP_RAD))
    points = []
    for k in range(1, steps + 1):
        theta = theta1 + delta * k / steps
        points.append((
            cx + rx * math.cos(theta) * cos_phi - ry * math.sin(theta) * sin_phi,
            cy + rx * math.cos(theta) * sin_phi + ry * math.sin(theta) * cos_phi,
        ))
    return points


def parse_d(d):
    """Parse an SVG path ``d`` string into a list of rings of ``(x, y)`` points."""
    tokens = TOKEN_RE.findall(d or "")
    rings = []
    ring = None
    x = y = 0.0
    start = (0.0, 0.0)
    prev_cubic_ctrl = None
    prev_quad_ctrl = None
    index = 0

    while index < len(tokens):
        command, _ = tokens[index]
        index += 1

        if command in "Zz":
            if ring is not None:
                rings.append(_finalize_ring(ring, start))
                ring = None
            x, y = start
            prev_cubic_ctrl = prev_quad_ctrl = None
            continue

        # Collect the arguments that follow this command letter.
        args = []
        while index < len(tokens) and tokens[index][0] == "":
            args.append(float(tokens[index][1]))
            index += 1
        if not args:
            continue

        upper = command.upper()
        relative = command.islower()
        size = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7}[upper]

        while len(args) >= size:
            chunk, args = args[:size], args[size:]

            if upper == "M":
                point = _point(chunk, x, y, relative)
                if ring is not None \
                        and abs(point[0] - x) <= MOVE_CONT_EPSILON \
                        and abs(point[1] - y) <= MOVE_CONT_EPSILON:
                    # No-op moveto: the outline continues from where it is.
                    # Keep the current ring instead of splitting it.
                    pass
                else:
                    if ring is not None:
                        rings.append(_finalize_ring(ring, start))
                    ring = [point]
                    start = point
                x, y = point
                prev_cubic_ctrl = prev_quad_ctrl = None
                upper = "L"  # repeated M pairs are implicit absolute linetos

            elif upper == "L":
                point = _point(chunk, x, y, relative)
                if ring is None:
                    ring, start = [point], point
                ring.append(point)
                x, y = point
                prev_cubic_ctrl = prev_quad_ctrl = None

            elif upper == "H":
                nx = x + chunk[0] if relative else chunk[0]
                if ring is None:
                    ring, start = [(nx, y)], (nx, y)
                ring.append((nx, y))
                x = nx
                prev_cubic_ctrl = prev_quad_ctrl = None

            elif upper == "V":
                ny = y + chunk[0] if relative else chunk[0]
                if ring is None:
                    ring, start = [(x, ny)], (x, ny)
                ring.append((x, ny))
                y = ny
                prev_cubic_ctrl = prev_quad_ctrl = None

            elif upper == "C":
                c1 = _point(chunk[0:2], x, y, relative)
                c2 = _point(chunk[2:4], x, y, relative)
                p1 = _point(chunk[4:6], x, y, relative)
                if ring is None:
                    ring, start = [(x, y)], (x, y)
                ring.extend(_sample_cubic((x, y), c1, c2, p1))
                x, y = p1
                prev_cubic_ctrl = c2

            elif upper == "S":
                c2 = _point(chunk[0:2], x, y, relative)
                p1 = _point(chunk[2:4], x, y, relative)
                c1 = (2.0 * x - prev_cubic_ctrl[0], 2.0 * y - prev_cubic_ctrl[1]) \
                    if prev_cubic_ctrl else (x, y)
                if ring is None:
                    ring, start = [(x, y)], (x, y)
                ring.extend(_sample_cubic((x, y), c1, c2, p1))
                x, y = p1
                prev_cubic_ctrl = c2

            elif upper == "Q":
                control = _point(chunk[0:2], x, y, relative)
                p1 = _point(chunk[2:4], x, y, relative)
                if ring is None:
                    ring, start = [(x, y)], (x, y)
                ring.extend(_sample_quad((x, y), control, p1))
                x, y = p1
                prev_quad_ctrl = control

            elif upper == "T":
                p1 = _point(chunk, x, y, relative)
                control = (2.0 * x - prev_quad_ctrl[0], 2.0 * y - prev_quad_ctrl[1]) \
                    if prev_quad_ctrl else (x, y)
                if ring is None:
                    ring, start = [(x, y)], (x, y)
                ring.extend(_sample_quad((x, y), control, p1))
                x, y = p1
                prev_quad_ctrl = control

            elif upper == "A":
                rx, ry, rotation, large_arc, sweep, ex, ey = chunk
                if relative:
                    ex, ey = x + ex, y + ey
                if ring is None:
                    ring, start = [(x, y)], (x, y)
                ring.extend(_sample_arc(x, y, rx, ry, rotation, large_arc, sweep, ex, ey))
                x, y = ex, ey
                prev_cubic_ctrl = prev_quad_ctrl = None

    if ring is not None:
        rings.append(_finalize_ring(ring, start))
    return rings


# --- Ring -> GeoJSON geometry --------------------------------------------

def _ring_area(ring):
    """Signed shoelace area of a ring."""
    return 0.5 * sum(
        ring[i][0] * ring[(i + 1) % len(ring)][1]
        - ring[(i + 1) % len(ring)][0] * ring[i][1]
        for i in range(len(ring))
    )


def _point_in_ring(point, ring):
    """Ray-casting point-in-polygon test."""
    px, py = point
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > py) != (yj > py):
            xint = (xj - xi) * (py - yi) / (yj - yi) + xi
            if px < xint:
                inside = not inside
        j = i
    return inside


def flip_rings_y(rings, max_y):
    """Flip ring Y coordinates from SVG's y-down space to y-up (GeoJSON/Leaflet
    latitude) space: ``y_flipped = max_y - y``. Keeps coordinates in
    ``[0, max_y]``."""
    return [
        [(x, max_y - y) for x, y in ring]
        for ring in rings
    ]


def rings_to_geometry(rings):
    """Assemble rings into a ``Polygon`` or ``MultiPolygon`` geometry.

    Rings fully contained inside another ring become holes of the smallest
    containing polygon. Sub-paths that don't nest become separate polygons.
    """
    rings = [ring for ring in rings if len(ring) >= 3]
    if not rings:
        return None

    order = sorted(rings, key=lambda r: -abs(_ring_area(r)))
    polygons = []  # {"exterior": [...], "holes": [...]}
    for ring in order:
        container = None
        for polygon in polygons:
            if not _point_in_ring(ring[0], polygon["exterior"]):
                continue
            if container is None or abs(_ring_area(polygon["exterior"])) < abs(_ring_area(container["exterior"])):
                container = polygon
        if container is None:
            polygons.append({"exterior": ring, "holes": []})
        else:
            container["holes"].append(ring)

    def clean(coords):
        return [[round(px, 4), round(py, 4)] for px, py in coords]

    if len(polygons) == 1 and not polygons[0]["holes"]:
        return {"type": "Polygon", "coordinates": [clean(polygons[0]["exterior"])]}
    return {
        "type": "MultiPolygon",
        "coordinates": [
            [clean(polygon["exterior"])] + [clean(hole) for hole in polygon["holes"]]
            for polygon in polygons
        ],
    }


# --- SVG traversal and state matching ------------------------------------

def collect_paths(root):
    """Return every ``<path>`` element with an id, skipping decorative containers."""
    paths = []

    def walk(element, inside_skip):
        skip = inside_skip or _local_name(element.tag) in SKIP_CONTAINERS
        for child in element:
            if _local_name(child.tag) == "path" and not skip and child.get("id"):
                paths.append(child)
            else:
                walk(child, skip)

    walk(root, False)
    return paths


def match_state(svg_id, province_id, mapping):
    """Match a path's id / state id directly against the mapping keys.

    Returns ``(key, tag)`` when the id is already a state id in some form
    (``state_1``, ``1``, ``STATE_1``, or a ``data-province-id`` attribute).
    """
    candidates = []
    if svg_id:
        candidates.append(svg_id)
        lowered = svg_id.lower()
        if lowered != svg_id:
            candidates.append(lowered)
        if svg_id.isdigit():
            candidates.append(f"state_{svg_id}")
        state_match = STATE_ID_RE.match(svg_id)
        if state_match:
            candidates.append(f"state_{state_match.group(1)}")
    if province_id and province_id.isdigit():
        candidates.append(f"state_{province_id}")

    for candidate in candidates:
        if candidate in mapping:
            return candidate, mapping[candidate]
    return None, None


class StateNameBridge:
    """Resolve mapchart-style path ids to HOI4 state ids.

    Builds two name indexes from the vanilla state files: the file names
    (``<id>-<Name>.txt``) and display names found in comments inside the
    files. Proposal stages, in decreasing confidence:

    1. exact file-name match, then exact comment match (comment wins when the
       two disagree, because the wiki file names contain known errors),
    2. ambiguous exact name disambiguated by the path's owner country,
    3. containment: one name is a prefix of the other,
    4. the path id appears as a comment inside exactly one state file,
    5. fuzzy similarity restricted to states owned by the same country.

    Country tags per mapchart label are derived from the states matched in
    stage 1/2 (majority vote), which keeps the fuzzy stage from leaking into
    unrelated countries. All stages contribute candidates and the best
    candidate that agrees with the path's country label wins; when none
    agree, the best candidate overall is used (some mapchart groups disagree
    with the game's 1936 owners). Proposals are resolved globally by
    ``resolve`` so every state id is assigned to at most one path.
    """

    def __init__(self, mapping, states_dir, save_config_path=None):
        self.mapping = mapping
        self.tag_to_ids = {}
        for key, tag in mapping.items():
            if key.startswith("state_") and key[len("state_"):].isdigit():
                self.tag_to_ids.setdefault(tag, []).append(int(key[len("state_"):]))

        self.filename_index = {}
        self.comment_index = {}
        self.file_comments = {}
        if states_dir and states_dir.is_dir():
            for file_path in sorted(states_dir.glob("*.txt")):
                match = STATE_FILE_RE.match(file_path.name)
                if not match:
                    continue
                state_id = int(match.group(1))
                self.filename_index.setdefault(
                    normalize_state_name(match.group(2)), []
                ).append(state_id)
                text = file_path.read_text(encoding="utf-8", errors="ignore")
                for regex in (NAME_COMMENT_RE, ID_COMMENT_RE, STATE_COMMENT_RE):
                    comment = regex.search(text)
                    if comment:
                        self.comment_index.setdefault(
                            normalize_state_name(comment.group(1)), []
                        ).append(state_id)
                self.file_comments[state_id] = {
                    normalize_state_name(comment)
                    for comment in ANY_COMMENT_RE.findall(text)
                }

        self.name_to_label = {}
        if save_config_path and save_config_path.is_file():
            save_config = json.loads(save_config_path.read_text(encoding="utf-8"))
            for group in save_config.get("groups", {}).values():
                for path_id in group.get("paths", []):
                    self.name_to_label[path_id] = group.get("label", "")

        # Tag -> country name (also the reservation slot key), e.g.
        # "GER" -> "Germany". Loaded from the shared web mapping, plus
        # aliases for canonical names the mapchart labels spell differently
        # ("U.S.A" vs label "United States").
        self.tag_meta = {}
        if TAG_META_FILE.is_file():
            self.tag_meta = json.loads(TAG_META_FILE.read_text(encoding="utf-8"))
        self.name_to_tag = {}
        for tag, name in self.tag_meta.items():
            self.name_to_tag[normalize_state_name(name)] = tag
            for alias in TAG_NAME_ALIASES.get(name, ()):
                self.name_to_tag[normalize_state_name(alias)] = tag

        self.label_tags, self.label_tag_counts = self._derive_label_tags()
        self.label_override = self._build_label_overrides()

    def _build_label_overrides(self):
        """Resolve mapchart country labels to tags via the country-name table.

        The save config labels ("Bolivian Republic", "German Reich",
        "Dominion of Canada"...) don't exactly match the bot's country names,
        so matching runs in stages: exact, containment, word-prefix, then
        fuzzy. A uniquely resolved label -> tag beats the derived
        majority-vote tags (which are wrong when a label's only matched
        states were name collisions, e.g. Bolivia's Santa Cruz matching the
        Argentine state of the same name).
        """
        overrides = {}
        for label in self.name_to_label.values():
            if not label or label in overrides:
                continue
            tag = self._match_label_to_tag(label)
            if tag:
                overrides[label] = tag
        return overrides

    def _match_label_to_tag(self, label):
        key = normalize_state_name(label)
        if not key:
            return None

        # 1. Exact name match.
        if key in self.name_to_tag:
            return self.name_to_tag[key]

        # 2. Containment ("Bolivia" <-> "Bolivian Republic"-style labels).
        hits = {
            tag
            for name_key, tag in self.name_to_tag.items()
            if key.startswith(name_key) or name_key.startswith(key)
        }
        if len(hits) == 1:
            return hits.pop()

        # 3. Word-level prefix ("German Reich" -> "Germany" via "german").
        # Only accepted when ONE tag wins unambiguously — shared words must
        # not override, e.g. "United States" shares "united" with
        # "United Kingdom" and must not resolve to ENG.
        words = {word for word in key.split() if len(word) >= 4}
        best_score = 0
        best_tags = set()
        if words:
            for name_key, tag in self.name_to_tag.items():
                name_words = [word for word in name_key.split() if len(word) >= 4]
                score = 0
                for word in words:
                    for name_word in name_words:
                        if word.startswith(name_word) or name_word.startswith(word):
                            score += max(len(word), len(name_word))
                if score > best_score:
                    best_score = score
                    best_tags = {tag}
                elif score == best_score and score > 0:
                    best_tags.add(tag)
        if best_score > 0 and len(best_tags) == 1:
            return best_tags.pop()

        # 4. Fuzzy similarity.
        scored = []
        for name_key, tag in self.name_to_tag.items():
            ratio = SequenceMatcher(None, key, name_key).ratio()
            scored.append((ratio, tag))
        scored.sort(reverse=True)
        if scored and scored[0][0] >= 0.75:
            second = scored[1][0] if len(scored) > 1 else 0.0
            if scored[0][0] - second >= 0.06:
                return scored[0][1]
        return None

    @staticmethod
    def _unique(ids):
        return ids[0] if len(ids) == 1 else None

    @staticmethod
    def _key_variants(svg_id):
        """Normalized-name variants for one path id, best first.

        Handles mapchart naming quirks: country disambiguators ("Georgia_US"),
        numbered suffixes ("Amazon_impassable_1"), and impassable suffixes —
        each stripped in turn so the name bridge can still match the base
        name when the vanilla state files spell it differently.
        """
        variants = [normalize_state_name(svg_id)]
        base = svg_id
        for pattern in (
            r"_(?:US|AR|UK|IR)$",
            r"_impassable_\d+$",
            r"_\d+$",
        ):
            stripped = re.sub(pattern, "", base)
            if stripped and stripped != base:
                base = stripped
                variant = normalize_state_name(base)
                if variant and variant not in variants:
                    variants.append(variant)
        return variants

    def _derive_label_tags(self):
        """Map mapchart country labels to the HOI4 tags of their states.

        Only exact matches contribute, and only tags with the maximum count
        per label are trusted, so a single mislabeled state cannot pollute a
        country's tag set. Returns ``(trusted_sets, counts)``.
        """
        counts = {}
        for svg_id, label in self.name_to_label.items():
            state_id = None
            for key in self._key_variants(svg_id):
                state_id = self._unique(self.filename_index.get(key, []))
                if state_id is None:
                    state_id = self._unique(self.comment_index.get(key, []))
                if state_id is not None:
                    break
            tag = self.mapping.get(f"state_{state_id}") if state_id is not None else None
            if tag:
                counts.setdefault(label, {}).setdefault(tag, 0)
                counts[label][tag] += 1
        trusted = {}
        for label, tag_counts in counts.items():
            best = max(tag_counts.values())
            trusted[label] = {tag for tag, count in tag_counts.items() if count == best}
        return trusted, counts

    def label_primary_tag(self, svg_id):
        """Best-guess owner tag for a path id from its mapchart country label.

        Used as a fallback when no state-level name match exists: the save
        config groups every path under a country, and the label resolves to a
        tag via the country-name table (label_override) or, failing that, the
        label's majority tag from states already matched. Returns ``None``
        when neither source knows the label.
        """
        label = self.name_to_label.get(svg_id)
        if not label:
            return None
        override = self.label_override.get(label)
        if override:
            return override
        tag_counts = self.label_tag_counts.get(label)
        if not tag_counts:
            return None
        # Most-matched tag wins; ties break alphabetically for determinism.
        ranked = sorted(tag_counts.items(), key=lambda item: (-item[1], item[0]))
        return ranked[0][0]

    def _country_ok(self, state_id, svg_id):
        """Check a candidate state's tag against the path's country label."""
        tag = self.mapping.get(f"state_{state_id}")
        if tag is None:
            return False
        trusted = self.label_tags.get(self.name_to_label.get(svg_id))
        return not trusted or tag in trusted

    def propose(self, svg_id):
        """Return ``(state_id, score)`` for a path id, or ``None``.

        All matching stages contribute candidates; the best candidate that
        agrees with the path's country label wins, falling back to the best
        candidate overall when none agree (some mapchart groups disagree with
the game's 1936 owners, e.g. Nendo is grouped under France but owned by
        ENG). Name stages are retried against normalized variants of the id
        (see ``_key_variants``).
        """
        candidates = []
        keys = self._key_variants(svg_id)
        primary_key = keys[0]

        # Stages 1-3 run against every name variant: exact matches (comments
        # beat file names on disagreement — wiki file names contain known
        # errors, e.g. "50-Baden.txt" holds Württemberg while
        # "978 - Actual Baden.txt" holds Baden), ambiguous-exact country
        # disambiguation, and containment.
        for key in keys:
            file_ids = self.filename_index.get(key, [])
            comment_ids = self.comment_index.get(key, [])
            if len(comment_ids) == 1:
                candidates.append((comment_ids[0], 1.0))
            if len(file_ids) == 1:
                candidates.append((file_ids[0], 0.99))
            for ids in (comment_ids, file_ids):
                good = [state_id for state_id in ids if self._country_ok(state_id, svg_id)]
                if len(good) == 1:
                    candidates.append((good[0], 0.95))
            contained = set()
            for index in (self.comment_index, self.filename_index):
                for index_key, ids in index.items():
                    if len(ids) != 1:
                        continue
                    if (key.startswith(index_key) or index_key.startswith(key)) \
                            and self._country_ok(ids[0], svg_id):
                        contained.add(ids[0])
            if len(contained) == 1:
                candidates.append((contained.pop(), 0.9))

        # Stage 4: the path id appears as a comment inside exactly one file.
        hits = []
        for state_id, comments in self.file_comments.items():
            if primary_key not in comments and not any(
                comment.startswith(primary_key) and len(comment) > len(primary_key)
                for comment in comments
            ):
                continue
            if self._country_ok(state_id, svg_id):
                hits.append(state_id)
        if len(hits) == 1:
            candidates.append((hits[0], 0.85))

        # Stage 5: fuzzy similarity, restricted to the path's country.
        trusted = self.label_tags.get(self.name_to_label.get(svg_id))
        if trusted:
            candidate_ids = sorted(
                {state_id for tag in trusted for state_id in self.tag_to_ids.get(tag, [])}
            )
            names = {}
            for index in (self.filename_index, self.comment_index):
                for index_key, ids in index.items():
                    for state_id in ids:
                        names.setdefault(state_id, index_key)
            scored = []
            for state_id in candidate_ids:
                if state_id in names:
                    ratio = SequenceMatcher(None, primary_key, names[state_id]).ratio()
                    scored.append((ratio, state_id))
            scored.sort(reverse=True)
            if scored:
                best_ratio, best_id = scored[0]
                second = scored[1][0] if len(scored) > 1 else 0.0
                if best_ratio >= FUZZY_MIN_RATIO and best_ratio - second >= FUZZY_MIN_GAP:
                    candidates.append((best_id, 0.4 + 0.4 * best_ratio))

        if not candidates:
            return None

        # Prefer the highest-scoring candidate that agrees with the path's
        # country label; fall back to the highest-scoring candidate overall.
        passing = [
            (state_id, score)
            for state_id, score in candidates
            if self._country_ok(state_id, svg_id)
        ]
        return max(passing or candidates, key=lambda entry: entry[1])

    def resolve(self, proposals):
        """Assign state ids to paths greedily, one path per state id.

        ``proposals`` maps a path id to ``(state_id, score)``. Returns a dict
        of ``path_id -> state_id`` where each state id appears at most once.
        """
        ranked = sorted(
            ((score, path_id, state_id) for path_id, (state_id, score) in proposals.items()),
            reverse=True,
        )
        assignments = {}
        for _, path_id, state_id in ranked:
            if state_id not in assignments.values():
                assignments[path_id] = state_id
        return assignments


# --- Nation-level merging ------------------------------------------------

# Vertex-snapping grid for shapely unions (in map units): duplicate vertices
# from adjacent state rings snap together so shared borders dissolve cleanly.
GRID_SIZE = 0.05
# Sliver cleanup: only interior holes STRICTLY below this area (in square map
# units) are removed — they are hairline artifacts of the curve-sampling
# self-intersection repair (~0.002-0.025 px²). Exterior polygons are NEVER
# dropped; real enclaves (Lesotho, San Marino, ...) stay as holes.
MIN_HOLE_AREA = 0.05

# Canonical-name aliases used when matching mapchart country labels to tags
# (the bot's canonical name for the USA is "U.S.A", while mapchart labels it
# "United States").
TAG_NAME_ALIASES = {
    "U.S.A": ("United States", "USA"),
    "British RAJ": ("British Raj",),
    "U.K": ("United Kingdom",),
}

# Exact state-name -> tag roster for custom faction mappings (French Levant,
# Greek Attica, Tibetan Kham, and the 17-faction Chinese warlord split).
# Lookups use EXACT case-insensitive path-id comparison — never
# normalized/substring matching — so "Chahar" (MEN) cannot collide with
# "Hebei-Chahar" (HBC) and "Gansu" (XIC) cannot hit GSM. Entries
# short-circuit the name bridge before any fuzzy or prefix matching runs.
PATH_TAG_MAP = {
    # Syria / Levant (French mandate in 1936 — Syria is only a releasable
    # nation and does not start independent, so these states render as
    # French territory).
    "Damascus": "FRA", "Aleppo": "FRA", "Lebanon": "FRA",
    "Hatay": "FRA", "Deir_az_Zur": "FRA",
    # Greece (mapchart groups Attica under the United Kingdom label).
    "Attica": "GRE",
    # Tibet — Chamdo is the Kham state (mapchart "Tibet" group); vanilla
    # 1936 history gives it to CHI, but this map renders it under TIB.
    "Chamdo": "TIB",
    # Sinkiang
    "Yarkand": "SIK", "Urumqi": "SIK", "Dzungaria": "SIK", "Dabancheng": "SIK",
    # Khotan Ma
    "Taklamakan": "KHM", "Khotan": "KHM", "Kunlun_Shan": "KHM",
    # Shaanxi Clique (mapchart "Northeastern Army" group)
    "Yan’an": "XIC", "Gansu": "XIC", "Xian": "XIC",
    # Ningxia Ma
    "Alxa": "NXM", "Ningxia": "NXM", "Guyuan": "NXM",
    # Qinghai Ma (mapchart "Xibei San Ma" group)
    "Haixi": "XSM", "Qinghai": "XSM", "Golog": "XSM",
    # Gansu Ma
    "Jiuquan": "GSM", "Wuwei": "GSM",
    # Sichuan Clique
    "Liangshan": "SIC", "Ganzi": "SIC", "Gannan": "SIC", "Chengdu": "SIC",
    "Chongqing": "SIC", "Sichuan": "SIC",
    # Shanxi
    "Shanxi": "SHX", "Suiyuan": "SHX", "Ordos": "SHX",
    # Communist China
    "Shaanbei": "PRC", "Yulin": "PRC",
    # Yunnan
    "Yunnan": "YUN", "Dali": "YUN",
    # Guangxi Clique
    "Guangxi": "GXC", "Nanning": "GXC",
    # Guangdong Clique
    "Nanlu": "GDC", "Hainan": "GDC", "Guangzhou": "GDC", "Guangdong": "GDC",
    # Manchukuo
    "Liaoning": "MAN", "Jehol": "MAN", "Liaobei": "MAN", "Heilungkiang": "MAN",
    "Hulunbuir": "MAN", "Sungkiang": "MAN", "Kirin": "MAN",
    # Mengjiang
    "Xilingol": "MEN", "Chahar": "MEN", "Pailingmiao": "MEN",
    # Hebei-Chahar
    "Hebei": "HBC", "Beiping": "HBC", "Hebei-Chahar": "HBC",
    # Shandong Clique
    "Shandong": "SND", "Jinan": "SND",
    # Nationalist China (remaining central/eastern China states)
    "Zunyi": "CHI", "Guizhou": "CHI", "Hunan": "CHI", "Jiangxi": "CHI",
    "Fujian": "CHI", "Zhejiang": "CHI", "Huangshan": "CHI", "Changde": "CHI",
    "Henan": "CHI", "Anhui": "CHI", "Shanghai": "CHI", "Jiangsu": "CHI",
    "Hubei": "CHI", "Qingdao": "CHI", "Wuhan": "CHI", "Suzhou": "CHI",
    "Nanjing": "CHI",
}

PATH_TAG_MAP_FOLDED = {key.casefold(): tag for key, tag in PATH_TAG_MAP.items()}

def _rings_centroid(rings):
    """Average of all ring points — a cheap centroid for neighbor fallback."""
    points = [point for ring in rings for point in ring]
    if not points:
        return None
    return (
        sum(x for x, _ in points) / len(points),
        sum(y for _, y in points) / len(points),
    )


def _merge_geometries_plain(geometries):
    """Combine state geometries into one MultiPolygon without dissolving
    internal borders (fallback when shapely is unavailable)."""
    coordinates = []
    for geometry in geometries:
        if geometry["type"] == "Polygon":
            coordinates.append(geometry["coordinates"])
        elif geometry["type"] == "MultiPolygon":
            coordinates.extend(geometry["coordinates"])
    if not coordinates:
        return None
    return {"type": "MultiPolygon", "coordinates": coordinates}


def _merge_geometries(geometries):
    """Merge per-state geometries into one nation geometry.

    When shapely is installed, every state polygon is first reduced to a
    standalone, solid outer shell (``Polygon(poly.exterior)``) with winding
    normalized by ``orient(..., sign=1.0)``, so a state can never be passed
    into ``unary_union`` as an interior ring and subtracted as a hole of a
    neighboring state (the northern Mexico Chihuahua/Durango void bug).
    Self-intersecting rings (an artifact of curve sampling) are repaired with
    ``buffer(0)`` and vertex-snapped with ``set_precision`` before the union
    dissolves internal state borders into clean country outlines. Sub-pixel
    slivers that survive the union are dropped via the minimum area
    thresholds. Without shapely, the state polygons are packed into a single
    MultiPolygon.
    """
    try:
        from shapely import set_precision
        from shapely.errors import GEOSException
        from shapely.geometry import MultiPolygon, Polygon, mapping, shape
        from shapely.geometry.polygon import orient
        from shapely.ops import unary_union
    except ImportError:
        return _merge_geometries_plain(geometries)

    polygons = []
    for geometry in geometries:
        try:
            polygon = shape(geometry)
        except (ValueError, TypeError, GEOSException) as exc:
            # Malformed input geometry — drop it rather than fail the merge.
            print(f"[WARN] shapely could not parse a state geometry: {exc}")
            continue
        if polygon.is_empty:
            continue
        if not polygon.is_valid:
            # Self-intersecting rings are common after curve sampling;
            # buffer(0) rebuilds the boundary into a valid polygon.
            polygon = polygon.buffer(0)
        if polygon.is_empty:
            continue
        # Reduce every part of this state to a solid exterior shell with
        # normalized winding. Interior rings are intentionally dropped — each
        # state has its own path in the SVG, so enclaves render as their own
        # nation features on top; keeping holes here is what let GEOS treat
        # northern Mexican states as subtracted voids during union.
        parts = (
            list(getattr(polygon, "geoms", []))
            if polygon.geom_type in ("MultiPolygon", "GeometryCollection")
            else [polygon]
        )
        for part in parts:
            if not isinstance(part, Polygon) or part.is_empty:
                continue
            shell = orient(Polygon(part.exterior), sign=1.0)
            if shell.is_empty:
                continue
            snapped = set_precision(shell, GRID_SIZE)
            # Grid-snapping may collapse tiny/thin polygons — keep the
            # original in that case so no state is ever lost.
            polygons.append(snapped if not snapped.is_empty else shell)
    if not polygons:
        return None

    merged = unary_union(polygons)
    if merged.is_empty:
        return None

    def cleaned_part(part):
        """Drop only strictly sub-pixel holes from one union part.

        Exterior polygons are always kept — MIN_HOLE_AREA applies to
        interior rings only (hairline slivers from the self-intersection
        repair). Real enclaves stay as holes because they are far larger.
        """
        if part.is_empty or part.geom_type not in ("Polygon", "MultiPolygon"):
            return None
        pieces = []
        for polygon in list(part.geoms) if part.geom_type == "MultiPolygon" else [part]:
            holes = [
                hole for hole in polygon.interiors
                if Polygon(hole).area >= MIN_HOLE_AREA
            ]
            pieces.append(Polygon(polygon.exterior, holes))
        if not pieces:
            return None
        if len(pieces) == 1:
            return pieces[0]
        return MultiPolygon(pieces)

    parts = (
        list(getattr(merged, "geoms", []))
        if merged.geom_type == "GeometryCollection"
        else [merged]
    )
    cleaned = [cleaned_part(part) for part in parts]
    cleaned = [part for part in cleaned if part is not None and not part.is_empty]
    if not cleaned:
        return None

    coordinates = []
    for part in cleaned:
        part_coords = mapping(part)["coordinates"]
        # shapely returns tuples; JSON serialization needs lists.
        part_coords = json.loads(json.dumps(part_coords))
        if part.geom_type == "Polygon":
            coordinates.append(part_coords)
        else:
            coordinates.extend(part_coords)
    if len(coordinates) == 1:
        return {"type": "Polygon", "coordinates": coordinates[0]}
    return {"type": "MultiPolygon", "coordinates": coordinates}


# --- Base-game country tables --------------------------------------------

def parse_country_names(path):
    """Parse HOI4's ``00_countries.txt`` (``TAG = "countries/Name.txt"``)
    into ``{tag: country name}``. Returns ``{}`` when the file is absent."""
    names = {}
    if not path.is_file():
        return names
    line_re = re.compile(
        r'^\s*([A-Z0-9]{3})\s*=\s*"countries/([^"]+)\.txt"\s*(?:#.*)?$'
    )
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        match = line_re.match(line)
        if match:
            names[match.group(1)] = match.group(2).strip()
    return names


def hsv_to_rgb(h, s, v):
    """Convert HOI4 HSV (h, s, v each in [0, 1]) to an ``(r, g, b)`` tuple."""
    h = (h % 1.0) * 6.0
    i = int(h)
    f = h - i
    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    t = v * (1.0 - s * (1.0 - f))
    if i == 0:
        r, g, b = v, t, p
    elif i == 1:
        r, g, b = q, v, p
    elif i == 2:
        r, g, b = p, v, t
    elif i == 3:
        r, g, b = p, q, v
    elif i == 4:
        r, g, b = t, p, v
    else:
        r, g, b = v, p, q
    return (
        max(0, min(255, round(r * 255))),
        max(0, min(255, round(g * 255))),
        max(0, min(255, round(b * 255))),
    )


def _hex_color(r, g, b):
    return f"#{r:02X}{g:02X}{b:02X}"


def _norm_hex(value):
    """Normalize a color to uppercase ``#RRGGBB`` (``#888888`` if not hex)."""
    value = str(value).strip().lstrip("#")
    if len(value) == 3:
        value = "".join(char * 2 for char in value)
    if re.fullmatch(r"[0-9a-fA-F]{6}", value):
        return "#" + value.upper()
    return "#888888"


def _hex_to_rgb(value):
    """Convert ``#RRGGBB`` to an ``(r, g, b)`` tuple (0-255)."""
    value = _norm_hex(value).lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hsv(r, g, b):
    """Convert an ``(r, g, b)`` tuple (0-255) to HSV (h, s, v) in [0, 1]."""
    r, g, b = r / 255.0, g / 255.0, b / 255.0
    max_c, min_c = max(r, g, b), min(r, g, b)
    delta = max_c - min_c
    v = max_c
    s = 0.0 if max_c == 0 else delta / max_c
    if delta == 0:
        h = 0.0
    elif max_c == r:
        h = ((g - b) / delta) % 6.0
    elif max_c == g:
        h = (b - r) / delta + 2.0
    else:
        h = (r - g) / delta + 4.0
    return h / 6.0, s, v


def _distinct_color(original, used):
    """Return an unused hex by walking hue with the golden-angle sequence.

    Preserves the original color's saturation/value so the replacement still
    reads as a classic political-map fill, only shifted in hue. Zero-saturation
    fills (e.g. a uniform SVG placeholder grey) have no hue to rotate, so they
    get a fresh saturated color instead of remaining grey forever.
    """
    r, g, b = _hex_to_rgb(original)
    h, s, v = rgb_to_hsv(r, g, b)
    if s < 0.05:
        h, s, v = 0.0, 0.55, 0.55
    golden = 0.3819660112501051  # (3 - sqrt(5)) / 2
    for step in range(1, 64):
        candidate = _hex_color(*hsv_to_rgb((h + step * golden) % 1.0, s, v))
        if candidate not in used:
            return candidate
    return original


def dedup_nation_colors(nation_colors, rendered_tags, major_tags=None):
    """Make every rendered nation's fill color distinct.

    HOI4's ``colors.txt`` reuses hex values across tags (e.g. FRA and PAR both
    ``#3971E4``), making unrelated nations visually indistinguishable on the
    dashboard. Keep each color on a single highest-priority tag (majors first,
    then alphabetical) and remap any tag that lost its color to a deterministic
    distinct hue. Non-rendered tags are left untouched.
    """
    major_order = list(major_tags or ())
    used = {}
    result = {tag: _norm_hex(color) for tag, color in nation_colors.items()}
    tags = sorted(
        (tag for tag in rendered_tags if tag in nation_colors),
        key=lambda tag: (
            major_order.index(tag) if tag in major_order else len(major_order),
            tag,
        ),
    )
    for tag in tags:
        color = result[tag]
        if color in used:
            result[tag] = _distinct_color(color, used)
            used[result[tag]] = tag
        else:
            used[color] = tag
    return result


def parse_country_colors(path):
    """Parse HOI4's ``colors.txt`` into ``{tag: "#RRGGBB"}``.

    Each tag block's uncommented ``color`` line is converted to hex —
    ``rgb { R G B }`` directly, ``HSV { H S V }`` via ``hsv_to_rgb`` (or the
    devs' annotated ``#R G B`` comment when present, e.g. BOL). Keywords are
    case-insensitive. Tags without a usable ``color`` line are skipped (the
    caller falls back to the mapchart SVG fill). Returns ``{}`` when the
    file is absent.
    """
    colors = {}
    if not path.is_file():
        return colors
    text = path.read_text(encoding="utf-8", errors="ignore")
    block_re = re.compile(r"(?m)^\s*([A-Z0-9]{3})\s*=\s*\{")
    for match in block_re.finditer(text):
        tag = match.group(1)
        # Brace-depth scan: `rgb { ... }` / `HSV { ... }` nest inside the
        # tag block, so a naive first-`}` split would truncate the block.
        depth = 0
        end = None
        for index in range(match.end() - 1, len(text)):
            char = text[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end = index
                    break
        if end is None:
            continue
        block = text[match.end():end]
        hex_color = None
        for raw_line in block.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            # Keywords are case-insensitive: most entries spell ``rgb`` /
            # ``HSV``, but a few (e.g. JAP) use lowercase ``hsv``.
            rgb_match = re.match(
                r"^color\s*=\s*rgb\s*\{\s*(\d+)\s+(\d+)\s+(\d+)\s*\}",
                line,
                re.IGNORECASE,
            )
            if rgb_match:
                r, g, b = (int(value) for value in rgb_match.groups())
                hex_color = _hex_color(r, g, b)
                break
            hsv_match = re.match(
                r"^color\s*=\s*hsv\s*\{\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\}"
                r"\s*(?:#\s*(\d+)\s+(\d+)\s+(\d+))?",
                line,
                re.IGNORECASE,
            )
            if hsv_match:
                h, s, v = (float(value) for value in hsv_match.group(1, 2, 3))
                if hsv_match.group(4):
                    # The devs occasionally annotate the rendered RGB next to
                    # the HSV line (e.g. BOL) — trust it over a conversion.
                    r, g, b = (int(value) for value in hsv_match.group(4, 5, 6))
                else:
                    r, g, b = hsv_to_rgb(h, s, v)
                hex_color = _hex_color(r, g, b)
                break
        if hex_color:
            colors[tag] = hex_color
    return colors


def build_nation_features(
    geometries_by_tag,
    tag_meta,
    colors=None,
    country_names=None,
    scenario_names=None,
):
    """Group state geometries by owner tag into one Feature per nation.

    Properties: ``{tag, name, slot_key, color}`` — ``name``/``slot_key``
    come from the scraped scenario JSON (``scenario_names``, authoritative
    for total conversions), then ``tag_meta``
    (web/src/lib/tag_to_slot.json), then the base-game country name and
    finally the raw tag. ``color`` is the nation's ``#RRGGBB`` map color
    (base-game colors.txt, falling back to the mapchart SVG fill).
    """
    colors = colors or {}
    country_names = country_names or {}
    scenario_names = scenario_names or {}
    features = []
    for tag in sorted(geometries_by_tag):
        geometry = _merge_geometries(geometries_by_tag[tag])
        if geometry is None:
            continue
        if tag == VOID_TAG:
            # Voided states: grey, named "Void", no reservation slot key.
            features.append({
                "type": "Feature",
                "properties": {
                    "tag": VOID_TAG,
                    "name": VOID_NAME,
                    "slot_key": None,
                    "color": VOID_COLOR,
                },
                "geometry": geometry,
            })
            continue
        name = (
            scenario_names.get(tag)
            or tag_meta.get(tag)
            or country_names.get(tag)
            or tag
        )
        features.append({
            "type": "Feature",
            "properties": {
                "tag": tag,
                "name": name,
                "slot_key": name,
                "color": colors.get(tag, "#888888"),
            },
            "geometry": geometry,
        })
    return features


# --- Main ------------------------------------------------------------------

def resolve_input(input_path):
    """Pick the input SVG, falling back when ``vanilla.svg`` is absent."""
    if input_path.is_file():
        return input_path, False
    for fallback in INPUT_FALLBACKS:
        if fallback.is_file():
            return fallback, True
    available = ", ".join(sorted(path.name for path in input_path.parent.glob("*.svg"))) \
        if input_path.parent.is_dir() else "none"
    print(f"ERROR: input SVG not found: {input_path}")
    print(f"Available .svg files in {input_path.parent}: {available or 'none'}")
    return None, False


def find_save_config(raw_assets_dir):
    """Locate a mapchart save config (``mapchartSave*.txt``), if present."""
    candidates = sorted(raw_assets_dir.glob("mapchartSave*.txt"))
    return candidates[0] if candidates else None


# --- Main ------------------------------------------------------------------

def main(argv=None):
    # Windows consoles often default to cp1252; ids like "Kitakyūshū" would
    # crash the summary print without this.
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure:
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except ValueError:
            pass

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=INPUT_FILE,
                        help=f"Input SVG file (default: {INPUT_FILE})")
    parser.add_argument("--mapping", type=Path, default=MAPPING_FILE,
                        help=f"State owner mapping JSON (default: {MAPPING_FILE})")
    parser.add_argument("--output", type=Path, default=OUTPUT_FILE,
                        help=f"Output GeoJSON file (default: {OUTPUT_FILE})")
    parser.add_argument(
        "--states-dir",
        type=Path,
        default=VANILLA_STATES_DIR,
        help=(
            "Directory of state files the name bridge indexes "
            f"(default: {VANILLA_STATES_DIR}). Point this at "
            "scripts/hoi4_files/road_to_56 for the Road to 56 run."
        ),
    )
    parser.add_argument(
        "--overrides",
        type=Path,
        default=OVERRIDES_FILE,
        help=f"Manual path-id -> state-id overrides JSON (default: {OVERRIDES_FILE}).",
    )
    parser.add_argument(
        "--no-overrides",
        action="store_true",
        help="Skip manual overrides (state ids differ between scenarios).",
    )
    parser.add_argument(
        "--colors-file",
        type=Path,
        nargs="+",
        default=[COLORS_FILE],
        help=(
            "HOI4 colors.txt file(s), merged in order (default: the base "
            "game's). Pass the mod's colors.txt for a modded scenario."
        ),
    )
    parser.add_argument(
        "--countries-file",
        type=Path,
        nargs="+",
        default=[COUNTRIES_FILE],
        help=(
            "HOI4 country-tags file(s) for tag -> country names, merged in "
            "order (default: the base game's 00_countries.txt)."
        ),
    )
    parser.add_argument(
        "--scenario-json",
        type=Path,
        default=None,
        help=(
            "Scraped scenario JSON (hoi4_scraper.py output): nation names are "
            "taken from it, beating tag_to_slot.json and the countries file. "
            "Total-conversion mods (Kaiserreich) reuse the base game's "
            "00_countries.txt with file-based names (\"Asian\", \"WestEur\"), "
            "so the scraper's localised names are authoritative there."
        ),
    )
    parser.add_argument(
        "--color-overrides",
        type=Path,
        default=None,
        help=(
            "JSON dict of tag -> \"#RRGGBB\" applied AFTER color dedup so the "
            "overrides always win. Any non-overridden nation whose color "
            "now collides is remapped to a distinct hue. Use for curated "
            "fixes, e.g. Kaiserreich's Russian Republic taking Millennium "
            "Dawn Russia's green."
        ),
    )
    args = parser.parse_args(argv)

    input_path, fell_back = resolve_input(args.input)
    if input_path is None:
        return 1
    if fell_back:
        print(f"NOTE: {args.input.name} not found, using {input_path.name} instead")

    mapping = json.loads(args.mapping.read_text(encoding="utf-8"))

    # Optional manual overrides, applied before the name bridge. State ids
    # differ between scenarios (Road to 56 renumbers states), so the vanilla
    # override file only applies when the run uses the vanilla states dir.
    overrides = {}
    if not args.no_overrides and args.overrides.is_file():
        raw_overrides = json.loads(args.overrides.read_text(encoding="utf-8"))
        for path_id, value in raw_overrides.items():
            state_id = parse_state_id(value)
            if state_id is None:
                print(f"WARNING: ignoring override {path_id!r}: bad value {value!r}")
                continue
            overrides[path_id] = state_id
        print(f"Loaded {len(overrides)} manual overrides from {args.overrides.name}")

    root = ET.parse(input_path).getroot()
    paths = collect_paths(root)

    # World background path (game-derived SVGs): its bbox defines the full
    # world rectangle the frontend fits to.
    ocean_bbox = None
    for path in paths:
        if path.get("id") == OCEAN_PATH_ID:
            rings = parse_d(path.get("d", ""))
            xs = [x for ring in rings for x, _ in ring]
            ys = [y for ring in rings for _, y in ring]
            if xs:
                ocean_bbox = [min(xs), min(ys), max(xs), max(ys)]
            break

    save_config = find_save_config(input_path.parent)
    bridge = StateNameBridge(mapping, args.states_dir, save_config)
    if save_config:
        print(f"Using mapchart save config {save_config.name} for country-constrained matching")

    # Overrides first, then direct state-id matching, then the name bridge.
    proposals = {}
    stage_counts = {}
    used_overrides = 0
    for path in paths:
        svg_id = path.get("id")
        if svg_id == OCEAN_PATH_ID:
            continue
        if svg_id in overrides:
            proposals[svg_id] = (overrides[svg_id], 3.0)
            used_overrides += 1
            continue
        key, tag = match_state(svg_id, path.get("data-province-id"), mapping)
        if key is not None:
            proposals[svg_id] = (int(key[len("state_"):]), 2.0)
            continue
        # Exact roster lookup (PATH_TAG_MAP) short-circuits the name bridge
        # BEFORE any fuzzy/prefix matching, so "Chahar" (MEN) can never
        # collide with "Hebei-Chahar" (HBC) or "Gansu" (XIC) with GSM. The
        # tag is assigned directly in the tag_by_path loop below.
        if PATH_TAG_MAP.get(svg_id) or PATH_TAG_MAP_FOLDED.get(svg_id.casefold()):
            continue
        proposal = bridge.propose(svg_id)
        if proposal is not None:
            proposals[svg_id] = proposal
    assignments = bridge.resolve(proposals)
    for path_id, state_id in assignments.items():
        score = proposals[path_id][1]
        stage = "override" if score > 2.0 else (
            "direct" if score > 1.0 else (
                "name-exact" if score >= 0.99 else
                "country-disambiguated" if score >= 0.95 else
                "containment" if score >= 0.9 else
                "comment" if score >= 0.85 else "fuzzy"
            )
        )
        stage_counts[stage] = stage_counts.get(stage, 0) + 1
    print(f"Applied {used_overrides} override(s)")

    # Parse every path once, then flip the Y axis: SVG y grows downward but
    # the output must be y-up for Leaflet's L.CRS.Simple (which projects
    # latitude onto -screen_y). Flipping against the global max Y keeps all
    # coordinates within [0, max_y].
    parsed_rings = {}
    max_y = 0.0
    for path in paths:
        svg_id = path.get("id")
        rings = parse_d(path.get("d", ""))
        parsed_rings[svg_id] = rings
        for ring in rings:
            for _, point_y in ring:
                max_y = max(max_y, point_y)
    print(f"SVG max Y: {max_y:.2f} — flipping Y axis (y_flipped = max_y - y)")

    # Build per-state geometry and resolve the owner tag for every path.
    geometries_by_path = {}
    skipped = 0
    for path in paths:
        svg_id = path.get("id")
        if svg_id == OCEAN_PATH_ID:
            continue
        geometry = rings_to_geometry(flip_rings_y(parsed_rings.get(svg_id, []), max_y))
        if geometry is None:
            skipped += 1
            continue
        geometries_by_path[svg_id] = geometry

    tag_by_path = {}
    matched_no_owner = 0
    roster_tag_count = 0
    for path in paths:
        svg_id = path.get("id")
        if svg_id == OCEAN_PATH_ID or svg_id not in geometries_by_path:
            continue
        # Exact case-insensitive state-name roster (Syria/Levant + Chinese
        # warlords) wins outright; the bridge never sees these paths.
        roster_tag = PATH_TAG_MAP.get(svg_id) or PATH_TAG_MAP_FOLDED.get(svg_id.casefold())
        if roster_tag is not None:
            tag_by_path[svg_id] = roster_tag
            roster_tag_count += 1
            continue
        state_id = assignments.get(svg_id)
        if state_id is not None:
            mapping_key = f"state_{state_id}"
            if mapping_key in mapping:
                # An explicit ``null`` value marks a deliberately voided state
                # (ownerless in the mod's files) — render it grey instead of
                # letting the name bridge / neighbour fallbacks guess an owner.
                tag = mapping[mapping_key]
                tag_by_path[svg_id] = tag if tag is not None else VOID_TAG
            else:
                matched_no_owner += 1
                tag_by_path[svg_id] = None
        else:
            tag_by_path[svg_id] = None

    # Fallback 1: the mapchart save config groups every path under a country
    # label — assign the label's majority tag (derived from states already
    # matched) to anything the name bridge missed.
    label_fallback_count = 0
    for svg_id, tag in tag_by_path.items():
        if tag is None:
            fallback_tag = bridge.label_primary_tag(svg_id)
            if fallback_tag:
                tag_by_path[svg_id] = fallback_tag
                label_fallback_count += 1

    # Fallback 2: nearest tagged neighbor by centroid distance — guarantees
    # zero grey states even for paths missing from the save config.
    neighbor_fallback_count = 0
    unresolved = [svg_id for svg_id, tag in tag_by_path.items() if tag is None]
    if unresolved:
        centroids = {
            svg_id: _rings_centroid(parsed_rings.get(svg_id, []))
            for svg_id in tag_by_path
        }
        tagged_points: list[tuple[str, tuple[float, float]]] = []
        for neighbor_id, neighbor_tag in tag_by_path.items():
            if neighbor_tag is None:
                continue
            neighbor_centroid = centroids.get(neighbor_id)
            if neighbor_centroid is not None:
                tagged_points.append((neighbor_id, neighbor_centroid))
        for svg_id in unresolved:
            centroid = centroids.get(svg_id)
            if centroid is None:
                continue
            centroid_x, centroid_y = centroid
            nearest = min(
                tagged_points,
                key=lambda item: (item[1][0] - centroid_x) ** 2
                + (item[1][1] - centroid_y) ** 2,
                default=None,
            )
            if nearest is not None:
                tag_by_path[svg_id] = tag_by_path[nearest[0]]
                neighbor_fallback_count += 1

    # Group per-state geometries by owner tag and merge into nation features.
    geometries_by_tag = {}
    for svg_id, tag in tag_by_path.items():
        if tag is None:
            continue
        geometries_by_tag.setdefault(tag, []).append(geometries_by_path[svg_id])

    # Nation colors: colors.txt file(s) first (exact RGB, later files
    # override earlier ones), falling back to the mapchart SVG fill for
    # custom tags none of the color files define.
    base_colors = {}
    for colors_path in args.colors_file:
        base_colors.update(parse_country_colors(colors_path))
    country_names = {}
    for countries_path in args.countries_file:
        country_names.update(parse_country_names(countries_path))
    scenario_names = {}
    if args.scenario_json is not None and args.scenario_json.is_file():
        scenario = json.loads(args.scenario_json.read_text(encoding="utf-8"))
        for tag, nation in scenario.get("nations", scenario).items():
            name = nation.get("name") if isinstance(nation, dict) else None
            if name:
                scenario_names[str(tag)] = str(name)
        print(
            f"Scenario names: {len(scenario_names)} from "
            f"{args.scenario_json.name}"
        )
    nation_colors = dict(base_colors)
    fill_fallback_count = 0
    for path in paths:
        svg_id = path.get("id")
        tag = tag_by_path.get(svg_id)
        if tag is None or tag == VOID_TAG or tag in nation_colors:
            continue
        fill = path.get("fill")
        if fill:
            nation_colors[tag] = fill
            fill_fallback_count += 1
    print(
        f"Nation colors: {len(base_colors)} base-game, "
        f"{fill_fallback_count} mapchart-fill fallback"
    )

    # Deduplicate fill colors across rendered nations: HOI4 reuses hex values
    # (e.g. FRA and PAR both #3971E4), so unrelated nations can be visually
    # indistinguishable. Majors keep their canonical color; colliding minors
    # are remapped to a distinct hue.
    rendered_tags = set(geometries_by_tag)
    nation_colors = dedup_nation_colors(
        nation_colors, rendered_tags, major_tags=MAJOR_TAGS
    )
    duplicate_groups = {}
    for tag in sorted(rendered_tags):
        duplicate_groups.setdefault(nation_colors.get(tag), []).append(tag)
    collisions = {c: tags for c, tags in duplicate_groups.items() if len(tags) > 1}
    print(
        f"Color dedup: {len(rendered_tags)} nations -> "
        f"{len(duplicate_groups)} distinct colors"
        + (f"; collisions remain: {collisions}" if collisions else "")
    )

    # Manual color overrides (tag -> "#RRGGBB"): applied after dedup so they
    # always win. Any non-overridden nation whose color now collides is
    # remapped to a distinct hue, keeping every rendered nation unique.
    if args.color_overrides is not None and args.color_overrides.is_file():
        overrides = json.loads(args.color_overrides.read_text(encoding="utf-8"))
        for tag, color in overrides.items():
            nation_colors[tag] = _norm_hex(str(color))
        used = {nation_colors[tag]: tag for tag in overrides}
        for tag in sorted(rendered_tags):
            if tag in overrides:
                continue
            color = nation_colors.get(tag)
            if color in used:
                replacement = _distinct_color(color, used)
                nation_colors[tag] = replacement
                used[replacement] = tag
            else:
                used[color] = tag
        print(f"Color overrides applied: {overrides}")

    nation_features = build_nation_features(
        geometries_by_tag, bridge.tag_meta, colors=nation_colors,
        country_names=country_names, scenario_names=scenario_names,
    )

    # Geometry void audit: verify every state's area survives its nation's
    # union (at least half the state's area must remain — a dropped state
    # contributes zero).
    void_audit_missing = None
    try:
        from shapely.errors import GEOSException
        from shapely.geometry import shape as shapely_shape

        missing_states = []
        # Merge each nation once (not once per state) — the per-state loop
        # below reuses this cache, avoiding ~1000 redundant unary_unions.
        nation_shapes = {}
        for tag, geometries in geometries_by_tag.items():
            merged = _merge_geometries(geometries)
            if merged is not None:
                nation_shapes[tag] = shapely_shape(merged)
        for svg_id, tag in tag_by_path.items():
            if tag is None or svg_id not in geometries_by_path:
                continue
            nation = nation_shapes.get(tag)
            if nation is None:
                missing_states.append(svg_id)
                continue
            individual = shapely_shape(geometries_by_path[svg_id])
            if not individual.is_valid:
                individual = individual.buffer(0)
            if individual.is_empty:
                continue
            try:
                retained = nation.intersection(individual).area
            except GEOSException:
                # Degenerate repair edge case — leave to the next run's audit.
                continue
            if retained < 0.5 * individual.area:
                missing_states.append(svg_id)
        void_audit_missing = missing_states
    except ImportError:
        void_audit_missing = None

    # Territory audit: major powers must own their historical home states.
    territory_audit = {
        "North America": [
            "Ohio", "Texas", "California", "New_York", "Florida", "Virginia",
            "Georgia_US", "Illinois", "Michigan", "Pennsylvania", "Washington",
            "Oregon", "Arizona", "Colorado", "British_Columbia", "Southern_Ontario",
            "Nord_du_Quebec", "Alberta", "Chihuahua", "Sonora", "Yucatan",
            "Mexico_City", "Baja_California", "Veracruz",
        ],
        "Europe": [
            "Oberbayern", "Sachsen", "Rhineland", "Brandenburg", "Württemberg",
            "Normandy", "Brittany", "Ile_de_France", "Bourgogne", "Savoy",
            "Greater_London_Area", "Yorkshire", "Wales", "Scottish_Highlands",
            "Moscow", "Leningrad", "Stalingrad", "Kyiv", "Minsk", "Katowice",
            "Warszawa", "Lombardia", "Sicilia", "Cataluña", "Madrid",
        ],
        "Asia": [
            "Beiping", "Shanghai", "Nanjing", "Jiangsu", "Shandong", "Hubei",
            "Hokkaido", "Kanto", "Kansai", "Kirin", "Jehol", "Gyeonggi",
            "Tonkin", "Mekong_Delta", "Bangkok", "Delhi", "Bombay",
            "West_Bengal", "Vladivostok", "Novosibirsk", "Tashkent", "Urumqi",
        ],
    }

    feature_collection = {"type": "FeatureCollection", "features": nation_features}
    if ocean_bbox is not None:
        feature_collection["world_bounds"] = [
            round(value, 4) for value in ocean_bbox
        ]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(feature_collection, separators=(",", ":")),
        encoding="utf-8",
    )

    total_paths = len(tag_by_path)
    tagged = sum(1 for tag in tag_by_path.values() if tag is not None)
    void_count = sum(1 for tag in tag_by_path.values() if tag == VOID_TAG)
    percent = 100.0 * tagged / total_paths if total_paths else 0.0
    print(f"Input: {input_path}")
    print(f"Parsed {len(paths)} <path> elements; skipped {skipped} without usable geometry")
    print("Match stages: " + ", ".join(f"{name}={count}" for name, count in sorted(stage_counts.items())))
    print(f"Tag fallbacks: label={label_fallback_count}, neighbor={neighbor_fallback_count}, roster={roster_tag_count}")
    print(f"State paths tagged with an owner: {tagged} / {total_paths} ({percent:.1f}%)")
    print(f"Void (ownerless) states: {void_count}")
    print(f"Matched state but no owner in mapping: {matched_no_owner}")

    # Territory audit printout — verifies majors own their home territories.
    # Only meaningful for the vanilla mapchart SVG (path ids are state
    # names); game-derived SVGs use state_<id> ids.
    if args.states_dir == VANILLA_STATES_DIR and not args.no_overrides:
        print("Territory audit (home states by region):")
        for region, state_ids in territory_audit.items():
            print(f"  [{region}]")
            for state_id in state_ids:
                print(f"    {state_id:22} -> {tag_by_path.get(state_id) or '???'}")

    # Every path in the mapchart "United States" group must resolve to USA.
    us_states = sorted(
        svg_id
        for svg_id, label in bridge.name_to_label.items()
        if label == "United States" and svg_id in tag_by_path
    )
    us_wrong = [svg_id for svg_id in us_states if tag_by_path[svg_id] != "USA"]
    if us_states:
        print(
            f"US states check: {len(us_states) - len(us_wrong)}/{len(us_states)} tagged USA"
            + (f" — WRONG: {[(s, tag_by_path[s]) for s in us_wrong]}" if us_wrong else "")
        )
    else:
        print("US states check: 0/0 tagged USA")

    # Void audit printout — zero states may be lost during union.
    if void_audit_missing is None:
        print("Geometry void audit: skipped (shapely unavailable)")
    elif void_audit_missing:
        print(f"Geometry void audit: {len(void_audit_missing)} state(s) missing from nation unions:")
        print("  " + ", ".join(sorted(void_audit_missing)))
    else:
        print(f"Geometry void audit: 0 / {total_paths} states missing from nation unions")

    # Assignments whose tag disagrees with the country label's majority tag
    # are worth reviewing (usually a mapchart group that differs from the
    # game's 1936 owners, or a cross-country name collision).
    if bridge.name_to_label and args.states_dir == VANILLA_STATES_DIR:
        label_tags = {}
        for path_id, state_id in assignments.items():
            label = bridge.name_to_label.get(path_id)
            tag = mapping.get(f"state_{state_id}")
            if label and tag:
                label_tags.setdefault(label, []).append(tag)
        for label, tags in label_tags.items():
            majority = max(set(tags), key=tags.count)
            for path_id, state_id in assignments.items():
                if bridge.name_to_label.get(path_id) == label \
                        and mapping.get(f"state_{state_id}") not in (None, majority):
                    print(f"  [REVIEW] {path_id}: tag {mapping[f'state_{state_id}']} "
                          f"(label {label!r} majority {majority})")

    untagged = [svg_id for svg_id, tag in tag_by_path.items() if tag is None]
    print(f"Nation features exported: {len(nation_features)}")
    if untagged:
        print(f"Untagged path ids ({len(untagged)}): {', '.join(sorted(untagged))}")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

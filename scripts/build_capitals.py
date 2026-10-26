"""Build the capital marker positions for every live-map GeoJSON.

Writes ``web/src/data/mapCapitals.json``::

    { "<map name>": { "<TAG>": [x, y], ... }, ... }

in the same y-up pixel space as ``web/public/maps/<map name>.geojson`` (the
live map shows each reserved player's avatar at their nation's capital).

For every nation on a map:
  1. its capital state (the scraped scenario JSON's ``capital`` id) is looked
     up in the state SVG the map was built from, and the most "inside" point
     of that state is taken — if that point lies inside the nation;
  2. otherwise (capital not drawn / owned by someone else at start / tag not
     in the scenario JSON) the most "inside" point of the nation's largest
     landmass is used.

State geometry is parsed and Y-flipped exactly like ``svg_to_geojson.py``
(same parser, same global max-Y), so the points line up with the GeoJSON.
Game-derived SVGs name their paths ``state_<id>``; the vanilla mapchart SVG
names paths after states, resolved through svg_to_geojson's name bridge.
The bridge leaves ~250 mapchart paths without a state id (e.g. "Lazio" vs
the game's "Latium"), so vanilla capitals missing from it are taken from the
game-derived TFB map (vanilla state ids) and carried into mapchart space by
an axis-aligned linear fit over every state both maps share.

Usage (from the repo root)::

    py scripts/build_capitals.py
"""

import json
import math
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

import svg_to_geojson as s2g

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
RAW = SCRIPT_DIR / "raw_assets"
MAPS_DIR = PROJECT_ROOT / "web" / "public" / "maps"
SCENARIOS_DIR = PROJECT_ROOT / "web" / "src" / "data" / "scenarios"
OUTPUT_FILE = PROJECT_ROOT / "web" / "src" / "data" / "mapCapitals.json"

# map name -> (state SVG, scenario JSON with the capitals). The modern map is
# Millennium Dawn's (NV/TFR reuse it), so MD's capitals position it.
MAPS = {
    "vanilla": (None, "vanilla_1936.json"),  # mapchart SVG via the name bridge (+ TFB)
    "road_to_56": (RAW / "road_to_56.svg", "road_to_56.json"),
    "kaiserreich": (RAW / "kaiserreich.svg", "kaiserreich.json"),
    "modern": (RAW / "modern_md.svg", "modern_md.json"),
    "tfb": (RAW / "hist_tfb.svg", "tfb.json"),
    "oak": (RAW / "hist_oak.svg", "oak.json"),
    "horst": (RAW / "hist_horst.svg", "horst.json"),
    "bffu": (RAW / "hist_bffu.svg", "bffu.json"),
}

STATE_ID_RE = re.compile(r"^state_(\d+)$")
GRID = 24  # interior-point search resolution per axis
MAX_EDGE_VERTICES = 600  # downsample huge rings for the distance search


# --- geometry helpers -------------------------------------------------------

def _inside(point, rings):
    """Inside the exterior ring (rings[0]) and outside every hole."""
    if not rings or not s2g._point_in_ring(point, rings[0]):
        return False
    return not any(s2g._point_in_ring(point, hole) for hole in rings[1:])


def _segment_distance(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    t = 0.0 if length_sq == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def _edge_distance(point, rings):
    best = math.inf
    for ring in rings:
        step = max(1, len(ring) // MAX_EDGE_VERTICES)
        sampled = ring[::step]
        for (ax, ay), (bx, by) in zip(sampled, sampled[1:] + sampled[:1]):
            best = min(best, _segment_distance(point[0], point[1], ax, ay, bx, by))
    return best


def interior_point(rings):
    """A point well inside a polygon (exterior + holes): the grid sample
    farthest from any edge (a cheap pole of inaccessibility)."""
    xs = [x for x, _ in rings[0]]
    ys = [y for _, y in rings[0]]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    best_point, best_score = None, -1.0
    for i in range(GRID):
        for j in range(GRID):
            point = (
                min_x + (i + 0.5) * (max_x - min_x) / GRID,
                min_y + (j + 0.5) * (max_y - min_y) / GRID,
            )
            if not _inside(point, rings):
                continue
            score = _edge_distance(point, rings)
            if score > best_score:
                best_point, best_score = point, score
    if best_point is None:  # sliver: fall back to the vertex average
        best_point = (sum(xs) / len(xs), sum(ys) / len(ys))
    return best_point


def polygons_of(geometry):
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    return geometry["coordinates"]


def largest_polygon(polygons):
    return max(polygons, key=lambda polygon: abs(s2g._ring_area(polygon[0])))


# --- state geometry ---------------------------------------------------------

def state_polygons(svg_path, resolve_ids):
    """state id -> its largest flipped polygon (exterior first, then holes)."""
    root = ET.parse(svg_path).getroot()
    paths = s2g.collect_paths(root)
    parsed = {}
    max_y = 0.0
    for path in paths:
        rings = s2g.parse_d(path.get("d", ""))
        parsed[path.get("id")] = rings
        for ring in rings:
            for _, y in ring:
                max_y = max(max_y, y)

    state_by_path = resolve_ids(paths)
    result = {}
    for svg_id, state_id in state_by_path.items():
        geometry = s2g.rings_to_geometry(s2g.flip_rings_y(parsed.get(svg_id, []), max_y))
        if geometry is None:
            continue
        polygon = largest_polygon(polygons_of(geometry))
        current = result.get(state_id)
        if current is None or abs(s2g._ring_area(polygon[0])) > abs(s2g._ring_area(current[0])):
            result[state_id] = polygon
    return result


def direct_state_ids(paths):
    ids = {}
    for path in paths:
        match = STATE_ID_RE.match(path.get("id") or "")
        if match:
            ids[path.get("id")] = int(match.group(1))
    return ids


def vanilla_state_ids(paths):
    """svg_to_geojson's matching for the mapchart SVG (overrides, direct ids,
    then the state-name bridge)."""
    mapping = json.loads(s2g.MAPPING_FILE.read_text(encoding="utf-8"))
    overrides = {}
    if s2g.OVERRIDES_FILE.is_file():
        for path_id, value in json.loads(s2g.OVERRIDES_FILE.read_text(encoding="utf-8")).items():
            state_id = s2g.parse_state_id(value)
            if state_id is not None:
                overrides[path_id] = state_id
    input_path, _ = s2g.resolve_input(s2g.INPUT_FILE)
    bridge = s2g.StateNameBridge(mapping, s2g.VANILLA_STATES_DIR, s2g.find_save_config(input_path.parent))
    proposals = {}
    for path in paths:
        svg_id = path.get("id")
        if svg_id == s2g.OCEAN_PATH_ID:
            continue
        if svg_id in overrides:
            proposals[svg_id] = (overrides[svg_id], 3.0)
            continue
        key, _ = s2g.match_state(svg_id, path.get("data-province-id"), mapping)
        if key is not None:
            proposals[svg_id] = (int(key[len("state_"):]), 2.0)
            continue
        if s2g.PATH_TAG_MAP.get(svg_id) or s2g.PATH_TAG_MAP_FOLDED.get(svg_id.casefold()):
            continue
        proposal = bridge.propose(svg_id)
        if proposal is not None:
            proposals[svg_id] = proposal
    return bridge.resolve(proposals)


def _ring_mean(polygon):
    ring = polygon[0]
    return (sum(x for x, _ in ring) / len(ring), sum(y for _, y in ring) / len(ring))


def _fit_axis(sources, targets):
    """Least-squares target = scale * source + offset."""
    n = len(sources)
    mean_s, mean_t = sum(sources) / n, sum(targets) / n
    var = sum((s - mean_s) ** 2 for s in sources)
    scale = sum((s - mean_s) * (t - mean_t) for s, t in zip(sources, targets)) / var
    return scale, mean_t - scale * mean_s


def fit_transform(src_states, dst_states):
    """Axis-aligned linear map from src state space to dst state space, fitted
    on shared state ids; the worst-fitting 20% (mis-bridged states) are
    dropped and the fit repeated."""
    pairs = [
        (_ring_mean(src_states[sid]), _ring_mean(dst_states[sid]))
        for sid in src_states.keys() & dst_states.keys()
    ]
    for _ in range(3):
        sx, ox = _fit_axis([s[0] for s, _ in pairs], [d[0] for _, d in pairs])
        sy, oy = _fit_axis([s[1] for s, _ in pairs], [d[1] for _, d in pairs])
        residual = lambda pair: math.hypot(sx * pair[0][0] + ox - pair[1][0], sy * pair[0][1] + oy - pair[1][1])
        pairs.sort(key=residual)
        median = residual(pairs[len(pairs) // 2])
        pairs = pairs[: int(len(pairs) * 0.8)]
    print(f"  TFB -> vanilla fit on {len(pairs)} states: median residual {median:.1f}px")
    return lambda point: (sx * point[0] + ox, sy * point[1] + oy)


# --- per map ----------------------------------------------------------------

def scenario_capitals(json_name):
    data = json.loads((SCENARIOS_DIR / json_name).read_text(encoding="utf-8"))
    nations = data.get("nations", data) if isinstance(data, dict) else {}
    capitals = {}
    for tag, nation in nations.items():
        if isinstance(nation, dict) and isinstance(nation.get("capital"), int):
            capitals[tag] = nation["capital"]
    return capitals


def build_map(name, svg_path, json_name):
    collection = json.loads((MAPS_DIR / f"{name}.geojson").read_text(encoding="utf-8"))
    capitals = scenario_capitals(json_name)
    borrowed_states, to_map = {}, None
    if svg_path is None:
        input_path, _ = s2g.resolve_input(s2g.INPUT_FILE)
        states = state_polygons(input_path, vanilla_state_ids)
        borrowed_states = state_polygons(RAW / "hist_tfb.svg", direct_state_ids)
        to_map = fit_transform(borrowed_states, states)
    else:
        states = state_polygons(svg_path, direct_state_ids)

    def capital_candidate(state_id):
        if state_id in states:
            return interior_point(states[state_id])
        if to_map and state_id in borrowed_states:
            return to_map(interior_point(borrowed_states[state_id]))
        return None

    points = {}
    used_capital = fallback = 0
    for feature in collection["features"]:
        props = feature["properties"]
        tag = props.get("tag")
        if not tag or not props.get("slot_key") or tag in points:
            continue
        nation_polygons = polygons_of(feature["geometry"])
        point = None
        candidate = capital_candidate(capitals.get(tag))
        if candidate is not None and any(_inside(candidate, polygon) for polygon in nation_polygons):
            point = candidate
        if point is None:
            point = interior_point(largest_polygon(nation_polygons))
            fallback += 1
        else:
            used_capital += 1
        points[tag] = [round(point[0], 1), round(point[1], 1)]
    print(f"{name}: {used_capital} capitals, {fallback} landmass fallbacks ({len(states)} states parsed)")
    return points


def main():
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure:
        reconfigure(encoding="utf-8", errors="replace")
    output = {name: build_map(name, svg, json_name) for name, (svg, json_name) in MAPS.items()}
    OUTPUT_FILE.write_text(json.dumps(output, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

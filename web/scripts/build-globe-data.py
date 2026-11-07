"""
Build the front-page globe's map data from the site's HOI4 maps.

The maps are in HOI4's flat pixel layout (1400 x 509, y up), not real
longitude/latitude. Longitude is close to linear in x. Latitude is not: HOI4
moves whole regions (North America sits ~12 degrees too far north next to
Europe). So latitude is fitted on known capitals and the leftover error is
smoothed out with a warp pinned to those capitals.

Output per map (public/landing/globe-<map>.json), coordinates as
[lon, lat, lon, lat, ...] rounded to 0.1 degrees (half a pixel on the globe):
  coast:    lines where land meets sea
  border:   lines between two nations
  capitals: {tag: [lon, lat]}

North of ARCTIC_SEAM the globe uses real geography from scripts/data/arctic.json
(Natural Earth, made by build-arctic-data.py): HOI4's maps stop at about 73.7 N
and squeeze everything up to that edge, which left a hard ring of land round
the pole and no Arctic Ocean.

Run from web/:  python scripts/build-globe-data.py
"""

import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPS = ["vanilla", "modern"]
WIDTH = 1400.0
HEIGHT = 509.0

# Real capitals (lat, lon) for vanilla tags, to pin the HOI4 layout to the globe.
REAL = {
    "GER": (52.52, 13.40), "ENG": (51.51, -0.13), "FRA": (48.86, 2.35), "ITA": (41.90, 12.50),
    "SOV": (55.75, 37.62), "USA": (38.90, -77.04), "JAP": (35.68, 139.69), "AST": (-35.28, 149.13),
    "NZL": (-41.29, 174.78), "CAN": (45.42, -75.70), "MEX": (19.43, -99.13), "BRA": (-22.91, -43.17),
    "ARG": (-34.60, -58.38), "SAF": (-25.75, 28.19), "ETH": (9.01, 38.75), "RAJ": (28.61, 77.21),
    "TUR": (39.93, 32.86), "CHL": (-33.45, -70.67), "NOR": (59.91, 10.75), "SWE": (59.33, 18.07),
    "FIN": (60.17, 24.94), "SPR": (40.42, -3.70), "POR": (38.72, -9.14), "POL": (52.23, 21.01),
    "PER": (35.69, 51.39), "MON": (47.89, 106.91), "MAN": (43.88, 125.32), "IRE": (53.35, -6.26),
    "GRE": (37.98, 23.73), "COL": (4.71, -74.07), "VEN": (10.48, -66.90), "PRU": (-12.05, -77.04),
    "CUB": (23.11, -82.37), "SIA": (13.76, 100.50), "PHI": (14.60, 120.98), "AFG": (34.53, 69.17),
    "SAU": (24.71, 46.68), "IRQ": (33.31, 44.36), "ICE": (64.15, -21.94), "HOL": (52.37, 4.90),
    "BEL": (50.85, 4.35), "DEN": (55.68, 12.57), "EST": (59.44, 24.75), "LAT": (56.95, 24.11),
    "LIT": (54.90, 23.89), "CZE": (50.08, 14.44), "HUN": (47.50, 19.04), "ROM": (44.43, 26.10),
    "BUL": (42.70, 23.32), "YUG": (44.79, 20.45), "SWI": (46.95, 7.45), "AUS": (48.21, 16.37),
    "URG": (-34.90, -56.16), "PAR": (-25.26, -57.58), "BOL": (-16.50, -68.15), "ECU": (-0.18, -78.47),
    "GUA": (14.63, -90.51), "PAN": (8.98, -79.52), "YEM": (15.37, 44.19), "OMA": (23.59, 58.41),
    "NEP": (27.72, 85.32), "TIB": (29.65, 91.17), "INS": (-6.21, 106.85), "TAN": (51.72, 94.45),
    "SIK": (43.83, 87.62), "YUN": (25.04, 102.71), "SHX": (37.87, 112.55), "CHI": (32.06, 118.80),
}


# ---- Fit: pixel -> lon/lat ---------------------------------------------------

def solve(matrix, vector):
    """Gaussian elimination (small systems; no numpy here)."""
    n = len(vector)
    a = [row[:] + [vector[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        a[col], a[pivot] = a[pivot], a[col]
        for r in range(n):
            if r != col:
                f = a[r][col] / a[col][col]
                for c in range(col, n + 1):
                    a[r][c] -= f * a[col][c]
    return [a[i][n] / a[i][i] for i in range(n)]


capitals_by_map = json.load(open(os.path.join(ROOT, "src", "data", "mapCapitals.json"), encoding="utf-8"))
vanilla_caps = capitals_by_map["vanilla"]
pins = [(vanilla_caps[t][0], vanilla_caps[t][1], REAL[t][0], REAL[t][1]) for t in REAL if t in vanilla_caps]
# Coast extremes (HOI4 pixel x, y -> real lat, lon): capitals alone leave the far
# south and north loose, and HOI4 stretches those a lot.
pins += [
    (437.3, 3.85, -55.98, -67.27),  # Cape Horn
    (470.9, 15.3, -52.35, -59.0),  # Falklands, south
    (558.5, 3.45, -54.9, -35.8),  # South Georgia
    (776.0, 16.65, -34.83, 20.0),  # Cape Agulhas
    (1261.95, 1.0, -43.64, 146.8),  # Tasmania, south
    (1359.75, 2.35, -47.29, 167.6),  # Stewart Island
    (798.3, 502.95, 71.13, 27.65),  # Nordkinn
    (109.9, 494.65, 71.39, -156.5),  # Point Barrow
    # The north-west coast: with no capitals there, HOI4's Pacific Northwest,
    # British Columbia and southern Alaska drifted 8-10 degrees north.
    (211.9, 422.45, 48.17, -124.73),  # Cape Alava, the mainland's westmost point
    (219.35, 426.95, 49.0, -123.0),  # where the coast meets the 49th parallel
    (197.4, 436.35, 50.78, -128.43),  # Cape Scott, Vancouver Island
    (179.2, 452.65, 53.6, -133.0),  # Haida Gwaii, west coast
    (187.65, 458.75, 54.67, -132.68),  # Dixon Entrance, the panhandle's south end
    # HOI4 squeezes Alaska's 17 degrees into ~36 px: pin its south side too.
    (63.65, 458.6, 54.6, -163.5),  # the Alaska Peninsula's south-west end
    (97.8, 468.55, 56.9, -154.0),  # Kodiak, south tip
    (149.65, 485.95, 60.3, -146.3),  # the Gulf of Alaska coast near Cordova
]

# Longitude: fixed slope so the seam at x=0 / x=1400 meets exactly; fit the offset.
LON_SLOPE = 360.0 / WIDTH
LON_OFFSET = sum(p[3] - LON_SLOPE * p[0] for p in pins) / len(pins)


def miller(lat):
    return 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(lat)))


def miller_inverse(value):
    return math.degrees(2.5 * math.atan(math.exp(value / 1.25)) - 0.625 * math.pi)


# Latitude: y = c * miller(lat) + d, then a smooth correction field.
n = len(pins)
xs = [miller(p[2]) for p in pins]
ys = [p[1] for p in pins]
sx, sy = sum(xs), sum(ys)
sxx = sum(x * x for x in xs)
sxy = sum(x * y for x, y in zip(xs, ys))
LAT_C = (n * sxy - sx * sy) / (n * sxx - sx * sx)
LAT_D = (sy - LAT_C * sx) / n
residuals = [p[1] - (LAT_C * miller(p[2]) + LAT_D) for p in pins]

SIGMA = 85.0  # px: how far one capital's correction reaches
RIDGE = 0.15  # keeps the warp smooth where capitals disagree


def kernel(ax, ay, bx, by):
    dx = min(abs(ax - bx), WIDTH - abs(ax - bx))  # the map wraps east-west
    dy = ay - by
    return math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA))


gram = [[kernel(p[0], p[1], q[0], q[1]) + (RIDGE if i == j else 0.0) for j, q in enumerate(pins)] for i, p in enumerate(pins)]
weights = solve(gram, residuals)


def to_lon_lat(x, y):
    shift = sum(w * kernel(x, y, p[0], p[1]) for w, p in zip(weights, pins))
    lat = miller_inverse((y - shift - LAT_D) / LAT_C)
    # Not wrapped to +-180: a shape on the seam stays in one piece (the globe
    # doesn't mind 181 degrees; the land drawing draws each shape twice).
    lon = LON_SLOPE * x + LON_OFFSET
    return lon, max(-89.0, min(89.0, lat))


# ---- Lines and outlines ------------------------------------------------------

def simplify(points, tolerance):
    """Douglas-Peucker on a list of (x, y). A closed ring is split in two first."""
    if len(points) < 3:
        return points
    if tuple(points[0]) == tuple(points[-1]):
        ax, ay = points[0]
        far = max(range(len(points)), key=lambda i: (points[i][0] - ax) ** 2 + (points[i][1] - ay) ** 2)
        if far == 0:
            return points[:1]
        return simplify(points[: far + 1], tolerance)[:-1] + simplify(points[far:], tolerance)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        ax, ay = points[start]
        bx, by = points[end]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy) or 1e-9
        best, index = 0.0, -1
        for i in range(start + 1, end):
            px, py = points[i]
            distance = abs(dy * px - dx * py + bx * ay - by * ax) / length
            if distance > best:
                best, index = distance, i
        if best > tolerance and index > 0:
            keep[index] = True
            stack.append((start, index))
            stack.append((index, end))
    return [p for p, k in zip(points, keep) if k]


def key(point):
    return (round(point[0], 3), round(point[1], 3))


def on_seam(a, b):
    """An edge along the map frame (the east-west seam, or where the Arctic is cut off)."""
    return (
        (a[0] < 0.6 and b[0] < 0.6)
        or (a[0] > WIDTH - 0.6 and b[0] > WIDTH - 0.6)
        or (a[1] < 0.6 and b[1] < 0.6)
        or (a[1] > HEIGHT - 0.6 and b[1] > HEIGHT - 0.6)
    )


def chains(segments):
    """Join loose segments into polylines."""
    neighbours = {}
    for a, b in segments:
        neighbours.setdefault(a, []).append(b)
        neighbours.setdefault(b, []).append(a)
    used = set()
    lines = []

    def walk(start, nxt):
        line = [start, nxt]
        used.add(frozenset((start, nxt)))
        while True:
            options = [p for p in neighbours[line[-1]] if frozenset((line[-1], p)) not in used]
            if len(neighbours[line[-1]]) != 2 or not options:
                return line
            used.add(frozenset((line[-1], options[0])))
            line.append(options[0])

    for node, around in neighbours.items():  # open ends and junctions first
        if len(around) != 2:
            for other in around:
                if frozenset((node, other)) not in used:
                    lines.append(walk(node, other))
    for node, around in neighbours.items():  # what's left are closed loops
        for other in around:
            if frozenset((node, other)) not in used:
                lines.append(walk(node, other))
    return lines


def flat(points, tolerance):
    out = []
    for x, y in simplify(points, tolerance):
        lon, lat = to_lon_lat(x, y)
        out += [round(lon, 1), round(lat, 1)]
    return out


def rings_of(geometry):
    if geometry["type"] == "Polygon":
        return geometry["coordinates"]
    return [ring for polygon in geometry["coordinates"] for ring in polygon]


def ring_area(ring):
    return abs(sum(ring[i][0] * ring[i - 1][1] - ring[i - 1][0] * ring[i][1] for i in range(len(ring)))) / 2


# ---- The real Arctic, stitched on at ARCTIC_SEAM ------------------------------

ARCTIC_SEAM = 66.0
arctic = json.load(open(os.path.join(ROOT, "scripts", "data", "arctic.json"), encoding="utf-8"))


def pairs(flat_list):
    return [(flat_list[i], flat_list[i + 1]) for i in range(0, len(flat_list) - 1, 2)]


def unpair(points):
    return [round(v, 1) for p in points for v in p]


def crossing(a, b):
    t = (ARCTIC_SEAM - a[1]) / (b[1] - a[1])
    return (a[0] + (b[0] - a[0]) * t, ARCTIC_SEAM)


def clip_line(flat_line, north):
    """The runs of a line on one side of the seam."""
    inside = (lambda p: p[1] >= ARCTIC_SEAM) if north else (lambda p: p[1] <= ARCTIC_SEAM)
    points = pairs(flat_line)
    runs, current = [], []
    for i, point in enumerate(points):
        if inside(point):
            if not current and i > 0:
                current.append(crossing(points[i - 1], point))
            current.append(point)
        elif current:
            current.append(crossing(points[i - 1], point))
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    return [unpair(r) for r in runs if len(r) >= 2]


def stitch_arctic(result):
    """HOI4's map south of the seam, the real Arctic north of it."""
    result["coast"] = [part for line in result["coast"] for part in clip_line(line, False)]
    result["border"] = [part for line in result["border"] for part in clip_line(line, False)]
    result["coast"] += [part for line in arctic["coast"] for part in clip_line(line, True)]
    result["border"] += [part for line in arctic["border"] for part in clip_line(line, True)]


out_dir = os.path.join(ROOT, "public", "landing")
os.makedirs(out_dir, exist_ok=True)
for name in MAPS:
    data = json.load(open(os.path.join(ROOT, "public", "maps", f"{name}.geojson"), encoding="utf-8"))
    counts = {}
    for feature in data["features"]:
        for ring in rings_of(feature["geometry"]):
            for i in range(1, len(ring)):
                a, b = key(ring[i - 1]), key(ring[i])
                if a == b or on_seam(a, b):
                    continue
                edge = (a, b) if a < b else (b, a)
                counts[edge] = counts.get(edge, 0) + 1
    coast = chains([e for e, c in counts.items() if c == 1])
    border = chains([e for e, c in counts.items() if c > 1])

    caps = {tag: [round(v, 2) for v in to_lon_lat(*xy)] for tag, xy in capitals_by_map[name].items()}
    result = {
        "coast": [line for line in (flat(c, 0.35) for c in coast) if len(line) >= 4],
        "border": [line for line in (flat(c, 0.45) for c in border) if len(line) >= 4],
        "capitals": caps,
    }
    stitch_arctic(result)
    path = os.path.join(out_dir, f"globe-{name}.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(result, handle, separators=(",", ":"))
    points = sum(len(line) for line in result["coast"] + result["border"]) // 2
    print(f"{name}: {os.path.getsize(path) // 1024} KB, {len(result['coast'])} coast + {len(result['border'])} border lines, {points} line points")

check = [(t, to_lon_lat(*vanilla_caps[t]), REAL[t]) for t in ("USA", "CAN", "GER", "SAF", "AST", "BRA")]
for tag, (lon, lat), (real_lat, real_lon) in check:
    print(f"  {tag}: {lat:6.1f},{lon:7.1f}  real {real_lat:6.1f},{real_lon:7.1f}")
print("  map top/bottom:", round(to_lon_lat(700, 509)[1], 1), round(to_lon_lat(700, 0)[1], 1))


# ---- The front page's flat map demo -------------------------------------------
# The vanilla map as SVG paths in its own pixel space (y flipped to point down),
# for the "claim your nation" scene: public/landing/map-vanilla.json.

def svg_path(rings, tolerance):
    parts = []
    for ring in rings:
        points = simplify(ring, tolerance)
        if len(points) < 3:
            continue
        coords = " ".join(f"{x:.1f} {HEIGHT - y:.1f}" for x, y in points)
        parts.append(f"M{coords}Z")
    return "".join(parts).replace(".0 ", " ").replace(".0Z", "Z")


flat = json.load(open(os.path.join(ROOT, "public", "maps", "vanilla.geojson"), encoding="utf-8"))
nations = []
for feature in flat["features"]:
    rings = [ring for ring in rings_of(feature["geometry"]) if ring_area(ring) > 0.25]
    d = svg_path(rings, 0.45)
    if d:
        props = feature["properties"]
        nations.append({"tag": props["tag"], "name": props["name"], "color": props["color"], "d": d})
capitals = {tag: [round(x, 1), round(HEIGHT - y, 1)] for tag, (x, y) in capitals_by_map["vanilla"].items()}
path = os.path.join(out_dir, "map-vanilla.json")
with open(path, "w", encoding="utf-8") as handle:
    json.dump({"width": WIDTH, "height": HEIGHT, "nations": nations, "capitals": capitals}, handle, separators=(",", ":"))
print(f"flat vanilla map: {os.path.getsize(path) // 1024} KB, {len(nations)} nations")

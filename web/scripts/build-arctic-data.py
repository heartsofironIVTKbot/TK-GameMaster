"""
The real Arctic for the front-page globe, from Natural Earth (public domain,
naturalearthdata.com). HOI4's maps stop at about 73.7 degrees north and squeeze
everything up to that edge, so north of a seam the globe uses real geography
instead (build-globe-data.py does the stitching).

Writes scripts/data/arctic.json: everything north of 58 N, in lon/lat rounded
to 0.1 degrees:
  land:   [{iso, rings}]  country shapes (ADM0_A3 code)
  coast:  [line]          where land meets sea
  border: [line]          land borders between countries

Run from web/ with the three 1:50m GeoJSON files (from
github.com/nvkelso/natural-earth-vector, geojson/):
  python scripts/build-arctic-data.py ne_50m_admin_0_countries.geojson \
      ne_50m_land.geojson ne_50m_admin_0_boundary_lines_land.geojson
"""

import json
import os
import sys

SOUTH = 58.0
TOLERANCE = 0.08


def simplify(points, tolerance):
    """Douglas-Peucker on [(lon, lat)]."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        (ax, ay), (bx, by) = points[start], points[end]
        dx, dy = bx - ax, by - ay
        length = (dx * dx + dy * dy) ** 0.5 or 1e-9
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


def polygons(geometry):
    return [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]


def lines_of(geometry):
    return [geometry["coordinates"]] if geometry["type"] == "LineString" else geometry["coordinates"]


def simplify_any(points, tolerance):
    """Douglas-Peucker that also works on closed outlines (first point == last):
    split at the point farthest from the start and simplify both halves."""
    if len(points) > 3 and points[0] == points[-1]:
        far = max(range(len(points)), key=lambda i: (points[i][0] - points[0][0]) ** 2 + (points[i][1] - points[0][1]) ** 2)
        return simplify(points[: far + 1], tolerance)[:-1] + simplify(points[far:], tolerance)
    return simplify(points, tolerance)


def flat(points):
    out = []
    for lon, lat in simplify_any([tuple(p[:2]) for p in points], TOLERANCE):
        out += [round(lon, 1), round(lat, 1)]
    return out


def north_parts(points):
    """The runs of a line that reach north of SOUTH (whole runs, unclipped)."""
    runs, current = [], []
    for p in points:
        if p[1] >= SOUTH:
            current.append(p)
        elif current:
            runs.append(current + [p])
            current = []
    if current:
        runs.append(current)
    return [r for r in runs if len(r) >= 2]


countries_path, land_path, borders_path = sys.argv[1:4]
countries = json.load(open(countries_path, encoding="utf-8"))
land_data = json.load(open(land_path, encoding="utf-8"))
border_data = json.load(open(borders_path, encoding="utf-8"))

land = []
for feature in countries["features"]:
    rings = []
    for polygon in polygons(feature["geometry"]):
        outer = polygon[0]
        if max(p[1] for p in outer) < SOUTH:
            continue
        ring = flat(outer)
        if len(ring) >= 6:
            rings.append(ring)
    if rings:
        land.append({"iso": feature["properties"]["ADM0_A3"], "rings": rings})

coast = []
for feature in land_data["features"]:
    for polygon in polygons(feature["geometry"]):
        for run in north_parts(polygon[0]):
            line = flat(run)
            if len(line) >= 4:
                coast.append(line)

border = []
for feature in border_data["features"]:
    for line in lines_of(feature["geometry"]):
        for run in north_parts(line):
            out = flat(run)
            if len(out) >= 4:
                border.append(out)

root = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(root, "data"), exist_ok=True)
path = os.path.join(root, "data", "arctic.json")
with open(path, "w", encoding="utf-8") as handle:
    json.dump({"source": "Natural Earth 1:50m (public domain)", "land": land, "coast": coast, "border": border}, handle, separators=(",", ":"))
print(f"arctic: {os.path.getsize(path) // 1024} KB, {len(land)} countries, {len(coast)} coast + {len(border)} border lines")

#!/usr/bin/env python3
"""Render a HOI4 state map (SVG) straight from the game's province raster.

Converts ``map/provinces.bmp`` + ``map/definition.csv`` + the effective
``history/states`` set (honouring the mod's ``replace_path`` entries) into an
SVG with one ``<path id="state_<id>">`` per state plus an ``id="ocean"``
background path spanning the full world rectangle. The output feeds
``scripts/svg_to_geojson.py`` exactly like the mapchart SVG does, but state
borders come from the game's own province map — so mods that renumber, add,
or redraw states (Road to 56 ships its own provinces.bmp/definition.csv)
produce a geographically exact political map instead of reusing vanilla
geometry.

Boundary extraction uses junction-safe multi-material marching squares:

- Cells with exactly two distinct corner values emit one straight segment
  between the two crossing points.
- Cells with three or four distinct values emit a half-segment from every
  crossed edge midpoint to the cell center, so all region boundaries meet at
  the center — the cell tiles exactly with no corner-gap dots and no crossing
  diagonals.
- Every boundary is traced exactly once; runs of same-pair segments are
  Douglas-Peucker-simplified once and cached, so the border shared by two
  states is bit-identical on both sides and the GeoJSON union dissolves it
  with zero slivers/tears.

Ownership follows the same 1936.1.1 start rules as the scraper (start-date
``transfer_state`` effects, DLC-gated branches); the resolved ``state_<id>``
-> owner mapping is written next to the SVG for the GeoJSON pass.

Usage::

    py scripts/build_state_map_svg.py ^
        --hoi4-path "C:\\...\\Hearts of Iron IV" ^
        --mod-path "C:\\...\\mod\\ugc_820260968.mod" ^
        --output scripts/raw_assets/road_to_56.svg ^
        --mapping-output scripts/road_to_56_mapping.json ^
        --preview scripts/raw_assets/road_to_56_preview.png

Requirements: numpy + Pillow (see scripts/requirements.txt). The full state
extraction over ~11M pixels takes a minute or two and is only run when the
mod updates.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from hoi4_scraper import (  # noqa: E402
    find_first,
    is_block,
    merged_files,
    mod_replace_paths,
    parse_clausewitz,
    read_text_safe,
    resolve_mod_dir,
    state_start_owner,
)

DEFAULT_OUTPUT = SCRIPT_DIR / "raw_assets" / "road_to_56.svg"
DEFAULT_MAPPING = SCRIPT_DIR / "road_to_56_mapping.json"

# Path ids the GeoJSON pipeline treats as the world background (skipped from
# state matching; their bounding box becomes the FeatureCollection's
# ``world_bounds`` so the frontend fits the full world rectangle).
OCEAN_PATH_ID = "ocean"

# Rings below this area (px²) are dropped. Midpoint-crossing rings around a
# single pixel are diamonds of area 0.5 and junction corner rings are 0.125,
# so only a zero threshold keeps every legitimate feature — the deterministic
# walk produces no degenerate rings to filter.
MIN_RING_AREA = 0.0

# Runs shorter than this (in points) keep their exact raster geometry —
# Douglas-Peucker at pixel scale would collapse 1px islands/corners (their
# max deviation is 0.5px). Long border runs are where smoothing pays off.
MIN_SIMPLIFY_POINTS = 12

# Edge "side" ids around a cell: T/R/B/L for the four pixel-edge crossing
# points, 4 for the cell center. For half-edges (edge midpoint -> center)
# ``va`` is the corner value on the *previous* side (T<-L) and ``vb`` the
# *next* side (T->R), so a walk can tell which corner a turn at the center
# sweeps.
SIDE_T, SIDE_R, SIDE_B, SIDE_L = 0, 1, 2, 3
SIDE_CENTER = 4


# ---------------------------------------------------------------------------
# Province raster -> state grid
# ---------------------------------------------------------------------------

def load_definition(path: Path) -> dict[tuple[int, int, int], int]:
    """Parse ``map/definition.csv`` into RGB -> province id (land only).

    Sea and lake provinces are excluded: they render as background.
    """
    colors: dict[tuple[int, int, int], int] = {}
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.split(";")
        if len(parts) < 5:
            continue
        try:
            province = int(parts[0])
            red, green, blue = int(parts[1]), int(parts[2]), int(parts[3])
        except ValueError:
            continue
        # Column 5 is the type in the base game format (id;r;g;b;name;type);
        # mods like Road to 56 use (id;r;g;b;type;coastal;terrain;continent).
        if parts[4].strip().lower() in ("sea", "lake"):
            continue
        colors[(red, green, blue)] = province
    return colors


def load_state_data(
    state_files: list[Path],
) -> tuple[dict[int, int], dict[int, str]]:
    """Return ``province -> state_id`` and ``state_id -> start owner``."""
    province_to_state: dict[int, int] = {}
    owners: dict[int, str] = {}
    for path in state_files:
        for key, value in parse_clausewitz(read_text_safe(path)):
            if key != "state" or not is_block(value):
                continue
            state_id = find_first(value, "id")
            if not state_id:
                continue
            try:
                state_id = int(str(state_id))
            except ValueError:
                continue
            provinces = find_first(value, "provinces")
            if is_block(provinces):
                for pair_key, pair_value in provinces:
                    for token in (pair_key, pair_value):
                        if not token:
                            continue
                        try:
                            province_to_state[int(str(token))] = state_id
                        except ValueError:
                            continue
            history = find_first(value, "history")
            if is_block(history):
                owner = state_start_owner(history)
                if owner:
                    owners[state_id] = owner
    return province_to_state, owners


def build_state_grid(
    bmp_path: Path,
    colors: dict[tuple[int, int, int], int],
    province_to_state: dict[int, int],
) -> np.ndarray:
    """Rasterize provinces.bmp into an int16 grid: 0 = background, state+1."""
    started = time.monotonic()
    with Image.open(bmp_path) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    print(f"  provinces.bmp: {rgb.shape[1]}x{rgb.shape[0]} loaded in "
          f"{time.monotonic() - started:.1f}s")

    lookup = np.zeros((256, 256, 256), dtype=np.int16)
    assigned = 0
    missing = 0
    for (red, green, blue), province in colors.items():
        state = province_to_state.get(province)
        if state is None:
            missing += 1
            continue
        lookup[red, green, blue] = state + 1
        assigned += 1
    print(f"  {assigned} land provinces mapped to states "
          f"({missing} land provinces not in any state)")

    grid = lookup[rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]]
    land_px = int((grid > 0).sum())
    print(f"  state grid: {land_px} land pixels across "
          f"{len(province_to_state)} state-referenced provinces")
    return grid


# ---------------------------------------------------------------------------
# Junction-safe multi-material marching squares
# ---------------------------------------------------------------------------

def _emit_edges(grid: np.ndarray) -> np.ndarray:
    """Vectorized marching squares over the multi-value grid.

    Returns ``(N, 8)`` rows: x1, y1, x2, y2, va, vb, side1, side2 in padded
    pixel coordinates.
    """
    padded = np.pad(grid.astype(np.int32), 1, constant_values=0)
    b00 = padded[:-1, :-1]
    b10 = padded[:-1, 1:]
    b01 = padded[1:, :-1]
    b11 = padded[1:, 1:]
    cT = b00 != b10
    cR = b10 != b11
    cB = b01 != b11
    cL = b00 != b01
    ncross = (
        cT.astype(np.int8) + cR.astype(np.int8)
        + cB.astype(np.int8) + cL.astype(np.int8)
    )
    rows, cols = ncross.shape
    yy, xx = np.mgrid[0:rows, 0:cols]
    T = (xx + 0.5, yy)
    R = (xx + 1.0, yy + 0.5)
    B = (xx + 0.5, yy + 1.0)
    L = (xx, yy + 0.5)
    C = (xx + 0.5, yy + 0.5)

    segments: list[np.ndarray] = []

    def push(cond, p1, p2, va, vb, side1, side2) -> None:
        if not cond.any():
            return
        x1 = p1[0][cond]
        y1 = p1[1][cond]
        x2 = p2[0][cond]
        y2 = p2[1][cond]
        segments.append(np.stack([
            x1, y1, x2, y2,
            va[cond].astype(np.float64),
            vb[cond].astype(np.float64),
            np.full(x1.shape, side1, dtype=np.float64),
            np.full(x1.shape, side2, dtype=np.float64),
        ], axis=1))

    # Two crossed edges: the boundary between the two values routes through
    # the cell center as two half-edges, so every pixel corner quadrant tiles
    # exactly (a straight diagonal would leave 0.125px² corner gaps at mixed
    # four-pixel junctions).
    two = ncross == 2
    push(two & cT & cL, T, C, b00, b10, SIDE_T, SIDE_CENTER)
    push(two & cT & cL, L, C, b01, b00, SIDE_L, SIDE_CENTER)
    push(two & cT & cR, T, C, b00, b10, SIDE_T, SIDE_CENTER)
    push(two & cT & cR, R, C, b10, b11, SIDE_R, SIDE_CENTER)
    push(two & cT & cB, T, C, b00, b10, SIDE_T, SIDE_CENTER)
    push(two & cT & cB, B, C, b11, b01, SIDE_B, SIDE_CENTER)
    push(two & cR & cB, R, C, b10, b11, SIDE_R, SIDE_CENTER)
    push(two & cR & cB, B, C, b11, b01, SIDE_B, SIDE_CENTER)
    push(two & cL & cB, L, C, b01, b00, SIDE_L, SIDE_CENTER)
    push(two & cL & cB, B, C, b11, b01, SIDE_B, SIDE_CENTER)
    push(two & cL & cR, L, C, b01, b00, SIDE_L, SIDE_CENTER)
    push(two & cL & cR, R, C, b10, b11, SIDE_R, SIDE_CENTER)

    # Three crossed edges (junction cell): every crossed edge gets a
    # half-segment to the cell center.
    three = ncross == 3
    push(three & ~cT, R, C, b10, b11, SIDE_R, SIDE_CENTER)
    push(three & ~cT, L, C, b01, b00, SIDE_L, SIDE_CENTER)
    push(three & ~cT, B, C, b11, b01, SIDE_B, SIDE_CENTER)
    push(three & ~cR, T, C, b00, b10, SIDE_T, SIDE_CENTER)
    push(three & ~cR, L, C, b01, b00, SIDE_L, SIDE_CENTER)
    push(three & ~cR, B, C, b11, b01, SIDE_B, SIDE_CENTER)
    push(three & ~cB, T, C, b00, b10, SIDE_T, SIDE_CENTER)
    push(three & ~cB, R, C, b10, b11, SIDE_R, SIDE_CENTER)
    push(three & ~cB, L, C, b01, b00, SIDE_L, SIDE_CENTER)
    push(three & ~cL, T, C, b00, b10, SIDE_T, SIDE_CENTER)
    push(three & ~cL, R, C, b10, b11, SIDE_R, SIDE_CENTER)
    push(three & ~cL, B, C, b11, b01, SIDE_B, SIDE_CENTER)

    # Four crossed edges: same rule — all four regions meet at the center.
    four = ncross == 4
    push(four, T, C, b00, b10, SIDE_T, SIDE_CENTER)
    push(four, R, C, b10, b11, SIDE_R, SIDE_CENTER)
    push(four, B, C, b11, b01, SIDE_B, SIDE_CENTER)
    push(four, L, C, b01, b00, SIDE_L, SIDE_CENTER)

    if not segments:
        return np.zeros((0, 8), dtype=np.float64)
    return np.concatenate(segments, axis=0)


def _point_key(x: float, y: float) -> tuple[int, int]:
    return (int(round(2.0 * x)), int(round(2.0 * y)))


def _simplify_piece(points, epsilon):
    """Iterative Douglas-Peucker on one polyline piece (endpoints kept)."""
    count = len(points)
    if count <= 2:
        return list(points)
    keep = np.zeros(count, dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, count - 1)]
    px = np.array([p[0] for p in points], dtype=np.float64)
    py = np.array([p[1] for p in points], dtype=np.float64)
    epsilon2 = epsilon * epsilon
    while stack:
        i0, i1 = stack.pop()
        if i1 <= i0 + 1:
            continue
        seg_x = px[i1] - px[i0]
        seg_y = py[i1] - py[i0]
        seg_len2 = seg_x * seg_x + seg_y * seg_y
        span_x = px[i0 + 1:i1]
        span_y = py[i0 + 1:i1]
        if seg_len2 > 0:
            t = (
                (span_x - px[i0]) * seg_x + (span_y - py[i0]) * seg_y
            ) / seg_len2
            t = np.clip(t, 0.0, 1.0)
            dist = (
                (px[i0] + t * seg_x - span_x) ** 2
                + (py[i0] + t * seg_y - span_y) ** 2
            )
        else:
            dist = (span_x - px[i0]) ** 2 + (span_y - py[i0]) ** 2
        if dist.size == 0:
            continue
        furthest = int(np.argmax(dist))
        if dist[furthest] > epsilon2:
            index = i0 + 1 + furthest
            keep[index] = True
            stack.append((i0, index))
            stack.append((index, i1))
    return [points[i] for i in range(count) if keep[i]]


def _simplify_chain(points, protected, epsilon):
    """DP per piece between protected points (junction centers stay exact).

    Junction cells are always two-point pieces between protected points, so
    the simplification only ever smooths long straight border runs — and
    those are cached and shared, keeping both sides bit-identical.
    """
    if len(points) <= 2:
        return list(points)
    result: list = []
    start = 0
    for index in range(1, len(points)):
        if protected[index]:
            piece = _simplify_piece(points[start:index + 1], epsilon)
            if result:
                piece = piece[1:]  # drop the shared junction point
            result.extend(piece)
            start = index
    if start < len(points) - 1:
        result.extend(points[start + 1:])
    return result


def ring_area(points) -> float:
    """Signed shoelace area."""
    total = 0.0
    for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
        total += x1 * y2 - x2 * y1
    return 0.5 * total


def _walk_state_rings(
    edges: np.ndarray, epsilon: float
) -> dict[int, list[list[tuple[float, float]]]]:
    """Assemble every state's boundary rings from the shared edge graph.

    Every boundary is traced exactly once; runs of same-pair segments are
    simplified once and cached by their endpoints, so the border shared by
    two states is bit-identical on both sides.
    """
    count = edges.shape[0]
    if count == 0:
        return {}
    k1 = np.stack(
        [np.rint(edges[:, 0] * 2).astype(np.int64),
         np.rint(edges[:, 1] * 2).astype(np.int64)],
        axis=1,
    )
    k2 = np.stack(
        [np.rint(edges[:, 2] * 2).astype(np.int64),
         np.rint(edges[:, 3] * 2).astype(np.int64)],
        axis=1,
    )
    node_edges: dict[tuple[int, int], list[int]] = {}
    edges_of: dict[int, list[int]] = {}
    for eid in range(count):
        va = int(edges[eid, 4])
        vb = int(edges[eid, 5])
        node_edges.setdefault((int(k1[eid, 0]), int(k1[eid, 1])), []).append(eid)
        node_edges.setdefault((int(k2[eid, 0]), int(k2[eid, 1])), []).append(eid)
        if va:
            edges_of.setdefault(va, []).append(eid)
        if vb and vb != va:
            edges_of.setdefault(vb, []).append(eid)

    chain_cache: dict[tuple, dict] = {}

    def pair_of(eid: int) -> tuple[int, int]:
        va = int(edges[eid, 4])
        vb = int(edges[eid, 5])
        return (min(va, vb), max(va, vb))

    def other_end(eid: int, node: tuple[int, int]) -> tuple[int, int]:
        first = (int(k1[eid, 0]), int(k1[eid, 1]))
        return (int(k2[eid, 0]), int(k2[eid, 1])) if node == first else first

    def other_side(eid: int, node: tuple[int, int]) -> int:
        first = (int(k1[eid, 0]), int(k1[eid, 1]))
        return int(edges[eid, 7]) if node == first else int(edges[eid, 6])

    def center_turn(
        incoming: int, center_node: tuple[int, int],
        candidates: list[int], state_value: int,
    ) -> int:
        """Continue through a degree-4 junction center (diagonal touch).

        The turn sweeping the state's own corner wins: the previous-side
        candidate sweeps ``va``, the next-side candidate sweeps ``vb``.
        """
        side_in = other_side(incoming, center_node)
        va = int(edges[incoming, 4])
        vb = int(edges[incoming, 5])
        for eid in candidates:
            side = other_side(eid, center_node)
            if side == (side_in - 1) % 4 and va == state_value:
                return eid
            if side == (side_in + 1) % 4 and vb == state_value:
                return eid
        return candidates[0]

    def run_chain(
        run_eids: list[int],
        start_node: tuple[int, int],
        end_node: tuple[int, int],
        pair: tuple[int, int],
    ) -> list:
        """Build + simplify one same-pair run, cached for the other side."""
        closed = start_node == end_node
        if closed:
            run_nodes = [start_node]
            cur = start_node
            for eid in run_eids:
                cur = other_end(eid, cur)
                run_nodes.append(cur)
            key = (min(run_nodes), min(run_nodes), pair)
        else:
            key = (min(start_node, end_node), max(start_node, end_node), pair)

        # Build the point list from start_node to end_node, protecting
        # junction centers (interior points of half-edges).
        points: list[tuple[float, float]] = []
        protected: list[bool] = []
        cur = start_node
        for eid in run_eids:
            nxt = other_end(eid, cur)
            if not points:
                points.append((cur[0] / 2.0, cur[1] / 2.0))
                protected.append(True)
            points.append((nxt[0] / 2.0, nxt[1] / 2.0))
            # Junction centers are chain-interior nodes that DP must keep;
            # plain pixel-edge crossings (mids) may be smoothed away.
            if cur == (int(k1[eid, 0]), int(k1[eid, 1])):
                protected.append(int(edges[eid, 7]) == SIDE_CENTER)
            else:
                protected.append(int(edges[eid, 6]) == SIDE_CENTER)
            cur = nxt
        protected[-1] = True
        if closed and len(points) > 1:
            # Drop the duplicated closing point; the cycle is stored and
            # rotated to the requester's start node on lookup.
            points = points[:-1]
            protected = protected[:-1]

        # Short chains keep their exact raster geometry: DP at this scale
        # would collapse single-pixel features.
        if len(points) < MIN_SIMPLIFY_POINTS:
            chain = list(points)
            if closed:
                chain_cache[key] = {"cycle": chain, "start": start_node}
                chain.append(chain[0])
            else:
                chain_cache[key] = {"start": start_node, "points": chain}
            return chain
        cached = chain_cache.get(key)
        if cached is not None:
            if closed:
                start_pt = (start_node[0] / 2.0, start_node[1] / 2.0)
                cycle = list(cached["cycle"])
                try:
                    offset = cycle.index(start_pt)
                except ValueError:
                    offset = 0
                rotated = cycle[offset:] + cycle[:offset]
                return rotated + [start_pt]
            if cached["start"] == start_node:
                return list(cached["points"])
            return list(reversed(cached["points"]))

        if closed:
            # Simplify the cycle split at the first protected point.
            split = next(
                (i for i, flag in enumerate(protected) if flag), 0
            )
            cycle_points = points[split:] + points[:split]
            cycle_flags = protected[split:] + protected[:split]
            cycle_flags[0] = True
            cycle_flags[-1] = True
            closed_chain = cycle_points + [cycle_points[0]]
            closed_flags = cycle_flags + [True]
            simplified = _simplify_chain(closed_chain, closed_flags, epsilon)
            chain_cache[key] = {"cycle": simplified[:-1], "start": start_node}
            return simplified
        simplified = _simplify_chain(points, protected, epsilon)
        chain_cache[key] = {"start": start_node, "points": simplified}
        return simplified

    rings_by_state: dict[int, list[list[tuple[float, float]]]] = {}
    for state_value, state_eids in sorted(edges_of.items()):
        eligible = set(state_eids)
        visited: set[int] = set()
        rings: list[list[tuple[float, float]]] = []
        for start_eid in state_eids:
            if start_eid in visited:
                continue
            start_node = (int(k1[start_eid, 0]), int(k1[start_eid, 1]))
            cur_node = start_node
            incoming: int | None = start_eid
            ring: list[tuple[float, float]] = []
            while incoming is not None and incoming not in visited:
                pair = pair_of(incoming)
                run_start = cur_node
                run_eids: list[int] = []
                while (
                    incoming is not None
                    and incoming not in visited
                    and pair_of(incoming) == pair
                ):
                    run_eids.append(incoming)
                    visited.add(incoming)
                    nxt_node = other_end(incoming, cur_node)
                    candidates = [
                        eid
                        for eid in node_edges.get(nxt_node, ())
                        if eid in eligible
                        and eid != incoming
                        and eid not in visited
                    ]
                    if not candidates:
                        incoming = None
                    elif len(candidates) == 1:
                        incoming = candidates[0]
                    else:
                        incoming = center_turn(
                            incoming, nxt_node, candidates, state_value
                        )
                    cur_node = nxt_node
                chain = run_chain(run_eids, run_start, cur_node, pair)
                if ring:
                    ring.extend(chain[1:])
                else:
                    ring.extend(chain)
            if len(ring) >= 4 and abs(ring_area(ring)) >= MIN_RING_AREA:
                rings.append(ring)
        rings_by_state[state_value] = rings
    return rings_by_state


def extract_state_rings(
    grid: np.ndarray, epsilon: float
) -> dict[int, list[list[tuple[float, float]]]]:
    """All boundary rings per state, offset from padded into grid coords."""
    edges = _emit_edges(grid)
    rings_by_value = _walk_state_rings(edges, epsilon)
    result: dict[int, list[list[tuple[float, float]]]] = {}
    for value, rings in rings_by_value.items():
        state_id = value - 1
        offset_rings = [
            [(x - 1.0, y - 1.0) for x, y in ring]
            for ring in rings
        ]
        result[state_id] = offset_rings
    return result


# ---------------------------------------------------------------------------
# SVG output
# ---------------------------------------------------------------------------

def _format_number(value: float) -> str:
    if value == int(value):
        return str(int(value))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _ring_d(ring: list[tuple[float, float]]) -> str:
    if not ring:
        return ""
    head = ring[0]
    parts = [f"M {_format_number(head[0])} {_format_number(head[1])}"]
    parts.append("L")
    parts.append(" ".join(
        f"{_format_number(x)} {_format_number(y)}" for x, y in ring[1:]
    ))
    parts.append("Z")
    return " ".join(parts)


def write_svg(
    output: Path,
    width: float,
    height: float,
    rings_by_state: dict[int, list[list[tuple[float, float]]]],
    include_ocean: bool = True,
) -> None:
    """Write the SVG: optional ocean background rect + one path per state."""
    width_text = _format_number(width)
    height_text = _format_number(height)
    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {width_text} {height_text}" '
        f'width="{width_text}" height="{height_text}">',
    ]
    if include_ocean:
        lines.append(
            f'<path id="{OCEAN_PATH_ID}" d="M 0 0 L {width_text} 0 '
            f'L {width_text} {height_text} L 0 {height_text} Z"/>'
        )
    for state_id in sorted(rings_by_state):
        rings = rings_by_state[state_id]
        if not rings:
            continue
        data = " ".join(_ring_d(ring) for ring in rings)
        lines.append(f'<path id="state_{state_id}" fill="#c8c8c8" d="{data}"/>')
    lines.append("</svg>")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Preview render (optional diagnostic PNG)
# ---------------------------------------------------------------------------

def write_preview(
    preview: Path, grid: np.ndarray, width: int, height: int
) -> None:
    """Downscale the state grid into a colour-coded preview PNG."""
    max_side = 1500
    scale = max(1, max(width, height) // max_side)
    small = grid[::scale, ::scale]
    palette: dict[int, tuple[int, int, int]] = {0: (22, 40, 59)}
    state = np.random.RandomState(1337)
    for value in np.unique(small):
        if value == 0:
            continue
        hue_f = state.uniform(0.0, 1.0)
        h6 = int(hue_f * 6) % 6
        f = (hue_f * 6) % 1
        q = 0.55 * (1 - f)
        t = 0.55 * f
        v = 0.55
        if h6 == 0:
            r, g, b = v, t, 0.0
        elif h6 == 1:
            r, g, b = q, v, 0.0
        elif h6 == 2:
            r, g, b = 0.0, v, t
        elif h6 == 3:
            r, g, b = 0.0, q, v
        elif h6 == 4:
            r, g, b = t, 0.0, v
        else:
            r, g, b = v, 0.0, q
        palette[value] = (
            int(255 * (r + 0.45)),
            int(255 * (g + 0.45)),
            int(255 * (b + 0.45)),
        )
    image = Image.new("RGB", (small.shape[1], small.shape[0]))
    pixels = image.load()
    for y in range(small.shape[0]):
        for x in range(small.shape[1]):
            pixels[x, y] = palette[int(small[y, x])]
    preview.parent.mkdir(parents=True, exist_ok=True)
    image.save(preview)
    print(f"Wrote preview {preview}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--hoi4-path", required=True, help="Base HOI4 installation directory."
    )
    parser.add_argument(
        "--mod-path",
        help="Optional mod directory (or its .mod descriptor file).",
    )
    parser.add_argument(
        "--output", type=Path, default=DEFAULT_OUTPUT,
        help=f"Output SVG (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--mapping-output", type=Path, default=DEFAULT_MAPPING,
        help=(
            "Output state_<id> -> owner mapping JSON "
            f"(default: {DEFAULT_MAPPING})"
        ),
    )
    parser.add_argument(
        "--simplify",
        type=float,
        default=0.5,
        help=(
            "Douglas-Peucker epsilon in map pixels for long border runs "
            "(default: 0.5; short runs always keep exact geometry). Shared "
            "borders are simplified once and reused on both sides, so "
            "smoothing never reopens slivers between adjacent states."
        ),
    )
    parser.add_argument(
        "--preview", type=Path, default=None,
        help="Optional colour-coded preview PNG of the state grid.",
    )
    parser.add_argument(
        "--world-height",
        type=float,
        default=None,
        help=(
            "Scale the output so the land extent's height matches this many "
            "map units. The vanilla mapchart world is 509.0 units tall — "
            "pass 509.0 so the modded map zooms/pans exactly like vanilla "
            "(same fill zoom, same wrap feel)."
        ),
    )
    parser.add_argument(
        "--no-ocean",
        action="store_true",
        help=(
            "Skip the ocean background path. The GeoJSON then has no "
            "world_bounds and the viewer fits the land extent — exactly "
            "like the vanilla mapchart map."
        ),
    )
    parser.add_argument(
        "--void-tags",
        default="",
        help=(
            "Comma-separated owner tags to treat as ownerless (e.g. OBG). "
            "Their states still get geometry but the mapping records null, "
            "so the GeoJSON pass renders them as grey non-clickable Void "
            "tiles instead of a nation."
        ),
    )
    args = parser.parse_args(argv)
    void_tags = {tag.strip().upper() for tag in args.void_tags.split(",") if tag.strip()}

    base = Path(args.hoi4_path).resolve()
    if not base.is_dir():
        print(f"ERROR: HOI4 path not found: {base}")
        return 1
    mod = resolve_mod_dir(args.mod_path, base)
    if mod:
        print(f"Mod root: {mod}")
    replace_paths = mod_replace_paths(args.mod_path, mod)

    # Effective map files: the mod's map/ wins over the base game's.
    bmp_path = None
    definition_path = None
    for root in (mod, base):
        if root is None:
            continue
        if bmp_path is None and (root / "map" / "provinces.bmp").is_file():
            bmp_path = root / "map" / "provinces.bmp"
        if definition_path is None and (root / "map" / "definition.csv").is_file():
            definition_path = root / "map" / "definition.csv"
    if bmp_path is None or definition_path is None:
        print("ERROR: could not find map/provinces.bmp + map/definition.csv")
        return 1
    print(f"Map raster: {bmp_path}")
    print(f"Definition: {definition_path}")

    print("Parsing history/states...")
    state_files = merged_files(
        "history/states", base, mod, replace_paths=replace_paths
    )
    province_to_state, owners = load_state_data(state_files)
    if void_tags:
        owners = {
            state_id: (None if tag in void_tags else tag)
            for state_id, tag in owners.items()
        }
        print(f"  Forced to Void: {sorted(void_tags)}")
    print(f"  {len(province_to_state)} provinces across "
          f"{len([t for t in owners.values() if t])} states with an owner")

    print("Loading definition.csv...")
    colors = load_definition(definition_path)
    print(f"  {len(colors)} land provinces defined")

    grid = build_state_grid(bmp_path, colors, province_to_state)
    height, width = grid.shape

    print("Extracting state boundaries (junction-safe marching squares)...")
    started = time.monotonic()
    rings_by_state = extract_state_rings(grid, args.simplify)
    print(f"  {len(rings_by_state)} states with geometry "
          f"({time.monotonic() - started:.1f}s)")
    covered_px = sum(
        int((grid == state_id + 1).sum()) for state_id in rings_by_state
    )
    land_px = int((grid > 0).sum())
    print(
        f"  {covered_px}/{land_px} land pixels covered "
        f"({100.0 * covered_px / max(1, land_px):.1f}%)"
    )

    missing_states = sorted(set(owners) - set(rings_by_state))
    if missing_states:
        print(
            f"  WARNING: {len(missing_states)} states have no raster pixels: "
            f"{missing_states[:20]}"
        )

    # Ownerless states: mod authors deliberately void states for balance/lag
    # (OAK voids Afghanistan, Argentina, ...; --void-tags forces extra tags
    # such as TFB/BFFU's OBG placeholder). They still get geometry; the
    # mapping records ``null`` so the GeoJSON pass renders them as grey
    # "Void" tiles instead of fuzzy-matching an owner.
    void_states = sorted(
        state_id for state_id in rings_by_state if owners.get(state_id) is None
    )
    if void_states:
        print(f"  {len(void_states)} ownerless states will render as Void: "
              f"{void_states[:30]}")

    # Optional uniform scale so the land extent matches a target world
    # height (509.0 = the vanilla mapchart world) — the viewer then zooms
    # and wraps exactly like vanilla.
    scale = 1.0
    if args.world_height:
        min_y = min(
            y
            for rings in rings_by_state.values()
            for ring in rings
            for _, y in ring
        )
        max_y = max(
            y
            for rings in rings_by_state.values()
            for ring in rings
            for _, y in ring
        )
        scale = args.world_height / max(1e-6, max_y - min_y)
        print(f"  Scaling to world height {args.world_height}: "
              f"factor {scale:.6f}")
        rings_by_state = {
            state_id: [
                [(x * scale, y * scale) for x, y in ring]
                for ring in rings
            ]
            for state_id, rings in rings_by_state.items()
        }

    write_svg(
        args.output,
        width * scale,
        height * scale,
        rings_by_state,
        include_ocean=not args.no_ocean,
    )

    mapping = {f"state_{state_id}": owners.get(state_id)
               for state_id in sorted(set(owners) | set(rings_by_state))}
    args.mapping_output.parent.mkdir(parents=True, exist_ok=True)
    args.mapping_output.write_text(
        json.dumps(mapping, indent=4) + "\n", encoding="utf-8"
    )

    if args.preview:
        write_preview(args.preview, grid, width, height)

    print(f"Wrote {args.output} ({len(rings_by_state)} states, "
          f"{_format_number(width * scale)}x{_format_number(height * scale)})")
    print(f"Wrote {args.mapping_output} ({len(mapping)} states)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

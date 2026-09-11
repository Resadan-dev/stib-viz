"""The reference of residents: where the people of the 19 municipalities live, on a 50 m grid.

Built once a year from two Statbel files with ``stibviz residents`` and committed under
``reference/`` (docs/03-commune-coverage.md, D27 to D31). The daily build reads it with
:func:`load_reference` and never downloads Statbel. Four things come out of the two files:

- the grid, aligned on Web Mercator so the site can lay it over the map as one image (D28);
- the residents, each sector's population shared evenly among the cells whose centre it holds, a
  sector smaller than a cell keeping its residents on the cell under it (D8);
- the municipal borders, taken from the sectors' own edges, which Statbel draws so that
  neighbours share every vertex (D29);
- where each municipality's name goes: the cell farthest from its border (D30).
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from collections import defaultdict, deque
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from itertools import pairwise
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

from stibviz.geometry import (
    ORIGIN_LAT,
    FloatArray,
    douglas_peucker_mask,
    from_mercator,
    to_mercator,
)
from stibviz.lambert2008 import from_lambert2008

IntArray = NDArray[np.int64]
Vertex = tuple[int, int]
Edge = tuple[Vertex, Vertex]

BRUSSELS_PREFIX = "21"
CELL_GROUND_M = 50.0
# 50 m on the ground at the latitude of Brussels, in the stretched metres of Web Mercator.
CELL_MERCATOR_M = CELL_GROUND_M / float(np.cos(np.radians(ORIGIN_LAT)))
BORDER_TOLERANCE_M = 1.0
COORDINATE_DECIMALS = 6
REFERENCE_FORMAT = 1
DEFAULT_REFERENCE = Path(__file__).resolve().parent / "reference" / "brussels.json"
UNLOCATED_SUFFIX = "ZZZZ"
LAMBERT_2008 = "3812"
_CRS = re.compile(r'"crs"\s*:.*?EPSG::?(\d+)')
_MUNICIPALITY = re.compile(r'"cd_munty_refnis"\s*:\s*"(\d+)"')
_YEAR = re.compile(r"(\d{4})")
_POINTS_PER_CHUNK = 4000


class ReferenceError(ValueError):
    """The Statbel files, or the reference file, are not what the pipeline expects."""


@dataclass(frozen=True)
class SectorShape:
    """One statistical sector as Statbel draws it, its rings in Lambert 2008 metres."""

    code: str
    municipality: str
    name_fr: str
    name_nl: str
    situation: str
    rings: tuple[FloatArray, ...]


@dataclass(frozen=True)
class StatbelPopulation:
    residents: dict[str, int]
    unlocated: int
    reference_date: str


@dataclass(frozen=True)
class Grid:
    """Square cells of ``cell_m`` Web Mercator metres. Cell (ix, iy) has its south-west corner at
    (x0 + ix * cell_m, y0 + iy * cell_m), rows counted from the south; its flat index is
    iy * nx + ix."""

    x0: float
    y0: float
    cell_m: float
    nx: int
    ny: int

    def centres(self, index: IntArray) -> tuple[FloatArray, FloatArray]:
        """Longitude and latitude of the centre of each cell."""
        ix, iy = index % self.nx, index // self.nx
        return from_mercator(self.x0 + (ix + 0.5) * self.cell_m, self.y0 + (iy + 0.5) * self.cell_m)


@dataclass(frozen=True)
class Municipality:
    code: str
    name_fr: str
    name_nl: str
    residents: int
    label: tuple[float, float]


@dataclass(frozen=True)
class Border:
    """A stretch of border between junctions, with the one or two municipalities along it."""

    municipalities: tuple[int, ...]
    lon: FloatArray
    lat: FloatArray


@dataclass(frozen=True)
class Reference:
    """The grid and who lives in it. Cells are entries: one per cell of the Region, plus one for
    each sector too small to hold a cell centre, sorted by flat index."""

    grid: Grid
    municipalities: tuple[Municipality, ...]
    sector_codes: tuple[str, ...]
    sector_municipality: IntArray
    sector_population: IntArray
    cell_index: IntArray
    cell_sector: IntArray
    borders: tuple[Border, ...]
    unlocated: int
    sources: Mapping[str, str]

    def cell_residents(self) -> FloatArray:
        counts = np.bincount(self.cell_sector, minlength=len(self.sector_codes))
        return self.sector_population[self.cell_sector] / counts[self.cell_sector]

    def cell_municipality(self) -> IntArray:
        return self.sector_municipality[self.cell_sector]

    def cell_centres(self) -> tuple[FloatArray, FloatArray]:
        return self.grid.centres(self.cell_index)


# --- Reading Statbel ----------------------------------------------------------------------------


def read_statbel_sectors(path: Path, prefix: str = BRUSSELS_PREFIX) -> list[SectorShape]:
    """The sectors whose municipality code starts with ``prefix``, from a Statbel GeoJSON zip.

    Statbel writes one feature per line, so the national file (227 MB) is streamed and only the
    lines of the Region are parsed.
    """
    with zipfile.ZipFile(path) as archive:
        member = next((n for n in archive.namelist() if n.lower().endswith(".geojson")), None)
        if member is None:
            raise ReferenceError(f"{path.name}: no GeoJSON inside the archive")
        with archive.open(member) as raw:
            return _read_features(io.TextIOWrapper(raw, encoding="utf-8"), prefix, path.name)


def _read_features(lines: Iterable[str], prefix: str, name: str) -> list[SectorShape]:
    crs: str | None = None
    sectors = []
    for line in lines:
        text = line.strip()
        if not text.startswith("{") or '"Feature"' not in text[:40]:
            if crs is None and (found := _CRS.search(text)):
                crs = found.group(1)
            continue
        if crs != LAMBERT_2008:
            raise ReferenceError(_projection_message(name, crs))
        municipality = _MUNICIPALITY.search(text)
        if municipality is None or not municipality.group(1).startswith(prefix):
            continue
        sectors.append(_sector(json.loads(text.rstrip(","))))
    if crs != LAMBERT_2008:
        raise ReferenceError(_projection_message(name, crs))
    return sorted(sectors, key=lambda sector: sector.code)


def _projection_message(name: str, crs: str | None) -> str:
    found = f"EPSG:{crs}" if crs else "no declared projection"
    return f"{name}: sectors in {found}, expected Belgian Lambert 2008 (EPSG:{LAMBERT_2008})"


def _sector(feature: Mapping[str, Any]) -> SectorShape:
    props, geometry = feature["properties"], feature["geometry"]
    if geometry["type"] == "Polygon":
        polygons = [geometry["coordinates"]]
    elif geometry["type"] == "MultiPolygon":
        polygons = geometry["coordinates"]
    else:
        raise ReferenceError(f"sector {props.get('cd_sector')}: geometry {geometry['type']}")
    return SectorShape(
        code=str(props["cd_sector"]),
        municipality=str(props["cd_munty_refnis"]),
        name_fr=str(props["tx_munty_descr_fr"]),
        name_nl=str(props["tx_munty_descr_nl"]),
        situation=str(props.get("dt_situation", "")).replace("/", "-"),
        rings=tuple(
            np.asarray(ring, dtype=np.float64)[:, :2] for polygon in polygons for ring in polygon
        ),
    )


def read_statbel_population(
    path: Path, prefix: str = BRUSSELS_PREFIX, reference_date: str | None = None
) -> StatbelPopulation:
    """Residents per sector from a Statbel population zip; "ZZZZ" rows, residents Statbel could
    not place in a sector, are counted apart. The reference date comes from the year in the file
    name (``OPENDATA_SECTOREN_2025_NEW``: 1 January 2025) unless given."""
    with zipfile.ZipFile(path) as archive:
        member = next((n for n in archive.namelist() if n.lower().endswith(".txt")), None)
        if member is None:
            raise ReferenceError(f"{path.name}: no text file inside the archive")
        rows = archive.read(member).decode("cp1252", errors="replace").splitlines()
    header = rows[0].split("|") if rows else []
    missing = [column for column in ("CD_SECTOR", "TOTAL") if column not in header]
    if missing:
        raise ReferenceError(f"{path.name}: missing column(s) {', '.join(missing)}")
    code_at, total_at = header.index("CD_SECTOR"), header.index("TOTAL")
    residents: dict[str, int] = {}
    unlocated = 0
    for row in rows[1:]:
        cells = row.split("|")
        if len(cells) <= max(code_at, total_at) or not cells[code_at].startswith(prefix):
            continue
        code = cells[code_at].strip()
        try:
            count = int(cells[total_at])
        except ValueError as exc:
            raise ReferenceError(f"{path.name}: {code}: {cells[total_at]!r} is no count") from exc
        if code.endswith(UNLOCATED_SUFFIX):
            unlocated += count
        else:
            residents[code] = residents.get(code, 0) + count
    if reference_date is None:
        year = _YEAR.search(path.stem)
        if year is None:
            raise ReferenceError(f"{path.name}: no year in the file name; give the date")
        reference_date = f"{year.group(1)}-01-01"
    return StatbelPopulation(residents, unlocated, reference_date)


# --- Building the reference ---------------------------------------------------------------------


def build_reference(
    sectors: Sequence[SectorShape], population: StatbelPopulation, *, sources: Mapping[str, str]
) -> Reference:
    """The grid, the residents of every cell, the municipalities and their borders."""
    if not sectors:
        raise ReferenceError("no sector to build a reference from")
    codes = sorted({sector.municipality for sector in sectors})
    municipality_of = {code: i for i, code in enumerate(codes)}
    names = {sector.municipality: (sector.name_fr, sector.name_nl) for sector in sectors}
    mercator = [[_ring_to_mercator(ring) for ring in sector.rings] for sector in sectors]
    grid = _grid(mercator)
    sector_of = _assign_cells(grid, mercator)
    sector_population = np.array(
        [population.residents.get(sector.code, 0) for sector in sectors], dtype=np.int64
    )
    sector_municipality = np.array(
        [municipality_of[sector.municipality] for sector in sectors], dtype=np.int64
    )
    cell_index, cell_sector = _entries(grid, sector_of, mercator, sector_population)
    raster = np.where(sector_of >= 0, sector_municipality[np.maximum(sector_of, 0)] + 1, 0)
    labels = _label_cells(raster.reshape(grid.ny, grid.nx), len(codes))
    for k in np.flatnonzero(labels < 0):  # only sectors smaller than a cell: use their cell
        labels[k] = cell_index[sector_municipality[cell_sector] == k][0]
    label_lon, label_lat = grid.centres(labels)
    residents = np.bincount(sector_municipality, weights=sector_population, minlength=len(codes))
    known = {sector.code for sector in sectors}
    elsewhere = sum(n for code, n in population.residents.items() if code not in known)
    return Reference(
        grid=grid,
        municipalities=tuple(
            Municipality(
                code=code,
                name_fr=names[code][0],
                name_nl=names[code][1],
                residents=round(float(residents[i])),
                label=(
                    round(float(label_lon[i]), COORDINATE_DECIMALS),
                    round(float(label_lat[i]), COORDINATE_DECIMALS),
                ),
            )
            for i, code in enumerate(codes)
        ),
        sector_codes=tuple(sector.code for sector in sectors),
        sector_municipality=sector_municipality,
        sector_population=sector_population,
        cell_index=cell_index,
        cell_sector=cell_sector,
        borders=_borders(sectors, [municipality_of[s.municipality] for s in sectors]),
        unlocated=population.unlocated + elsewhere,
        sources=dict(sources),
    )


def _ring_to_mercator(ring: FloatArray) -> FloatArray:
    lon, lat = from_lambert2008(ring[:, 0], ring[:, 1])
    x, y = to_mercator(lon, lat)
    return np.column_stack([x, y])


def _grid(mercator: Sequence[Sequence[FloatArray]]) -> Grid:
    xs = np.concatenate([ring[:, 0] for rings in mercator for ring in rings])
    ys = np.concatenate([ring[:, 1] for rings in mercator for ring in rings])
    x0 = float(np.floor(xs.min() / CELL_MERCATOR_M) * CELL_MERCATOR_M)
    y0 = float(np.floor(ys.min() / CELL_MERCATOR_M) * CELL_MERCATOR_M)
    nx = int((xs.max() - x0) // CELL_MERCATOR_M) + 1
    ny = int((ys.max() - y0) // CELL_MERCATOR_M) + 1
    return Grid(x0=x0, y0=y0, cell_m=CELL_MERCATOR_M, nx=nx, ny=ny)


def _inside(px: FloatArray, py: FloatArray, rings: Sequence[FloatArray]) -> NDArray[np.bool_]:
    """Even-odd rule over every ring of a sector, outer rings and holes alike."""
    result = np.zeros(px.shape, dtype=bool)
    for ring in rings:
        x0, y0 = ring[:, 0], ring[:, 1]
        x1, y1 = np.roll(x0, -1), np.roll(y0, -1)
        for start in range(0, len(px), _POINTS_PER_CHUNK):
            qx = px[start : start + _POINTS_PER_CHUNK, None]
            qy = py[start : start + _POINTS_PER_CHUNK, None]
            crosses = (y0 > qy) != (y1 > qy)
            with np.errstate(divide="ignore", invalid="ignore"):
                x_at = x0 + (qy - y0) * (x1 - x0) / (y1 - y0)
            odd = (crosses & (qx < x_at)).sum(axis=1) % 2 == 1
            result[start : start + _POINTS_PER_CHUNK] ^= odd
    return result


def _assign_cells(grid: Grid, mercator: Sequence[Sequence[FloatArray]]) -> IntArray:
    """The sector holding each cell centre, -1 outside; the first sector wins a shared centre."""
    sector_of = np.full(grid.nx * grid.ny, -1, dtype=np.int64)
    for k, rings in enumerate(mercator):
        xs = (np.concatenate([ring[:, 0] for ring in rings]) - grid.x0) // grid.cell_m
        ys = (np.concatenate([ring[:, 1] for ring in rings]) - grid.y0) // grid.cell_m
        ix = np.arange(int(xs.min()), int(xs.max()) + 1)
        iy = np.arange(int(ys.min()), int(ys.max()) + 1)
        gx, gy = (a.ravel() for a in np.meshgrid(ix, iy))
        cx, cy = grid.x0 + (gx + 0.5) * grid.cell_m, grid.y0 + (gy + 0.5) * grid.cell_m
        hit = _inside(cx, cy, rings)
        flat = gy[hit] * grid.nx + gx[hit]
        sector_of[flat[sector_of[flat] == -1]] = k
    return sector_of


def _entries(
    grid: Grid,
    sector_of: IntArray,
    mercator: Sequence[Sequence[FloatArray]],
    population: IntArray,
) -> tuple[IntArray, IntArray]:
    """One entry per cell of the Region, plus one per inhabited sector that holds no centre."""
    index = np.flatnonzero(sector_of >= 0)
    sector = sector_of[index]
    covered = np.bincount(sector, minlength=len(mercator))
    extra_index, extra_sector = [], []
    for k in np.flatnonzero((covered == 0) & (population > 0)):
        outer = mercator[k][0]
        x, y = outer[:-1, 0].mean(), outer[:-1, 1].mean()
        ix = int(np.clip((x - grid.x0) // grid.cell_m, 0, grid.nx - 1))
        iy = int(np.clip((y - grid.y0) // grid.cell_m, 0, grid.ny - 1))
        extra_index.append(iy * grid.nx + ix)
        extra_sector.append(int(k))
    all_index = np.concatenate([index, np.array(extra_index, dtype=np.int64)])
    all_sector = np.concatenate([sector, np.array(extra_sector, dtype=np.int64)])
    order = np.lexsort((all_sector, all_index))
    return all_index[order].astype(np.int64), all_sector[order].astype(np.int64)


def _label_cells(raster: IntArray, count: int) -> IntArray:
    """Per municipality (raster value k + 1), the flat index of its cell farthest from a border."""
    ny, nx = raster.shape
    padded = np.pad(raster, 1)
    centre = padded[1:-1, 1:-1]
    edge = (
        (padded[:-2, 1:-1] != centre)
        | (padded[2:, 1:-1] != centre)
        | (padded[1:-1, :-2] != centre)
        | (padded[1:-1, 2:] != centre)
    ) & (raster > 0)
    dist = np.where(edge, 0, -1)
    queue = deque(zip(*np.nonzero(edge), strict=True))
    while queue:
        iy, ix = queue.popleft()
        for jy, jx in ((iy + 1, ix), (iy - 1, ix), (iy, ix + 1), (iy, ix - 1)):
            inside = 0 <= jy < ny and 0 <= jx < nx
            if inside and dist[jy, jx] < 0 and raster[jy, jx] == raster[iy, ix]:
                dist[jy, jx] = dist[iy, ix] + 1
                queue.append((jy, jx))
    # -1 for a municipality that holds no cell centre at all: the caller places it otherwise.
    return np.array(
        [
            int(np.argmax(np.where(raster == k + 1, dist, -1))) if np.any(raster == k + 1) else -1
            for k in range(count)
        ]
    )


def _borders(sectors: Sequence[SectorShape], owners: Sequence[int]) -> tuple[Border, ...]:
    """Edges not shared inside a municipality, chained between junctions, simplified with their
    ends fixed so neighbouring stretches stay joined."""
    occurrences: dict[Edge, list[int]] = defaultdict(list)
    for sector, owner in zip(sectors, owners, strict=True):
        for ring in sector.rings:
            points = [(round(x * 100), round(y * 100)) for x, y in ring]  # whole centimetres
            if points[0] != points[-1]:
                points.append(points[0])
            for a, b in pairwise(points):
                if a != b:
                    occurrences[(a, b) if a < b else (b, a)].append(owner)
    kept: dict[Edge, tuple[int, ...]] = {}
    for edge, sides in occurrences.items():
        if len(sides) > 2:
            raise ReferenceError(f"an edge is shared by {len(sides)} sectors: they do not tile")
        if len(sides) == 2 and sides[0] == sides[1]:
            continue
        kept[edge] = tuple(sorted(set(sides)))
    borders = []
    for municipalities, vertices in _chain(kept):
        xy = np.array(vertices, dtype=np.float64) / 100
        keep = douglas_peucker_mask(xy[:, 0], xy[:, 1], BORDER_TOLERANCE_M)
        lon, lat = from_lambert2008(xy[keep, 0], xy[keep, 1])
        borders.append(
            Border(
                municipalities,
                np.round(lon, COORDINATE_DECIMALS),
                np.round(lat, COORDINATE_DECIMALS),
            )
        )
    return tuple(borders)


def _chain(kept: Mapping[Edge, tuple[int, ...]]) -> list[tuple[tuple[int, ...], list[Vertex]]]:
    """Walk the edges into polylines that stop where borders meet or change sides."""
    incident: dict[Vertex, list[Edge]] = defaultdict(list)
    for edge in kept:
        incident[edge[0]].append(edge)
        incident[edge[1]].append(edge)

    def is_junction(vertex: Vertex) -> bool:
        edges = incident[vertex]
        return len(edges) != 2 or kept[edges[0]] != kept[edges[1]]

    visited: set[Edge] = set()

    def walk(start: Vertex, edge: Edge) -> list[Vertex]:
        path, current = [start], start
        while True:
            visited.add(edge)
            current = edge[1] if edge[0] == current else edge[0]
            path.append(current)
            onward = [e for e in incident[current] if e not in visited]
            if current == start or is_junction(current) or not onward:
                return path
            edge = onward[0]

    chains = []
    for vertex in sorted(incident):
        if is_junction(vertex):
            for edge in sorted(incident[vertex]):
                if edge not in visited:
                    chains.append((kept[edge], walk(vertex, edge)))
    for edge in sorted(kept):  # rings with no junction at all: an island, a lone municipality
        if edge not in visited:
            chains.append((kept[edge], walk(edge[0], edge)))
    return chains


# --- The reference file -------------------------------------------------------------------------


def _runs(index: IntArray, sector: IntArray) -> list[list[int]]:
    """Consecutive cells of one sector as [first flat index, count, sector]."""
    breaks = np.flatnonzero((np.diff(index) != 1) | (np.diff(sector) != 0)) + 1
    starts = np.concatenate([[0], breaks])
    ends = np.concatenate([breaks, [len(index)]])
    return [[int(index[s]), int(e - s), int(sector[s])] for s, e in zip(starts, ends, strict=True)]


def reference_payload(reference: Reference) -> dict[str, Any]:
    grid = reference.grid
    return {
        "format": REFERENCE_FORMAT,
        "sources": dict(reference.sources),
        "grid": {
            "projection": "EPSG:3857",
            "ground_m": CELL_GROUND_M,
            "cell_m": grid.cell_m,
            "x0": grid.x0,
            "y0": grid.y0,
            "nx": grid.nx,
            "ny": grid.ny,
        },
        "unlocated": reference.unlocated,
        "municipalities": [
            {
                "code": m.code,
                "name_fr": m.name_fr,
                "name_nl": m.name_nl,
                "residents": m.residents,
                "label": list(m.label),
            }
            for m in reference.municipalities
        ],
        "sectors": [
            [code, int(municipality), int(population)]
            for code, municipality, population in zip(
                reference.sector_codes,
                reference.sector_municipality,
                reference.sector_population,
                strict=True,
            )
        ],
        "cells": _runs(reference.cell_index, reference.cell_sector),
        "borders": [
            {
                "municipalities": list(border.municipalities),
                "coordinates": np.column_stack([border.lon, border.lat]).tolist(),
            }
            for border in reference.borders
        ],
    }


def write_reference(reference: Reference, path: Path) -> int:
    """Write the reference as compact JSON; returns its size in bytes."""
    text = json.dumps(reference_payload(reference), ensure_ascii=False, separators=(",", ":"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def load_reference(path: Path = DEFAULT_REFERENCE) -> Reference:
    """Read a reference written by :func:`write_reference`, checking its internal consistency."""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ReferenceError(f"{path}: cannot read the reference of residents: {exc}") from exc
    if payload.get("format") != REFERENCE_FORMAT:
        raise ReferenceError(
            f"{path}: reference format {payload.get('format')!r}, expected {REFERENCE_FORMAT}"
        )
    try:
        return _reference_from(payload)
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        raise ReferenceError(f"{path}: malformed reference of residents: {exc}") from exc


def _reference_from(payload: Mapping[str, Any]) -> Reference:
    g = payload["grid"]
    grid = Grid(
        x0=float(g["x0"]),
        y0=float(g["y0"]),
        cell_m=float(g["cell_m"]),
        nx=int(g["nx"]),
        ny=int(g["ny"]),
    )
    municipalities = tuple(
        Municipality(
            code=str(m["code"]),
            name_fr=str(m["name_fr"]),
            name_nl=str(m["name_nl"]),
            residents=int(m["residents"]),
            label=(float(m["label"][0]), float(m["label"][1])),
        )
        for m in payload["municipalities"]
    )
    sectors = payload["sectors"]
    sector_municipality = np.array([int(s[1]) for s in sectors], dtype=np.int64)
    sector_population = np.array([int(s[2]) for s in sectors], dtype=np.int64)
    runs = payload["cells"]
    cell_index = np.concatenate([np.arange(first, first + n) for first, n, _ in runs])
    cell_sector = np.concatenate([np.full(n, sector) for _, n, sector in runs])
    cell_index, cell_sector = cell_index.astype(np.int64), cell_sector.astype(np.int64)
    if len(municipalities) == 0 or np.any(sector_municipality >= len(municipalities)):
        raise ValueError("a sector names a municipality the reference does not list")
    if np.any(cell_sector >= len(sectors)) or np.any(cell_index >= grid.nx * grid.ny):
        raise ValueError("a cell lies outside the grid or names an unknown sector")
    borders = tuple(
        Border(
            tuple(int(i) for i in b["municipalities"]),
            np.array([p[0] for p in b["coordinates"]], dtype=np.float64),
            np.array([p[1] for p in b["coordinates"]], dtype=np.float64),
        )
        for b in payload["borders"]
    )
    return Reference(
        grid=grid,
        municipalities=municipalities,
        sector_codes=tuple(str(s[0]) for s in sectors),
        sector_municipality=sector_municipality,
        sector_population=sector_population,
        cell_index=cell_index,
        cell_sector=cell_sector,
        borders=borders,
        unlocated=int(payload["unlocated"]),
        sources={str(k): str(v) for k, v in payload["sources"].items()},
    )

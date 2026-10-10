"""How well the STIB serves the residents of each municipality, hour by hour.

docs/03-commune-coverage.md, D10 to D31. For every inhabited cell of the reference of residents:
the departures per direction a short walk away, in each hour of the service day. For every
municipality and for the Region: the residents in each class of service, the departures within
reach of the median resident, and the resident-hours spent above the "high" threshold.

Everything leaves this module as whole residents and whole departures. The site divides and
rounds, once (D19): rounding a share here and again on the page is how 19.95 hours became 19.9
in one place and 20.0 in the other.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np
import pandas as pd
from numpy.typing import NDArray

from stibviz.geometry import FloatArray, to_metres
from stibviz.network import HOURS_PER_DAY, SECONDS_PER_HOUR
from stibviz.residents import IntArray, Reference
from stibviz.service_day import DayTrips
from stibviz.stats import RouteInfo

HOURS = HOURS_PER_DAY
SURFACE, METRO = 0, 1  # bus, tram and Noctis; metro (D11)
# 500 m and 1 km on foot (UN SDG 11.2.1) over a detour factor of 1.25, as the crow flies (D13).
REACH_M = (400.0, 800.0)
PLACE_M = 250.0  # quays of one name this close together are one place (D12)
# Departures per direction in the hour: low under 4, medium to 10, high to 20, very high (D24).
THRESHOLDS = (4, 10, 20)
HIGH_CLASS = 3
CLASSES = 5
DRAWN_MIN_RESIDENTS = 0.5  # a cell with fewer residents is drawn as "few or none" (D20)
DEPARTURES_CAP = 255  # one byte per cell and hour in the published grid (D31)
_BUCKET_M = max(REACH_M)


@dataclass(frozen=True)
class Quays:
    """The quays served on the day: position in local metres, place, and which groups call."""

    x: FloatArray
    y: FloatArray
    place: IntArray
    serves: NDArray[np.bool_]  # (quays, 2): surface, metro


@dataclass(frozen=True)
class AreaCoverage:
    """One municipality, or the Region, in whole residents and whole departures."""

    residents: int
    classes: IntArray  # (HOURS, CLASSES): residents in each class, hour by hour
    median: IntArray  # (HOURS,): departures per direction within reach of the median resident
    resident_hours: int  # residents times hours above "high", summed over the day


@dataclass(frozen=True)
class DayCoverage:
    region: AreaCoverage
    municipalities: tuple[AreaCoverage, ...]
    # (HOURS, drawn cells), drawn cells in image order: rows from the north, west to east.
    classes: NDArray[np.uint8]
    departures: NDArray[np.uint8]


# --- Departures -----------------------------------------------------------------------------------


def quay_departures(day: DayTrips, mode_of_route: Mapping[str, str]) -> pd.DataFrame:
    """One row per departure: a trip calling at a quay other than its last stop (D10).

    Columns: ``stop_id``, ``route_id``, ``direction_id`` (text, empty when the feed has none),
    ``hour`` of the service day counted from 04:00, and ``group``, surface or metro.
    """
    stop_times = day.stop_times[["trip_id", "seq", "stop_id", "dep"]]
    last = stop_times.groupby("trip_id").seq.transform("max")
    rows = stop_times[stop_times.seq < last].merge(
        day.trips[["trip_id", "route_id", "direction_id"]], on="trip_id"
    )
    hour = (rows.dep.to_numpy(dtype=np.float64) // SECONDS_PER_HOUR).clip(0, HOURS - 1)
    return pd.DataFrame(
        {
            "stop_id": rows.stop_id.to_numpy(),
            "route_id": rows.route_id.to_numpy(),
            "direction_id": rows.direction_id.fillna("").astype(str).to_numpy(),
            "hour": hour.astype(np.int64),
            "group": np.where(
                rows.route_id.map(mode_of_route).to_numpy() == "metro", METRO, SURFACE
            ),
        }
    )


def group_places(names: NDArray[np.object_], x: FloatArray, y: FloatArray) -> IntArray:
    """A place per group of quays sharing a name, linked within ``PLACE_M`` step by step (D12).

    STIB quays of one stop sit on either side of a street or around a junction, sometimes 100 m
    apart or more; the same name elsewhere in the city is another stop.
    """
    parent = list(range(len(names)))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    by_name: defaultdict[str, list[int]] = defaultdict(list)
    for i, name in enumerate(names):
        by_name[str(name)].append(i)
    for members in by_name.values():
        for a in members:
            for b in members:
                if a < b and np.hypot(x[a] - x[b], y[a] - y[b]) <= PLACE_M:
                    parent[root(a)] = root(b)
    roots = sorted({root(i) for i in range(len(names))})
    index = {r: k for k, r in enumerate(roots)}
    return np.array([index[root(i)] for i in range(len(names))], dtype=np.int64)


def place_departures(
    departures: pd.DataFrame, place_of: Mapping[str, int], places: int
) -> FloatArray:
    """Departures per direction of each place, per group and hour: (places, 2, HOURS) (D23).

    Each route counts for the busier of its directions at the place, and the routes add up: a
    traveller rides one way, and different routes lead to different places.
    """
    frame = departures.assign(place=departures.stop_id.map(place_of))
    per_direction = frame.groupby(["place", "group", "route_id", "hour", "direction_id"]).size()
    busier = per_direction.groupby(level=["place", "group", "route_id", "hour"]).max()
    per_place = busier.groupby(level=["place", "group", "hour"]).sum()
    out = np.zeros((places, 2, HOURS))
    if len(per_place):
        levels = [per_place.index.get_level_values(k).to_numpy(dtype=np.int64) for k in range(3)]
        out[levels[0], levels[1], levels[2]] = per_place.to_numpy()
    return out


def reachable_departures(
    px: FloatArray, py: FloatArray, quays: Quays, per_place: FloatArray
) -> FloatArray:
    """For each point, the departures of its best place within reach, per group: (n, 2, HOURS).

    The best place, not the sum of the places: a line passing three nearby stops is one line
    (D14). Points and quays are in the same local metres.
    """
    reach = np.zeros((len(px), 2, HOURS))
    if len(quays.x) == 0:
        return reach
    buckets: defaultdict[tuple[int, int], list[int]] = defaultdict(list)
    qbx, qby = (quays.x // _BUCKET_M).astype(np.int64), (quays.y // _BUCKET_M).astype(np.int64)
    for i, key in enumerate(zip(qbx.tolist(), qby.tolist(), strict=True)):
        buckets[key].append(i)
    points: defaultdict[tuple[int, int], list[int]] = defaultdict(list)
    pbx, pby = (px // _BUCKET_M).astype(np.int64), (py // _BUCKET_M).astype(np.int64)
    for i, key in enumerate(zip(pbx.tolist(), pby.tolist(), strict=True)):
        points[key].append(i)
    for (bx, by), members in points.items():
        near = [
            q for dx in (-1, 0, 1) for dy in (-1, 0, 1) for q in buckets.get((bx + dx, by + dy), [])
        ]
        if not near:
            continue
        idx, cand = np.array(members), np.array(near)
        distance = np.hypot(px[idx, None] - quays.x[cand], py[idx, None] - quays.y[cand])
        for group, radius in enumerate(REACH_M):
            within = (distance <= radius) & quays.serves[cand, group]
            values = per_place[quays.place[cand], group, :]
            reach[idx, group, :] = np.where(within[:, :, None], values[None], 0).max(axis=1)
    return reach


# --- Classes and figures --------------------------------------------------------------------------


def service_classes(total: NDArray[np.floating]) -> NDArray[np.uint8]:
    """0 none, 1 low, 2 medium, 3 high, 4 very high, from departures per direction (D24)."""
    low, high, top = THRESHOLDS
    return np.select(
        [total == 0, total < low, total <= high, total <= top], [0, 1, 2, 3], default=4
    ).astype(np.uint8)


def weighted_median(values: FloatArray, weights: FloatArray) -> float:
    """The value of the middle resident; 0 when nobody is weighed at all."""
    if weights.sum() <= 0:
        return 0.0
    order = np.argsort(values, kind="stable")
    cumulative = np.cumsum(weights[order])
    return float(values[order][np.searchsorted(cumulative, cumulative[-1] / 2)])


def area_coverage(
    weights: FloatArray, classes: NDArray[np.uint8], totals: FloatArray
) -> AreaCoverage:
    """Whole residents per class and hour, the median departures, and the resident-hours."""
    counts = np.stack(
        [np.bincount(classes[:, h], weights=weights, minlength=CLASSES) for h in range(HOURS)]
    )
    median = np.array([weighted_median(totals[:, h], weights) for h in range(HOURS)])
    above = (classes >= HIGH_CLASS).sum(axis=1)
    return AreaCoverage(
        residents=round(float(weights.sum())),
        classes=np.rint(counts).astype(np.int64),
        median=np.rint(median).astype(np.int64),
        resident_hours=round(float((weights * above).sum())),
    )


# --- The reference and the day --------------------------------------------------------------------


def _cells(reference: Reference) -> tuple[IntArray, IntArray, FloatArray]:
    """Distinct cells, each entry's position among them, and the residents of each cell."""
    cells, inverse = np.unique(reference.cell_index, return_inverse=True)
    residents = np.bincount(inverse, weights=reference.cell_residents(), minlength=len(cells))
    return cells, inverse, residents


def _image_index(reference: Reference, flat: IntArray) -> IntArray:
    """Flat indices counted from the south to indices of the image, rows from the north."""
    grid = reference.grid
    return (grid.ny - 1 - flat // grid.nx) * grid.nx + flat % grid.nx


def coverage_rasters(reference: Reference) -> tuple[NDArray[np.uint8], NDArray[np.uint8]]:
    """In image order, the municipality of each cell (from 1, 0 outside) and the drawn mask.

    These depend on the reference alone, so the site fetches them once, not with every day.
    """
    grid = reference.grid
    cells, _, residents = _cells(reference)
    # The first entry of every cell: its own sector, before any sector too small to hold one.
    _, first = np.unique(reference.cell_index, return_index=True)
    municipality = np.zeros(grid.nx * grid.ny, dtype=np.uint8)
    image = _image_index(reference, cells)
    municipality[image] = reference.cell_municipality()[first] + 1
    drawn = np.zeros(grid.nx * grid.ny, dtype=np.uint8)
    drawn[image[residents >= DRAWN_MIN_RESIDENTS]] = 1
    return municipality, drawn


def _quays(departures: pd.DataFrame, stops: pd.DataFrame) -> tuple[Quays, dict[str, int]]:
    ids = sorted(departures.stop_id.unique())
    rows = stops.set_index("stop_id").loc[ids]
    x, y = to_metres(rows.lon.to_numpy(), rows.lat.to_numpy())
    place = group_places(rows.stop_name.to_numpy(dtype=object), x, y)
    groups = departures.groupby("stop_id").group.unique()
    serves = np.array([[SURFACE in groups[i], METRO in groups[i]] for i in ids], dtype=bool)
    return Quays(x=x, y=y, place=place, serves=serves.reshape(len(ids), 2)), dict(
        zip(ids, place.tolist(), strict=True)
    )


def compute_coverage(
    day: DayTrips, stops: pd.DataFrame, routes: Sequence[RouteInfo], reference: Reference
) -> DayCoverage:
    """The coverage of one service day over the reference of residents."""
    departures = quay_departures(day, {route.route_id: route.mode for route in routes})
    quays, place_of = _quays(departures, stops)
    per_place = place_departures(departures, place_of, int(quays.place.max(initial=-1)) + 1)
    cells, inverse, residents = _cells(reference)
    lon, lat = reference.grid.centres(cells)
    px, py = to_metres(lon, lat)
    inhabited = residents > 0
    reach = np.zeros((len(cells), 2, HOURS))
    reach[inhabited] = reachable_departures(px[inhabited], py[inhabited], quays, per_place)
    totals = reach.sum(axis=1)
    classes = service_classes(totals)

    weights = reference.cell_residents()
    municipality = reference.cell_municipality()
    entry_classes, entry_totals = classes[inverse], totals[inverse]
    areas = tuple(
        area_coverage(weights[mine], entry_classes[mine], entry_totals[mine])
        for mine in (municipality == k for k in range(len(reference.municipalities)))
    )
    drawn = residents >= DRAWN_MIN_RESIDENTS
    order = np.argsort(_image_index(reference, cells[drawn]), kind="stable")
    return DayCoverage(
        region=area_coverage(weights, entry_classes, entry_totals),
        municipalities=areas,
        classes=np.ascontiguousarray(classes[drawn][order].T),
        departures=np.ascontiguousarray(
            np.minimum(totals[drawn][order], DEPARTURES_CAP).T.astype(np.uint8)
        ),
    )

"""Trajectories: each trip sampled as (longitude, latitude, time) vertices along its shape.

ARCHITECTURE.md, step 8. A vehicle moves at constant speed between two consecutive stops, along
the original shape. Vertices are emitted at the stops and at every shape vertex the
simplification kept in between; positions come from the original geometry, times from linear
interpolation on the original distances.

Three data quirks are handled here rather than left to the renderer:

- **Dwell.** When a vehicle stands at a stop (departure later than arrival) the path is split:
  one path ends at the arrival, the next starts at the departure. A path therefore never holds
  two consecutive vertices at the same place, which the WebGL path renderer cannot draw.
- **Equal times.** STIB timetables are given to the minute, so two nearby stops often share the
  same time. Those times are spread by distance between the surrounding distinct times, so every
  path has strictly increasing timestamps.
- **The end of the span.** A trip that runs past 28:00 is cut by interpolation at the span end
  and reported as truncated.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

import numpy as np

from stibviz.geometry import FloatArray
from stibviz.service_day import SERVICE_DAY_LENGTH_S, DayTrips
from stibviz.shapes import PatternKey, Shape, StopProjection
from stibviz.vehicles import VehicleAssembly

# Used only to give a time to trailing stops whose times could not be interpolated.
NOMINAL_SPEED_MPS = 10.0


@dataclass(frozen=True)
class Path:
    """A continuous piece of one trip: strictly increasing times, no repeated vertex."""

    lon: FloatArray
    lat: FloatArray
    t: FloatArray
    vehicle: int
    trip: int
    route: int


@dataclass(frozen=True)
class TripTrajectory:
    trip_id: str
    paths: tuple[Path, ...]
    stops: tuple[tuple[str, int], ...]
    length_m: float
    truncated: bool
    time_repaired: bool


def _repair_times(events: FloatArray, positions: FloatArray) -> tuple[FloatArray, bool]:
    """Make event times strictly increasing wherever the position advances.

    ``events`` alternates departure and arrival times along a trip, ``positions`` the matching
    distances along the shape. Equal times at the same position (a zero dwell) are legitimate;
    equal or decreasing times across a positive distance are not, and are interpolated by
    distance between the nearest trustworthy times on either side.
    """
    fixed = events.astype(np.float64).copy()
    repaired = False
    anchor = 0
    pending: list[int] = []
    for k in range(1, len(fixed)):
        same_place = positions[k] == positions[anchor]
        good = fixed[k] > fixed[anchor] or (fixed[k] == fixed[anchor] and same_place)
        if not good:
            pending.append(k)
            repaired = True
            continue
        if pending:
            span = positions[k] - positions[anchor]
            for j in pending:
                if span > 0:
                    fraction = (positions[j] - positions[anchor]) / span
                else:
                    fraction = (j - anchor) / (k - anchor)
                fixed[j] = fixed[anchor] + fraction * (fixed[k] - fixed[anchor])
            pending = []
        anchor = k
    for j in pending:
        # No later trustworthy time: advance at a nominal speed, at least one second per step.
        step = max(1.0, (positions[j] - positions[j - 1]) / NOMINAL_SPEED_MPS)
        fixed[j] = fixed[j - 1] + step
    return fixed, repaired


class _PathBuilder:
    """Accumulates (along, t) vertices and splits paths at dwells and repeated positions."""

    def __init__(self) -> None:
        self.paths: list[tuple[list[float], list[float]]] = []
        self._along: list[float] = []
        self._t: list[float] = []

    def add(self, along: float, t: float) -> None:
        if self._along:
            last_along, last_t = self._along[-1], self._t[-1]
            if along == last_along:
                if t == last_t:
                    return  # the same vertex again
                self.close()  # standing still: the trail ends here and restarts later
            elif t <= last_t:
                t = last_t + 1e-3  # guard against a rounding tie after repair
        self._along.append(along)
        self._t.append(t)

    def close(self) -> None:
        if len(self._along) >= 2:
            self.paths.append((self._along, self._t))
        self._along, self._t = [], []


def _sample_trip(
    along: FloatArray, dep: FloatArray, arr: FloatArray, shape: Shape
) -> list[tuple[FloatArray, FloatArray]]:
    """Vertices of one trip as (along, t) arrays, one pair per continuous path."""
    kept_cum = shape.cum[shape.keep]
    builder = _PathBuilder()
    for i in range(len(along) - 1):
        a0, a1 = along[i], along[i + 1]
        t0, t1 = dep[i], arr[i + 1]
        builder.add(a0, t0)
        if a1 > a0 and t1 > t0:
            lo = np.searchsorted(kept_cum, a0, side="right")
            hi = np.searchsorted(kept_cum, a1, side="left")
            for cum in kept_cum[lo:hi]:
                builder.add(float(cum), t0 + (cum - a0) / (a1 - a0) * (t1 - t0))
        builder.add(a1, t1)
    builder.close()
    return [(np.asarray(a), np.asarray(t)) for a, t in builder.paths]


def _truncate(
    along: FloatArray, t: FloatArray, limit: float
) -> tuple[FloatArray, FloatArray] | None:
    """Cut a path at ``limit`` seconds by interpolation; None when it starts at or after it."""
    if t[0] >= limit:
        return None
    if t[-1] <= limit:
        return along, t
    k = int(np.searchsorted(t, limit, side="left"))
    if t[k] == limit:
        return along[: k + 1], t[: k + 1]
    fraction = (limit - t[k - 1]) / (t[k] - t[k - 1])
    cut_along = along[k - 1] + fraction * (along[k] - along[k - 1])
    return np.append(along[:k], cut_along), np.append(t[:k], limit)


def build_trajectories(
    day: DayTrips,
    patterns: Mapping[str, PatternKey],
    projections: Mapping[PatternKey, StopProjection],
    shapes: Mapping[str, Shape],
    assembly: VehicleAssembly,
    route_index: Mapping[str, int],
) -> dict[str, TripTrajectory]:
    """Sample every trip of the day. Keys are trip ids, in the order of ``day.trips``."""
    route_of_trip = dict(zip(day.trips.trip_id, day.trips.route_id, strict=True))
    grouped = day.stop_times.groupby("trip_id", sort=False)
    trajectories: dict[str, TripTrajectory] = {}
    for trip_id, rows in grouped:
        key = patterns[trip_id]
        shape = shapes[key[0]]
        along = projections[key].along
        arr_raw = rows.arr.to_numpy(dtype=np.float64)
        dep_raw = rows.dep.to_numpy(dtype=np.float64)
        n = len(along)
        vehicle, trip = assembly.trip_index[trip_id]
        route = route_index[route_of_trip[trip_id]]
        stop_ids = rows.stop_id.tolist()
        if n < 2:
            # A single stop time cannot describe a movement: no path, but the stop is kept.
            trajectories[str(trip_id)] = TripTrajectory(
                trip_id=str(trip_id),
                paths=(),
                stops=((stop_ids[0], int(dep_raw[0])),),
                length_m=0.0,
                truncated=False,
                time_repaired=False,
            )
            continue

        # Alternating departure/arrival events with their positions, then repair the times.
        events = np.empty(2 * n - 2)
        positions = np.empty(2 * n - 2)
        events[0::2], events[1::2] = dep_raw[:-1], arr_raw[1:]
        positions[0::2], positions[1::2] = along[:-1], along[1:]
        fixed, repaired = _repair_times(events, positions)
        dep = np.concatenate((fixed[0::2], [fixed[-1]]))
        arr = np.concatenate(([fixed[0]], fixed[1::2]))

        paths: list[Path] = []
        truncated = False
        for path_along, path_t in _sample_trip(along, dep, arr, shape):
            cut = _truncate(path_along, path_t, float(SERVICE_DAY_LENGTH_S))
            if cut is None:
                truncated = True
                continue
            truncated = truncated or len(cut[1]) != len(path_t) or cut[1][-1] != path_t[-1]
            if len(cut[1]) < 2:
                continue
            lon, lat = shape.position_at(cut[0])
            paths.append(Path(lon=lon, lat=lat, t=cut[1], vehicle=vehicle, trip=trip, route=route))

        stop_times = [int(np.rint(x)) for x in dep[:-1]] + [int(np.rint(arr[-1]))]
        trajectories[str(trip_id)] = TripTrajectory(
            trip_id=str(trip_id),
            paths=tuple(paths),
            stops=tuple(zip(stop_ids, stop_times, strict=True)),
            length_m=float(along[-1] - along[0]),
            truncated=truncated,
            time_repaired=repaired,
        )
    return trajectories

"""The network layer, the stop dictionary and the lookup table for the real-time converter.

ARCHITECTURE.md, step 10 and sections 5.5 to 5.7. The network layer is what the site draws
under the vehicles: one segment per (mode, from stop, to stop) served on the day, with its daily
run count, an intensity class and the shape geometry between the two stops, simplified for
display. The lookup table is not read by the v1 site: it records, per trip pattern, where each
stop sits along its shape, so the v2 real-time converter can turn "last stop + distance" into a
point without replaying the GTFS feed.
"""

from __future__ import annotations

import bisect
from collections import Counter, defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np

from stibviz.geometry import FloatArray, douglas_peucker_mask, to_metres
from stibviz.gtfs import Feed
from stibviz.service_day import DayTrips
from stibviz.shapes import PatternKey, Shape, StopProjection
from stibviz.stats import RouteInfo

# The service day is twenty-four hours from 04:00; hour 0 of a segment's row is that first hour.
SECONDS_PER_HOUR = 3600
HOURS_PER_DAY = 24

# Daily runs above each break move a segment up one intensity class (1 to 5).
INTENSITY_BREAKS = (20, 60, 120, 240)
NETWORK_TOLERANCE_M = 5.0
# An hour of the service day needs this many runs over a segment before its speed is worth
# reading, and its window grows this far either way in search of them.
HOURLY_MIN_RUNS = 3
HOURLY_MAX_RADIUS = 2


def intensity_class(runs: int) -> int:
    """Intensity class 1 to 5 of a segment from its daily run count."""
    return 1 + bisect.bisect_left(INTENSITY_BREAKS, runs)


SegmentKey = tuple[str, str, str]


@dataclass(frozen=True)
class NetworkSegment:
    from_stop: str
    to_stop: str
    mode: str
    runs: int
    intensity: int
    underground: bool
    lon: FloatArray
    lat: FloatArray
    # Scheduled speed over the segment across the day, in km/h; None when no run measures one.
    speed_kmh: float | None
    # The same, hour by hour of the service day: 24 values from 04:00, None where the timetable
    # runs too few times for whole-minute times to say anything.
    hourly_kmh: tuple[float | None, ...]


def aggregate_speed_kmh(lengths_m: Sequence[float], durations_s: Sequence[float]) -> float | None:
    """Distance covered over time spent, across every run of a segment, in km/h.

    A ratio of sums rather than a mean of speeds: scheduled times are whole minutes, so a single
    run over a 700 m segment reads as 21 or 42 km/h and nothing in between, and only the sums let
    that rounding average out over the day. A run whose two stops share the same scheduled
    second says nothing about speed and is left out of both sums; a segment with no run left has
    no speed at all, which the site draws as unknown rather than as zero.
    """
    length = 0.0
    duration = 0.0
    for metres, seconds in zip(lengths_m, durations_s, strict=True):
        if seconds > 0:
            length += metres
            duration += seconds
    return 3.6 * length / duration if duration > 0 else None


def hourly_speeds_kmh(
    lengths_m: Sequence[float],
    durations_s: Sequence[float],
    runs: Sequence[int],
    *,
    min_runs: int = HOURLY_MIN_RUNS,
    max_radius: int = HOURLY_MAX_RADIUS,
) -> list[float | None]:
    """One speed per hour of the service day, from sums already bucketed by departure hour.

    Scheduled times are whole minutes, so a single run over a two-minute leg is worth give or
    take a quarter of its speed: an hour served once says nothing, and drawn raw it would make
    the quiet hours flicker. Each hour therefore takes the narrowest window centred on it that
    holds runs enough, and gives up rather than reach further than ``max_radius``, which is what
    keeps the morning peak from borrowing the speeds of the middle of the day. An hour that
    never reaches the count is unknown, which the site draws as such rather than as slow.
    """
    hours = len(runs)
    speeds: list[float | None] = []
    for hour in range(hours):
        speed: float | None = None
        for radius in range(max_radius + 1):
            first = max(0, hour - radius)
            last = min(hours - 1, hour + radius)
            window = range(first, last + 1)
            if sum(runs[i] for i in window) < min_runs:
                continue
            duration = sum(durations_s[i] for i in window)
            if duration > 0:
                speed = 3.6 * sum(lengths_m[i] for i in window) / duration
            break
        speeds.append(speed)
    return speeds


def _portion(
    shape: Shape, start: float, end: float, tolerance_m: float
) -> tuple[FloatArray, FloatArray]:
    """The shape geometry between two distances along it, simplified for display."""
    inside = (shape.cum > start) & (shape.cum < end)
    along = np.concatenate(([start], shape.cum[inside], [end]))
    lon, lat = shape.position_at(along)
    x, y = to_metres(lon, lat)
    keep = douglas_peucker_mask(x, y, tolerance_m)
    return lon[keep], lat[keep]


def build_network(
    day: DayTrips,
    patterns: Mapping[str, PatternKey],
    projections: Mapping[PatternKey, StopProjection],
    shapes: Mapping[str, Shape],
    routes: Sequence[RouteInfo],
    tolerance_m: float = NETWORK_TOLERANCE_M,
) -> list[NetworkSegment]:
    """One segment per (mode, from stop, to stop) served on the day, with its run count and
    the scheduled speed of the day over it."""
    mode_of_route = {route.route_id: route.mode for route in routes}
    route_of_trip = dict(zip(day.trips.trip_id, day.trips.route_id, strict=True))
    runs: Counter[SegmentKey] = Counter()
    geometry: dict[SegmentKey, tuple[str, float, float]] = {}
    # Per segment, the length and scheduled duration of every run: distance over time across
    # the day is the speed the site colours it with, and the same sums bucketed by departure
    # hour are the speed it colours each hour of the day with.
    lengths: defaultdict[SegmentKey, list[float]] = defaultdict(list)
    durations: defaultdict[SegmentKey, list[float]] = defaultdict(list)
    by_hour: defaultdict[SegmentKey, tuple[list[float], list[float], list[int]]] = defaultdict(
        lambda: ([0.0] * HOURS_PER_DAY, [0.0] * HOURS_PER_DAY, [0] * HOURS_PER_DAY)
    )
    for trip_id, rows in day.stop_times.groupby("trip_id", sort=False):
        shape_id, stop_ids = patterns[trip_id]
        mode = mode_of_route[route_of_trip[trip_id]]
        along = projections[(shape_id, stop_ids)].along
        arr = rows.arr.to_numpy(dtype=np.float64)
        dep = rows.dep.to_numpy(dtype=np.float64)
        for i in range(len(stop_ids) - 1):
            if along[i + 1] <= along[i]:
                continue  # a pinned stop: nothing to draw between the two
            key = (mode, stop_ids[i], stop_ids[i + 1])
            runs[key] += 1
            geometry.setdefault(key, (shape_id, float(along[i]), float(along[i + 1])))
            length = float(along[i + 1] - along[i])
            duration = float(arr[i + 1] - dep[i])
            lengths[key].append(length)
            durations[key].append(duration)
            if duration > 0:
                # The hour the run sets off in, counted from the first hour of the service day.
                hour = min(HOURS_PER_DAY - 1, max(0, int(dep[i] // SECONDS_PER_HOUR)))
                hour_lengths, hour_durations, hour_runs = by_hour[key]
                hour_lengths[hour] += length
                hour_durations[hour] += duration
                hour_runs[hour] += 1

    segments = []
    for key in sorted(runs):
        mode, from_stop, to_stop = key
        shape_id, start, end = geometry[key]
        lon, lat = _portion(shapes[shape_id], start, end, tolerance_m)
        segments.append(
            NetworkSegment(
                from_stop=from_stop,
                to_stop=to_stop,
                mode=mode,
                runs=runs[key],
                intensity=intensity_class(runs[key]),
                underground=mode == "metro",
                lon=lon,
                lat=lat,
                speed_kmh=aggregate_speed_kmh(lengths[key], durations[key]),
                hourly_kmh=tuple(hourly_speeds_kmh(*by_hour[key])),
            )
        )
    return segments


def stop_dictionary(feed: Feed, day: DayTrips) -> dict[str, tuple[float, float, str]]:
    """Stops served on the day: id -> (longitude, latitude, name)."""
    used = set(day.stop_times.stop_id)
    rows = feed.stops[feed.stops.stop_id.isin(used)]
    return {
        row.stop_id: (float(row.lon), float(row.lat), row.stop_name)
        for row in rows.itertuples(index=False)
    }


def lookup_table(
    day: DayTrips,
    patterns: Mapping[str, PatternKey],
    projections: Mapping[PatternKey, StopProjection],
    routes: Sequence[RouteInfo],
) -> dict[str, Any]:
    """Per pattern, the stops with their distance along the shape; per route and terminus, the
    candidate patterns. Written for the v2 real-time converter (ARCHITECTURE.md, section 5.7)."""
    short_name = {route.route_id: route.short_name for route in routes}
    trips = day.trips.set_index("trip_id")
    described: dict[PatternKey, dict[str, Any]] = {}
    for trip_id, key in patterns.items():
        if key in described:
            continue
        trip = trips.loc[trip_id]
        shape_id, stop_ids = key
        along = projections[key].along
        described[key] = {
            "shape_id": shape_id,
            "route": short_name[trip.route_id],
            "direction_id": trip.direction_id,
            "terminus": stop_ids[-1],
            "stops": [
                [stop_id, round(float(d), 1)] for stop_id, d in zip(stop_ids, along, strict=True)
            ],
        }
    ordered = [described[key] for key in sorted(described)]
    by_route: dict[str, dict[str, list[int]]] = {}
    for index, entry in enumerate(ordered):
        by_route.setdefault(entry["route"], {}).setdefault(entry["terminus"], []).append(index)
    return {"patterns": ordered, "routes": by_route}

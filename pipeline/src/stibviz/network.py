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
from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np

from stibviz.geometry import FloatArray, douglas_peucker_mask, to_metres
from stibviz.gtfs import Feed
from stibviz.service_day import DayTrips
from stibviz.shapes import PatternKey, Shape, StopProjection
from stibviz.stats import RouteInfo

# Daily runs above each break move a segment up one intensity class (1 to 5).
INTENSITY_BREAKS = (20, 60, 120, 240)
NETWORK_TOLERANCE_M = 5.0


def intensity_class(runs: int) -> int:
    """Intensity class 1 to 5 of a segment from its daily run count."""
    return 1 + bisect.bisect_left(INTENSITY_BREAKS, runs)


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
    """One segment per (mode, from stop, to stop) served on the day, with its run count."""
    mode_of_route = {route.route_id: route.mode for route in routes}
    route_of_trip = dict(zip(day.trips.trip_id, day.trips.route_id, strict=True))
    runs: Counter[tuple[str, str, str]] = Counter()
    geometry: dict[tuple[str, str, str], tuple[str, float, float]] = {}
    for trip_id, (shape_id, stop_ids) in patterns.items():
        mode = mode_of_route[route_of_trip[trip_id]]
        along = projections[(shape_id, stop_ids)].along
        for i in range(len(stop_ids) - 1):
            if along[i + 1] <= along[i]:
                continue  # a pinned stop: nothing to draw between the two
            key = (mode, stop_ids[i], stop_ids[i + 1])
            runs[key] += 1
            geometry.setdefault(key, (shape_id, float(along[i]), float(along[i + 1])))

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

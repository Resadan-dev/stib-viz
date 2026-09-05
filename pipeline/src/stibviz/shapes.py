"""Shapes: cumulative distances, stop projection and simplification.

Everything is computed on the original shape geometry (ARCHITECTURE.md, steps 4 to 6): the
cumulative distance, the position of each stop along the shape, and the simplification mask.
Simplification only decides which original vertices the trajectories will carry; it never moves
a vertex nor changes a distance.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

import numpy as np
import pandas as pd

from stibviz.geometry import (
    BoolArray,
    FloatArray,
    cumulative_distance,
    douglas_peucker_mask,
    project_point,
    to_metres,
)
from stibviz.gtfs import Feed
from stibviz.service_day import DayTrips

# A trip pattern: the shape it follows and the ordered stops it serves.
PatternKey = tuple[str, tuple[str, ...]]


class ShapeError(ValueError):
    """A trip references a shape or a stop the feed does not define."""


@dataclass(frozen=True)
class Shape:
    """One GTFS shape with its geometry in degrees and in local metres.

    ``cum`` is the distance along the original polyline at each vertex, strictly increasing
    because repeated consecutive vertices are dropped at construction. ``keep`` marks the
    vertices retained by simplification. ``feed_length_m`` is the last ``shape_dist_traveled``
    of the feed, in metres, when the feed provides it.
    """

    shape_id: str
    lon: FloatArray
    lat: FloatArray
    x: FloatArray
    y: FloatArray
    cum: FloatArray
    keep: BoolArray
    feed_length_m: float | None

    @property
    def length_m(self) -> float:
        return float(self.cum[-1])

    def position_at(self, along: FloatArray) -> tuple[FloatArray, FloatArray]:
        """Longitude and latitude at the given distances along the original shape."""
        d = np.clip(along, 0.0, self.cum[-1])
        return np.interp(d, self.cum, self.lon), np.interp(d, self.cum, self.lat)


@dataclass(frozen=True)
class StopProjection:
    """Where the stops of one pattern fall along its shape.

    ``along`` is the distance in metres from the start of the shape, ``offset`` the distance
    between each stop and the shape. ``increasing`` is false when a stop could not be placed
    strictly after the previous one, which the checks report as an anomaly.
    """

    along: FloatArray
    offset: FloatArray
    increasing: bool


def _drop_repeated_vertices(lon: FloatArray, lat: FloatArray) -> tuple[FloatArray, FloatArray]:
    if len(lon) < 2:
        return lon, lat
    moved = np.concatenate(([True], (np.diff(lon) != 0) | (np.diff(lat) != 0)))
    return lon[moved], lat[moved]


def build_shapes(feed: Feed, tolerance_m: float = 2.0) -> dict[str, Shape]:
    """Build every shape of the feed, simplified to ``tolerance_m`` metres."""
    shapes: dict[str, Shape] = {}
    for shape_id, group in feed.shapes.groupby("shape_id", sort=False):
        lon, lat = _drop_repeated_vertices(
            group.lon.to_numpy(dtype=np.float64), group.lat.to_numpy(dtype=np.float64)
        )
        x, y = to_metres(lon, lat)
        feed_km = group.dist_km.dropna()
        shapes[str(shape_id)] = Shape(
            shape_id=str(shape_id),
            lon=lon,
            lat=lat,
            x=x,
            y=y,
            cum=cumulative_distance(x, y),
            keep=douglas_peucker_mask(x, y, tolerance_m),
            feed_length_m=None if feed_km.empty else float(feed_km.iloc[-1]) * 1000.0,
        )
    return shapes


def project_stops(shape: Shape, stops: pd.DataFrame) -> StopProjection:
    """Project stops (rows in pattern order, with ``lon`` and ``lat``) onto the shape.

    Each stop is searched from the segment of the previous one onward, so the projection moves
    forward along the shape even where the route passes near the same place twice.
    """
    sx, sy = to_metres(stops.lon.to_numpy(dtype=np.float64), stops.lat.to_numpy(dtype=np.float64))
    along = np.empty(len(stops), dtype=np.float64)
    offset = np.empty(len(stops), dtype=np.float64)
    segment = 0
    previous = -np.inf
    increasing = True
    for i in range(len(stops)):
        along[i], offset[i], segment = project_point(
            sx[i], sy[i], shape.x, shape.y, shape.cum, segment
        )
        if along[i] <= previous:
            # Same segment as the previous stop but not further along it: the stop cannot
            # advance. Pin it to the previous distance and let the checks report the anomaly.
            along[i] = previous
            increasing = False
        previous = along[i]
    return StopProjection(along=along, offset=offset, increasing=increasing)


def trip_patterns(day: DayTrips) -> pd.Series:
    """Map each trip of the day to its pattern: ``(shape_id, ordered stop ids)``."""
    stops_by_trip = day.stop_times.groupby("trip_id", sort=False).stop_id.agg(tuple)
    shapes_by_trip = day.trips.set_index("trip_id").shape_id
    patterns = {
        trip_id: (shapes_by_trip[trip_id], stop_ids) for trip_id, stop_ids in stops_by_trip.items()
    }
    return pd.Series(patterns, dtype=object)


def project_patterns(
    keys: Iterable[PatternKey], shapes: dict[str, Shape], stops: pd.DataFrame
) -> dict[PatternKey, StopProjection]:
    """Project every distinct pattern once. Raises :class:`ShapeError` on unknown ids."""
    indexed = stops.set_index("stop_id") if "stop_id" in stops.columns else stops
    projections: dict[PatternKey, StopProjection] = {}
    for key in keys:
        shape_id, stop_ids = key
        shape = shapes.get(shape_id)
        if shape is None:
            raise ShapeError(f"trip pattern references unknown shape {shape_id!r}")
        missing = [stop_id for stop_id in stop_ids if stop_id not in indexed.index]
        if missing:
            raise ShapeError(f"trip pattern references unknown stop(s) {', '.join(missing)}")
        projections[key] = project_stops(shape, indexed.loc[list(stop_ids)])
    return projections

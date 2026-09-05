"""The route table with modes, and the per-minute series the manifest publishes.

ARCHITECTURE.md, step 11. Three series per mode, 1,440 values each, one per minute from 04:00
to 03:59 the next morning: vehicles running (an instantaneous count of active trips), trips
departed since 04:00 (cumulative) and kilometres covered since 04:00 (cumulative, assuming
constant speed along each trip). The interface reads its counters and the activity curve
straight from these series.
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from stibviz.gtfs import Feed
from stibviz.service_day import SERVICE_DAY_LENGTH_S, DayTrips
from stibviz.trajectories import TripTrajectory
from stibviz.vehicles import VehicleAssembly

MODES = ("metro", "tram", "bus", "noctis")
MINUTES_PER_DAY = SERVICE_DAY_LENGTH_S // 60

_NIGHT_LINE = re.compile(r"^N\d+$")
_ROUTE_TYPE_MODE = {"0": "tram", "1": "metro", "3": "bus"}


def route_mode(short_name: str, route_type: str) -> str:
    """Mode of a route: GTFS ``route_type`` plus the STIB night-line naming (``N`` and digits)."""
    mode = _ROUTE_TYPE_MODE.get(route_type.strip())
    if mode is None:
        raise ValueError(f"unsupported route_type {route_type!r} for route {short_name!r}")
    if mode == "bus" and _NIGHT_LINE.match(short_name.strip().upper()):
        return "noctis"
    return mode


def natural_key(text: str) -> tuple[tuple[int, int, str], ...]:
    """Sort key that orders embedded numbers by value: 9 before 10, N4 before N06."""
    return tuple(
        (0, int(token), "") if token.isdigit() else (1, 0, token)
        for token in re.split(r"(\d+)", text)
        if token
    )


@dataclass(frozen=True)
class RouteInfo:
    route_id: str
    short_name: str
    long_name: str
    mode: str
    color: str
    text_color: str


def route_table(feed: Feed, day: DayTrips) -> list[RouteInfo]:
    """The routes served on the day, ordered by mode then by natural short name.

    The position in this list is the route index carried by every path and slice.
    """
    used = set(day.trips.route_id)
    rows = feed.routes[feed.routes.route_id.isin(used)]
    routes = [
        RouteInfo(
            route_id=row.route_id,
            short_name=row.route_short_name,
            long_name=row.route_long_name,
            mode=route_mode(row.route_short_name, row.route_type),
            color=row.route_color or "FFFFFF",
            text_color=row.route_text_color or "000000",
        )
        for row in rows.itertuples(index=False)
    ]
    return sorted(
        routes, key=lambda r: (MODES.index(r.mode), natural_key(r.short_name), r.route_id)
    )


@dataclass(frozen=True)
class DayStats:
    """Per-mode series of 1,440 minutes and the day totals."""

    vehicles: dict[str, NDArray[np.int64]]
    departures: dict[str, NDArray[np.int64]]
    km: dict[str, NDArray[np.float64]]
    total_trips: int
    total_vehicles: int
    total_km: float
    peak: tuple[int, int]

    @property
    def peak_count(self) -> int:
        return self.peak[0]

    @property
    def peak_minute(self) -> int:
        return self.peak[1]


def _minute_at_or_after(seconds: int) -> int:
    """Index of the first minute mark (HH:MM:00) at or after ``seconds`` since 04:00."""
    return min(MINUTES_PER_DAY, max(0, math.ceil(seconds / 60)))


def compute_stats(
    trajectories: Mapping[str, TripTrajectory],
    assembly: VehicleAssembly,
    routes: Sequence[RouteInfo],
) -> DayStats:
    """Compute the per-minute series and totals of one day."""
    mode_of_route = {route.route_id: route.mode for route in routes}
    vehicles = {mode: np.zeros(MINUTES_PER_DAY, dtype=np.int64) for mode in MODES}
    departure_steps = {mode: np.zeros(MINUTES_PER_DAY + 1, dtype=np.int64) for mode in MODES}
    km_steps = {mode: np.zeros(MINUTES_PER_DAY + 1, dtype=np.float64) for mode in MODES}
    km_partial = {mode: np.zeros(MINUTES_PER_DAY, dtype=np.float64) for mode in MODES}
    minute_marks = np.arange(MINUTES_PER_DAY, dtype=np.float64) * 60.0

    total_trips = 0
    total_length_m = 0.0
    for vehicle in assembly.vehicles:
        for trip in vehicle.trips:
            mode = mode_of_route[trip.route_id]
            length_m = trajectories[trip.trip_id].length_m
            first = _minute_at_or_after(trip.start)
            after_end = _minute_at_or_after(trip.end)
            vehicles[mode][first:after_end] += 1
            departure_steps[mode][first] += 1
            # Distance covered: a ramp while the trip runs, then the full length for good.
            if after_end > first:
                fraction = (minute_marks[first:after_end] - trip.start) / max(
                    trip.end - trip.start, 1
                )
                km_partial[mode][first:after_end] += np.clip(fraction, 0.0, 1.0) * length_m
            km_steps[mode][after_end] += length_m
            total_trips += 1
            total_length_m += length_m

    departures = {
        mode: np.cumsum(steps)[:MINUTES_PER_DAY] for mode, steps in departure_steps.items()
    }
    km = {
        mode: (np.cumsum(km_steps[mode])[:MINUTES_PER_DAY] + km_partial[mode]) / 1000.0
        for mode in MODES
    }
    total_running = sum(vehicles.values())
    peak_minute = int(np.argmax(total_running))
    return DayStats(
        vehicles=vehicles,
        departures=departures,
        km=km,
        total_trips=total_trips,
        total_vehicles=len(assembly.vehicles),
        total_km=total_length_m / 1000.0,
        peak=(int(total_running[peak_minute]), peak_minute),
    )

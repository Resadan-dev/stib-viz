"""Chaining the trips of a service day into vehicles.

A GTFS ``block_id`` names the physical vehicle that runs a sequence of trips. The site animates
vehicles, not trips (SCOPE.md, framing decisions), so this module turns the day's trips into
vehicles (ARCHITECTURE.md, step 7):

- trips sharing a ``block_id`` are chained in departure order;
- a trip without ``block_id`` is a vehicle of its own;
- when two trips of a block overlap in time, the block is split into two vehicles and counted as
  an anomaly, because one vehicle cannot run two trips at once;
- when the next trip starts more than ``deadhead_threshold_m`` from where the previous one ended,
  the vehicle moved empty in between: nothing will be drawn, and the transition is counted.

Vehicles are numbered in order of their first departure; that index is what the binary slices
and the manifest use to refer to them.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

import numpy as np
import pandas as pd

from stibviz.geometry import to_metres
from stibviz.service_day import DayTrips

DEADHEAD_THRESHOLD_M = 100.0


@dataclass(frozen=True)
class TripRef:
    """One trip as seen from its vehicle, in seconds since 04:00."""

    trip_id: str
    route_id: str
    shape_id: str
    direction_id: str
    headsign: str
    start: int
    end: int
    first_stop: str
    last_stop: str
    from_layover: bool


@dataclass(frozen=True)
class Vehicle:
    index: int
    block_id: str
    trips: tuple[TripRef, ...]


@dataclass(frozen=True)
class VehicleAssembly:
    """All vehicles of the day plus the counters the checks and the manifest report."""

    vehicles: tuple[Vehicle, ...]
    trip_index: dict[str, tuple[int, int]]
    overlapping_blocks: int
    deadheads: int


def _stop_positions(stops: pd.DataFrame) -> dict[str, tuple[float, float]]:
    indexed = stops.set_index("stop_id") if "stop_id" in stops.columns else stops
    x, y = to_metres(indexed.lon.to_numpy(dtype=np.float64), indexed.lat.to_numpy(dtype=np.float64))
    return {
        str(stop_id): (float(px), float(py))
        for stop_id, px, py in zip(indexed.index, x, y, strict=True)
    }


def _chains(day: DayTrips) -> tuple[list[tuple[str, list[pd.Series]]], int]:
    """Group the day's trips into chains of non-overlapping trips per block."""
    by_block: dict[str, list[pd.Series]] = defaultdict(list)
    lone: list[tuple[str, list[pd.Series]]] = []
    for _, trip in day.trips.iterrows():  # already sorted by start then trip_id
        if trip.block_id:
            by_block[trip.block_id].append(trip)
        else:
            lone.append(("", [trip]))

    chains: list[tuple[str, list[pd.Series]]] = list(lone)
    overlapping_blocks = 0
    for block_id, trips in by_block.items():
        current: list[pd.Series] = []
        split = False
        for trip in trips:
            if current and trip.start < current[-1].end:
                chains.append((block_id, current))
                current = []
                split = True
            current.append(trip)
        chains.append((block_id, current))
        overlapping_blocks += int(split)
    chains.sort(key=lambda chain: (int(chain[1][0].start), chain[1][0].trip_id))
    return chains, overlapping_blocks


def assemble_vehicles(
    day: DayTrips, stops: pd.DataFrame, deadhead_threshold_m: float = DEADHEAD_THRESHOLD_M
) -> VehicleAssembly:
    """Chain the trips of ``day`` into vehicles; ``stops`` gives stop coordinates."""
    positions = _stop_positions(stops)
    ends = day.stop_times.groupby("trip_id", sort=False).stop_id.agg(["first", "last"])
    chains, overlapping_blocks = _chains(day)

    vehicles: list[Vehicle] = []
    trip_index: dict[str, tuple[int, int]] = {}
    deadheads = 0
    for vehicle_index, (block_id, trips) in enumerate(chains):
        refs: list[TripRef] = []
        for position, trip in enumerate(trips):
            first_stop, last_stop = ends.loc[trip.trip_id, "first"], ends.loc[trip.trip_id, "last"]
            from_layover = False
            if position > 0:
                px, py = positions[refs[-1].last_stop]
                qx, qy = positions[first_stop]
                from_layover = float(np.hypot(qx - px, qy - py)) <= deadhead_threshold_m
                deadheads += int(not from_layover)
            refs.append(
                TripRef(
                    trip_id=trip.trip_id,
                    route_id=trip.route_id,
                    shape_id=trip.shape_id,
                    direction_id=trip.direction_id,
                    headsign=trip.trip_headsign,
                    start=int(trip.start),
                    end=int(trip.end),
                    first_stop=first_stop,
                    last_stop=last_stop,
                    from_layover=from_layover,
                )
            )
            trip_index[trip.trip_id] = (vehicle_index, position)
        vehicles.append(Vehicle(index=vehicle_index, block_id=block_id, trips=tuple(refs)))

    return VehicleAssembly(
        vehicles=tuple(vehicles),
        trip_index=trip_index,
        overlapping_blocks=overlapping_blocks,
        deadheads=deadheads,
    )

"""Writing the published files: binary slices, stop files, manifest, network, lookup, index.

ARCHITECTURE.md, section 5. This module is the only writer of the data contract. Everything the
site reads passes through here, so the layout is fixed by tests on both sides: the pipeline
writes a day, the site decodes it.

Slice format ``STV1`` (little-endian):

============  =================  ================================================
field         type               content
============  =================  ================================================
header        6 x Uint32         magic ``STV1``, version, vertices V, paths P, hour, 0
positions     Float32 x 2V       longitude, latitude interleaved
times         Float32 x V        seconds since 04:00 of the service day
index         Uint32 x (P + 1)   start offset of each path, last element equals V
vehicle       Uint32 x P         index into ``manifest.vehicles``
trip          Uint16 x P         index of the trip within the vehicle
route         Uint16 x P         index into ``manifest.routes``
============  =================  ================================================

Offsets keep every typed array aligned to its element size, so the browser can view the buffer
without copying it.
"""

from __future__ import annotations

import datetime as dt
import json
import shutil
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

from stibviz.gtfs import FeedInfo
from stibviz.network import INTENSITY_BREAKS, NetworkSegment
from stibviz.service_day import SERVICE_DAY_START_S
from stibviz.slicing import FIRST_HOUR, Slice, window
from stibviz.stats import DayStats, RouteInfo
from stibviz.trajectories import TripTrajectory
from stibviz.vehicles import VehicleAssembly

STV1_MAGIC = 0x53545631
STV1_VERSION = 1
HEADER_WORDS = 6
SOURCE_SCHEDULE = "schedule"
COORDINATE_DECIMALS = 5


@dataclass(frozen=True)
class DayBundle:
    """Everything the pipeline computed for one day, ready to be written."""

    date: dt.date
    feed_info: FeedInfo
    routes: Sequence[RouteInfo]
    assembly: VehicleAssembly
    trajectories: Mapping[str, TripTrajectory]
    slices: Sequence[Slice]
    stats: DayStats
    network: Sequence[NetworkSegment]
    stops: Mapping[str, tuple[float, float, str]]
    lookup: Mapping[str, Any]
    anomalies: Mapping[str, int]
    generated_at: dt.datetime


@dataclass(frozen=True)
class DecodedSlice:
    hour: int
    vertices: int
    paths: int
    positions: NDArray[np.float32]
    times: NDArray[np.float32]
    index: NDArray[np.uint32]
    vehicle: NDArray[np.uint32]
    trip: NDArray[np.uint16]
    route: NDArray[np.uint16]
    offsets: dict[str, int]


def encode_slice(a_slice: Slice) -> bytes:
    """Serialise one slice to the STV1 layout."""
    vertices, paths = a_slice.vertices, len(a_slice.paths)
    positions = np.empty(2 * vertices, dtype="<f4")
    times = np.empty(vertices, dtype="<f4")
    index = np.zeros(paths + 1, dtype="<u4")
    cursor = 0
    for i, path in enumerate(a_slice.paths):
        n = len(path.t)
        positions[2 * cursor : 2 * (cursor + n) : 2] = path.lon
        positions[2 * cursor + 1 : 2 * (cursor + n) : 2] = path.lat
        times[cursor : cursor + n] = path.t
        index[i] = cursor
        cursor += n
    index[paths] = vertices
    header = np.array([STV1_MAGIC, STV1_VERSION, vertices, paths, a_slice.hour, 0], dtype="<u4")
    vehicle = np.array([p.vehicle for p in a_slice.paths], dtype="<u4")
    trip = np.array([p.trip for p in a_slice.paths], dtype="<u2")
    route = np.array([p.route for p in a_slice.paths], dtype="<u2")
    return b"".join(a.tobytes() for a in (header, positions, times, index, vehicle, trip, route))


def decode_slice(data: bytes) -> DecodedSlice:
    """Read an STV1 slice back into typed arrays. Raises ValueError on a foreign file."""
    header_bytes = 4 * HEADER_WORDS
    if len(data) < header_bytes:
        raise ValueError("not an STV1 slice: file too short")
    header = np.frombuffer(data, dtype="<u4", count=HEADER_WORDS)
    if int(header[0]) != STV1_MAGIC or int(header[1]) != STV1_VERSION:
        raise ValueError("not an STV1 slice: bad magic or version")
    vertices, paths, hour = int(header[2]), int(header[3]), int(header[4])
    offsets = {"positions": header_bytes}
    offsets["times"] = offsets["positions"] + 8 * vertices
    offsets["index"] = offsets["times"] + 4 * vertices
    offsets["vehicle"] = offsets["index"] + 4 * (paths + 1)
    offsets["trip"] = offsets["vehicle"] + 4 * paths
    offsets["route"] = offsets["trip"] + 2 * paths
    if len(data) != offsets["route"] + 2 * paths:
        raise ValueError("not an STV1 slice: size does not match the header")

    def view(name: str, dtype: str, count: int) -> NDArray[Any]:
        return np.frombuffer(data, dtype=dtype, count=count, offset=offsets[name])

    return DecodedSlice(
        hour=hour,
        vertices=vertices,
        paths=paths,
        positions=view("positions", "<f4", 2 * vertices),
        times=view("times", "<f4", vertices),
        index=view("index", "<u4", paths + 1),
        vehicle=view("vehicle", "<u4", paths),
        trip=view("trip", "<u2", paths),
        route=view("route", "<u2", paths),
        offsets=offsets,
    )


def _day_kind(date: dt.date) -> str:
    if date.weekday() == 5:
        return "saturday"
    if date.weekday() == 6:
        return "sunday"
    return "weekday"


def _write_json(path: Path, payload: Any) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def _round_coordinates(lon: NDArray[np.float64], lat: NDArray[np.float64]) -> list[list[float]]:
    return [
        [round(float(x), COORDINATE_DECIMALS), round(float(y), COORDINATE_DECIMALS)]
        for x, y in zip(lon, lat, strict=True)
    ]


def _network_payload(bundle: DayBundle) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "feed_version": bundle.feed_info.version,
        "intensity_breaks": list(INTENSITY_BREAKS),
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": _round_coordinates(segment.lon, segment.lat),
                },
                "properties": {
                    "mode": segment.mode,
                    "from": segment.from_stop,
                    "to": segment.to_stop,
                    "runs": segment.runs,
                    "class": segment.intensity,
                    "underground": segment.underground,
                },
            }
            for segment in bundle.network
        ],
        "stops": {
            stop_id: [round(lon, 6), round(lat, 6), name]
            for stop_id, (lon, lat, name) in sorted(bundle.stops.items())
        },
    }


def _stops_by_hour(
    bundle: DayBundle, hours: Sequence[int]
) -> dict[int, dict[str, list[list[Any]]]]:
    """For each slice hour, the stop times of every trip active in that hour's window."""
    files: dict[int, dict[str, list[list[Any]]]] = {hour: {} for hour in hours}
    for hour in hours:
        start, end = window(hour - FIRST_HOUR)
        for vehicle in bundle.assembly.vehicles:
            for position, trip in enumerate(vehicle.trips):
                if trip.start < end and trip.end > start:
                    stops = bundle.trajectories[trip.trip_id].stops
                    files[hour][f"{vehicle.index}:{position}"] = [[t, s] for s, t in stops]
    return files


def write_day(bundle: DayBundle, data_dir: Path) -> dict[str, Any]:
    """Write one day under ``data_dir`` and return its manifest.

    The day directory is replaced entirely, so a rebuild never leaves a stale slice behind.
    Shared files (network layer, lookup table) are named by feed version.
    """
    day_dir = data_dir / bundle.date.isoformat()
    if day_dir.exists():
        shutil.rmtree(day_dir)
    (day_dir / "slices").mkdir(parents=True)
    (day_dir / "stops").mkdir()

    slice_entries = []
    for a_slice in bundle.slices:
        name = f"{a_slice.hour:02d}-{a_slice.mode}.bin"
        data = encode_slice(a_slice)
        (day_dir / "slices" / name).write_bytes(data)
        slice_entries.append(
            {
                "hour": a_slice.hour,
                "mode": a_slice.mode,
                "path": f"slices/{name}",
                "bytes": len(data),
                "vertices": a_slice.vertices,
                "paths": len(a_slice.paths),
            }
        )

    hours = sorted({a_slice.hour for a_slice in bundle.slices})
    stop_entries = []
    for hour, content in _stops_by_hour(bundle, hours).items():
        name = f"{hour:02d}.json"
        size = _write_json(day_dir / "stops" / name, content)
        stop_entries.append({"hour": hour, "path": f"stops/{name}", "bytes": size})

    version = bundle.feed_info.version
    _write_json(data_dir / "network" / f"{version}.json", _network_payload(bundle))
    _write_json(data_dir / "lookup" / f"{version}.json", bundle.lookup)

    route_index = {route.route_id: i for i, route in enumerate(bundle.routes)}
    stats = bundle.stats
    manifest: dict[str, Any] = {
        "date": bundle.date.isoformat(),
        "source": SOURCE_SCHEDULE,
        "feed_version": version,
        "attribution": f"Source: STIB-MIVB – Open Data – {bundle.generated_at.date().isoformat()}",
        "network": f"network/{version}.json",
        "service_day_start_s": SERVICE_DAY_START_S,
        "totals": {
            "trips": stats.total_trips,
            "vehicles": stats.total_vehicles,
            "km": round(stats.total_km, 2),
        },
        "peak": {"vehicles": stats.peak_count, "minute": stats.peak_minute},
        "per_minute": {
            "vehicles": {mode: series.tolist() for mode, series in stats.vehicles.items()},
            "departures": {mode: series.tolist() for mode, series in stats.departures.items()},
            "km": {mode: np.round(series, 3).tolist() for mode, series in stats.km.items()},
        },
        "routes": [
            {
                "id": route.route_id,
                "name": route.short_name,
                "mode": route.mode,
                "color": route.color,
                "text_color": route.text_color,
                "long_name": route.long_name,
            }
            for route in bundle.routes
        ],
        "vehicles": [
            {
                "block": vehicle.block_id,
                "trips": [
                    {
                        "route_idx": route_index[trip.route_id],
                        "headsign": trip.headsign,
                        "start": trip.start,
                        "end": trip.end,
                        "from_layover": trip.from_layover,
                    }
                    for trip in vehicle.trips
                ],
            }
            for vehicle in bundle.assembly.vehicles
        ],
        "slices": slice_entries,
        "stops_files": stop_entries,
        "anomalies": dict(bundle.anomalies),
    }
    _write_json(day_dir / "manifest.json", manifest)
    return manifest


def write_index(
    data_dir: Path, feed_info: FeedInfo, generated_at: dt.datetime | None = None
) -> dict[str, Any]:
    """List every day directory holding a manifest and write ``index.json``."""
    stamp = generated_at or dt.datetime.now(dt.UTC)
    days = []
    for entry in sorted(data_dir.iterdir()):
        manifest_path = entry / "manifest.json"
        if not entry.is_dir() or not manifest_path.is_file():
            continue
        try:
            date = dt.date.fromisoformat(entry.name)
        except ValueError:
            continue
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        days.append(
            {
                "date": entry.name,
                "kind": _day_kind(date),
                "source": manifest.get("source", SOURCE_SCHEDULE),
                "manifest": f"{entry.name}/manifest.json",
            }
        )
    index = {
        "generated_at": stamp.astimezone(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "feed_version": feed_info.version,
        "feed_valid_from": feed_info.start_date.isoformat(),
        "feed_valid_to": feed_info.end_date.isoformat(),
        "service_day_start": "04:00",
        "days": days,
    }
    _write_json(data_dir / "index.json", index)
    return index

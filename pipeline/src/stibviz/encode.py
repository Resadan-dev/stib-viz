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
import gzip
import hashlib
import json
import shutil
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

from stibviz.coverage import (
    DRAWN_MIN_RESIDENTS,
    PLACE_M,
    REACH_M,
    THRESHOLDS,
    AreaCoverage,
    DayCoverage,
    coverage_rasters,
)
from stibviz.geometry import from_mercator
from stibviz.gtfs import FeedInfo
from stibviz.network import HOURLY_MIN_RUNS, HOURS_PER_DAY, INTENSITY_BREAKS, NetworkSegment
from stibviz.residents import CELL_GROUND_M, Reference
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
# The coverage grid (docs/03-commune-coverage.md, D31), both files gzip-compressed inside:
# "SCC1", the municipality of every cell and the drawn mask; "SCH1", the hours of one day.
SCC1_MAGIC = 0x53434331
SCH1_MAGIC = 0x53434831
COVERAGE_VERSION = 1
BOUNDS_DECIMALS = 7


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
    # How well the day serves the residents, and the reference it was measured on; a day built
    # without a reference of residents publishes no coverage.
    coverage: DayCoverage | None = None
    reference: Reference | None = None


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


def _strictly_increasing_f4(t: NDArray[np.float64]) -> NDArray[np.float32]:
    """Cast times to Float32 while keeping them strictly increasing.

    Two vertices closer than the Float32 resolution (0.008 s near the end of the day) would
    collapse to the same value; the later one is moved to the next representable number, a shift
    far below anything visible.
    """
    values = t.astype("<f4")
    if np.all(np.diff(values) > 0):
        return values
    for i in range(1, len(values)):
        if values[i] <= values[i - 1]:
            values[i] = np.nextafter(values[i - 1], np.float32(np.inf))
    return values


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
        times[cursor : cursor + n] = _strictly_increasing_f4(path.t)
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


def safe_path(root: Path, *parts: str) -> Path:
    """A path under ``root``. Raises :class:`ValueError` for any part that would escape it.

    The feed version reaches file names from `feed_info.txt`, which the pipeline does not write.
    `gtfs.py` already refuses a version that is not one safe segment; this is the second lock,
    so a future caller cannot reintroduce the hole by taking another value from the feed.
    """
    candidate = root.joinpath(*parts).resolve()
    if not candidate.is_relative_to(root.resolve()):
        raise ValueError(f"refusing to write outside {root}: {'/'.join(parts)!r}")
    return candidate


def _json_text(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _write_text(path: Path, text: str) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def _write_json(path: Path, payload: Any) -> int:
    return _write_text(path, _json_text(payload))


def _digest(text: str) -> str:
    """Enough of a SHA-256 to name a file by what is in it; collisions are not a concern here."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


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
                    "speed": None if segment.speed_kmh is None else round(segment.speed_kmh, 1),
                },
            }
            for segment in bundle.network
        ],
        "stops": {
            stop_id: [round(lon, 6), round(lat, 6), name]
            for stop_id, (lon, lat, name) in sorted(bundle.stops.items())
        },
    }


def _hourly_payload(bundle: DayBundle) -> dict[str, Any]:
    """The speeds hour by hour, keyed by segment, in tenths of a km/h.

    A file of its own rather than a field of the network layer: it is twenty-four numbers per
    segment, and only the speed view of the site ever reads them. Keyed by the segment rather
    than by its position, so nothing depends on two files agreeing on an order. Zero means the
    timetable cannot time that segment in that hour (ARCHITECTURE.md, section 5.8).
    """
    return {
        "feed_version": bundle.feed_info.version,
        "first_hour": FIRST_HOUR,
        "hours": HOURS_PER_DAY,
        "min_runs": HOURLY_MIN_RUNS,
        "speeds": {
            f"{segment.mode}|{segment.from_stop}|{segment.to_stop}": [
                0 if value is None else round(value * 10) for value in segment.hourly_kmh
            ]
            for segment in bundle.network
        },
    }


def _gzip(data: bytes) -> bytes:
    """Compressed without a timestamp, so the same content gives the same bytes and name.

    Cloudflare does not compress ``application/octet-stream``, so the grid travels compressed
    inside the file and the browser inflates it (docs/03-commune-coverage.md, D31).
    """
    return gzip.compress(data, compresslevel=9, mtime=0)


def _digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:12]


def encode_coverage_cells(reference: Reference) -> bytes:
    """``SCC1``: 4 x Uint32 header (magic, version, nx, ny), the municipality of every cell (0
    outside, then 1 to 19) and the drawn mask, one byte per cell each, rows from the north."""
    municipality, drawn = coverage_rasters(reference)
    grid = reference.grid
    header = np.array([SCC1_MAGIC, COVERAGE_VERSION, grid.nx, grid.ny], dtype="<u4")
    return _gzip(header.tobytes() + municipality.tobytes() + drawn.tobytes())


def decode_coverage_cells(data: bytes) -> tuple[int, int, NDArray[np.uint8], NDArray[np.uint8]]:
    """(nx, ny, municipality, drawn) from an ``SCC1`` file; raises ValueError on any mismatch."""
    raw = gzip.decompress(data)
    header = np.frombuffer(raw[:16], dtype="<u4")
    if len(header) < 4 or header[0] != SCC1_MAGIC or header[1] != COVERAGE_VERSION:
        raise ValueError("not an SCC1 coverage cells file of the expected version")
    nx, ny = int(header[2]), int(header[3])
    if len(raw) != 16 + 2 * nx * ny:
        raise ValueError(f"SCC1: {len(raw)} bytes for a {nx} x {ny} grid")
    body = np.frombuffer(raw, dtype=np.uint8, offset=16)
    return nx, ny, body[: nx * ny].copy(), body[nx * ny :].copy()


def encode_coverage_hours(coverage: DayCoverage) -> bytes:
    """``SCH1``: 6 x Uint32 header (magic, version, drawn cells N, hours, first hour, 0), then the
    class of every drawn cell hour by hour (Uint8 x hours x N), then its departures per direction
    within reach, capped at 255, in the same order."""
    hours, drawn = coverage.classes.shape
    header = np.array([SCH1_MAGIC, COVERAGE_VERSION, drawn, hours, FIRST_HOUR, 0], dtype="<u4")
    classes = np.ascontiguousarray(coverage.classes, dtype=np.uint8)
    departures = np.ascontiguousarray(coverage.departures, dtype=np.uint8)
    return _gzip(header.tobytes() + classes.tobytes() + departures.tobytes())


def decode_coverage_hours(data: bytes) -> tuple[NDArray[np.uint8], NDArray[np.uint8]]:
    """(classes, departures), each hours x N, from an ``SCH1`` file."""
    raw = gzip.decompress(data)
    header = np.frombuffer(raw[:24], dtype="<u4")
    if len(header) < 6 or header[0] != SCH1_MAGIC or header[1] != COVERAGE_VERSION:
        raise ValueError("not an SCH1 coverage hours file of the expected version")
    drawn, hours = int(header[2]), int(header[3])
    if len(raw) != 24 + 2 * hours * drawn:
        raise ValueError(f"SCH1: {len(raw)} bytes for {hours} hours of {drawn} cells")
    body = np.frombuffer(raw, dtype=np.uint8, offset=24)
    size = hours * drawn
    return body[:size].reshape(hours, drawn).copy(), body[size:].reshape(hours, drawn).copy()


def _area_payload(area: AreaCoverage) -> dict[str, Any]:
    return {
        "residents": area.residents,
        "classes": area.classes.tolist(),
        "median": area.median.tolist(),
        "resident_hours": area.resident_hours,
    }


def _municipalities_payload(reference: Reference) -> dict[str, Any]:
    grid = reference.grid
    lon, lat = from_mercator(
        [grid.x0, grid.x0 + grid.nx * grid.cell_m], [grid.y0, grid.y0 + grid.ny * grid.cell_m]
    )
    return {
        "sources": dict(reference.sources),
        "grid": {
            "nx": grid.nx,
            "ny": grid.ny,
            "ground_m": CELL_GROUND_M,
            # West, south, east, north: where the site lays the grid image over the map.
            "bounds": [
                round(float(value), BOUNDS_DECIMALS) for value in (lon[0], lat[0], lon[1], lat[1])
            ],
        },
        "municipalities": [
            {
                "code": m.code,
                "name": m.name_fr,
                "name_nl": m.name_nl,
                "residents": m.residents,
                "label": list(m.label),
            }
            for m in reference.municipalities
        ],
        "borders": [
            {
                "municipalities": list(border.municipalities),
                "coordinates": _round_coordinates(border.lon, border.lat),
            }
            for border in reference.borders
        ],
    }


def _write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _write_coverage(
    coverage: DayCoverage, reference: Reference, version: str, data_dir: Path
) -> str:
    """Write the day's coverage and the two files of its reference; return the day's file.

    Every name is a digest of the content, like the network's: the reference files stay the
    same from one day to the next, and the day files change only when the timetable does.
    """
    municipalities_text = _json_text(_municipalities_payload(reference))
    municipalities = f"municipalities-{_digest(municipalities_text)}.json"
    _write_text(safe_path(data_dir, "coverage", municipalities), municipalities_text)
    cells_data = encode_coverage_cells(reference)
    cells = f"cells-{_digest_bytes(cells_data)}.bin"
    _write_bytes(safe_path(data_dir, "coverage", cells), cells_data)
    hours_data = encode_coverage_hours(coverage)
    hours = f"{version}-{_digest_bytes(hours_data)}-hours.bin"
    _write_bytes(safe_path(data_dir, "coverage", hours), hours_data)
    stats_text = _json_text(
        {
            "feed_version": version,
            "first_hour": FIRST_HOUR,
            "hours": int(coverage.classes.shape[0]),
            "thresholds": list(THRESHOLDS),
            "reach_m": [round(radius) for radius in REACH_M],
            "place_m": round(PLACE_M),
            "drawn_min_residents": DRAWN_MIN_RESIDENTS,
            "municipalities_file": f"coverage/{municipalities}",
            "cells_file": f"coverage/{cells}",
            "hours_file": f"coverage/{hours}",
            "region": _area_payload(coverage.region),
            "municipalities": [_area_payload(area) for area in coverage.municipalities],
        }
    )
    stats = f"{version}-{_digest(stats_text)}.json"
    _write_text(safe_path(data_dir, "coverage", stats), stats_text)
    return f"coverage/{stats}"


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
    # An older build of the same day may hold slices the new one does not list; start clean.
    if day_dir.exists():
        shutil.rmtree(day_dir)
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
    # Named by a digest of what is in it. The runs and the speeds it carries are those of this
    # day, so the seven days of a window can no longer overwrite one another's file; days that
    # share a timetable land on the same name and therefore on one file; and the year of
    # immutable caching becomes literally true, since a changed content is a changed name.
    network_text = _json_text(_network_payload(bundle))
    network_name = f"{version}-{_digest(network_text)}.json"
    _write_text(safe_path(data_dir, "network", network_name), network_text)
    hourly_text = _json_text(_hourly_payload(bundle))
    hourly_name = f"{version}-{_digest(hourly_text)}-hourly.json"
    _write_text(safe_path(data_dir, "network", hourly_name), hourly_text)
    _write_json(safe_path(data_dir, "lookup", f"{version}.json"), bundle.lookup)

    route_index = {route.route_id: i for i, route in enumerate(bundle.routes)}
    vehicles = [
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
    ]
    _write_json(day_dir / "vehicles.json", vehicles)
    stats = bundle.stats
    manifest: dict[str, Any] = {
        "date": bundle.date.isoformat(),
        "source": SOURCE_SCHEDULE,
        "feed_version": version,
        "attribution": f"Source: STIB-MIVB – Open Data – {bundle.generated_at.date().isoformat()}",
        "network": f"network/{network_name}",
        "network_hourly": f"network/{hourly_name}",
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
        "vehicles_file": "vehicles.json",
        "vehicle_count": len(bundle.assembly.vehicles),
        "slices": slice_entries,
        "stops_files": stop_entries,
        "anomalies": dict(bundle.anomalies),
    }
    if bundle.coverage is not None and bundle.reference is not None:
        manifest["coverage"] = _write_coverage(bundle.coverage, bundle.reference, version, data_dir)
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

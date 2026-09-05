"""Quality checks on a built day and on a written day directory.

ARCHITECTURE.md, section 4.3. Two levels:

- **Blocking checks**: a failure means the day is not published.
- **Per-object anomalies**: counted, tolerated under a share of the day's trips (0.1 % by
  default), and reported in the manifest. Above the share, the day is blocked.

``check_build`` runs at build time with the feed still at hand, so it can compare the produced
counts with a direct count. ``check_day_dir`` runs on the written files alone, which is what the
``stibviz check`` command does.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from stibviz.encode import HEADER_WORDS, DayBundle, decode_slice
from stibviz.service_day import DayTrips
from stibviz.shapes import PatternKey, Shape, StopProjection
from stibviz.slicing import Slice
from stibviz.stats import MINUTES_PER_DAY, MODES

MAX_SLICE_BYTES = 2_500_000
MAX_DAY_BYTES = 35_000_000
ANOMALY_TOLERANCE = 0.001
MAX_MEDIAN_OFFSET_M = 15.0
MAX_STOP_OFFSET_M = 80.0
MAX_SHAPE_LENGTH_ERROR = 0.01

# Anomaly counters subject to the tolerance. Time repair is reported but never blocks: a
# timetable given to the minute repairs equal times on a large share of ordinary trips.
TOLERATED_ANOMALIES = (
    "stop_offset",
    "stop_order",
    "truncated_after_28h",
    "dropped_before_start",
    "dropped_after_span",
    "without_stop_times",
    "block_overlap",
)
REQUIRED_MANIFEST_KEYS = (
    "date",
    "source",
    "feed_version",
    "totals",
    "peak",
    "per_minute",
    "routes",
    "vehicles_file",
    "slices",
    "stops_files",
    "anomalies",
)


@dataclass(frozen=True)
class CheckReport:
    blocking: list[str] = field(default_factory=list)
    anomalies: dict[str, int] = field(default_factory=dict)
    info: dict[str, Any] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.blocking

    def render(self) -> str:
        lines = ["OK" if self.ok else "BLOCKED"]
        lines += [f"  blocking: {message}" for message in self.blocking]
        lines += [f"  anomaly {key}: {value}" for key, value in sorted(self.anomalies.items())]
        lines += [f"  info {key}: {value}" for key, value in sorted(self.info.items())]
        return "\n".join(lines)


def slice_bytes(a_slice: Slice) -> int:
    """Size of a slice once encoded, from the STV1 layout."""
    paths = len(a_slice.paths)
    return 4 * HEADER_WORDS + 12 * a_slice.vertices + 4 * (paths + 1) + 8 * paths


def _direct_peak(day: DayTrips) -> tuple[int, int]:
    """Peak of simultaneous trips from the day's trips alone, independent of the statistics."""
    if day.trips.empty:
        return 0, 0
    minutes = np.arange(MINUTES_PER_DAY) * 60
    start = day.trips.start.to_numpy()[:, None]
    end = day.trips.end.to_numpy()[:, None]
    running = ((start <= minutes) & (end > minutes)).sum(axis=0)
    minute = int(np.argmax(running))
    return int(running[minute]), minute


def check_build(
    bundle: DayBundle,
    day: DayTrips,
    patterns: Mapping[str, PatternKey],
    projections: Mapping[PatternKey, StopProjection],
    shapes: Mapping[str, Shape],
    *,
    anomaly_tolerance: float = ANOMALY_TOLERANCE,
    max_slice_bytes: int = MAX_SLICE_BYTES,
    max_day_bytes: int = MAX_DAY_BYTES,
) -> CheckReport:
    """Check a built day against the feed it came from."""
    blocking: list[str] = []
    n_trips = len(day.trips)

    if bundle.stats.total_trips != n_trips:
        blocking.append(
            f"trips: the manifest counts {bundle.stats.total_trips}, the day has {n_trips}"
        )
    if bundle.stats.total_vehicles != len(bundle.assembly.vehicles):
        blocking.append("vehicles: the manifest count differs from the assembled vehicles")
    peak = _direct_peak(day)
    if bundle.stats.peak != peak:
        blocking.append(f"peak: the manifest says {bundle.stats.peak}, a direct count gives {peak}")

    total_bytes = 0
    for a_slice in bundle.slices:
        size = slice_bytes(a_slice)
        total_bytes += size
        if size > max_slice_bytes:
            blocking.append(
                f"slice {a_slice.hour:02d}-{a_slice.mode}: {size} bytes exceed {max_slice_bytes}"
            )
    if total_bytes > max_day_bytes:
        blocking.append(f"day: {total_bytes} bytes of slices exceed {max_day_bytes}")

    for route in bundle.routes:
        if not route.short_name or len(route.color) != 6:
            blocking.append(f"route {route.route_id!r}: missing name or colour")

    pattern_keys = [key for _, key in patterns.items()]
    used_shapes = {key[0] for key in pattern_keys}
    bad_lengths = 0
    for shape_id in used_shapes:
        shape = shapes[shape_id]
        if shape.feed_length_m and shape.feed_length_m > 0:
            error = abs(shape.length_m - shape.feed_length_m) / shape.feed_length_m
            bad_lengths += int(error > MAX_SHAPE_LENGTH_ERROR)
    if bad_lengths:
        blocking.append(
            f"shapes: {bad_lengths} recomputed lengths differ from shape_dist_traveled by over 1 %"
        )

    # Per-object anomalies, counted in trips.
    stop_offset = stop_order = 0
    offsets = []
    for key in pattern_keys:
        projection = projections[key]
        offsets.append(projection.offset)
        stop_offset += int(bool(np.any(projection.offset > MAX_STOP_OFFSET_M)))
        stop_order += int(not projection.increasing)
    all_offsets = np.concatenate(offsets) if offsets else np.zeros(0)
    median_offset = float(np.median(all_offsets)) if len(all_offsets) else 0.0
    if median_offset > MAX_MEDIAN_OFFSET_M:
        blocking.append(f"stops: median offset to the shape is {median_offset:.1f} m")

    trajectories = bundle.trajectories.values()
    anomalies = {
        "stop_offset": stop_offset,
        "stop_order": stop_order,
        "time_repaired": sum(int(t.time_repaired) for t in trajectories),
        "truncated_after_28h": sum(int(t.truncated) for t in trajectories),
        "dropped_before_start": int(day.dropped_before_start),
        "dropped_after_span": int(day.dropped_after_span),
        "without_stop_times": int(day.without_stop_times),
        "block_overlap": int(bundle.assembly.overlapping_blocks),
    }
    allowed = anomaly_tolerance * max(n_trips, 1)
    for key in TOLERATED_ANOMALIES:
        if anomalies[key] > allowed:
            share = f"{anomaly_tolerance:.1%} of {n_trips} trips"
            blocking.append(f"{key}: {anomalies[key]} anomalies exceed {share}")

    info = {
        "deadheads": bundle.assembly.deadheads,
        "stop_offset_median_m": round(median_offset, 2),
        "slices": len(bundle.slices),
        "slice_bytes": total_bytes,
    }
    return CheckReport(blocking=blocking, anomalies=anomalies, info=info)


def _check_slice_file(path: Path, expected_bytes: int) -> list[str]:
    problems = []
    data = path.read_bytes()
    if len(data) != expected_bytes:
        problems.append(f"{path.name}: {len(data)} bytes on disk, {expected_bytes} in the manifest")
    try:
        decoded = decode_slice(data)
    except ValueError as exc:
        return [*problems, f"{path.name}: {exc}"]
    if decoded.paths and not np.all(np.diff(decoded.index) >= 2):
        problems.append(f"{path.name}: a path has fewer than two vertices")
    for start, end in zip(decoded.index[:-1], decoded.index[1:], strict=True):
        if not np.all(np.diff(decoded.times[start:end]) > 0):
            problems.append(f"{path.name}: a path has non-increasing times")
            break
    return problems


def check_day_dir(
    day_dir: Path,
    *,
    max_slice_bytes: int = MAX_SLICE_BYTES,
    max_day_bytes: int = MAX_DAY_BYTES,
) -> CheckReport:
    """Check a written day directory from its files alone."""
    manifest_path = day_dir / "manifest.json"
    if not manifest_path.is_file():
        return CheckReport(blocking=[f"manifest.json missing in {day_dir}"])
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except ValueError as exc:
        return CheckReport(blocking=[f"manifest.json is not valid JSON: {exc}"])

    blocking = [
        f"manifest.json: missing key {key!r}"
        for key in REQUIRED_MANIFEST_KEYS
        if key not in manifest
    ]
    if blocking:
        return CheckReport(blocking=blocking)

    for series, per_mode in manifest["per_minute"].items():
        for mode in MODES:
            values = per_mode.get(mode)
            if not isinstance(values, list) or len(values) != MINUTES_PER_DAY:
                blocking.append(f"per_minute {series}/{mode}: expected {MINUTES_PER_DAY} values")

    listed = set()
    total_bytes = 0
    for entry in manifest["slices"]:
        path = day_dir / entry["path"]
        listed.add(path.name)
        if not path.is_file():
            blocking.append(f"{path.name}: listed in the manifest but missing")
            continue
        blocking += _check_slice_file(path, entry["bytes"])
        total_bytes += entry["bytes"]
        if entry["bytes"] > max_slice_bytes:
            blocking.append(f"{path.name}: {entry['bytes']} bytes exceed {max_slice_bytes}")
    slices_dir = day_dir / "slices"
    if slices_dir.is_dir():
        for path in slices_dir.iterdir():
            if path.name not in listed:
                blocking.append(f"{path.name}: present on disk but not listed in the manifest")
    if total_bytes > max_day_bytes:
        blocking.append(f"day: {total_bytes} bytes of slices exceed {max_day_bytes}")

    for entry in manifest["stops_files"]:
        if not (day_dir / entry["path"]).is_file():
            blocking.append(f"{entry['path']}: listed in the manifest but missing")
    if not (day_dir / manifest["vehicles_file"]).is_file():
        blocking.append(f"{manifest['vehicles_file']}: listed in the manifest but missing")

    anomalies = {key: int(value) for key, value in manifest["anomalies"].items()}
    info = {"slices": len(manifest["slices"]), "slice_bytes": total_bytes}
    return CheckReport(blocking=blocking, anomalies=anomalies, info=info)

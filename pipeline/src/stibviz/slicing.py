"""Hour slices: the portions of every path active during one hour, per mode.

ARCHITECTURE.md, step 9. The site mounts one slice per mode at a time and switches at the hour.
Slice ``h`` therefore holds every path portion active in ``[h - 300 s, h + 1 h + 120 s)``: the
upstream overlap feeds the trails that are still visible when the hour starts, the downstream
overlap covers the switch to the next slice. Paths are cut by interpolation at the window bounds.
Only non-empty slices exist; the manifest lists them and the site asks for nothing else.

Hours are numbered as GTFS hours of the service day: slice 4 covers 04:00 to 05:00, slice 27
covers 03:00 to 04:00 the next morning.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

import numpy as np

from stibviz.service_day import SERVICE_DAY_LENGTH_S, SERVICE_DAY_START_S
from stibviz.trajectories import Path, TripTrajectory

UPSTREAM_OVERLAP_S = 300
DOWNSTREAM_OVERLAP_S = 120
HOUR_S = 3600
FIRST_HOUR = SERVICE_DAY_START_S // HOUR_S
HOURS_PER_DAY = SERVICE_DAY_LENGTH_S // HOUR_S


@dataclass(frozen=True)
class Slice:
    """Every path portion of one mode active during one GTFS hour of the service day."""

    hour: int
    mode: str
    paths: tuple[Path, ...]

    @property
    def vertices(self) -> int:
        return sum(len(path.t) for path in self.paths)


def _interpolated(path: Path, at: float) -> tuple[float, float]:
    lon = float(np.interp(at, path.t, path.lon))
    lat = float(np.interp(at, path.t, path.lat))
    return lon, lat


def cut_path(path: Path, start: float, end: float) -> Path | None:
    """The portion of ``path`` within ``[start, end]``, or None when less than a segment remains.

    Vertices inside the window are kept as they are; a vertex is interpolated at each bound the
    path crosses. A path that only touches a bound has nothing to draw and yields None.
    """
    t = path.t
    if t[-1] <= start or t[0] >= end:
        return None
    keep = (t >= start) & (t <= end)
    lon, lat, times = list(path.lon[keep]), list(path.lat[keep]), list(t[keep])
    if t[0] < start and (not times or times[0] > start):
        lo, la = _interpolated(path, start)
        lon.insert(0, lo)
        lat.insert(0, la)
        times.insert(0, start)
    if t[-1] > end and (not times or times[-1] < end):
        lo, la = _interpolated(path, end)
        lon.append(lo)
        lat.append(la)
        times.append(end)
    if len(times) < 2:
        return None
    return Path(
        lon=np.asarray(lon, dtype=np.float64),
        lat=np.asarray(lat, dtype=np.float64),
        t=np.asarray(times, dtype=np.float64),
        vehicle=path.vehicle,
        trip=path.trip,
        route=path.route,
    )


def window(day_hour: int) -> tuple[float, float]:
    """The time window of slice ``day_hour`` (0 = 04:00), in seconds since 04:00."""
    start = day_hour * HOUR_S - UPSTREAM_OVERLAP_S
    end = (day_hour + 1) * HOUR_S + DOWNSTREAM_OVERLAP_S
    return float(start), float(end)


def slice_trajectories(
    trajectories: Iterable[TripTrajectory], mode_of_route: Mapping[int, str]
) -> list[Slice]:
    """Distribute every path into the hour slices it is active in, per mode.

    ``mode_of_route`` maps a route index to its mode name. Slices come back sorted by hour then
    mode, and only the non-empty ones are returned.
    """
    buckets: dict[tuple[int, str], list[Path]] = defaultdict(list)
    for trajectory in trajectories:
        for path in trajectory.paths:
            mode = mode_of_route[path.route]
            first = max(0, int((path.t[0] - DOWNSTREAM_OVERLAP_S) // HOUR_S) - 1)
            last = min(HOURS_PER_DAY - 1, int((path.t[-1] + UPSTREAM_OVERLAP_S) // HOUR_S))
            for day_hour in range(first, last + 1):
                start, end = window(day_hour)
                cut = cut_path(path, start, end)
                if cut is not None:
                    buckets[(FIRST_HOUR + day_hour, mode)].append(cut)
    return [
        Slice(hour=hour, mode=mode, paths=tuple(paths))
        for (hour, mode), paths in sorted(buckets.items())
    ]

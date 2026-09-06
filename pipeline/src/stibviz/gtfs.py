"""Reading and validating a GTFS feed.

Only what the pipeline needs is read. Identifiers stay strings exactly as published. The columns
the pipeline computes on are added with an explicit type: ``lat`` and ``lon`` as floats, ``seq``
as an integer, ``arrival_s`` and ``departure_s`` as integer seconds. GTFS times count from
"noon minus twelve hours" of the service date, so an hour above 24 simply keeps counting:
``25:10:00`` is 90,600 seconds and belongs to the same service day as ``05:10:00``.
"""

from __future__ import annotations

import datetime as dt
import io
import re
import zipfile
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import IO

import pandas as pd


class GtfsError(ValueError):
    """The feed is missing something the pipeline needs, or a value is malformed."""


# File -> columns the pipeline cannot work without.
REQUIRED_FILES: dict[str, tuple[str, ...]] = {
    "agency.txt": ("agency_name",),
    "routes.txt": ("route_id", "route_short_name", "route_type", "route_color"),
    "trips.txt": ("route_id", "service_id", "trip_id", "shape_id"),
    "stop_times.txt": ("trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"),
    "stops.txt": ("stop_id", "stop_name", "stop_lat", "stop_lon"),
    "shapes.txt": ("shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"),
}

# Optional files, with the columns required when the file is present.
OPTIONAL_FILES: dict[str, tuple[str, ...]] = {
    "calendar.txt": (
        "service_id",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "start_date",
        "end_date",
    ),
    "calendar_dates.txt": ("service_id", "date", "exception_type"),
    "feed_info.txt": ("feed_version",),
}

# Optional columns, with the value used when the column is absent.
OPTIONAL_COLUMNS: dict[str, dict[str, str]] = {
    "routes.txt": {"route_long_name": "", "route_text_color": "FFFFFF"},
    "trips.txt": {"block_id": "", "direction_id": "", "trip_headsign": ""},
    "stops.txt": {"location_type": "0", "parent_station": ""},
    "shapes.txt": {"shape_dist_traveled": ""},
    "feed_info.txt": {"feed_start_date": "", "feed_end_date": ""},
}

_TIME_PATTERN = re.compile(r"^(\d{1,2}):([0-5]\d):([0-5]\d)$")


def parse_gtfs_time(text: str) -> int:
    """Turn a GTFS ``HH:MM:SS`` time into seconds; ``HH`` may exceed 24."""
    match = _TIME_PATTERN.match(text.strip())
    if match is None:
        raise GtfsError(f"malformed GTFS time: {text!r}")
    hours, minutes, seconds = (int(part) for part in match.groups())
    return hours * 3600 + minutes * 60 + seconds


@dataclass(frozen=True)
class FeedInfo:
    """Version and validity window of the feed."""

    version: str
    start_date: dt.date
    end_date: dt.date


@dataclass(frozen=True)
class Feed:
    """The GTFS tables the pipeline uses, typed and sorted.

    ``stop_times`` is sorted by ``trip_id`` then ``seq``; ``shapes`` by ``shape_id`` then ``seq``.
    ``calendar`` and ``calendar_dates`` may be empty frames when the file is absent.
    """

    routes: pd.DataFrame
    trips: pd.DataFrame
    stop_times: pd.DataFrame
    stops: pd.DataFrame
    shapes: pd.DataFrame
    calendar: pd.DataFrame
    calendar_dates: pd.DataFrame
    info: FeedInfo

    def covers(self, date: dt.date) -> bool:
        """Whether the feed's validity window includes ``date``."""
        return self.info.start_date <= date <= self.info.end_date


class _Source:
    """A GTFS feed stored as a zip archive or as an extracted directory."""

    def __init__(self, source: Path | str | bytes) -> None:
        self._zip: zipfile.ZipFile | None = None
        self._dir: Path | None = None
        if isinstance(source, bytes):
            self._zip = zipfile.ZipFile(io.BytesIO(source))
        else:
            path = Path(source)
            if path.is_dir():
                self._dir = path
            elif path.is_file():
                self._zip = zipfile.ZipFile(path)
            else:
                raise GtfsError(f"GTFS source not found: {path}")

    def names(self) -> set[str]:
        if self._zip is not None:
            return {Path(name).name for name in self._zip.namelist() if not name.endswith("/")}
        assert self._dir is not None
        return {entry.name for entry in self._dir.iterdir() if entry.is_file()}

    @contextmanager
    def open(self, name: str) -> Iterator[IO[bytes]]:
        if self._zip is not None:
            member = next(m for m in self._zip.namelist() if Path(m).name == name)
            with self._zip.open(member) as handle:
                yield handle
        else:
            assert self._dir is not None
            with (self._dir / name).open("rb") as handle:
                yield handle

    def close(self) -> None:
        if self._zip is not None:
            self._zip.close()


def _read_table(source: _Source, name: str, required: tuple[str, ...]) -> pd.DataFrame:
    with source.open(name) as handle:
        frame = pd.read_csv(handle, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    frame.columns = frame.columns.str.strip()
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise GtfsError(f"{name}: missing required column(s) {', '.join(missing)}")
    for column, default in OPTIONAL_COLUMNS.get(name, {}).items():
        if column not in frame.columns:
            frame[column] = default
    return frame


def _read_optional_table(source: _Source, name: str, names: set[str]) -> pd.DataFrame:
    columns = OPTIONAL_FILES[name]
    if name not in names:
        return pd.DataFrame({column: pd.Series(dtype=str) for column in columns})
    return _read_table(source, name, columns)


def _to_float(frame: pd.DataFrame, column: str, table: str) -> pd.Series:
    try:
        return pd.to_numeric(frame[column], errors="raise").astype("float64")
    except (ValueError, TypeError) as exc:
        raise GtfsError(f"{table}: column {column} holds a non-numeric value") from exc


def _to_int(frame: pd.DataFrame, column: str, table: str) -> pd.Series:
    try:
        return pd.to_numeric(frame[column], errors="raise").astype("int64")
    except (ValueError, TypeError) as exc:
        raise GtfsError(f"{table}: column {column} holds a non-integer value") from exc


def _time_column(frame: pd.DataFrame, column: str, table: str) -> pd.Series:
    parts = frame[column].str.strip().str.extract(_TIME_PATTERN)
    bad = parts[0].isna()
    if bad.any():
        example = frame.loc[bad, column].iloc[0]
        raise GtfsError(f"{table}: {int(bad.sum())} malformed {column} value(s), e.g. {example!r}")
    hours, minutes, seconds = (parts[i].astype("int64") for i in range(3))
    return hours * 3600 + minutes * 60 + seconds


def _to_date(text: str, what: str) -> dt.date:
    try:
        return dt.datetime.strptime(text.strip(), "%Y%m%d").date()
    except ValueError as exc:
        raise GtfsError(f"{what}: malformed date {text!r}, expected YYYYMMDD") from exc


# The feed version names the files the pipeline writes, so it has to be one safe path segment.
# Anything else is refused rather than rewritten: the version travels into the manifest and into
# the URLs the site fetches, so quietly changing it would be worse than failing the build.
FEED_VERSION_RE = re.compile(r"[A-Za-z0-9._-]{1,64}")


def _feed_version(text: str) -> str:
    version = text.strip() or "unknown"
    if version in {".", ".."} or FEED_VERSION_RE.fullmatch(version) is None:
        raise GtfsError(
            f"feed_info.txt: feed_version {version!r} cannot name a file; "
            "expected letters, digits, dot, dash or underscore"
        )
    return version


def _feed_info(
    feed_info: pd.DataFrame, calendar: pd.DataFrame, calendar_dates: pd.DataFrame
) -> FeedInfo:
    version = "unknown"
    start = end = ""
    if not feed_info.empty:
        row = feed_info.iloc[0]
        version = _feed_version(row["feed_version"])
        start, end = row["feed_start_date"], row["feed_end_date"]
    if start and end:
        return FeedInfo(version, _to_date(start, "feed_info.txt"), _to_date(end, "feed_info.txt"))
    dates = [_to_date(value, "calendar.txt") for value in calendar.start_date]
    dates += [_to_date(value, "calendar.txt") for value in calendar.end_date]
    dates += [_to_date(value, "calendar_dates.txt") for value in calendar_dates.date]
    if not dates:
        raise GtfsError("cannot determine the feed validity window: no dates in the calendars")
    return FeedInfo(version, min(dates), max(dates))


def load_feed(source: Path | str | bytes) -> Feed:
    """Read a GTFS zip, in-memory zip or extracted directory into typed tables.

    Raises :class:`GtfsError` when a required file or column is missing, when a time, date or
    coordinate is malformed, or when neither calendar file exists.
    """
    src = _Source(source)
    try:
        names = src.names()
        missing = sorted(set(REQUIRED_FILES) - names)
        if missing:
            raise GtfsError(f"missing required GTFS file(s): {', '.join(missing)}")
        if "calendar.txt" not in names and "calendar_dates.txt" not in names:
            raise GtfsError("calendar.txt or calendar_dates.txt is required")

        tables = {name: _read_table(src, name, columns) for name, columns in REQUIRED_FILES.items()}
        calendar = _read_optional_table(src, "calendar.txt", names)
        calendar_dates = _read_optional_table(src, "calendar_dates.txt", names)
        feed_info = _read_optional_table(src, "feed_info.txt", names)
    finally:
        src.close()

    stops = tables["stops.txt"]
    stops["lat"] = _to_float(stops, "stop_lat", "stops.txt")
    stops["lon"] = _to_float(stops, "stop_lon", "stops.txt")

    shapes = tables["shapes.txt"]
    shapes["lat"] = _to_float(shapes, "shape_pt_lat", "shapes.txt")
    shapes["lon"] = _to_float(shapes, "shape_pt_lon", "shapes.txt")
    shapes["seq"] = _to_int(shapes, "shape_pt_sequence", "shapes.txt")
    shapes["dist_km"] = pd.to_numeric(shapes["shape_dist_traveled"], errors="coerce")
    shapes = shapes.sort_values(["shape_id", "seq"], kind="stable").reset_index(drop=True)

    stop_times = tables["stop_times.txt"]
    stop_times["arrival_s"] = _time_column(stop_times, "arrival_time", "stop_times.txt")
    stop_times["departure_s"] = _time_column(stop_times, "departure_time", "stop_times.txt")
    stop_times["seq"] = _to_int(stop_times, "stop_sequence", "stop_times.txt")
    stop_times = stop_times.sort_values(["trip_id", "seq"], kind="stable").reset_index(drop=True)

    return Feed(
        routes=tables["routes.txt"],
        trips=tables["trips.txt"],
        stop_times=stop_times,
        stops=stops,
        shapes=shapes,
        calendar=calendar,
        calendar_dates=calendar_dates,
        info=_feed_info(feed_info, calendar, calendar_dates),
    )

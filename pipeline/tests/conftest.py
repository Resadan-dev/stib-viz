"""Shared test fixtures: a small synthetic GTFS feed and helpers to write it as a zip.

The synthetic network lives around (4.35 E, 50.85 N), roughly central Brussels. At that
latitude one degree of longitude is about 70.3 km and one degree of latitude about 111.2 km, so
0.01 degrees east is about 703 m and 0.01 degrees north about 1,112 m.

Shape A runs east along latitude 50.85 from S1 to S3, then turns north to S4:
S1 (4.350) -> S2 (4.360) -> S3 (4.370) -> S4 (4.370, 50.860). Shape B is its reverse.
Shape C is the S1 -> S2 leg only, used by bus 95, whose stop S2B sits 11 m north of the line.
"""

from __future__ import annotations

import io
import zipfile
from collections.abc import Mapping
from pathlib import Path

import pytest

# --- Geometry -----------------------------------------------------------------------------

SHAPE_A = [
    (4.350, 50.850),
    (4.355, 50.850),
    (4.360, 50.850),
    (4.365, 50.850),
    (4.370, 50.850),
    (4.370, 50.855),
    (4.370, 50.860),
]
SHAPE_B = list(reversed(SHAPE_A))
SHAPE_C = [(4.350, 50.850), (4.355, 50.850), (4.360, 50.850)]

STOPS = {
    "S1": ("Gare", 50.850, 4.350),
    "S2": ("Bourse", 50.850, 4.360),
    "S2B": ("Bourse quai B", 50.8501, 4.360),
    "S3": ("Parc", 50.850, 4.370),
    "S4": ("Nord", 50.860, 4.370),
}


def _shape_rows(shape_id: str, points: list[tuple[float, float]]) -> list[str]:
    rows = []
    dist = 0.0
    prev = None
    for i, (lon, lat) in enumerate(points):
        if prev is not None:
            # Rough planar distance in km, close enough for a feed that the pipeline recomputes.
            dx = (lon - prev[0]) * 70.3
            dy = (lat - prev[1]) * 111.2
            dist += (dx * dx + dy * dy) ** 0.5
        rows.append(f"{shape_id},{lat:.6f},{lon:.6f},{10001 + i},{dist:.3f}")
        prev = (lon, lat)
    return rows


# --- Tables -------------------------------------------------------------------------------

AGENCY = (
    "agency_id,agency_name,agency_url,agency_timezone,agency_lang\n"
    '"STIB/MIVB",STIB,https://stib.example,Europe/Brussels,fr\n'
)

FEED_INFO = (
    "feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version\n"
    "STIB,https://stib.example,fr,20260831,20260927,test_2026\n"
)

ROUTES = (
    "route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color\n"
    'M1,"STIB/MIVB",1,GARE - NORD,1,B5378C,FFFFFF\n'
    'B95,"STIB/MIVB",95,GARE - BOURSE,3,1D4ED8,FFFFFF\n'
    'N06,"STIB/MIVB",N06,NUIT GARE - NORD,3,7C3AED,FFFFFF\n'
)

STOPS_CSV = "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\n" + "".join(
    f"{sid},{name},{lat:.6f},{lon:.6f},0,\n" for sid, (name, lat, lon) in STOPS.items()
)

CALENDAR = (
    "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n"
    "WK,1,1,1,1,1,0,0,20260831,20260927\n"
    "NIGHT,0,0,0,0,1,1,0,20260831,20260927\n"
)

# EXTRA exists only through calendar_dates (allowed by GTFS). WK is removed on the 10th.
CALENDAR_DATES = "service_id,date,exception_type\nEXTRA,20260909,1\nWK,20260910,2\n"

SHAPES_CSV = (
    "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence,shape_dist_traveled\n"
    + "\n".join(
        _shape_rows("shpA", SHAPE_A) + _shape_rows("shpB", SHAPE_B) + _shape_rows("shpC", SHAPE_C)
    )
    + "\n"
)

# trip_id, route, service, block, shape, direction, headsign
TRIPS_ROWS = [
    ("T1", "M1", "WK", "V1", "shpA", "0", "NORD"),
    ("T2", "M1", "WK", "V1", "shpB", "1", "GARE"),
    ("T3", "M1", "WK", "V1", "shpA", "0", "NORD"),
    ("T4", "B95", "WK", "V2", "shpC", "0", "BOURSE"),  # after midnight, kept
    ("T5", "B95", "WK", "V2", "shpC", "0", "BOURSE"),  # before 04:00, dropped
    ("T6", "N06", "NIGHT", "V3", "shpA", "0", "NORD"),  # ends 27:57, kept whole
    ("T7", "N06", "NIGHT", "V3", "shpA", "0", "NORD"),  # ends 28:05, truncated
    ("T8", "M1", "EXTRA", "", "shpA", "0", "NORD"),  # no block: vehicle of its own
    ("T9", "M1", "WK", "V5", "shpA", "0", "NORD"),  # overlaps T10 -> block split
    ("T10", "M1", "WK", "V5", "shpB", "1", "GARE"),
    ("T11", "M1", "WK", "V6", "shpA", "0", "NORD"),  # ends at S4 ...
    ("T12", "M1", "WK", "V6", "shpA", "0", "NORD"),  # ... starts at S1: deadhead
]

TRIPS_CSV = "route_id,service_id,trip_id,trip_headsign,direction_id,block_id,shape_id\n" + "".join(
    f"{route},{service},{trip},{headsign},{direction},{block},{shape}\n"
    for trip, route, service, block, shape, direction, headsign in TRIPS_ROWS
)

StopTimeRow = tuple[str, str, str]


def _st(trip: str, rows: list[StopTimeRow]) -> list[str]:
    """Stop-time rows for one trip: (arrival, departure, stop_id) in stop order."""
    return [f"{trip},{arr},{dep},{stop},{i + 1}" for i, (arr, dep, stop) in enumerate(rows)]


def _run(start_hhmm: str, stops: list[str], minutes: list[int]) -> list[StopTimeRow]:
    """Stop times for a run starting at ``start_hhmm`` with offsets in minutes per stop."""
    h, m = (int(x) for x in start_hhmm.split(":"))
    base = h * 60 + m
    rows: list[StopTimeRow] = []
    for stop, offset in zip(stops, minutes, strict=True):
        total = base + offset
        t = f"{total // 60:02d}:{total % 60:02d}:00"
        rows.append((t, t, stop))
    return rows


OUT = ["S1", "S2", "S3", "S4"]
BACK = ["S4", "S3", "S2", "S1"]

STOP_TIMES_CSV = (
    "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
    + "\n".join(
        # T1: a 30 s dwell at S2, so the trajectory splits there.
        _st(
            "T1",
            [
                ("05:00:00", "05:00:00", "S1"),
                ("05:02:00", "05:02:30", "S2"),
                ("05:04:00", "05:04:00", "S3"),
                ("05:07:00", "05:07:00", "S4"),
            ],
        )
        + _st("T2", _run("05:15", BACK, [0, 3, 5, 7]))
        # T3: S2 and S3 share the same minute, so times must be spread by distance.
        + _st("T3", _run("05:30", OUT, [0, 2, 2, 7]))
        + _st("T4", _run("25:10", ["S1", "S2B"], [0, 3]))
        + _st("T5", _run("03:30", ["S1", "S2B"], [0, 3]))
        + _st("T6", _run("27:50", OUT, [0, 2, 4, 7]))
        + _st("T7", _run("27:58", OUT, [0, 2, 4, 7]))
        + _st("T8", _run("06:00", OUT, [0, 2, 4, 7]))
        + _st("T9", _run("07:00", OUT, [0, 2, 4, 7]))
        + _st("T10", _run("07:05", BACK, [0, 3, 5, 7]))
        + _st("T11", _run("08:00", OUT, [0, 2, 4, 7]))
        + _st("T12", _run("08:20", OUT, [0, 2, 4, 7]))
    )
    + "\n"
)

SAMPLE_TABLES: dict[str, str] = {
    "agency.txt": AGENCY,
    "feed_info.txt": FEED_INFO,
    "routes.txt": ROUTES,
    "stops.txt": STOPS_CSV,
    "calendar.txt": CALENDAR,
    "calendar_dates.txt": CALENDAR_DATES,
    "shapes.txt": SHAPES_CSV,
    "trips.txt": TRIPS_CSV,
    "stop_times.txt": STOP_TIMES_CSV,
}


def write_gtfs_zip(path: Path, tables: Mapping[str, str]) -> Path:
    """Write the given tables as a GTFS zip and return its path."""
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, text in tables.items():
            zf.writestr(name, text)
    return path


def gtfs_zip_bytes(tables: Mapping[str, str]) -> bytes:
    """Return the given tables as an in-memory GTFS zip."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, text in tables.items():
            zf.writestr(name, text)
    return buffer.getvalue()


@pytest.fixture
def sample_gtfs_zip(tmp_path: Path) -> Path:
    """The synthetic feed written to a temporary zip."""
    return write_gtfs_zip(tmp_path / "gtfs.zip", SAMPLE_TABLES)

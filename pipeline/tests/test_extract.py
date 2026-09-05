"""Tests against the versioned three-route extract of the real STIB feed.

Two kinds of assertions: figures counted directly from the raw GTFS tables, independent of the
pipeline (trips, vehicles, peak), and frozen reference figures in ``expected.json`` that catch
any unintended change in the produced day.
"""

from __future__ import annotations

import datetime as dt
import json
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from stibviz.build import BuildResult, build_day
from stibviz.checks import check_day_dir
from stibviz.cli import main
from stibviz.encode import write_day
from stibviz.gtfs import load_feed, parse_gtfs_time
from stibviz.service_day import SERVICE_DAY_START_S, SPAN_END_S
from stibviz.stats import MINUTES_PER_DAY

EXTRACT_DIR = Path(__file__).parent / "fixtures" / "gtfs-extract"
EXTRACT_ZIP = EXTRACT_DIR / "gtfs.zip"
EXPECTED = json.loads((EXTRACT_DIR / "expected.json").read_text(encoding="utf-8"))
DATE = dt.date.fromisoformat(EXPECTED["date"])
MAX_EXTRACT_BYTES = 500_000


@pytest.fixture(scope="module")
def built() -> BuildResult:
    return build_day(
        load_feed(EXTRACT_ZIP), DATE, generated_at=dt.datetime(2026, 9, 5, tzinfo=dt.UTC)
    )


def _raw(name: str) -> pd.DataFrame:
    with zipfile.ZipFile(EXTRACT_ZIP) as archive, archive.open(name) as handle:
        return pd.read_csv(handle, dtype=str, keep_default_na=False)


def _raw_day_trips() -> pd.DataFrame:
    """Trips of the date, from the raw tables and the GTFS rules alone."""
    weekday = DATE.strftime("%A").lower()
    key = DATE.strftime("%Y%m%d")
    calendar = _raw("calendar.txt")
    running = calendar[
        (calendar[weekday] == "1") & (calendar.start_date <= key) & (calendar.end_date >= key)
    ]
    services = set(running.service_id)
    dates = _raw("calendar_dates.txt")
    dates = dates[dates.date == key]
    services |= set(dates[dates.exception_type == "1"].service_id)
    services -= set(dates[dates.exception_type == "2"].service_id)
    trips = _raw("trips.txt")
    trips = trips[trips.service_id.isin(services)]

    stop_times = _raw("stop_times.txt")
    stop_times = stop_times[stop_times.trip_id.isin(trips.trip_id)]
    seconds = stop_times.departure_time.map(parse_gtfs_time) - SERVICE_DAY_START_S
    bounds = seconds.groupby(stop_times.trip_id).agg(["min", "max"])
    bounds = bounds[(bounds["min"] >= 0) & (bounds["min"] < SPAN_END_S - SERVICE_DAY_START_S)]
    return trips.merge(bounds, left_on="trip_id", right_index=True)


def test_extract_stays_small_and_clearly_marked() -> None:
    assert EXTRACT_ZIP.stat().st_size < MAX_EXTRACT_BYTES
    assert load_feed(EXTRACT_ZIP).info.version.endswith("-extract")
    assert load_feed(EXTRACT_ZIP).info.version == EXPECTED["feed_version"]


def test_build_passes_every_check(built: BuildResult) -> None:
    assert built.report.blocking == []
    assert built.report.anomalies == EXPECTED["anomalies"]


def test_trip_and_vehicle_counts_match_a_direct_count(built: BuildResult) -> None:
    raw = _raw_day_trips()
    assert built.bundle.stats.total_trips == len(raw) == EXPECTED["total_trips"]
    # No overlapping block on this day, so one vehicle per block.
    assert built.bundle.stats.total_vehicles == raw.block_id.nunique() == EXPECTED["total_vehicles"]


def test_peak_matches_a_direct_count(built: BuildResult) -> None:
    raw = _raw_day_trips()
    minutes = np.arange(MINUTES_PER_DAY) * 60
    start = raw["min"].to_numpy()[:, None]
    end = raw["max"].to_numpy()[:, None]
    running = ((start <= minutes) & (end > minutes)).sum(axis=0)
    minute = int(np.argmax(running))
    assert built.bundle.stats.peak == (int(running[minute]), minute)
    assert list(built.bundle.stats.peak) == EXPECTED["peak"]


def test_routes_match_the_raw_table(built: BuildResult) -> None:
    raw = _raw("routes.txt").set_index("route_short_name")
    produced = [
        {"short_name": r.short_name, "mode": r.mode, "color": r.color} for r in built.bundle.routes
    ]
    assert produced == EXPECTED["routes"]
    for route in built.bundle.routes:
        assert route.color == raw.loc[route.short_name, "route_color"].upper()


def test_reference_figures(built: BuildResult) -> None:
    stats = built.bundle.stats
    assert round(stats.total_km) == EXPECTED["total_km"]
    assert {m: int(v.max()) for m, v in stats.vehicles.items()} == EXPECTED["max_vehicles_per_mode"]
    assert len(built.bundle.slices) == EXPECTED["slices"]
    assert built.report.info["slice_bytes"] == EXPECTED["slice_bytes"]
    assert built.report.info["deadheads"] == EXPECTED["deadheads"]
    assert built.report.info["stop_offset_median_m"] < 1.0


def test_written_day_passes_file_checks(built: BuildResult, tmp_path: Path) -> None:
    write_day(built.bundle, tmp_path)
    report = check_day_dir(tmp_path / EXPECTED["date"])
    assert report.blocking == []
    assert report.info["slice_bytes"] == EXPECTED["slice_bytes"]


def test_cli_builds_and_checks_the_fixture_day(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    out = tmp_path / "data"
    assert (
        main(["build", "--gtfs", str(EXTRACT_ZIP), "--date", EXPECTED["date"], "--out", str(out)])
        == 0
    )
    assert main(["check", "--day", str(out / EXPECTED["date"])]) == 0
    assert (out / "index.json").is_file()
    assert f"{EXPECTED['total_trips']} trips" in capsys.readouterr().out

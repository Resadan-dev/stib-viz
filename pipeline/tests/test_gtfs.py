"""Reading and validating a GTFS feed."""

from __future__ import annotations

import datetime as dt
import zipfile
from pathlib import Path

import pytest
from tests.conftest import SAMPLE_TABLES, write_gtfs_zip

from stibviz.gtfs import Feed, GtfsError, load_feed, parse_gtfs_time


def test_parse_time_accepts_hours_beyond_24() -> None:
    assert parse_gtfs_time("04:00:00") == 4 * 3600
    assert parse_gtfs_time("25:10:00") == 25 * 3600 + 10 * 60
    assert parse_gtfs_time("5:07:30") == 5 * 3600 + 7 * 60 + 30


@pytest.mark.parametrize("text", ["", "5:10", "aa:bb:cc", "25:60:00", "01:02:03:04"])
def test_parse_time_rejects_malformed_values(text: str) -> None:
    with pytest.raises(GtfsError):
        parse_gtfs_time(text)


def test_load_sample_feed_tables_and_types(sample_gtfs_zip: Path) -> None:
    feed = load_feed(sample_gtfs_zip)
    assert isinstance(feed, Feed)
    assert len(feed.routes) == 3
    assert len(feed.trips) == 12
    assert set(feed.stops.stop_id) == {"S1", "S2", "S2B", "S3", "S4"}
    assert feed.stops.dtypes["lat"].kind == "f"
    assert feed.stops.dtypes["lon"].kind == "f"
    assert feed.shapes.dtypes["lat"].kind == "f"
    assert feed.shapes.dtypes["seq"].kind == "i"
    assert feed.shapes.dtypes["dist_km"].kind == "f"


def test_stop_times_get_integer_seconds_and_are_sorted(sample_gtfs_zip: Path) -> None:
    feed = load_feed(sample_gtfs_zip)
    st = feed.stop_times
    assert st.dtypes["arrival_s"].kind == "i"
    assert st.dtypes["departure_s"].kind == "i"
    assert st.dtypes["seq"].kind == "i"
    t4 = st[st.trip_id == "T4"]
    assert t4.departure_s.iloc[0] == 25 * 3600 + 10 * 60
    # Sorted by trip then by stop sequence, so per-trip slices are contiguous and ordered.
    grouped = st.groupby("trip_id", sort=False).seq
    assert (grouped.diff().dropna() > 0).all()
    assert list(st.trip_id.drop_duplicates()) == sorted(st.trip_id.unique())


def test_feed_info_gives_version_and_validity(sample_gtfs_zip: Path) -> None:
    feed = load_feed(sample_gtfs_zip)
    assert feed.info.version == "test_2026"
    assert feed.info.start_date == dt.date(2026, 8, 31)
    assert feed.info.end_date == dt.date(2026, 9, 27)
    assert feed.covers(dt.date(2026, 9, 9))
    assert not feed.covers(dt.date(2026, 10, 1))


def test_load_from_extracted_directory(sample_gtfs_zip: Path, tmp_path: Path) -> None:
    folder = tmp_path / "extracted"
    with zipfile.ZipFile(sample_gtfs_zip) as zf:
        zf.extractall(folder)
    feed = load_feed(folder)
    assert len(feed.trips) == 12


def test_missing_required_file_is_reported(tmp_path: Path) -> None:
    tables = {k: v for k, v in SAMPLE_TABLES.items() if k != "stops.txt"}
    path = write_gtfs_zip(tmp_path / "gtfs.zip", tables)
    with pytest.raises(GtfsError, match=r"stops.txt"):
        load_feed(path)


def test_missing_required_column_is_reported(tmp_path: Path) -> None:
    routes = SAMPLE_TABLES["routes.txt"].replace("route_color", "colour")
    path = write_gtfs_zip(tmp_path / "gtfs.zip", {**SAMPLE_TABLES, "routes.txt": routes})
    with pytest.raises(GtfsError, match="route_color"):
        load_feed(path)


def test_malformed_time_in_stop_times_is_reported(tmp_path: Path) -> None:
    broken = SAMPLE_TABLES["stop_times.txt"].replace("05:00:00,05:00:00,S1", "5h00,05:00:00,S1")
    path = write_gtfs_zip(tmp_path / "gtfs.zip", {**SAMPLE_TABLES, "stop_times.txt": broken})
    with pytest.raises(GtfsError, match="arrival_time"):
        load_feed(path)


def test_calendar_may_be_absent_when_calendar_dates_exists(tmp_path: Path) -> None:
    tables = {k: v for k, v in SAMPLE_TABLES.items() if k != "calendar.txt"}
    feed = load_feed(write_gtfs_zip(tmp_path / "gtfs.zip", tables))
    assert feed.calendar.empty
    assert len(feed.calendar_dates) == 2


def test_both_calendar_files_absent_is_an_error(tmp_path: Path) -> None:
    tables = {
        k: v for k, v in SAMPLE_TABLES.items() if k not in ("calendar.txt", "calendar_dates.txt")
    }
    with pytest.raises(GtfsError, match="calendar"):
        load_feed(write_gtfs_zip(tmp_path / "gtfs.zip", tables))


def test_feed_info_is_optional_and_falls_back_on_calendar(tmp_path: Path) -> None:
    tables = {k: v for k, v in SAMPLE_TABLES.items() if k != "feed_info.txt"}
    feed = load_feed(write_gtfs_zip(tmp_path / "gtfs.zip", tables))
    assert feed.info.version == "unknown"
    assert feed.info.start_date == dt.date(2026, 8, 31)
    assert feed.info.end_date == dt.date(2026, 9, 27)


def test_non_numeric_coordinate_is_reported(tmp_path: Path) -> None:
    stops = SAMPLE_TABLES["stops.txt"].replace("50.850000,4.350000", "north,4.350000")
    path = write_gtfs_zip(tmp_path / "gtfs.zip", {**SAMPLE_TABLES, "stops.txt": stops})
    with pytest.raises(GtfsError, match="stop_lat"):
        load_feed(path)


def test_malformed_calendar_date_is_reported(tmp_path: Path) -> None:
    tables = {k: v for k, v in SAMPLE_TABLES.items() if k != "feed_info.txt"}
    tables["calendar.txt"] = tables["calendar.txt"].replace("20260831", "2026-08-31")
    with pytest.raises(GtfsError, match="YYYYMMDD"):
        load_feed(write_gtfs_zip(tmp_path / "gtfs.zip", tables))


def test_missing_source_path_is_reported(tmp_path: Path) -> None:
    with pytest.raises(GtfsError, match="not found"):
        load_feed(tmp_path / "nowhere.zip")


@pytest.mark.parametrize(
    "version",
    [
        "../../../../etc/passwd",
        r"..\..\windows",
        "network/../../escape",
        "..",
        ".",
        "with space",
        "quote'd",
    ],
)
def test_feed_version_that_could_escape_a_directory_is_rejected(
    tmp_path: Path, version: str
) -> None:
    # The version names files the pipeline writes, so it must be usable as one path segment.
    tables = dict(SAMPLE_TABLES)
    tables["feed_info.txt"] = (
        "feed_publisher_name,feed_publisher_url,feed_lang,feed_version,"
        "feed_start_date,feed_end_date\n"
        f"Test,https://example.org,fr,{version},20260831,20260927\n"
    )
    path = write_gtfs_zip(tmp_path / "bad.zip", tables)
    with pytest.raises(GtfsError, match="feed_version"):
        load_feed(path)


def test_feed_version_keeps_the_characters_a_real_feed_uses(tmp_path: Path) -> None:
    tables = dict(SAMPLE_TABLES)
    tables["feed_info.txt"] = (
        "feed_publisher_name,feed_publisher_url,feed_lang,feed_version,"
        "feed_start_date,feed_end_date\n"
        "Test,https://example.org,fr,2_20_20260831_010702-extract,20260831,20260927\n"
    )
    path = write_gtfs_zip(tmp_path / "good.zip", tables)
    assert load_feed(path).info.version == "2_20_20260831_010702-extract"

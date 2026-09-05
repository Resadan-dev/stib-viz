"""Selecting the trips of one service day and applying the 04:00 -> 28:00 span rule."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import pytest

from stibviz.gtfs import load_feed
from stibviz.service_day import (
    SERVICE_DAY_START_S,
    SPAN_END_S,
    DateNotCoveredError,
    DayTrips,
    active_services,
    select_day,
)

WEDNESDAY = dt.date(2026, 9, 9)
THURSDAY = dt.date(2026, 9, 10)
FRIDAY = dt.date(2026, 9, 11)
SATURDAY = dt.date(2026, 9, 12)
SUNDAY = dt.date(2026, 9, 13)


def test_span_constants() -> None:
    assert SERVICE_DAY_START_S == 4 * 3600
    assert SPAN_END_S == 28 * 3600


def test_active_services_combine_calendar_and_exceptions(sample_gtfs_zip: Path) -> None:
    feed = load_feed(sample_gtfs_zip)
    assert active_services(feed, WEDNESDAY) == frozenset({"WK", "EXTRA"})
    assert active_services(feed, THURSDAY) == frozenset()  # WK removed by calendar_dates
    assert active_services(feed, FRIDAY) == frozenset({"WK", "NIGHT"})
    assert active_services(feed, SATURDAY) == frozenset({"NIGHT"})
    assert active_services(feed, SUNDAY) == frozenset()


def test_wednesday_keeps_the_extra_service_and_drops_the_early_trip(
    sample_gtfs_zip: Path,
) -> None:
    day = select_day(load_feed(sample_gtfs_zip), WEDNESDAY)
    assert isinstance(day, DayTrips)
    assert day.date == WEDNESDAY
    # WK trips T1-T5, T9-T12 plus EXTRA trip T8, minus T5 which departs at 03:30.
    assert set(day.trips.trip_id) == {"T1", "T2", "T3", "T4", "T8", "T9", "T10", "T11", "T12"}
    assert day.dropped_before_start == 1
    assert day.ends_after_span == 0


def test_friday_includes_night_trips_and_counts_the_one_running_past_28h(
    sample_gtfs_zip: Path,
) -> None:
    day = select_day(load_feed(sample_gtfs_zip), FRIDAY)
    assert {"T6", "T7"} <= set(day.trips.trip_id)
    assert "T8" not in set(day.trips.trip_id)
    assert len(day.trips) == 10
    assert day.ends_after_span == 1  # T7 arrives at 28:05


def test_saturday_has_only_the_night_service(sample_gtfs_zip: Path) -> None:
    day = select_day(load_feed(sample_gtfs_zip), SATURDAY)
    assert list(day.trips.trip_id) == ["T6", "T7"]


def test_trips_carry_start_and_end_in_gtfs_and_day_seconds(sample_gtfs_zip: Path) -> None:
    day = select_day(load_feed(sample_gtfs_zip), WEDNESDAY)
    t4 = day.trips.set_index("trip_id").loc["T4"]
    assert t4.start_s == 25 * 3600 + 10 * 60
    assert t4.end_s == 25 * 3600 + 13 * 60
    assert t4.start == t4.start_s - SERVICE_DAY_START_S
    assert t4.end == t4.end_s - SERVICE_DAY_START_S
    assert list(day.trips.columns[:3]) == ["trip_id", "route_id", "service_id"]


def test_trips_are_sorted_by_start_then_id(sample_gtfs_zip: Path) -> None:
    day = select_day(load_feed(sample_gtfs_zip), WEDNESDAY)
    starts = list(day.trips.start)
    assert starts == sorted(starts)
    assert list(day.trips.trip_id)[:3] == ["T1", "T2", "T3"]


def test_stop_times_are_restricted_to_the_day_and_shifted(sample_gtfs_zip: Path) -> None:
    day = select_day(load_feed(sample_gtfs_zip), WEDNESDAY)
    st = day.stop_times
    assert set(st.trip_id) == set(day.trips.trip_id)
    assert "T5" not in set(st.trip_id)
    first = st[st.trip_id == "T1"].iloc[0]
    assert first.dep == 5 * 3600 - SERVICE_DAY_START_S
    assert first.arr == first.dep


def test_date_outside_feed_validity_is_refused(sample_gtfs_zip: Path) -> None:
    with pytest.raises(DateNotCoveredError):
        select_day(load_feed(sample_gtfs_zip), dt.date(2026, 10, 1))


def test_day_without_service_is_empty_not_an_error(sample_gtfs_zip: Path) -> None:
    day = select_day(load_feed(sample_gtfs_zip), SUNDAY)
    assert day.trips.empty
    assert day.stop_times.empty
    assert day.dropped_before_start == 0


def test_side_counters_are_zero_on_the_sample_feed(sample_gtfs_zip: Path) -> None:
    day = select_day(load_feed(sample_gtfs_zip), WEDNESDAY)
    assert day.dropped_after_span == 0
    assert day.without_stop_times == 0

"""Route table with modes, and the per-minute series the manifest publishes."""

from __future__ import annotations

import numpy as np
import pytest
from tests.conftest import PipelineState

from stibviz.service_day import select_day
from stibviz.stats import (
    MODES,
    DayStats,
    RouteInfo,
    compute_stats,
    natural_key,
    route_mode,
    route_table,
)


@pytest.mark.parametrize(
    ("short_name", "route_type", "mode"),
    [
        ("1", "1", "metro"),
        ("7", "0", "tram"),
        ("95", "3", "bus"),
        ("N06", "3", "noctis"),
        ("N18", "3", "noctis"),
        ("NAV", "3", "bus"),  # the event shuttle is a bus, not a night line
    ],
)
def test_route_mode(short_name: str, route_type: str, mode: str) -> None:
    assert route_mode(short_name, route_type) == mode


def test_unknown_route_type_is_rejected() -> None:
    with pytest.raises(ValueError, match="route_type"):
        route_mode("X", "9")


def test_route_table_lists_the_routes_of_the_day_in_mode_then_natural_order(
    wednesday_state: PipelineState, friday_state: PipelineState
) -> None:
    wednesday = route_table(wednesday_state.feed, wednesday_state.day)
    assert [r.route_id for r in wednesday] == ["M1", "B95"]
    friday = route_table(friday_state.feed, friday_state.day)
    assert [(r.route_id, r.mode) for r in friday] == [
        ("M1", "metro"),
        ("B95", "bus"),
        ("N06", "noctis"),
    ]
    m1 = friday[0]
    assert isinstance(m1, RouteInfo)
    assert (m1.short_name, m1.long_name, m1.color, m1.text_color) == (
        "1",
        "GARE - NORD",
        "B5378C",
        "FFFFFF",
    )


def test_route_table_orders_short_names_naturally(wednesday_state: PipelineState) -> None:
    feed = wednesday_state.feed
    feed.routes.loc[len(feed.routes)] = ["B10", "STIB/MIVB", "10", "TEN", "3", "AAAAAA", "000000"]
    feed.routes.loc[len(feed.routes)] = ["B9", "STIB/MIVB", "9", "NINE", "3", "AAAAAA", "000000"]
    feed.trips.loc[len(feed.trips)] = ["B10", "WK", "TX10", "", "0", "", "shpC"]
    feed.trips.loc[len(feed.trips)] = ["B9", "WK", "TX9", "", "0", "", "shpC"]
    day = select_day(feed, wednesday_state.day.date)
    # Trips without stop times are not part of the day, so only the sample routes remain...
    assert [r.short_name for r in route_table(feed, day)] == ["1", "95"]
    # ...but the ordering rule itself puts 9 before 10 and 95.
    assert sorted(["95", "10", "9", "N06", "N4"], key=natural_key) == ["9", "10", "95", "N4", "N06"]


def test_per_minute_series_cover_every_mode_and_the_whole_day(
    wednesday_state: PipelineState,
) -> None:
    routes = route_table(wednesday_state.feed, wednesday_state.day)
    stats = compute_stats(wednesday_state.trajectories, wednesday_state.assembly, routes)
    assert isinstance(stats, DayStats)
    for series in (stats.vehicles, stats.departures, stats.km):
        assert set(series) == set(MODES)
        assert all(len(values) == 1440 for values in series.values())
    assert stats.vehicles["tram"].sum() == 0 and stats.vehicles["noctis"].sum() == 0


def test_vehicles_running_counts_active_trips_at_each_minute(
    wednesday_state: PipelineState,
) -> None:
    routes = route_table(wednesday_state.feed, wednesday_state.day)
    stats = compute_stats(wednesday_state.trajectories, wednesday_state.assembly, routes)
    metro = stats.vehicles["metro"]
    assert metro[61] == 1  # 05:01: T1 only
    assert metro[76] == 1  # 05:16: T2
    assert metro[186] == 2  # 07:06: T9 and T10 overlap
    assert metro[30] == 0
    assert stats.vehicles["bus"][1272] == 1  # 25:12: T4
    assert stats.peak == (2, 185)  # first minute with two metros running: 07:05


def test_departures_and_km_are_cumulative(wednesday_state: PipelineState) -> None:
    routes = route_table(wednesday_state.feed, wednesday_state.day)
    stats = compute_stats(wednesday_state.trajectories, wednesday_state.assembly, routes)
    metro_dep = stats.departures["metro"]
    assert metro_dep[59] == 0 and metro_dep[60] == 1  # T1 departs at 05:00
    assert metro_dep[-1] == 8
    assert np.all(np.diff(metro_dep) >= 0)
    assert stats.departures["bus"][1269] == 0 and stats.departures["bus"][1270] == 1
    metro_km = stats.km["metro"]
    assert np.all(np.diff(metro_km) >= 0)
    assert metro_km[-1] == pytest.approx(8 * 2.518, abs=0.05)
    assert stats.km["bus"][-1] == pytest.approx(0.703, abs=0.01)
    # Three minutes into T1 (05:00 -> 05:07), three sevenths of its length are covered.
    assert metro_km[63] == pytest.approx(2.518 * 3 / 7, abs=0.05)


def test_totals(wednesday_state: PipelineState) -> None:
    routes = route_table(wednesday_state.feed, wednesday_state.day)
    stats = compute_stats(wednesday_state.trajectories, wednesday_state.assembly, routes)
    assert stats.total_trips == 9
    assert stats.total_vehicles == 6
    assert stats.total_km == pytest.approx(8 * 2.518 + 0.703, abs=0.05)

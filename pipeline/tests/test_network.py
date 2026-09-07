"""Network layer: stop-to-stop segments with run counts, stop dictionary, v2 lookup table."""

from __future__ import annotations

import pytest
from tests.conftest import PipelineState

from stibviz.network import (
    INTENSITY_BREAKS,
    NetworkSegment,
    aggregate_speed_kmh,
    build_network,
    hourly_speeds_kmh,
    intensity_class,
    lookup_table,
    stop_dictionary,
)
from stibviz.shapes import project_patterns, trip_patterns
from stibviz.stats import route_table


def _segments(state: PipelineState) -> list[NetworkSegment]:
    patterns = trip_patterns(state.day)
    projections = project_patterns(set(patterns.values), state.shapes, state.feed.stops)
    routes = route_table(state.feed, state.day)
    return build_network(state.day, patterns, projections, state.shapes, routes)


@pytest.mark.parametrize(
    ("runs", "expected"),
    [(1, 1), (20, 1), (21, 2), (60, 2), (61, 3), (120, 3), (121, 4), (240, 4), (241, 5), (999, 5)],
)
def test_intensity_class(runs: int, expected: int) -> None:
    assert intensity_class(runs) == expected


def test_intensity_breaks_are_increasing() -> None:
    assert list(INTENSITY_BREAKS) == sorted(INTENSITY_BREAKS)
    assert len(INTENSITY_BREAKS) == 4


def test_segments_are_one_per_stop_pair_and_mode_with_run_counts(
    wednesday_state: PipelineState,
) -> None:
    segments = _segments(wednesday_state)
    keys = {(s.mode, s.from_stop, s.to_stop): s.runs for s in segments}
    assert keys == {
        ("metro", "S1", "S2"): 6,
        ("metro", "S2", "S3"): 6,
        ("metro", "S3", "S4"): 6,
        ("metro", "S4", "S3"): 2,
        ("metro", "S3", "S2"): 2,
        ("metro", "S2", "S1"): 2,
        ("bus", "S1", "S2B"): 1,
    }
    assert all(s.underground == (s.mode == "metro") for s in segments)
    assert all(s.intensity == intensity_class(s.runs) for s in segments)
    ordering = [(s.mode, s.from_stop, s.to_stop) for s in segments]
    assert ordering == sorted(ordering)


def test_aggregate_speed_is_distance_over_time_across_every_run() -> None:
    # A ratio of sums, not a mean of speeds: scheduled times are whole minutes, so one run over
    # 703 m reads as 21 or 42 km/h and nothing in between; over the day the rounding averages out.
    assert aggregate_speed_kmh([703.0, 703.0], [120.0, 120.0]) == pytest.approx(21.09, abs=0.01)
    assert aggregate_speed_kmh([1000.0, 1000.0], [120.0, 240.0]) == pytest.approx(20.0)


def test_aggregate_speed_leaves_out_runs_whose_stops_share_a_second() -> None:
    # Two stops on the same scheduled second say nothing about speed; the run is left out of
    # both sums, so it neither inflates the speed nor drags it to zero.
    assert aggregate_speed_kmh([500.0, 500.0], [0.0, 100.0]) == pytest.approx(18.0)
    assert aggregate_speed_kmh([500.0, 500.0], [-30.0, 100.0]) == pytest.approx(18.0)


def test_aggregate_speed_is_unknown_when_no_run_measures_anything() -> None:
    assert aggregate_speed_kmh([500.0], [0.0]) is None
    assert aggregate_speed_kmh([], []) is None


def _empty_day() -> tuple[list[float], list[float], list[int]]:
    return [0.0] * 24, [0.0] * 24, [0] * 24


def test_hourly_speed_reads_the_hour_alone_when_it_has_runs_enough() -> None:
    lengths, durations, runs = _empty_day()
    lengths[8], durations[8], runs[8] = 3000.0, 300.0, 3
    assert hourly_speeds_kmh(lengths, durations, runs)[8] == pytest.approx(36.0)


def test_hourly_speed_widens_to_its_neighbours_when_an_hour_is_too_thin() -> None:
    """Whole-minute timetables make one run worth ±25% on a two-minute leg.

    An hour served once says nothing, so the window grows to its neighbours until it holds runs
    enough to average that rounding out. It grows no further than two hours either way, which
    keeps the morning peak from borrowing the speeds of the middle of the day.
    """
    lengths, durations, runs = _empty_day()
    lengths[8], durations[8], runs[8] = 1000.0, 100.0, 1
    lengths[9], durations[9], runs[9] = 2000.0, 100.0, 2
    hourly = hourly_speeds_kmh(lengths, durations, runs)
    # Three runs across the pair: 3,000 m over 200 s, the same reading for both hours.
    assert hourly[8] == pytest.approx(54.0)
    assert hourly[9] == pytest.approx(54.0)


def test_hourly_speed_is_unknown_when_even_the_widest_window_is_too_thin() -> None:
    lengths, durations, runs = _empty_day()
    lengths[12], durations[12], runs[12] = 1000.0, 100.0, 1
    hourly = hourly_speeds_kmh(lengths, durations, runs)
    assert all(value is None for value in hourly)
    assert len(hourly) == 24


def test_hourly_speed_never_widens_across_the_ends_of_the_day() -> None:
    lengths, durations, runs = _empty_day()
    for hour in (0, 1, 2):
        lengths[hour], durations[hour], runs[hour] = 1000.0, 100.0, 1
    hourly = hourly_speeds_kmh(lengths, durations, runs)
    # The first hour reaches three runs by looking forward only, and the last hour finds none.
    assert hourly[0] == pytest.approx(36.0)
    assert hourly[23] is None


def test_segments_carry_a_speed_for_each_hour_of_the_service_day(
    wednesday_state: PipelineState,
) -> None:
    by_key = {(s.mode, s.from_stop, s.to_stop): s for s in _segments(wednesday_state)}
    segment = by_key[("metro", "S1", "S2")]
    assert len(segment.hourly_kmh) == 24
    # The synthetic Wednesday runs this leg between 05:00 and 08:20, hours 1 to 4 of the day.
    assert all(value is not None for value in segment.hourly_kmh[:6])
    # Nothing runs in the afternoon, and no window of two hours either way reaches it.
    assert all(value is None for value in segment.hourly_kmh[6:])
    assert segment.hourly_kmh[1] == pytest.approx(segment.speed_kmh, abs=6)


def test_segments_carry_the_scheduled_speed_of_the_day(wednesday_state: PipelineState) -> None:
    by_key = {(s.mode, s.from_stop, s.to_stop): s for s in _segments(wednesday_state)}
    # Six runs of 703 m in two minutes each.
    assert by_key[("metro", "S1", "S2")].speed_kmh == pytest.approx(21.1, abs=0.3)
    # T3 reaches S2 and S3 in the same minute and drops out of the sums; T1 dwells 30 s at S2.
    assert by_key[("metro", "S2", "S3")].speed_kmh == pytest.approx(22.2, abs=0.3)
    # 1112 m in three minutes for five runs, in five minutes for T3.
    assert by_key[("metro", "S3", "S4")].speed_kmh == pytest.approx(20.0, abs=0.3)
    assert all(s.speed_kmh is not None and s.speed_kmh > 0 for s in by_key.values())


def test_segment_geometry_follows_the_shape_between_the_two_stops(
    wednesday_state: PipelineState,
) -> None:
    by_key = {(s.from_stop, s.to_stop): s for s in _segments(wednesday_state)}
    corner_leg = by_key[("S3", "S4")]
    assert list(corner_leg.lon) == pytest.approx([4.370, 4.370])
    assert list(corner_leg.lat) == pytest.approx([50.850, 50.860])
    first_leg = by_key[("S1", "S2")]
    assert list(first_leg.lon) == pytest.approx([4.350, 4.360])
    assert list(first_leg.lat) == pytest.approx([50.850, 50.850])
    # The bus stop S2B sits off the line: the segment still ends on the shape.
    bus_leg = by_key[("S1", "S2B")]
    assert bus_leg.lat[-1] == pytest.approx(50.850)


def test_stop_dictionary_covers_the_stops_served_on_the_day(wednesday_state: PipelineState) -> None:
    stops = stop_dictionary(wednesday_state.feed, wednesday_state.day)
    assert set(stops) == {"S1", "S2", "S2B", "S3", "S4"}
    assert stops["S1"] == (pytest.approx(4.350), pytest.approx(50.850), "Gare")


def test_lookup_table_maps_route_and_terminus_to_patterns(wednesday_state: PipelineState) -> None:
    state = wednesday_state
    patterns = trip_patterns(state.day)
    projections = project_patterns(set(patterns.values), state.shapes, state.feed.stops)
    routes = route_table(state.feed, state.day)
    table = lookup_table(state.day, patterns, projections, routes)
    assert len(table["patterns"]) == 3
    outbound = next(p for p in table["patterns"] if p["shape_id"] == "shpA")
    assert outbound["route"] == "1"
    assert outbound["direction_id"] == "0"
    assert outbound["terminus"] == "S4"
    assert [stop for stop, _ in outbound["stops"]] == ["S1", "S2", "S3", "S4"]
    assert [along for _, along in outbound["stops"]] == pytest.approx([0, 703, 1406, 2518], abs=8)
    assert set(table["routes"]) == {"1", "95"}
    assert table["routes"]["1"]["S4"] == [table["patterns"].index(outbound)]
    shape_c = next(i for i, p in enumerate(table["patterns"]) if p["shape_id"] == "shpC")
    assert table["routes"]["95"] == {"S2B": [shape_c]}

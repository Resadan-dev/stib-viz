"""Network layer: stop-to-stop segments with run counts, stop dictionary, v2 lookup table."""

from __future__ import annotations

import pytest
from tests.conftest import PipelineState

from stibviz.network import (
    INTENSITY_BREAKS,
    NetworkSegment,
    build_network,
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

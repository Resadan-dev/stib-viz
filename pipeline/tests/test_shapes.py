"""Shapes: cumulative distances, stop projection and simplification on the synthetic feed."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import numpy as np
import pytest

from stibviz.gtfs import load_feed
from stibviz.service_day import select_day
from stibviz.shapes import (
    Shape,
    ShapeError,
    build_shapes,
    project_patterns,
    project_stops,
    trip_patterns,
)

WEDNESDAY = dt.date(2026, 9, 9)


def test_build_shapes_returns_typed_shapes_with_lengths(sample_gtfs_zip: Path) -> None:
    shapes = build_shapes(load_feed(sample_gtfs_zip), tolerance_m=2.0)
    assert set(shapes) == {"shpA", "shpB", "shpC"}
    a = shapes["shpA"]
    assert isinstance(a, Shape)
    assert a.lon.shape == a.lat.shape == a.x.shape == a.y.shape == a.cum.shape == a.keep.shape
    assert a.length_m == pytest.approx(2518, abs=8)
    assert shapes["shpC"].length_m == pytest.approx(703, abs=4)
    assert a.cum[0] == 0.0 and np.all(np.diff(a.cum) > 0)


def test_simplification_keeps_original_vertices_only(sample_gtfs_zip: Path) -> None:
    a = build_shapes(load_feed(sample_gtfs_zip), tolerance_m=2.0)["shpA"]
    assert list(a.keep) == [True, False, False, False, True, False, True]
    # Kept vertices keep their exact original coordinates and distances.
    assert a.lon[a.keep].tolist() == [4.350, 4.370, 4.370]
    assert a.cum[a.keep][1] == pytest.approx(1406, abs=6)


def test_feed_distance_is_kept_for_the_consistency_check(sample_gtfs_zip: Path) -> None:
    shapes = build_shapes(load_feed(sample_gtfs_zip), tolerance_m=2.0)
    assert shapes["shpA"].feed_length_m == pytest.approx(2518, rel=0.02)


def test_feed_distance_is_none_when_the_column_is_empty(sample_gtfs_zip: Path) -> None:
    feed = load_feed(sample_gtfs_zip)
    feed.shapes["dist_km"] = np.nan
    assert build_shapes(feed, tolerance_m=2.0)["shpA"].feed_length_m is None


def test_project_stops_gives_increasing_distances_and_offsets(sample_gtfs_zip: Path) -> None:
    feed = load_feed(sample_gtfs_zip)
    shapes = build_shapes(feed, tolerance_m=2.0)
    stops = feed.stops.set_index("stop_id")
    projection = project_stops(shapes["shpC"], stops.loc[["S1", "S2B"]])
    assert projection.along[0] == pytest.approx(0.0, abs=0.5)
    assert projection.along[1] == pytest.approx(703, abs=4)
    assert projection.offset[0] == pytest.approx(0.0, abs=0.5)
    assert projection.offset[1] == pytest.approx(11.0, abs=1.0)
    assert projection.increasing


def test_project_stops_on_the_reverse_shape(sample_gtfs_zip: Path) -> None:
    feed = load_feed(sample_gtfs_zip)
    shapes = build_shapes(feed, tolerance_m=2.0)
    stops = feed.stops.set_index("stop_id")
    projection = project_stops(shapes["shpB"], stops.loc[["S4", "S3", "S2", "S1"]])
    assert projection.along == pytest.approx([0.0, 1112, 1815, 2518], abs=8)
    assert np.all(projection.offset < 0.5)


def test_project_stops_flags_a_stop_that_cannot_move_forward(sample_gtfs_zip: Path) -> None:
    feed = load_feed(sample_gtfs_zip)
    shapes = build_shapes(feed, tolerance_m=2.0)
    stops = feed.stops.set_index("stop_id")
    # S1 listed twice in a row: the second one cannot advance along the shape.
    projection = project_stops(shapes["shpA"], stops.loc[["S1", "S1", "S4"]])
    assert not projection.increasing


def test_trip_patterns_and_their_projection(sample_gtfs_zip: Path) -> None:
    feed = load_feed(sample_gtfs_zip)
    day = select_day(feed, WEDNESDAY)
    patterns = trip_patterns(day)
    assert patterns["T1"] == ("shpA", ("S1", "S2", "S3", "S4"))
    assert patterns["T4"] == ("shpC", ("S1", "S2B"))
    assert set(patterns.values) == {
        ("shpA", ("S1", "S2", "S3", "S4")),
        ("shpB", ("S4", "S3", "S2", "S1")),
        ("shpC", ("S1", "S2B")),
    }
    shapes = build_shapes(feed, tolerance_m=2.0)
    projected = project_patterns(set(patterns.values), shapes, feed.stops)
    assert len(projected) == 3
    assert projected[("shpC", ("S1", "S2B"))].offset[1] == pytest.approx(11.0, abs=1.0)


def test_position_at_interpolates_along_the_original_shape(sample_gtfs_zip: Path) -> None:
    a = build_shapes(load_feed(sample_gtfs_zip), tolerance_m=2.0)["shpA"]
    lon, lat = a.position_at(np.array([0.0, a.cum[4], a.cum[4] + a.cum[5] - a.cum[4]]))
    assert lon == pytest.approx([4.350, 4.370, 4.370])
    assert lat == pytest.approx([50.850, 50.850, 50.855])


def test_project_patterns_reports_unknown_shape_and_stop(sample_gtfs_zip: Path) -> None:
    feed = load_feed(sample_gtfs_zip)
    shapes = build_shapes(feed, tolerance_m=2.0)
    with pytest.raises(ShapeError, match="unknown shape"):
        project_patterns({("nope", ("S1", "S2"))}, shapes, feed.stops)
    with pytest.raises(ShapeError, match="unknown stop"):
        project_patterns({("shpA", ("S1", "ghost"))}, shapes, feed.stops)

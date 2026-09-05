"""Trajectories: (lon, lat, t) sampling along shapes, dwell splits, time repair, truncation."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import numpy as np
import pytest

from stibviz.gtfs import load_feed
from stibviz.service_day import SERVICE_DAY_LENGTH_S, select_day
from stibviz.shapes import build_shapes, project_patterns, trip_patterns
from stibviz.trajectories import Path as TrajectoryPath
from stibviz.trajectories import TripTrajectory, build_trajectories
from stibviz.vehicles import assemble_vehicles

WEDNESDAY = dt.date(2026, 9, 9)
FRIDAY = dt.date(2026, 9, 11)
ROUTE_INDEX = {"M1": 0, "B95": 1, "N06": 2}


def _build(sample_gtfs_zip: Path, date: dt.date) -> dict[str, TripTrajectory]:
    feed = load_feed(sample_gtfs_zip)
    day = select_day(feed, date)
    shapes = build_shapes(feed, tolerance_m=2.0)
    patterns = trip_patterns(day)
    projections = project_patterns(set(patterns.values), shapes, feed.stops)
    assembly = assemble_vehicles(day, feed.stops)
    return build_trajectories(day, patterns, projections, shapes, assembly, ROUTE_INDEX)


@pytest.fixture
def wednesday(sample_gtfs_zip: Path) -> dict[str, TripTrajectory]:
    return _build(sample_gtfs_zip, WEDNESDAY)


def test_every_trip_of_the_day_gets_a_trajectory(wednesday: dict[str, TripTrajectory]) -> None:
    assert set(wednesday) == {"T1", "T2", "T3", "T4", "T8", "T9", "T10", "T11", "T12"}


def test_plain_trip_is_one_path_through_kept_vertices_and_stops(
    wednesday: dict[str, TripTrajectory],
) -> None:
    t2 = wednesday["T2"]
    assert len(t2.paths) == 1
    path = t2.paths[0]
    assert isinstance(path, TrajectoryPath)
    # S4, the corner (which is also stop S3), S2, S1: four vertices.
    assert len(path.t) == 4
    assert path.lon[0] == pytest.approx(4.370) and path.lat[0] == pytest.approx(50.860)
    assert path.lon[-1] == pytest.approx(4.350) and path.lat[-1] == pytest.approx(50.850)
    assert list(path.t) == pytest.approx([4500, 4680, 4800, 4920])
    assert t2.length_m == pytest.approx(2518, abs=8)
    assert not t2.truncated and not t2.time_repaired


def test_paths_carry_vehicle_trip_and_route_indices(wednesday: dict[str, TripTrajectory]) -> None:
    path = wednesday["T2"].paths[0]
    assert (path.vehicle, path.trip, path.route) == (0, 1, 0)
    assert wednesday["T4"].paths[0].route == 1


def test_dwell_at_an_intermediate_stop_splits_the_path(
    wednesday: dict[str, TripTrajectory],
) -> None:
    t1 = wednesday["T1"]
    assert len(t1.paths) == 2
    first, second = t1.paths
    assert first.t[-1] == pytest.approx(3720)  # arrival at S2, 05:02:00
    assert second.t[0] == pytest.approx(3750)  # departure from S2, 05:02:30
    assert (first.lon[-1], first.lat[-1]) == (pytest.approx(4.360), pytest.approx(50.850))
    assert (second.lon[0], second.lat[0]) == (pytest.approx(4.360), pytest.approx(50.850))


def test_equal_stop_times_are_spread_by_distance(wednesday: dict[str, TripTrajectory]) -> None:
    t3 = wednesday["T3"]
    assert t3.time_repaired
    path = t3.paths[0]
    assert np.all(np.diff(path.t) > 0)
    # S3 sat at the same minute as S2; it is now placed by distance between S2 and S4.
    corner = np.argmin(np.abs(path.lon - 4.370) + np.abs(path.lat - 50.850))
    expected = 5520 + (1406 - 703) / (2518 - 703) * 300
    assert path.t[corner] == pytest.approx(expected, abs=2)


def test_paths_never_hold_repeated_vertices_or_backward_time(
    wednesday: dict[str, TripTrajectory],
) -> None:
    for trajectory in wednesday.values():
        for path in trajectory.paths:
            assert len(path.t) >= 2
            assert np.all(np.diff(path.t) > 0)
            moved = (np.diff(path.lon) != 0) | (np.diff(path.lat) != 0)
            assert moved.all()


def test_trip_running_past_28h_is_truncated_at_the_span_end(sample_gtfs_zip: Path) -> None:
    friday = _build(sample_gtfs_zip, FRIDAY)
    t6, t7 = friday["T6"], friday["T7"]
    assert not t6.truncated
    assert t6.paths[-1].t[-1] == pytest.approx(27 * 3600 + 57 * 60 - 4 * 3600)
    assert t7.truncated
    assert t7.paths[-1].t[-1] == pytest.approx(SERVICE_DAY_LENGTH_S)
    # Cut by interpolation between S2 (28:00) and S3 (28:02): exactly at S2.
    assert t7.paths[-1].lon[-1] == pytest.approx(4.360, abs=1e-6)


def test_stop_times_of_each_trip_are_exposed_for_the_stop_files(
    wednesday: dict[str, TripTrajectory],
) -> None:
    t2 = wednesday["T2"]
    assert t2.stops == (("S4", 4500), ("S3", 4680), ("S2", 4800), ("S1", 4920))


def test_repair_times_interpolates_by_index_when_positions_do_not_move() -> None:
    from stibviz.trajectories import _repair_times

    fixed, repaired = _repair_times(
        np.array([0.0, 5.0, 3.0, 6.0]), np.array([0.0, 100.0, 100.0, 100.0])
    )
    assert repaired
    assert list(fixed) == pytest.approx([0.0, 5.0, 5.5, 6.0])


def test_repair_times_advances_a_trailing_bad_time_at_nominal_speed() -> None:
    from stibviz.trajectories import _repair_times

    fixed, repaired = _repair_times(np.array([0.0, 10.0, 8.0]), np.array([0.0, 100.0, 300.0]))
    assert repaired
    assert list(fixed) == pytest.approx([0.0, 10.0, 30.0])  # 200 m at 10 m/s


def test_truncate_cuts_by_interpolation_or_leaves_alone() -> None:
    from stibviz.trajectories import _truncate

    along, t = np.array([0.0, 100.0, 200.0]), np.array([0.0, 10.0, 20.0])
    cut = _truncate(along, t, 15.0)
    assert cut is not None
    assert list(cut[0]) == pytest.approx([0.0, 100.0, 150.0])
    assert list(cut[1]) == pytest.approx([0.0, 10.0, 15.0])
    assert _truncate(along, t, 25.0) == (along, t)
    assert _truncate(along, t + 30.0, 25.0) is None


def test_trip_with_a_single_stop_time_yields_no_path(sample_gtfs_zip: Path, tmp_path: Path) -> None:
    from tests.conftest import SAMPLE_TABLES, write_gtfs_zip

    tables = dict(SAMPLE_TABLES)
    tables["trips.txt"] += "M1,WK,T13,NORD,0,,shpA\n"
    tables["stop_times.txt"] += "T13,09:00:00,09:00:00,S2,1\n"
    trajectories = _build(write_gtfs_zip(tmp_path / "one_stop.zip", tables), WEDNESDAY)
    t13 = trajectories["T13"]
    assert t13.paths == ()
    assert t13.stops == (("S2", 5 * 3600),)
    assert t13.length_m == 0.0

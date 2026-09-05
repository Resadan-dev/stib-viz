"""Hour slices with asymmetric overlap: which paths go where, cut by interpolation."""

from __future__ import annotations

import numpy as np
import pytest
from tests.conftest import MODE_OF_ROUTE, PipelineState

from stibviz.slicing import (
    DOWNSTREAM_OVERLAP_S,
    UPSTREAM_OVERLAP_S,
    Slice,
    cut_path,
    slice_trajectories,
)
from stibviz.trajectories import Path


def _path(t: list[float], lon: list[float] | None = None) -> Path:
    n = len(t)
    return Path(
        lon=np.array(lon if lon is not None else [4.35 + 0.001 * i for i in range(n)]),
        lat=np.full(n, 50.85),
        t=np.array(t, dtype=np.float64),
        vehicle=7,
        trip=2,
        route=1,
    )


def test_overlap_constants() -> None:
    assert (UPSTREAM_OVERLAP_S, DOWNSTREAM_OVERLAP_S) == (300, 120)


def test_cut_path_keeps_a_fully_inside_path_untouched() -> None:
    path = _path([100.0, 200.0, 300.0])
    cut = cut_path(path, 0.0, 400.0)
    assert cut is not None
    assert list(cut.t) == [100.0, 200.0, 300.0]
    assert (cut.vehicle, cut.trip, cut.route) == (7, 2, 1)


def test_cut_path_interpolates_at_both_bounds() -> None:
    path = _path([0.0, 100.0, 200.0, 300.0], lon=[4.0, 4.1, 4.2, 4.3])
    cut = cut_path(path, 50.0, 250.0)
    assert cut is not None
    assert list(cut.t) == pytest.approx([50.0, 100.0, 200.0, 250.0])
    assert list(cut.lon) == pytest.approx([4.05, 4.1, 4.2, 4.25])


def test_cut_path_does_not_duplicate_a_vertex_sitting_on_a_bound() -> None:
    path = _path([0.0, 100.0, 200.0])
    cut = cut_path(path, 100.0, 200.0)
    assert cut is not None
    assert list(cut.t) == [100.0, 200.0]


def test_cut_path_returns_none_when_nothing_remains() -> None:
    path = _path([0.0, 100.0, 200.0])
    assert cut_path(path, 300.0, 400.0) is None
    assert cut_path(path, 200.0, 400.0) is None  # touches the bound at a single point


def test_slices_are_named_by_gtfs_hour_and_mode_and_never_empty(
    wednesday_state: PipelineState,
) -> None:
    slices = slice_trajectories(wednesday_state.trajectories.values(), MODE_OF_ROUTE)
    assert all(isinstance(s, Slice) for s in slices)
    keys = [(s.hour, s.mode) for s in slices]
    assert keys == sorted(keys)
    assert all(s.paths for s in slices)
    assert all(4 <= s.hour <= 27 for s in slices)
    # Bus 95 runs T4 at 25:10, metro 1 runs between 05:00 and 08:30.
    assert (25, "bus") in keys
    assert {h for h, m in keys if m == "metro"} == {4, 5, 6, 7, 8}
    assert "noctis" not in {m for _, m in keys}


def test_a_path_ending_exactly_at_the_downstream_bound_is_kept_once(
    wednesday_state: PipelineState,
) -> None:
    slices = {
        (s.hour, s.mode): s
        for s in slice_trajectories(wednesday_state.trajectories.values(), MODE_OF_ROUTE)
    }
    # T1's first path ends at 05:02:00 = 3720 s, exactly the end of hour 04's window.
    hour_04 = slices[(4, "metro")]
    t1_first = [p for p in hour_04.paths if p.vehicle == 0 and p.trip == 0]
    assert len(t1_first) == 1
    assert t1_first[0].t[-1] == 3720.0
    # Its second path starts at 05:02:30, after the window: only in hour 05.
    hour_05 = slices[(5, "metro")]
    assert len([p for p in hour_05.paths if p.vehicle == 0 and p.trip == 0]) == 2


def test_a_path_crossing_the_bound_is_cut_in_the_earlier_slice(
    wednesday_state: PipelineState,
) -> None:
    slices = {
        (s.hour, s.mode): s
        for s in slice_trajectories(wednesday_state.trajectories.values(), MODE_OF_ROUTE)
    }
    # T8 runs 06:00 -> 06:07 (7200 -> 7620 s). Hour 05's window ends at 7200 + 120 = 7320.
    vehicle, trip = wednesday_state.assembly.trip_index["T8"]
    in_05 = [p for p in slices[(5, "metro")].paths if (p.vehicle, p.trip) == (vehicle, trip)]
    in_06 = [p for p in slices[(6, "metro")].paths if (p.vehicle, p.trip) == (vehicle, trip)]
    assert len(in_05) == 1 and in_05[0].t[-1] == 7320.0 and len(in_05[0].t) >= 2
    assert len(in_06) == 1 and in_06[0].t[-1] == 7620.0


def test_slice_reports_its_vertex_count(wednesday_state: PipelineState) -> None:
    slices = slice_trajectories(wednesday_state.trajectories.values(), MODE_OF_ROUTE)
    for s in slices:
        assert s.vertices == sum(len(p.t) for p in s.paths)
        assert s.vertices >= 2 * len(s.paths)


def test_night_slices_reach_hour_27(friday_state: PipelineState) -> None:
    slices = slice_trajectories(friday_state.trajectories.values(), MODE_OF_ROUTE)
    hours = {s.hour for s in slices if s.mode == "noctis"}
    assert hours == {27}
    assert max(s.hour for s in slices) == 27

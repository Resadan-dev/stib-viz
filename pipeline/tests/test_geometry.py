"""Planar geometry helpers: local projection, polyline distances, projection, simplification."""

from __future__ import annotations

import numpy as np
import pytest
from tests.conftest import SHAPE_A

from stibviz.geometry import (
    cumulative_distance,
    douglas_peucker_mask,
    point_at_distance,
    project_point,
    to_metres,
)

LON = np.array([p[0] for p in SHAPE_A])
LAT = np.array([p[1] for p in SHAPE_A])


def test_to_metres_matches_brussels_scale() -> None:
    x, y = to_metres(np.array([4.35, 4.36]), np.array([50.85, 50.86]))
    assert x[0] == pytest.approx(0.0)
    assert y[0] == pytest.approx(0.0)
    assert x[1] - x[0] == pytest.approx(703, abs=3)  # 0.01 deg of longitude
    assert y[1] - y[0] == pytest.approx(1112, abs=3)  # 0.01 deg of latitude


def test_cumulative_distance_along_shape_a() -> None:
    x, y = to_metres(LON, LAT)
    cum = cumulative_distance(x, y)
    assert cum[0] == 0.0
    assert np.all(np.diff(cum) > 0)
    assert cum[4] == pytest.approx(4 * 351.5, abs=4)  # the eastbound leg
    assert cum[-1] == pytest.approx(4 * 351.5 + 2 * 556, abs=6)


def test_point_at_distance_interpolates_and_clamps() -> None:
    x, y = to_metres(LON, LAT)
    cum = cumulative_distance(x, y)
    px, py = point_at_distance(x, y, cum, np.array([0.0, cum[4], cum[4] + 100.0, 1e9, -5.0]))
    assert (px[0], py[0]) == (pytest.approx(x[0]), pytest.approx(y[0]))
    assert (px[1], py[1]) == (pytest.approx(x[4]), pytest.approx(y[4]))  # the corner
    assert px[2] == pytest.approx(x[4])  # heading north after the corner
    assert py[2] == pytest.approx(y[4] + 100.0)
    assert (px[3], py[3]) == (pytest.approx(x[-1]), pytest.approx(y[-1]))  # clamped to the end
    assert (px[4], py[4]) == (pytest.approx(x[0]), pytest.approx(y[0]))  # clamped to the start


def test_project_point_gives_distance_along_and_offset() -> None:
    x, y = to_metres(LON, LAT)
    cum = cumulative_distance(x, y)
    # A point 11 m north of the line, above the third vertex (S2).
    along, offset, segment = project_point(x[2], y[2] + 11.0, x, y, cum)
    assert along == pytest.approx(cum[2], abs=0.5)
    assert offset == pytest.approx(11.0, abs=0.5)
    assert segment in (1, 2)


def test_project_point_respects_the_monotonic_constraint() -> None:
    # Out and back along the same street: east 1000 m at y=0, west at y=20.
    x = np.array([0.0, 500.0, 1000.0, 1000.0, 500.0, 0.0])
    y = np.array([0.0, 0.0, 0.0, 20.0, 20.0, 20.0])
    cum = cumulative_distance(x, y)
    first_along, _, first_segment = project_point(500.0, 5.0, x, y, cum)
    assert first_along == pytest.approx(500.0)
    # The same spot on the way back must land on the return leg when the search starts there.
    second_along, offset, _ = project_point(500.0, 15.0, x, y, cum, start_segment=first_segment + 1)
    assert second_along == pytest.approx(1520.0, abs=1.0)
    assert offset == pytest.approx(5.0)


def test_douglas_peucker_keeps_endpoints_and_the_corner_only() -> None:
    x, y = to_metres(LON, LAT)
    keep = douglas_peucker_mask(x, y, tolerance=2.0)
    assert keep.dtype == bool
    assert list(keep) == [True, False, False, False, True, False, True]


def test_douglas_peucker_keeps_everything_when_tolerance_is_tiny() -> None:
    x = np.array([0.0, 10.0, 20.0, 30.0])
    y = np.array([0.0, 3.0, 0.0, 3.0])
    assert douglas_peucker_mask(x, y, tolerance=0.1).all()
    assert list(douglas_peucker_mask(x, y, tolerance=10.0)) == [True, False, False, True]


def test_douglas_peucker_handles_degenerate_inputs() -> None:
    assert list(douglas_peucker_mask(np.array([0.0]), np.array([0.0]), 2.0)) == [True]
    assert list(douglas_peucker_mask(np.array([0.0, 1.0]), np.array([0.0, 1.0]), 2.0)) == [
        True,
        True,
    ]
    # A closed loop: first and last vertices coincide, the farthest point must still be kept.
    x = np.array([0.0, 100.0, 100.0, 0.0, 0.0])
    y = np.array([0.0, 0.0, 100.0, 100.0, 0.0])
    keep = douglas_peucker_mask(x, y, tolerance=2.0)
    assert keep[0] and keep[-1]
    assert keep.sum() >= 4


def test_single_vertex_polyline_is_handled() -> None:
    x, y = np.array([5.0]), np.array([7.0])
    px, py = point_at_distance(x, y, cumulative_distance(x, y), np.array([0.0, 10.0]))
    assert list(px) == [5.0, 5.0] and list(py) == [7.0, 7.0]
    along, offset, segment = project_point(8.0, 11.0, x, y, cumulative_distance(x, y))
    assert (along, offset, segment) == (0.0, 5.0, 0)
    assert list(douglas_peucker_mask(np.array([]), np.array([]), 1.0)) == []


def test_project_point_beyond_the_last_segment_lands_on_the_end() -> None:
    x = np.array([0.0, 100.0, 200.0])
    y = np.zeros(3)
    along, offset, segment = project_point(
        150.0, 30.0, x, y, cumulative_distance(x, y), start_segment=5
    )
    assert (along, offset, segment) == (200.0, pytest.approx(58.31, abs=0.01), 1)

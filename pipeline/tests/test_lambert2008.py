"""Belgian Lambert 2008 (EPSG:3812) to and from longitude and latitude."""

from __future__ import annotations

import numpy as np
import pytest

from stibviz.geometry import to_metres
from stibviz.lambert2008 import (
    FALSE_EASTING,
    FALSE_NORTHING,
    LAT_ORIGIN_DEG,
    LON_ORIGIN_DEG,
    from_lambert2008,
    to_lambert2008,
)

# The Statbel sector 21004A001 "GRAND-PLACE" (statistical sectors on 1 January 2026, CC BY 4.0,
# Source: Statbel), outer ring in Lambert 2008 metres. It holds the Grand-Place and little else.
GRAND_PLACE_SECTOR = [
    (648991.63, 670692.47), (649015.60, 670639.72), (649015.49, 670605.42),
    (649025.10, 670565.08), (649029.68, 670554.17), (649049.60, 670510.84),
    (649063.92, 670486.60), (649067.81, 670476.24), (649053.70, 670405.63),
    (649032.90, 670372.58), (649017.96, 670359.57), (648991.48, 670340.42),
    (648956.88, 670390.34), (648906.54, 670426.30), (648882.55, 670457.47),
    (648822.61, 670488.64), (648784.24, 670529.40), (648736.27, 670577.34),
    (648683.52, 670606.10), (648652.86, 670630.63), (648751.84, 670802.74),
    (648800.50, 670881.00), (648801.87, 670883.21), (648845.35, 670848.29),
    (648852.54, 670814.73), (648871.73, 670793.16), (648941.26, 670742.81),
]  # fmt: skip


def _inside(lon: float, lat: float, ring: list[tuple[float, float]]) -> bool:
    """Even-odd rule in longitude and latitude, fine for a ring a few hundred metres wide."""
    inside = False
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1], strict=True):
        if (y0 > lat) != (y1 > lat) and lon < x0 + (lat - y0) * (x1 - x0) / (y1 - y0):
            inside = not inside
    return inside


def test_the_false_origin_maps_to_the_false_easting_and_northing() -> None:
    x, y = to_lambert2008(np.array([LON_ORIGIN_DEG]), np.array([LAT_ORIGIN_DEG]))
    assert x[0] == pytest.approx(FALSE_EASTING, abs=1e-6)
    assert y[0] == pytest.approx(FALSE_NORTHING, abs=1e-6)


def test_the_central_meridian_keeps_the_false_easting() -> None:
    x, _ = to_lambert2008(np.full(3, LON_ORIGIN_DEG), np.array([50.70, 50.85, 50.95]))
    assert np.allclose(x, FALSE_EASTING, atol=1e-6)


def test_north_is_up_and_east_is_right() -> None:
    x, y = to_lambert2008(np.array([4.35, 4.36, 4.35]), np.array([50.85, 50.85, 50.86]))
    assert x[1] > x[0]
    assert y[2] > y[0]


def test_a_round_trip_over_the_region_is_exact_to_the_micrometre() -> None:
    rng = np.random.default_rng(7)
    lon = rng.uniform(4.24, 4.49, 500)
    lat = rng.uniform(50.76, 50.92, 500)
    back_lon, back_lat = from_lambert2008(*to_lambert2008(lon, lat))
    x0, y0 = to_metres(lon, lat)
    x1, y1 = to_metres(back_lon, back_lat)
    assert np.hypot(x1 - x0, y1 - y0).max() < 1e-6


def test_distances_agree_with_the_local_projection() -> None:
    # The local projection is a sphere; the ellipsoid differs by a few thousandths east to west.
    lon, lat = np.array([4.30, 4.40]), np.array([50.82, 50.88])
    x, y = to_lambert2008(lon, lat)
    mx, my = to_metres(lon, lat)
    assert np.hypot(*np.diff([x, y], axis=1)) == pytest.approx(
        np.hypot(*np.diff([mx, my], axis=1)), rel=5e-3
    )


def test_the_grand_place_sector_holds_the_grand_place() -> None:
    xs, ys = np.array(GRAND_PLACE_SECTOR).T
    lon, lat = from_lambert2008(xs, ys)
    ring = list(zip(lon.tolist(), lat.tolist(), strict=True))
    assert _inside(4.352360, 50.846777, ring)  # the square itself
    assert not _inside(4.341500, 50.894900, ring)  # the Atomium, far north
    assert not _inside(4.357100, 50.845500, ring)  # the Central station, next door

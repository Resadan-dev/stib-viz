"""Belgian Lambert 2008 (EPSG:3812) to and from longitude and latitude.

Statbel publishes its statistical sectors in Belgian Lambert only, and the pipeline keeps no
projection library (ARCHITECTURE.md, section 9). The projection is a Lambert conic conformal with
two standard parallels on the GRS80 ellipsoid (EPSG method 9802, IOGP guidance note 7-2), which
comes down to a closed formula each way. ETRS89, the datum of Lambert 2008, and WGS84 differ by
well under a metre, which is ignored.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike

from stibviz.geometry import FloatArray

SEMI_MAJOR_AXIS_M = 6_378_137.0
INVERSE_FLATTENING = 298.257222101
FIRST_PARALLEL_DEG = 49 + 50 / 60
SECOND_PARALLEL_DEG = 51 + 10 / 60
LAT_ORIGIN_DEG = 50.797815
LON_ORIGIN_DEG = 4.359215833333333
FALSE_EASTING = 649_328.0
FALSE_NORTHING = 665_262.0
# The inverse latitude converges to well below a micrometre within five rounds; eight is margin.
LATITUDE_ROUNDS = 8

_E2 = (2 - 1 / INVERSE_FLATTENING) / INVERSE_FLATTENING
_E = np.sqrt(_E2)


def _m(lat: FloatArray) -> FloatArray:
    return np.cos(lat) / np.sqrt(1 - _E2 * np.sin(lat) ** 2)


def _t(lat: FloatArray) -> FloatArray:
    s = _E * np.sin(lat)
    return np.tan(np.pi / 4 - lat / 2) / ((1 - s) / (1 + s)) ** (_E / 2)


_LAT_1 = np.radians(FIRST_PARALLEL_DEG)
_LAT_2 = np.radians(SECOND_PARALLEL_DEG)
_N = (np.log(_m(_LAT_1)) - np.log(_m(_LAT_2))) / (np.log(_t(_LAT_1)) - np.log(_t(_LAT_2)))
_F = _m(_LAT_1) / (_N * _t(_LAT_1) ** _N)
_R_ORIGIN = SEMI_MAJOR_AXIS_M * _F * _t(np.radians(LAT_ORIGIN_DEG)) ** _N
_LON_ORIGIN = np.radians(LON_ORIGIN_DEG)


def to_lambert2008(lon: ArrayLike, lat: ArrayLike) -> tuple[FloatArray, FloatArray]:
    """Longitudes and latitudes in degrees to Lambert 2008 eastings and northings in metres."""
    phi = np.radians(np.asarray(lat, dtype=np.float64))
    lam = np.radians(np.asarray(lon, dtype=np.float64))
    r = SEMI_MAJOR_AXIS_M * _F * _t(phi) ** _N
    theta = _N * (lam - _LON_ORIGIN)
    return FALSE_EASTING + r * np.sin(theta), FALSE_NORTHING + _R_ORIGIN - r * np.cos(theta)


def from_lambert2008(x: ArrayLike, y: ArrayLike) -> tuple[FloatArray, FloatArray]:
    """Lambert 2008 eastings and northings in metres to longitudes and latitudes in degrees."""
    dx = np.asarray(x, dtype=np.float64) - FALSE_EASTING
    dy = _R_ORIGIN - (np.asarray(y, dtype=np.float64) - FALSE_NORTHING)
    r = np.sign(_N) * np.hypot(dx, dy)
    t = (r / (SEMI_MAJOR_AXIS_M * _F)) ** (1 / _N)
    lam = np.arctan2(dx, dy) / _N + _LON_ORIGIN
    phi = np.pi / 2 - 2 * np.arctan(t)
    for _ in range(LATITUDE_ROUNDS):
        s = _E * np.sin(phi)
        phi = np.pi / 2 - 2 * np.arctan(t * ((1 - s) / (1 + s)) ** (_E / 2))
    return np.degrees(lam), np.degrees(phi)

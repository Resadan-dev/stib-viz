"""Planar geometry on a local equirectangular projection centred on Brussels.

At city scale an equirectangular projection is exact to the centimetre, which makes distances,
projections and simplification plain Euclidean arithmetic on numpy arrays. Coordinates stay in
degrees everywhere else; only this module and its callers' intermediate values are in metres.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]
BoolArray = NDArray[np.bool_]

EARTH_RADIUS_M = 6_371_008.8
ORIGIN_LON = 4.35
ORIGIN_LAT = 50.85


def to_metres(
    lon: NDArray[np.floating] | list[float],
    lat: NDArray[np.floating] | list[float],
    origin: tuple[float, float] = (ORIGIN_LON, ORIGIN_LAT),
) -> tuple[FloatArray, FloatArray]:
    """Project longitudes and latitudes to local metres east and north of ``origin``."""
    lon_arr = np.asarray(lon, dtype=np.float64)
    lat_arr = np.asarray(lat, dtype=np.float64)
    metres_per_degree = EARTH_RADIUS_M * np.pi / 180.0
    x = (lon_arr - origin[0]) * metres_per_degree * np.cos(np.radians(origin[1]))
    y = (lat_arr - origin[1]) * metres_per_degree
    return x, y


def cumulative_distance(x: FloatArray, y: FloatArray) -> FloatArray:
    """Distance along the polyline at each vertex, starting at zero."""
    steps = np.hypot(np.diff(x), np.diff(y))
    return np.concatenate(([0.0], np.cumsum(steps)))


def point_at_distance(
    x: FloatArray, y: FloatArray, cum: FloatArray, along: FloatArray
) -> tuple[FloatArray, FloatArray]:
    """Points on the polyline at the given distances along it, clamped to its extent."""
    if len(x) == 1:
        return np.full_like(along, x[0], dtype=np.float64), np.full_like(
            along, y[0], dtype=np.float64
        )
    d = np.clip(along, 0.0, cum[-1])
    index = np.clip(np.searchsorted(cum, d, side="right") - 1, 0, len(x) - 2)
    length = cum[index + 1] - cum[index]
    fraction = np.divide(d - cum[index], length, out=np.zeros_like(d), where=length > 0)
    px = x[index] + fraction * (x[index + 1] - x[index])
    py = y[index] + fraction * (y[index + 1] - y[index])
    return px, py


def project_point(
    px: float,
    py: float,
    x: FloatArray,
    y: FloatArray,
    cum: FloatArray,
    start_segment: int = 0,
) -> tuple[float, float, int]:
    """Nearest point of the polyline to ``(px, py)``, searched from ``start_segment`` onward.

    Returns the distance along the polyline, the offset between the point and the polyline, and
    the index of the segment holding the projection. Restricting the search to segments at or
    after ``start_segment`` is what keeps a sequence of stops moving forward along a route that
    passes near the same place twice.
    """
    last_segment = len(x) - 2
    if last_segment < 0 or start_segment > last_segment:
        # Nothing ahead: the point projects onto the final vertex.
        return float(cum[-1]), float(np.hypot(px - x[-1], py - y[-1])), max(last_segment, 0)
    ax, ay = x[start_segment:-1], y[start_segment:-1]
    dx, dy = x[start_segment + 1 :] - ax, y[start_segment + 1 :] - ay
    length_sq = dx * dx + dy * dy
    dot = (px - ax) * dx + (py - ay) * dy
    fraction = np.clip(np.divide(dot, length_sq, out=np.zeros_like(dot), where=length_sq > 0), 0, 1)
    offsets = np.hypot(px - (ax + fraction * dx), py - (ay + fraction * dy))
    best = int(np.argmin(offsets))
    segment = start_segment + best
    along = cum[segment] + fraction[best] * np.sqrt(length_sq[best])
    return float(along), float(offsets[best]), segment


def douglas_peucker_mask(x: FloatArray, y: FloatArray, tolerance: float) -> BoolArray:
    """Vertices to keep so the polyline stays within ``tolerance`` metres of the original.

    Classic Douglas-Peucker, iterative. Endpoints are always kept. Only original vertices are
    ever kept, so callers can carry their original distances along unchanged.
    """
    n = len(x)
    keep = np.zeros(n, dtype=bool)
    if n == 0:
        return keep
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        first, last = stack.pop()
        if last - first < 2:
            continue
        inner = slice(first + 1, last)
        chord_x, chord_y = x[last] - x[first], y[last] - y[first]
        chord_sq = chord_x * chord_x + chord_y * chord_y
        if chord_sq > 0:
            # Perpendicular distance of the inner vertices to the chord.
            distances = np.abs(chord_x * (y[first] - y[inner]) - chord_y * (x[first] - x[inner]))
            distances = distances / np.sqrt(chord_sq)
        else:
            # Closed loop or repeated vertex: fall back to the distance to the first vertex.
            distances = np.hypot(x[inner] - x[first], y[inner] - y[first])
        farthest = int(np.argmax(distances))
        if distances[farthest] > tolerance:
            split = first + 1 + farthest
            keep[split] = True
            stack.append((first, split))
            stack.append((split, last))
    return keep

"""Building one day: from a loaded feed to a checked, ready-to-write bundle.

This is the pipeline of ARCHITECTURE.md section 4.2 in one function, steps 3 to 13. Each step
lives in its own module; this one only wires them in order and runs the checks at the end.
"""

from __future__ import annotations

import datetime as dt
import time
from dataclasses import dataclass, replace

from stibviz.checks import ANOMALY_TOLERANCE, CheckReport, check_build
from stibviz.encode import DayBundle
from stibviz.gtfs import Feed
from stibviz.network import build_network, lookup_table, stop_dictionary
from stibviz.service_day import select_day
from stibviz.shapes import Shape, build_shapes, project_patterns, trip_patterns
from stibviz.slicing import slice_trajectories
from stibviz.stats import compute_stats, route_table
from stibviz.trajectories import build_trajectories
from stibviz.vehicles import assemble_vehicles

SIMPLIFICATION_TOLERANCE_M = 2.0


@dataclass(frozen=True)
class BuildResult:
    bundle: DayBundle
    report: CheckReport
    seconds: float


def build_day(
    feed: Feed,
    date: dt.date,
    *,
    tolerance_m: float = SIMPLIFICATION_TOLERANCE_M,
    anomaly_tolerance: float = ANOMALY_TOLERANCE,
    generated_at: dt.datetime | None = None,
    shapes: dict[str, Shape] | None = None,
) -> BuildResult:
    """Run every step for ``date``. Pass ``shapes`` to reuse them across several days."""
    started = time.perf_counter()
    day = select_day(feed, date)
    shapes = shapes if shapes is not None else build_shapes(feed, tolerance_m)
    patterns = trip_patterns(day)
    keys = {key for _, key in patterns.items()}
    projections = project_patterns(keys, shapes, feed.stops)
    assembly = assemble_vehicles(day, feed.stops)
    routes = route_table(feed, day)
    route_index = {route.route_id: i for i, route in enumerate(routes)}
    trajectories = build_trajectories(day, patterns, projections, shapes, assembly, route_index)
    mode_of_route = {i: route.mode for i, route in enumerate(routes)}
    bundle = DayBundle(
        date=date,
        feed_info=feed.info,
        routes=routes,
        assembly=assembly,
        trajectories=trajectories,
        slices=slice_trajectories(trajectories.values(), mode_of_route),
        stats=compute_stats(trajectories, assembly, routes),
        network=build_network(day, patterns, projections, shapes, routes),
        stops=stop_dictionary(feed, day),
        lookup=lookup_table(day, patterns, projections, routes),
        anomalies={},
        generated_at=generated_at or dt.datetime.now(dt.UTC),
    )
    report = check_build(
        bundle, day, patterns, projections, shapes, anomaly_tolerance=anomaly_tolerance
    )
    bundle = replace(bundle, anomalies=report.anomalies)
    return BuildResult(bundle=bundle, report=report, seconds=time.perf_counter() - started)

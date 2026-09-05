"""Command line entry point: ``stibviz fetch | build | check | index``.

Every command prints a readable summary, writes errors to stderr and returns a non-zero exit
code on failure (ARCHITECTURE.md, section 4.4).
"""

from __future__ import annotations

import argparse
import datetime as dt
import shutil
import sys
from collections.abc import Sequence
from pathlib import Path

from stibviz import __version__
from stibviz.build import SIMPLIFICATION_TOLERANCE_M, build_day
from stibviz.checks import ANOMALY_TOLERANCE, check_day_dir
from stibviz.encode import write_day, write_index
from stibviz.fetch import FetchError, fetch_gtfs
from stibviz.gtfs import GtfsError, load_feed
from stibviz.service_day import DateNotCoveredError
from stibviz.shapes import ShapeError

DEFAULT_GTFS_URL = (
    "https://opendata-discovery-gtfs-static.api.production.belgianmobility.io"
    "/api/gtfs/feed/stibmivb/static"
)


def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser for the ``stibviz`` command."""
    parser = argparse.ArgumentParser(
        prog="stibviz",
        description="Turn the STIB GTFS feed into trajectories for the stib-viz website.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    commands = parser.add_subparsers(dest="command")

    fetch = commands.add_parser("fetch", help="download the GTFS feed when it changed")
    fetch.add_argument("--url", default=DEFAULT_GTFS_URL)
    fetch.add_argument("--out", type=Path, default=Path("cache"))

    build = commands.add_parser("build", help="build one service day")
    build.add_argument("--gtfs", type=Path, required=True, help="GTFS zip or directory")
    build.add_argument("--date", type=dt.date.fromisoformat, required=True)
    build.add_argument("--out", type=Path, required=True, help="data directory to write into")
    build.add_argument("--tolerance", type=float, default=SIMPLIFICATION_TOLERANCE_M)
    build.add_argument("--anomaly-tolerance", type=float, default=ANOMALY_TOLERANCE)

    check = commands.add_parser("check", help="check a written day directory")
    check.add_argument("--day", type=Path, required=True)

    index = commands.add_parser("index", help="write index.json for a data directory")
    index.add_argument("--data", type=Path, required=True)
    index.add_argument("--gtfs", type=Path, required=True, help="the feed the days came from")
    return parser


def _fetch(args: argparse.Namespace) -> int:
    try:
        result = fetch_gtfs(args.url, args.out)
    except FetchError as exc:
        print(f"fetch failed: {exc}", file=sys.stderr)
        return 1
    state = "downloaded" if result.changed else "unchanged"
    print(f"{state}: {result.path} ({result.size} bytes, sha256 {result.sha256[:12]})")
    return 0


def _build(args: argparse.Namespace) -> int:
    try:
        feed = load_feed(args.gtfs)
        result = build_day(
            feed, args.date, tolerance_m=args.tolerance, anomaly_tolerance=args.anomaly_tolerance
        )
    except (GtfsError, DateNotCoveredError, ShapeError) as exc:
        print(f"build failed: {exc}", file=sys.stderr)
        return 1
    print(f"{args.date.isoformat()}: built in {result.seconds:.1f} s")
    print(result.report.render())
    if not result.report.ok:
        print("day not written", file=sys.stderr)
        return 1
    write_day(result.bundle, args.out)
    day_dir = args.out / args.date.isoformat()
    verdict = check_day_dir(day_dir)
    if not verdict.ok:
        print(verdict.render())
        shutil.rmtree(day_dir)
        print("written files failed their checks: day removed", file=sys.stderr)
        return 1
    write_index(args.out, feed.info, generated_at=result.bundle.generated_at)
    stats = result.bundle.stats
    print(
        f"written: {stats.total_trips} trips, {stats.total_vehicles} vehicles, "
        f"peak {stats.peak_count} at minute {stats.peak_minute}, "
        f"{result.report.info['slices']} slices, {result.report.info['slice_bytes']} bytes"
    )
    return 0


def _check(args: argparse.Namespace) -> int:
    report = check_day_dir(args.day)
    print(report.render())
    return 0 if report.ok else 1


def _index(args: argparse.Namespace) -> int:
    try:
        feed = load_feed(args.gtfs)
    except GtfsError as exc:
        print(f"index failed: {exc}", file=sys.stderr)
        return 1
    index = write_index(args.data, feed.info)
    print(f"index.json: {len(index['days'])} day(s)")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    """Run the command and return its exit code."""
    parser = build_parser()
    args = parser.parse_args(argv)
    handlers = {"fetch": _fetch, "build": _build, "check": _check, "index": _index}
    handler = handlers.get(args.command)
    if handler is None:
        parser.print_help()
        return 0
    return handler(args)

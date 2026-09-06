"""Command line entry point: ``stibviz fetch | plan | build | week | check | index``.

Every command prints a readable summary, writes errors to stderr and returns a non-zero exit
code on failure (ARCHITECTURE.md, section 4.4).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from stibviz import __version__
from stibviz.build import SIMPLIFICATION_TOLERANCE_M, build_day
from stibviz.checks import ANOMALY_TOLERANCE, CheckReport, check_day_dir
from stibviz.encode import write_day, write_index
from stibviz.fetch import FetchError, fetch_gtfs
from stibviz.gtfs import Feed, GtfsError, load_feed
from stibviz.service_day import DateNotCoveredError
from stibviz.shapes import ShapeError
from stibviz.window import DAYS_AFTER, DAYS_BEFORE, plan_days, rolling_window

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

    plan = commands.add_parser("plan", help="list the days of the rolling window to build")
    plan.add_argument("--gtfs", type=Path, required=True, help="GTFS zip or directory")
    plan.add_argument("--today", type=dt.date.fromisoformat, default=dt.date.today())
    plan.add_argument("--published", type=Path, help="index.json of the live site, if any")
    plan.add_argument("--days-before", type=int, default=DAYS_BEFORE)
    plan.add_argument("--days-after", type=int, default=DAYS_AFTER)

    build = commands.add_parser("build", help="build one service day")
    build.add_argument("--gtfs", type=Path, required=True, help="GTFS zip or directory")
    build.add_argument("--date", type=dt.date.fromisoformat, required=True)
    build.add_argument("--out", type=Path, required=True, help="data directory to write into")
    build.add_argument("--tolerance", type=float, default=SIMPLIFICATION_TOLERANCE_M)
    build.add_argument("--anomaly-tolerance", type=float, default=ANOMALY_TOLERANCE)

    week = commands.add_parser("week", help="build the rolling window of days, then the index")
    week.add_argument("--gtfs", type=Path, required=True, help="GTFS zip or directory")
    week.add_argument("--out", type=Path, required=True, help="data directory to write into")
    week.add_argument("--today", type=dt.date.fromisoformat, default=dt.date.today())
    week.add_argument("--published", type=Path, help="index.json of the live site, if any")
    week.add_argument(
        "--force",
        action="store_true",
        help="build every covered day even when the site already publishes them",
    )
    week.add_argument("--days-before", type=int, default=DAYS_BEFORE)
    week.add_argument("--days-after", type=int, default=DAYS_AFTER)
    week.add_argument("--report", type=Path, help="write one line per day and a summary here")
    week.add_argument("--tolerance", type=float, default=SIMPLIFICATION_TOLERANCE_M)
    week.add_argument("--anomaly-tolerance", type=float, default=ANOMALY_TOLERANCE)

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


def _read_published(path: Path | None) -> Any:
    """The published index, or None when there is none or it cannot be read."""
    if path is None or not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except ValueError:
        print("published index unreadable, planning a full build", file=sys.stderr)
        return None


@dataclass(frozen=True)
class DayOutcome:
    ok: bool
    message: str
    report: CheckReport | None = None


def _write_checked_day(
    feed: Feed, date: dt.date, out: Path, *, tolerance_m: float, anomaly_tolerance: float
) -> DayOutcome:
    """Build one day, write it and check the written files; a failed day leaves nothing behind."""
    day_dir = out / date.isoformat()
    try:
        result = build_day(feed, date, tolerance_m=tolerance_m, anomaly_tolerance=anomaly_tolerance)
        if not result.report.ok:
            return DayOutcome(False, "blocked: " + "; ".join(result.report.blocking), result.report)
        write_day(result.bundle, out)
        verdict = check_day_dir(day_dir)
        if not verdict.ok:
            shutil.rmtree(day_dir)
            return DayOutcome(
                False, "written files failed their checks: " + "; ".join(verdict.blocking)
            )
    except (DateNotCoveredError, ShapeError) as exc:
        return DayOutcome(False, str(exc))
    except Exception as exc:
        # Days are built independently, and that has to hold for the failures nobody foresaw
        # too. An exception escaping here used to take the whole run with it, discarding the
        # index and the report of every day that had already built. Half a written day is worse
        # than none, so whatever this one left behind goes with it.
        shutil.rmtree(day_dir, ignore_errors=True)
        return DayOutcome(False, f"unexpected error: {exc!r}")
    stats = result.bundle.stats
    return DayOutcome(
        True,
        f"{stats.total_trips} trips, {stats.total_vehicles} vehicles, "
        f"peak {stats.peak_count} at minute {stats.peak_minute}, "
        f"{result.report.info['slices']} slices, {result.report.info['slice_bytes']} bytes "
        f"in {result.seconds:.1f} s",
        result.report,
    )


def _plan(args: argparse.Namespace) -> int:
    try:
        feed = load_feed(args.gtfs)
    except GtfsError as exc:
        print(f"plan failed: {exc}", file=sys.stderr)
        return 1
    published = _read_published(args.published)
    window = rolling_window(args.today, args.days_before, args.days_after)
    plan = plan_days(window, feed.info, published)
    for day in plan.uncovered:
        print(f"skipped: {day.isoformat()} is outside the feed validity", file=sys.stderr)
    if plan.up_to_date:
        print(
            f"up to date: feed {feed.info.version} and every covered day published", file=sys.stderr
        )
    for day in plan.to_build:
        print(day.isoformat())
    return 0


def _build(args: argparse.Namespace) -> int:
    try:
        feed = load_feed(args.gtfs)
    except GtfsError as exc:
        print(f"build failed: {exc}", file=sys.stderr)
        return 1
    outcome = _write_checked_day(
        feed,
        args.date,
        args.out,
        tolerance_m=args.tolerance,
        anomaly_tolerance=args.anomaly_tolerance,
    )
    if outcome.report is not None:
        print(outcome.report.render())
    if not outcome.ok:
        print(f"build failed: {outcome.message}", file=sys.stderr)
        return 1
    write_index(args.out, feed.info)
    print(f"written: {outcome.message}")
    return 0


def _week(args: argparse.Namespace) -> int:
    try:
        feed = load_feed(args.gtfs)
    except GtfsError as exc:
        print(f"week failed: {exc}", file=sys.stderr)
        return 1
    window = rolling_window(args.today, args.days_before, args.days_after)
    # --force ignores what the site publishes, so a run has work to do and therefore deploys.
    # It is how a fix reaches the site on a day when the data itself has not changed.
    published = None if args.force else _read_published(args.published)
    plan = plan_days(window, feed.info, published)
    lines = [f"{day.isoformat()}: skipped, outside the feed validity" for day in plan.uncovered]
    if plan.up_to_date:
        print(
            f"up to date: feed {feed.info.version} and every covered day published", file=sys.stderr
        )
        _finish_week(args.report, lines, built=0, failed=0, skipped=len(plan.uncovered))
        return 0
    built = failed = 0
    for day in plan.to_build:
        outcome = _write_checked_day(
            feed,
            day,
            args.out,
            tolerance_m=args.tolerance,
            anomaly_tolerance=args.anomaly_tolerance,
        )
        if outcome.ok:
            built += 1
            lines.append(f"{day.isoformat()}: built")
            print(f"{day.isoformat()}: built, {outcome.message}")
        else:
            failed += 1
            lines.append(f"{day.isoformat()}: FAILED {outcome.message}")
            print(f"{day.isoformat()}: FAILED {outcome.message}", file=sys.stderr)
    if args.out.is_dir():
        _remove_stale_days(args.out, set(window))
        write_index(args.out, feed.info)
    else:
        print("no day written, no index", file=sys.stderr)
    _finish_week(args.report, lines, built=built, failed=failed, skipped=len(plan.uncovered))
    return 1 if failed else 0


def _remove_stale_days(out: Path, window: set[dt.date]) -> None:
    """Drop day directories outside the window: the site only ever offers the window."""
    if not out.is_dir():
        return
    for entry in out.iterdir():
        try:
            date = dt.date.fromisoformat(entry.name)
        except ValueError:
            continue
        if entry.is_dir() and date not in window:
            shutil.rmtree(entry)
            print(f"removed stale day {entry.name}")


def _finish_week(
    report: Path | None, lines: list[str], *, built: int, failed: int, skipped: int
) -> None:
    summary = f"built: {built}, failed: {failed}, skipped: {skipped}"
    print(summary)
    if report is not None:
        report.write_text("\n".join([*lines, summary]) + "\n", encoding="utf-8")


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
    handlers = {
        "fetch": _fetch,
        "plan": _plan,
        "build": _build,
        "week": _week,
        "check": _check,
        "index": _index,
    }
    handler = handlers.get(args.command)
    if handler is None:
        parser.print_help()
        return 0
    return handler(args)

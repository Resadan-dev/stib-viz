"""Cut a small, real GTFS extract out of the full feed, for the versioned test fixture.

Usage: uv run python tools/make_extract.py <full.zip> <out.zip> <YYYYMMDD> <YYYYMMDD> ROUTE...

Keeps the given routes (by short name), the services running inside the date window, and only
the trips, stop times, stops and shapes those need. The feed version gets an ``-extract`` suffix
so the fixture can never be mistaken for the real thing.
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path

import pandas as pd


def read(archive: zipfile.ZipFile, name: str) -> pd.DataFrame:
    with archive.open(name) as handle:
        return pd.read_csv(handle, dtype=str, keep_default_na=False, encoding="utf-8-sig")


def _running_services(
    calendar: pd.DataFrame, dates: pd.DataFrame, start: str, end: str
) -> set[str]:
    """Services with at least one active day inside the window."""
    import datetime as dt

    first, last = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    days = [first + dt.timedelta(days=i) for i in range((last - first).days + 1)]
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    running: set[str] = set()
    for row in calendar.itertuples():
        for day in days:
            key = day.strftime("%Y%m%d")
            if (
                row.start_date <= key <= row.end_date
                and getattr(row, weekdays[day.weekday()]) == "1"
            ):
                running.add(row.service_id)
    running |= set(dates[dates.exception_type == "1"].service_id)
    return running


def main(source: Path, target: Path, start: str, end: str, short_names: list[str]) -> None:
    with zipfile.ZipFile(source) as archive:
        tables = {name: read(archive, name) for name in archive.namelist()}
    routes = tables["routes.txt"]
    routes = routes[routes.route_short_name.isin(short_names)]
    trips = tables["trips.txt"]
    trips = trips[trips.route_id.isin(routes.route_id)]

    calendar = tables["calendar.txt"]
    calendar = calendar[(calendar.end_date >= start) & (calendar.start_date <= end)].copy()
    calendar["start_date"] = calendar.start_date.where(calendar.start_date >= start, start)
    calendar["end_date"] = calendar.end_date.where(calendar.end_date <= end, end)
    dates = tables["calendar_dates.txt"]
    dates = dates[(dates.date >= start) & (dates.date <= end)]
    services = _running_services(calendar, dates, start, end)
    trips = trips[trips.service_id.isin(services)]
    calendar = calendar[calendar.service_id.isin(trips.service_id)]
    dates = dates[dates.service_id.isin(trips.service_id)]

    stop_times = tables["stop_times.txt"]
    stop_times = stop_times[stop_times.trip_id.isin(trips.trip_id)]
    stops = tables["stops.txt"]
    used = set(stop_times.stop_id)
    parents = set(stops[stops.stop_id.isin(used)].parent_station) - {""}
    stops = stops[stops.stop_id.isin(used | parents)]
    shapes = tables["shapes.txt"]
    shapes = shapes[shapes.shape_id.isin(trips.shape_id)]
    feed_info = tables["feed_info.txt"].copy()
    feed_info["feed_start_date"], feed_info["feed_end_date"] = start, end
    feed_info["feed_version"] = feed_info.feed_version + "-extract"

    output = {
        "agency.txt": tables["agency.txt"],
        "feed_info.txt": feed_info,
        "routes.txt": routes,
        "trips.txt": trips,
        "stop_times.txt": stop_times,
        "stops.txt": stops,
        "shapes.txt": shapes,
        "calendar.txt": calendar,
        "calendar_dates.txt": dates,
    }
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as out:
        for name, frame in output.items():
            out.writestr(name, frame.to_csv(index=False, lineterminator="\n"))
    print(
        f"{target}: {target.stat().st_size} bytes, {len(routes)} routes, {len(trips)} trips, "
        f"{len(stop_times)} stop times, {len(stops)} stops, {shapes.shape_id.nunique()} shapes"
    )


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5:])

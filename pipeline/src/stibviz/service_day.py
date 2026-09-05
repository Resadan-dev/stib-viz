"""Selecting the trips of one service day.

A service day runs from 04:00 to 04:00 the next morning. In GTFS seconds that is the span
``[SERVICE_DAY_START_S, SPAN_END_S)``, i.e. ``[14400, 100800)``. A trip belongs to the day when
its first departure falls inside the span (ARCHITECTURE.md, step 3): a 25:10 departure is part
of the day, a 03:30 departure is not. Trips that start inside the span but arrive after 28:00 are
kept whole here and truncated later by the trajectory step, which reports them as anomalies.

Every time this module returns is expressed both in GTFS seconds (``*_s`` columns) and in
seconds since 04:00 of the service day (``start``, ``end``, ``arr``, ``dep``), the unit every
later step and the published files use.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import pandas as pd

from stibviz.gtfs import Feed

SERVICE_DAY_START_S = 4 * 3600
SERVICE_DAY_LENGTH_S = 24 * 3600
SPAN_END_S = SERVICE_DAY_START_S + SERVICE_DAY_LENGTH_S

_WEEKDAY_COLUMNS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")

TRIP_COLUMNS = [
    "trip_id",
    "route_id",
    "service_id",
    "shape_id",
    "block_id",
    "direction_id",
    "trip_headsign",
    "start_s",
    "end_s",
    "start",
    "end",
]


class DateNotCoveredError(ValueError):
    """The requested date lies outside the feed's validity window."""


@dataclass(frozen=True)
class DayTrips:
    """The trips and stop times of one service day, with counts of what was set aside.

    ``trips`` has the columns of :data:`TRIP_COLUMNS`, sorted by ``start`` then ``trip_id``.
    ``stop_times`` is restricted to those trips, sorted by trip then sequence, with ``arr`` and
    ``dep`` in seconds since 04:00.
    """

    date: dt.date
    trips: pd.DataFrame
    stop_times: pd.DataFrame
    dropped_before_start: int
    dropped_after_span: int
    ends_after_span: int
    without_stop_times: int


def active_services(feed: Feed, date: dt.date) -> frozenset[str]:
    """Service ids running on ``date``: calendar rows plus and minus calendar_dates exceptions."""
    ymd = date.strftime("%Y%m%d")
    base: set[str] = set()
    calendar = feed.calendar
    if not calendar.empty:
        weekday = _WEEKDAY_COLUMNS[date.weekday()]
        running = (
            (calendar.start_date <= ymd) & (calendar.end_date >= ymd) & (calendar[weekday] == "1")
        )
        base = set(calendar.loc[running, "service_id"])
    exceptions = feed.calendar_dates[feed.calendar_dates.date == ymd]
    added = set(exceptions.loc[exceptions.exception_type == "1", "service_id"])
    removed = set(exceptions.loc[exceptions.exception_type == "2", "service_id"])
    return frozenset((base | added) - removed)


def select_day(feed: Feed, date: dt.date) -> DayTrips:
    """Return the trips of the service day ``date`` and their stop times.

    Raises :class:`DateNotCoveredError` when the feed does not cover ``date``. A date with no
    service at all yields empty tables, not an error: that is a legitimate answer.
    """
    if not feed.covers(date):
        raise DateNotCoveredError(
            f"{date.isoformat()} is outside the feed validity window "
            f"{feed.info.start_date.isoformat()} to {feed.info.end_date.isoformat()}"
        )
    services = active_services(feed, date)
    candidates = feed.trips[feed.trips.service_id.isin(services)]
    stop_times = feed.stop_times[feed.stop_times.trip_id.isin(candidates.trip_id)]

    # stop_times is sorted by trip then sequence, so first/last give the terminus times.
    bounds = (
        stop_times.groupby("trip_id", sort=False)
        .agg(start_s=("departure_s", "first"), end_s=("arrival_s", "last"))
        .reset_index()
    )
    trips = candidates.merge(bounds, on="trip_id", how="inner")
    without_stop_times = len(candidates) - len(trips)

    before = trips.start_s < SERVICE_DAY_START_S
    after = trips.start_s >= SPAN_END_S
    trips = trips[~before & ~after].copy()
    trips["start"] = trips.start_s - SERVICE_DAY_START_S
    trips["end"] = trips.end_s - SERVICE_DAY_START_S
    trips = trips.sort_values(["start", "trip_id"], kind="stable").reset_index(drop=True)
    trips = trips[TRIP_COLUMNS]

    stop_times = stop_times[stop_times.trip_id.isin(trips.trip_id)].copy()
    stop_times["arr"] = stop_times.arrival_s - SERVICE_DAY_START_S
    stop_times["dep"] = stop_times.departure_s - SERVICE_DAY_START_S
    stop_times = stop_times.reset_index(drop=True)

    return DayTrips(
        date=date,
        trips=trips,
        stop_times=stop_times,
        dropped_before_start=int(before.sum()),
        dropped_after_span=int(after.sum()),
        ends_after_span=int((trips.end_s > SPAN_END_S).sum()),
        without_stop_times=without_stop_times,
    )

"""Rolling window of service days and the nightly plan (ARCHITECTURE.md, section 7.2).

The site offers yesterday, today and the next five days, within the validity of the feed. The
nightly run compares the feed it downloaded with the index the site already publishes: when the
feed is unchanged and every covered day is there, nothing is built. Otherwise the whole window is
rebuilt, because a deployment replaces the site: publishing only the missing days would lose the
others.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any

from stibviz.gtfs import FeedInfo

DAYS_BEFORE = 1
DAYS_AFTER = 5


def rolling_window(
    today: dt.date, days_before: int = DAYS_BEFORE, days_after: int = DAYS_AFTER
) -> list[dt.date]:
    """The service days to publish around ``today``, in order."""
    return [today + dt.timedelta(days=offset) for offset in range(-days_before, days_after + 1)]


@dataclass(frozen=True)
class Plan:
    """What the nightly run has to build."""

    to_build: list[dt.date]
    uncovered: list[dt.date]
    up_to_date: bool


def _published_days(published: Any, version: str) -> set[dt.date]:
    """Days the site publishes for this feed version; empty for another version or a bad index."""
    if not isinstance(published, dict) or published.get("feed_version") != version:
        return set()
    entries = published.get("days")
    if not isinstance(entries, list):
        return set()
    days: set[dt.date] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        try:
            days.add(dt.date.fromisoformat(str(entry.get("date"))))
        except ValueError:
            continue
    return days


def plan_days(window: list[dt.date], feed: FeedInfo, published: Any) -> Plan:
    """Days of the window to build, given the feed at hand and the published index, if any."""
    covered = [day for day in window if feed.start_date <= day <= feed.end_date]
    uncovered = [day for day in window if day not in covered]
    done = _published_days(published, feed.version)
    up_to_date = bool(covered) and all(day in done for day in covered)
    return Plan(to_build=[] if up_to_date else covered, uncovered=uncovered, up_to_date=up_to_date)

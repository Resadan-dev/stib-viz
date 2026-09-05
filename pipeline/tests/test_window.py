"""Rolling window of service days and the plan of what to build."""

from __future__ import annotations

import datetime as dt

import pytest

from stibviz.gtfs import FeedInfo
from stibviz.window import Plan, plan_days, rolling_window

FEED = FeedInfo(version="v2", start_date=dt.date(2026, 8, 31), end_date=dt.date(2026, 9, 27))
TODAY = dt.date(2026, 9, 9)


def test_rolling_window_runs_from_yesterday_to_five_days_ahead() -> None:
    window = rolling_window(TODAY)
    assert window[0] == dt.date(2026, 9, 8)
    assert window[-1] == dt.date(2026, 9, 14)
    assert len(window) == 7


def test_rolling_window_accepts_another_shape() -> None:
    assert rolling_window(TODAY, days_before=0, days_after=1) == [TODAY, dt.date(2026, 9, 10)]


def test_plan_builds_the_whole_covered_window_without_a_published_index() -> None:
    plan = plan_days(rolling_window(TODAY), FEED, published=None)
    assert plan.to_build == rolling_window(TODAY)
    assert plan.uncovered == []
    assert plan.up_to_date is False


def test_plan_sets_aside_days_the_feed_does_not_cover() -> None:
    late = dt.date(2026, 9, 26)
    plan = plan_days(rolling_window(late), FEED, published=None)
    assert plan.uncovered == [
        dt.date(2026, 9, 28),
        dt.date(2026, 9, 29),
        dt.date(2026, 9, 30),
        dt.date(2026, 10, 1),
    ]
    assert plan.to_build == [dt.date(2026, 9, 25), dt.date(2026, 9, 26), dt.date(2026, 9, 27)]


def test_plan_rebuilds_the_whole_window_when_a_day_is_missing() -> None:
    # A deployment replaces the site, so a partial build would lose the published days.
    published = {"feed_version": "v2", "days": [{"date": "2026-09-08"}, {"date": "2026-09-09"}]}
    plan = plan_days(rolling_window(TODAY), FEED, published)
    assert plan.to_build == rolling_window(TODAY)
    assert plan.up_to_date is False


def test_plan_is_up_to_date_when_every_day_is_published_for_this_feed() -> None:
    published = {
        "feed_version": "v2",
        "days": [{"date": d.isoformat()} for d in rolling_window(TODAY)],
    }
    plan = plan_days(rolling_window(TODAY), FEED, published)
    assert plan.to_build == []
    assert plan.up_to_date is True


def test_plan_rebuilds_everything_for_a_new_feed_version() -> None:
    published = {
        "feed_version": "v1",
        "days": [{"date": d.isoformat()} for d in rolling_window(TODAY)],
    }
    plan = plan_days(rolling_window(TODAY), FEED, published)
    assert plan.to_build == rolling_window(TODAY)


def test_plan_ignores_a_malformed_published_index() -> None:
    plan = plan_days(rolling_window(TODAY), FEED, published={"days": "soon"})
    assert plan.to_build == rolling_window(TODAY)
    assert plan.up_to_date is False


def test_plan_is_a_frozen_value() -> None:
    plan = Plan(to_build=[], uncovered=[], up_to_date=True)
    with pytest.raises(AttributeError):
        plan.up_to_date = False  # type: ignore[misc]

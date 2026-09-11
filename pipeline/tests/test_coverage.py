"""How well the STIB serves residents: departures per direction within reach, classes, figures.

The synthetic network (tests/conftest.py) runs metro M1 both ways along S1 Gare, S2 Bourse, S3
Parc, S4 Nord, and one bus B95 after midnight from S1; its stops all have different names.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from tests.conftest import PipelineState, synthetic_reference

from stibviz.coverage import (
    DRAWN_MIN_RESIDENTS,
    HOURS,
    METRO,
    SURFACE,
    Quays,
    area_coverage,
    compute_coverage,
    coverage_rasters,
    group_places,
    place_departures,
    quay_departures,
    reachable_departures,
    service_classes,
    weighted_median,
)
from stibviz.geometry import to_mercator
from stibviz.stats import route_table


def _departures(rows: list[tuple[str, str, str, int, int]]) -> pd.DataFrame:
    return pd.DataFrame(rows, columns=["stop_id", "route_id", "direction_id", "hour", "group"])


# --- Departures, places, reach ------------------------------------------------------------------


def test_a_departure_is_a_call_at_any_stop_but_the_last(wednesday_state: PipelineState) -> None:
    day, feed = wednesday_state.day, wednesday_state.feed
    modes = {route.route_id: route.mode for route in route_table(feed, day)}
    departures = quay_departures(day, modes)
    # Eight metro trips of four stops each, and one bus trip of two stops.
    assert len(departures) == 8 * 3 + 1
    assert set(departures.columns) == {"stop_id", "route_id", "direction_id", "hour", "group"}
    assert not ((departures.route_id == "M1") & (departures.stop_id == "S4")
                & (departures.direction_id == "0")).any()  # fmt: skip


def test_departures_fall_in_the_hour_they_leave_and_their_mode_group(
    wednesday_state: PipelineState,
) -> None:
    day, feed = wednesday_state.day, wednesday_state.feed
    modes = {route.route_id: route.mode for route in route_table(feed, day)}
    departures = quay_departures(day, modes)
    bus = departures[departures.route_id == "B95"]
    # 25:10 is 21 hours and 10 minutes after the 04:00 start of the service day.
    assert bus.hour.tolist() == [21]
    assert bus.group.tolist() == [SURFACE]
    assert set(departures[departures.route_id == "M1"].group) == {METRO}
    first = departures[(departures.route_id == "M1") & (departures.stop_id == "S1")]
    assert sorted(first.hour.tolist())[:2] == [1, 1]  # T1 at 05:00 and T3 at 05:30


def test_quays_of_one_name_close_together_are_one_place() -> None:
    names = np.array(["A", "A", "A", "A", "B"])
    x = np.array([0.0, 200.0, 400.0, 3000.0, 100.0])
    place = group_places(names, x, np.zeros(5))
    assert place[0] == place[1] == place[2]  # linked step by step, 200 m apart
    assert len({place[0], place[3], place[4]}) == 3  # far away, or another name


def test_a_place_counts_each_route_in_its_busier_direction_then_adds_the_routes() -> None:
    rows = (
        [("q1", "R1", "0", 5, SURFACE)] * 6
        + [("q2", "R1", "1", 5, SURFACE)] * 4
        + [("q1", "R2", "0", 5, SURFACE)] * 3
        + [("q3", "M", "0", 5, METRO)] * 12
    )
    per_place = place_departures(_departures(rows), {"q1": 0, "q2": 0, "q3": 0}, places=1)
    assert per_place.shape == (1, 2, HOURS)
    assert per_place[0, SURFACE, 5] == 6 + 3
    assert per_place[0, METRO, 5] == 12
    assert per_place.sum() == 21


def test_a_missing_direction_counts_as_a_direction_of_its_own() -> None:
    rows = [("q1", "R1", "", 7, SURFACE)] * 2 + [("q1", "R1", "0", 7, SURFACE)] * 5
    per_place = place_departures(_departures(rows), {"q1": 0}, places=1)
    assert per_place[0, SURFACE, 7] == 5


def _quays() -> tuple[Quays, np.ndarray]:
    # Two surface stops 300 m apart and a metro station 700 m east of the first.
    quays = Quays(
        x=np.array([0.0, 300.0, 700.0]),
        y=np.zeros(3),
        place=np.array([0, 1, 2]),
        serves=np.array([[True, False], [True, False], [False, True]]),
    )
    per_place = np.zeros((3, 2, HOURS))
    per_place[0, SURFACE, 3] = 5
    per_place[1, SURFACE, 3] = 8
    per_place[2, METRO, 3] = 12
    return quays, per_place


def test_each_group_takes_its_best_place_within_its_own_reach() -> None:
    quays, per_place = _quays()
    reach = reachable_departures(np.array([0.0, 1000.0, 2000.0]), np.zeros(3), quays, per_place)
    assert reach.shape == (3, 2, HOURS)
    assert reach[0, SURFACE, 3] == 8  # both surface stops within 400 m: the better, not the sum
    assert reach[0, METRO, 3] == 12  # the station 700 m away, within 800 m
    assert reach[1, SURFACE, 3] == 0  # the nearer surface stop is 700 m away
    assert reach[1, METRO, 3] == 12
    assert not reach[2].any()  # 1.3 km from the station
    assert not reach[:, :, :3].any() and not reach[:, :, 4:].any()


def test_reach_is_nothing_without_a_single_stop() -> None:
    quays = Quays(x=np.zeros(0), y=np.zeros(0), place=np.zeros(0, dtype=np.int64),
                  serves=np.zeros((0, 2), dtype=bool))  # fmt: skip
    reach = reachable_departures(np.array([0.0]), np.array([0.0]), quays, np.zeros((0, 2, HOURS)))
    assert not reach.any()


# --- Classes and figures ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("departures", "expected"),
    [(0, 0), (1, 1), (3, 1), (4, 2), (10, 2), (11, 3), (20, 3), (21, 4), (300, 4)],
)
def test_service_classes_follow_the_thresholds_4_10_20(departures: int, expected: int) -> None:
    assert service_classes(np.array([departures]))[0] == expected


def test_weighted_median() -> None:
    assert weighted_median(np.array([1.0, 5.0, 9.0]), np.array([1.0, 1.0, 1.0])) == 5
    assert weighted_median(np.array([1.0, 5.0, 9.0]), np.array([1.0, 1.0, 10.0])) == 9
    assert weighted_median(np.array([9.0, 1.0]), np.array([0.0, 0.0])) == 0


def test_area_figures_are_whole_residents_and_departures() -> None:
    weights = np.array([10.4, 20.3, 0.0])
    classes = np.zeros((3, HOURS), dtype=np.uint8)
    totals = np.zeros((3, HOURS))
    classes[0, 8], totals[0, 8] = 3, 14
    classes[1, 8], totals[1, 8] = 4, 25
    area = area_coverage(weights, classes, totals)
    assert area.residents == 31
    assert area.classes.shape == (HOURS, 5)
    assert area.classes[8].tolist() == [0, 0, 0, 10, 20]
    assert area.classes[0].tolist() == [31, 0, 0, 0, 0]
    assert area.median[8] == 25  # the heavier point
    assert area.resident_hours == 31  # 30.7 residents, one hour each above "high"
    assert area.classes.dtype == np.int64 and area.median.dtype == np.int64


# --- The whole day ------------------------------------------------------------------------------


def test_the_day_counts_every_resident_of_the_reference(wednesday_state: PipelineState) -> None:
    day, feed = wednesday_state.day, wednesday_state.feed
    reference = synthetic_reference()
    coverage = compute_coverage(day, feed.stops, route_table(feed, day), reference)
    assert coverage.region.residents == 3000
    assert [m.residents for m in coverage.municipalities] == [1000, 2000]
    assert np.all(np.abs(coverage.region.classes.sum(axis=1) - 3000) <= 5)
    # No departure between 04:00 and 05:00: every resident is in "none".
    assert coverage.region.classes[0, 0] == 3000
    # Two metro departures per direction at most in an hour: nobody ever reaches "high".
    assert coverage.region.resident_hours == 0


def test_the_drawn_grid_follows_the_image_order(wednesday_state: PipelineState) -> None:
    day, feed = wednesday_state.day, wednesday_state.feed
    reference = synthetic_reference()
    coverage = compute_coverage(day, feed.stops, route_table(feed, day), reference)
    municipality, drawn = coverage_rasters(reference)
    grid = reference.grid
    assert municipality.shape == drawn.shape == (grid.nx * grid.ny,)
    assert coverage.classes.shape == coverage.departures.shape == (HOURS, int(drawn.sum()))
    # Row 0 of the image is the northernmost row of the grid.
    x, y = to_mercator([4.36], [50.85])  # S2 Bourse
    ix = int((x[0] - grid.x0) // grid.cell_m)
    iy = int((y[0] - grid.y0) // grid.cell_m)
    image = (grid.ny - 1 - iy) * grid.nx + ix
    column = int(drawn[:image].sum())
    assert drawn[image] == 1
    # 05:00-06:00 at Bourse: T1 and T3 eastbound, T2 westbound, so 2 per direction.
    assert coverage.departures[1, column] == 2
    assert coverage.classes[1, column] == 1
    # Municipalities are counted from 1 in the raster, 0 being outside the Region.
    for lon, expected in ((4.35, 1), (4.37, 2)):  # Gare in the west half, Parc in the east
        x, y = to_mercator([lon], [50.85])
        ix = int((x[0] - grid.x0) // grid.cell_m)
        iy = int((y[0] - grid.y0) // grid.cell_m)
        assert municipality[(grid.ny - 1 - iy) * grid.nx + ix] == expected


def test_the_night_bus_serves_the_hour_after_midnight(wednesday_state: PipelineState) -> None:
    day, feed = wednesday_state.day, wednesday_state.feed
    reference = synthetic_reference()
    coverage = compute_coverage(day, feed.stops, route_table(feed, day), reference)
    _, drawn = coverage_rasters(reference)
    grid = reference.grid
    x, y = to_mercator([4.35], [50.85])  # S1 Gare, where B95 leaves at 25:10
    ix = int((x[0] - grid.x0) // grid.cell_m)
    iy = int((y[0] - grid.y0) // grid.cell_m)
    column = int(drawn[: (grid.ny - 1 - iy) * grid.nx + ix].sum())
    assert coverage.departures[21, column] == 1
    assert coverage.classes[21, column] == 1


def test_cells_with_too_few_residents_are_not_drawn() -> None:
    reference = synthetic_reference()
    _, drawn = coverage_rasters(reference)
    per_cell = reference.cell_residents()
    assert int(drawn.sum()) == int((per_cell >= DRAWN_MIN_RESIDENTS).sum())

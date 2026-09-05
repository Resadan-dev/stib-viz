"""Chaining trips into vehicles through block_id: layovers, deadheads, splits."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import pytest

from stibviz.gtfs import load_feed
from stibviz.service_day import select_day
from stibviz.vehicles import TripRef, Vehicle, VehicleAssembly, assemble_vehicles

WEDNESDAY = dt.date(2026, 9, 9)
FRIDAY = dt.date(2026, 9, 11)


@pytest.fixture
def wednesday(sample_gtfs_zip: Path) -> VehicleAssembly:
    feed = load_feed(sample_gtfs_zip)
    return assemble_vehicles(select_day(feed, WEDNESDAY), feed.stops)


def test_block_chains_its_trips_in_start_order(wednesday: VehicleAssembly) -> None:
    v1 = wednesday.vehicles[0]
    assert isinstance(v1, Vehicle)
    assert v1.block_id == "V1"
    assert [t.trip_id for t in v1.trips] == ["T1", "T2", "T3"]
    assert all(isinstance(t, TripRef) for t in v1.trips)
    assert v1.trips[0].start == 3600 and v1.trips[0].end == 3600 + 7 * 60


def test_layover_is_recognised_when_the_next_trip_starts_where_the_last_ended(
    wednesday: VehicleAssembly,
) -> None:
    v1 = wednesday.vehicles[0]
    assert v1.trips[0].from_layover is False  # first trip of the vehicle
    assert v1.trips[1].from_layover is True  # T1 ends at S4, T2 starts at S4
    assert v1.trips[2].from_layover is True  # T2 ends at S1, T3 starts at S1


def test_deadhead_move_breaks_the_layover_but_keeps_the_vehicle(
    wednesday: VehicleAssembly,
) -> None:
    v6 = next(v for v in wednesday.vehicles if v.block_id == "V6")
    assert [t.trip_id for t in v6.trips] == ["T11", "T12"]
    assert v6.trips[1].from_layover is False  # T11 ends at S4, T12 starts 2.5 km away at S1
    assert wednesday.deadheads == 1


def test_overlapping_trips_in_one_block_are_split_into_two_vehicles(
    wednesday: VehicleAssembly,
) -> None:
    v5 = [v for v in wednesday.vehicles if v.block_id == "V5"]
    assert len(v5) == 2
    assert [t.trip_id for t in v5[0].trips] == ["T9"]
    assert [t.trip_id for t in v5[1].trips] == ["T10"]
    assert wednesday.overlapping_blocks == 1


def test_trip_without_block_is_a_vehicle_of_its_own(wednesday: VehicleAssembly) -> None:
    lone = [v for v in wednesday.vehicles if v.block_id == ""]
    assert len(lone) == 1
    assert [t.trip_id for t in lone[0].trips] == ["T8"]


def test_vehicles_are_ordered_by_first_departure_and_indexed(wednesday: VehicleAssembly) -> None:
    assert len(wednesday.vehicles) == 6
    assert [v.index for v in wednesday.vehicles] == list(range(6))
    firsts = [v.trips[0].start for v in wednesday.vehicles]
    assert firsts == sorted(firsts)
    assert wednesday.vehicles[-1].block_id == "V2"  # T4 at 25:10 comes last


def test_trip_lookup_gives_vehicle_and_trip_indices(wednesday: VehicleAssembly) -> None:
    assert wednesday.trip_index["T3"] == (0, 2)
    assert wednesday.trip_index["T10"] == (3, 0)
    assert len(wednesday.trip_index) == 9


def test_trip_ref_carries_what_the_manifest_needs(wednesday: VehicleAssembly) -> None:
    t2 = wednesday.vehicles[0].trips[1]
    assert t2.route_id == "M1"
    assert t2.shape_id == "shpB"
    assert t2.headsign == "GARE"
    assert t2.direction_id == "1"
    assert t2.first_stop == "S4" and t2.last_stop == "S1"


def test_night_block_on_friday(sample_gtfs_zip: Path) -> None:
    feed = load_feed(sample_gtfs_zip)
    assembly = assemble_vehicles(select_day(feed, FRIDAY), feed.stops)
    v3 = next(v for v in assembly.vehicles if v.block_id == "V3")
    assert [t.trip_id for t in v3.trips] == ["T6", "T7"]
    assert v3.trips[1].from_layover is False  # T6 ends at S4, T7 restarts from S1


def test_empty_day_gives_an_empty_assembly(sample_gtfs_zip: Path) -> None:
    feed = load_feed(sample_gtfs_zip)
    assembly = assemble_vehicles(select_day(feed, dt.date(2026, 9, 13)), feed.stops)
    assert assembly.vehicles == ()
    assert assembly.trip_index == {}

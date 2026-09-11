"""Encoding: STV1 binary slices, per-hour stop files, manifest, network, lookup and index."""

from __future__ import annotations

import datetime as dt
import gzip
import json
import re
from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
from tests.conftest import MODE_OF_ROUTE, PipelineState, synthetic_reference

from stibviz.coverage import compute_coverage, coverage_rasters
from stibviz.encode import (
    COVERAGE_VERSION,
    HEADER_WORDS,
    SCC1_MAGIC,
    SCH1_MAGIC,
    STV1_MAGIC,
    STV1_VERSION,
    DayBundle,
    decode_coverage_cells,
    decode_coverage_hours,
    decode_slice,
    encode_slice,
    safe_path,
    write_day,
    write_index,
)
from stibviz.network import build_network, lookup_table, stop_dictionary
from stibviz.shapes import project_patterns, trip_patterns
from stibviz.slicing import slice_trajectories
from stibviz.stats import compute_stats, route_table


def _bundle(state: PipelineState) -> DayBundle:
    patterns = trip_patterns(state.day)
    projections = project_patterns(set(patterns.values), state.shapes, state.feed.stops)
    routes = route_table(state.feed, state.day)
    return DayBundle(
        date=state.day.date,
        feed_info=state.feed.info,
        routes=routes,
        assembly=state.assembly,
        trajectories=state.trajectories,
        slices=slice_trajectories(state.trajectories.values(), MODE_OF_ROUTE),
        stats=compute_stats(state.trajectories, state.assembly, routes),
        network=build_network(state.day, patterns, projections, state.shapes, routes),
        stops=stop_dictionary(state.feed, state.day),
        lookup=lookup_table(state.day, patterns, projections, routes),
        anomalies={"stop_offset": 0, "truncated_after_28h": 0, "block_overlap": 1},
        generated_at=dt.datetime(2026, 9, 9, 6, 40, 12, tzinfo=dt.UTC),
    )


def test_slice_round_trip_and_layout(wednesday_state: PipelineState) -> None:
    bundle = _bundle(wednesday_state)
    a_slice = next(s for s in bundle.slices if (s.hour, s.mode) == (5, "metro"))
    data = encode_slice(a_slice)
    header = np.frombuffer(data[: 4 * HEADER_WORDS], dtype="<u4")
    vertices, paths = a_slice.vertices, len(a_slice.paths)
    assert list(header) == [STV1_MAGIC, STV1_VERSION, vertices, paths, 5, 0]
    expected = (
        4 * HEADER_WORDS + 8 * vertices + 4 * vertices + 4 * (paths + 1) + 4 * paths + 2 * paths * 2
    )
    assert len(data) == expected

    decoded = decode_slice(data)
    assert decoded.hour == 5 and decoded.vertices == vertices and decoded.paths == paths
    assert decoded.positions.dtype == np.float32 and decoded.positions.shape == (2 * vertices,)
    assert decoded.times.dtype == np.float32 and len(decoded.times) == vertices
    assert decoded.index.dtype == np.uint32 and list(decoded.index[[0, -1]]) == [0, vertices]
    assert np.all(np.diff(decoded.index) >= 2)
    assert decoded.vehicle.dtype == np.uint32 and decoded.trip.dtype == np.uint16
    assert decoded.route.dtype == np.uint16
    first = a_slice.paths[0]
    assert decoded.positions[0] == pytest.approx(first.lon[0], abs=5e-7)  # Float32 at 4.4 E
    assert decoded.positions[1] == pytest.approx(first.lat[0], abs=4e-6)  # Float32 at 50.9 N
    assert decoded.times[: len(first.t)] == pytest.approx(first.t)
    assert (decoded.vehicle[0], decoded.trip[0], decoded.route[0]) == (
        first.vehicle,
        first.trip,
        first.route,
    )


def test_typed_array_offsets_are_aligned(wednesday_state: PipelineState) -> None:
    bundle = _bundle(wednesday_state)
    for a_slice in bundle.slices:
        decoded = decode_slice(encode_slice(a_slice))
        assert decoded.offsets["positions"] % 4 == 0
        assert decoded.offsets["times"] % 4 == 0
        assert decoded.offsets["index"] % 4 == 0
        assert decoded.offsets["vehicle"] % 4 == 0
        assert decoded.offsets["trip"] % 2 == 0
        assert decoded.offsets["route"] % 2 == 0


def test_decode_rejects_a_foreign_file() -> None:
    with pytest.raises(ValueError, match="STV1"):
        decode_slice(b"\x00" * 64)


def test_write_day_produces_the_documented_files(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    bundle = _bundle(wednesday_state)
    manifest = write_day(bundle, tmp_path)
    day_dir = tmp_path / "2026-09-09"
    assert (day_dir / "manifest.json").is_file()
    assert (day_dir / "vehicles.json").is_file()
    assert json.loads((day_dir / "manifest.json").read_text(encoding="utf-8")) == manifest
    slice_files = sorted(p.name for p in (day_dir / "slices").iterdir())
    assert slice_files == sorted(f"{s.hour:02d}-{s.mode}.bin" for s in bundle.slices)
    assert (tmp_path / manifest["network"]).is_file()
    assert (tmp_path / "lookup" / "test_2026.json").is_file()
    stop_files = sorted(p.name for p in (day_dir / "stops").iterdir())
    assert stop_files == sorted({f"{s.hour:02d}.json" for s in bundle.slices})


def test_manifest_content(wednesday_state: PipelineState, tmp_path: Path) -> None:
    bundle = _bundle(wednesday_state)
    manifest = write_day(bundle, tmp_path)
    assert manifest["date"] == "2026-09-09"
    assert manifest["source"] == "schedule"
    assert manifest["feed_version"] == "test_2026"
    assert manifest["attribution"] == "Source: STIB-MIVB – Open Data – 2026-09-09"
    assert re.fullmatch(r"network/test_2026-[0-9a-f]{12}\.json", manifest["network"])
    assert manifest["totals"] == {"trips": 9, "vehicles": 6, "km": pytest.approx(20.85, abs=0.1)}
    assert manifest["peak"] == {"vehicles": 2, "minute": 185}
    for series in ("vehicles", "departures", "km"):
        assert set(manifest["per_minute"][series]) == {"metro", "tram", "bus", "noctis"}
        assert all(len(v) == 1440 for v in manifest["per_minute"][series].values())
    assert manifest["routes"][0] == {
        "id": "M1",
        "name": "1",
        "mode": "metro",
        "color": "B5378C",
        "text_color": "FFFFFF",
        "long_name": "GARE - NORD",
    }
    assert manifest["vehicles_file"] == "vehicles.json" and manifest["vehicle_count"] == 6
    vehicles = json.loads((tmp_path / "2026-09-09" / "vehicles.json").read_text(encoding="utf-8"))
    v1 = vehicles[0]
    assert v1["block"] == "V1"
    assert v1["trips"][1] == {
        "route_idx": 0,
        "headsign": "GARE",
        "start": 4500,
        "end": 4920,
        "from_layover": True,
    }
    a_slice = manifest["slices"][0]
    assert set(a_slice) == {"hour", "mode", "path", "bytes", "vertices", "paths"}
    assert a_slice["path"].startswith("slices/") and a_slice["bytes"] > 24
    assert manifest["anomalies"] == {"stop_offset": 0, "truncated_after_28h": 0, "block_overlap": 1}
    assert manifest["stops_files"][0]["path"].startswith("stops/")


def test_stop_files_list_the_trips_active_in_the_hour(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    bundle = _bundle(wednesday_state)
    write_day(bundle, tmp_path)
    hour_05 = json.loads(
        (tmp_path / "2026-09-09" / "stops" / "05.json").read_text(encoding="utf-8")
    )
    vehicle, trip = wednesday_state.assembly.trip_index["T2"]
    assert hour_05[f"{vehicle}:{trip}"] == [[4500, "S4"], [4680, "S3"], [4800, "S2"], [4920, "S1"]]
    hour_04 = json.loads(
        (tmp_path / "2026-09-09" / "stops" / "04.json").read_text(encoding="utf-8")
    )
    assert f"{vehicle}:{trip}" not in hour_04


def test_network_file_is_geojson_with_stop_dictionary(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    bundle = _bundle(wednesday_state)
    manifest = write_day(bundle, tmp_path)
    network = json.loads((tmp_path / manifest["network"]).read_text(encoding="utf-8"))
    assert network["type"] == "FeatureCollection"
    assert len(network["features"]) == 7
    feature = network["features"][0]
    assert feature["geometry"]["type"] == "LineString"
    assert set(feature["properties"]) == {
        "mode",
        "from",
        "to",
        "runs",
        "class",
        "underground",
        "speed",
    }
    # Kilometres per hour to one decimal, the scheduled speed of the day over the segment.
    speeds = [f["properties"]["speed"] for f in network["features"]]
    assert all(isinstance(v, float) and v == round(v, 1) and v > 0 for v in speeds)
    lon, lat = feature["geometry"]["coordinates"][0]
    assert lon == round(lon, 5) and lat == round(lat, 5)
    assert network["stops"]["S1"] == [4.35, 50.85, "Gare"]
    assert network["intensity_breaks"] == [20, 60, 120, 240]


def test_the_network_file_is_named_by_what_is_in_it(
    wednesday_state: PipelineState, friday_state: PipelineState, tmp_path: Path
) -> None:
    """Days no longer share one network file, and identical timetables still share one.

    The file used to be named by feed version alone, so the seven days of a window wrote it in
    turn and the last one won: whatever day you opened, you read the runs and the speeds of
    another one. Naming it by a digest of its content gives each timetable its own file, lets
    the weekdays of a window share one, and makes the year of immutable caching literally true.
    """
    wednesday = write_day(_bundle(wednesday_state), tmp_path)
    friday = write_day(_bundle(friday_state), tmp_path)
    # The Friday runs Noctis and the Wednesday does not: two timetables, two networks, two files.
    assert wednesday["network"] != friday["network"]
    for manifest in (wednesday, friday):
        assert (tmp_path / manifest["network"]).is_file()

    # The same day written again lands on the same name rather than on a second file.
    assert write_day(_bundle(wednesday_state), tmp_path)["network"] == wednesday["network"]
    written = [
        p.name for p in (tmp_path / "network").iterdir() if not p.name.endswith("-hourly.json")
    ]
    assert len(written) == 2

    def segments(name: str) -> set[tuple[str, str, str]]:
        content = json.loads((tmp_path / name).read_text(encoding="utf-8"))
        return {
            (f["properties"]["mode"], f["properties"]["from"], f["properties"]["to"])
            for f in content["features"]
        }

    assert ("noctis", "S1", "S2") in segments(friday["network"])
    assert ("noctis", "S1", "S2") not in segments(wednesday["network"])


def test_the_hourly_speeds_are_a_file_of_their_own(
    wednesday_state: PipelineState, friday_state: PipelineState, tmp_path: Path
) -> None:
    """Kept out of the network file, which every session reads for its first frame.

    The hourly speeds are twenty-four numbers per segment and only the speed view ever needs
    them, so they travel in a file of their own, loaded the first time that view is turned on.
    """
    manifest = write_day(_bundle(wednesday_state), tmp_path)
    name = manifest["network_hourly"]
    assert re.fullmatch(r"network/test_2026-[0-9a-f]{12}-hourly\.json", name)
    payload = json.loads((tmp_path / name).read_text(encoding="utf-8"))
    assert (payload["first_hour"], payload["hours"], payload["min_runs"]) == (4, 24, 3)

    row = payload["speeds"]["metro|S1|S2"]
    assert len(row) == 24
    # Tenths of a km/h as whole numbers, and zero for an hour the timetable cannot time.
    assert all(isinstance(value, int) and value >= 0 for value in row)
    assert row[1] > 0
    assert row[12] == 0

    # None of it reaches the network file, which is read for the first frame of every session.
    network = json.loads((tmp_path / manifest["network"]).read_text(encoding="utf-8"))
    assert set(network["features"][0]["properties"]) == {
        "mode",
        "from",
        "to",
        "runs",
        "class",
        "underground",
        "speed",
    }
    # A different timetable is a different file, named by its own content like the network.
    assert write_day(_bundle(friday_state), tmp_path)["network_hourly"] != name


def test_index_lists_the_written_days(wednesday_state: PipelineState, tmp_path: Path) -> None:
    bundle = _bundle(wednesday_state)
    write_day(bundle, tmp_path)
    index = write_index(tmp_path, bundle.feed_info, generated_at=bundle.generated_at)
    assert json.loads((tmp_path / "index.json").read_text(encoding="utf-8")) == index
    assert index["feed_version"] == "test_2026"
    assert index["feed_valid_from"] == "2026-08-31" and index["feed_valid_to"] == "2026-09-27"
    assert index["service_day_start"] == "04:00"
    assert index["generated_at"] == "2026-09-09T06:40:12Z"
    assert index["days"] == [
        {
            "date": "2026-09-09",
            "kind": "weekday",
            "source": "schedule",
            "manifest": "2026-09-09/manifest.json",
        }
    ]


def test_index_ignores_directories_without_a_manifest(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    bundle = _bundle(wednesday_state)
    write_day(bundle, tmp_path)
    (tmp_path / "2026-09-10").mkdir()
    index = write_index(tmp_path, bundle.feed_info, generated_at=bundle.generated_at)
    assert [d["date"] for d in index["days"]] == ["2026-09-09"]


def test_times_too_close_for_float32_stay_strictly_increasing() -> None:
    from stibviz.slicing import Slice
    from stibviz.trajectories import Path as TrajectoryPath

    path = TrajectoryPath(
        lon=np.array([4.35, 4.351, 4.352]),
        lat=np.array([50.85, 50.85, 50.85]),
        t=np.array([54000.0, 54000.0000001, 54010.0]),
        vehicle=0,
        trip=0,
        route=0,
    )
    decoded = decode_slice(encode_slice(Slice(hour=19, mode="bus", paths=(path,))))
    assert np.all(np.diff(decoded.times) > 0)


def test_write_day_replaces_an_older_build_of_the_same_day(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    bundle = _bundle(wednesday_state)
    write_day(bundle, tmp_path)
    stale = tmp_path / bundle.date.isoformat() / "slices" / "99-bus.bin"
    stale.write_bytes(b"stale")
    write_day(bundle, tmp_path)
    assert not stale.exists()
    assert (tmp_path / bundle.date.isoformat() / "manifest.json").is_file()


def test_safe_path_refuses_a_name_that_would_leave_the_data_directory(tmp_path: Path) -> None:
    assert safe_path(tmp_path, "network", "v1.json") == (tmp_path / "network" / "v1.json").resolve()
    # A single ".." only climbs back into the data directory, so these are the real escapes:
    # one that walks out of it, and an absolute path, which joinpath would otherwise honour.
    # The absolute one is spelled from the anchor of the temporary directory: "C:/escape.json"
    # is a drive only on Windows, and elsewhere it is an ordinary directory named "C:" that
    # stays inside the data directory, which is why CI on Linux saw no refusal.
    absolute = str(Path(tmp_path.anchor, "escape.json"))
    for escape in ["../../escape.json", "../../../../etc/passwd", absolute]:
        with pytest.raises(ValueError, match="refusing to write outside"):
            safe_path(tmp_path, "network", escape)


# --- Coverage (docs/03-commune-coverage.md, D31) -------------------------------------------------


def _bundle_with_coverage(state: PipelineState) -> DayBundle:
    bundle = _bundle(state)
    reference = synthetic_reference()
    coverage = compute_coverage(state.day, state.feed.stops, bundle.routes, reference)
    return replace(bundle, coverage=coverage, reference=reference)


def _coverage_stats(manifest: dict, data_dir: Path) -> dict:
    return json.loads((data_dir / manifest["coverage"]).read_text(encoding="utf-8"))


def test_a_day_without_coverage_names_none(wednesday_state: PipelineState, tmp_path: Path) -> None:
    manifest = write_day(_bundle(wednesday_state), tmp_path)
    assert "coverage" not in manifest
    assert not (tmp_path / "coverage").exists()


def test_the_coverage_figures_are_whole_numbers_named_in_the_manifest(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    manifest = write_day(_bundle_with_coverage(wednesday_state), tmp_path)
    assert re.fullmatch(r"coverage/[^/]+-[0-9a-f]{12}\.json", manifest["coverage"])
    stats = _coverage_stats(manifest, tmp_path)
    assert (stats["first_hour"], stats["hours"]) == (4, 24)
    assert stats["thresholds"] == [4, 10, 20]
    assert stats["reach_m"] == [400, 800]
    for key in ("municipalities_file", "cells_file", "hours_file"):
        assert (tmp_path / stats[key]).is_file()
    region = stats["region"]
    assert region["residents"] == 3000
    assert len(region["classes"]) == 24
    assert all(len(row) == 5 and all(isinstance(v, int) for v in row) for row in region["classes"])
    assert len(region["median"]) == 24 and isinstance(region["resident_hours"], int)
    assert [m["residents"] for m in stats["municipalities"]] == [1000, 2000]


def test_the_hours_file_round_trips(wednesday_state: PipelineState, tmp_path: Path) -> None:
    bundle = _bundle_with_coverage(wednesday_state)
    stats = _coverage_stats(write_day(bundle, tmp_path), tmp_path)
    data = (tmp_path / stats["hours_file"]).read_bytes()
    assert bundle.coverage is not None
    classes, departures = decode_coverage_hours(data)
    assert np.array_equal(classes, bundle.coverage.classes)
    assert np.array_equal(departures, bundle.coverage.departures)
    header = np.frombuffer(gzip.decompress(data)[:24], dtype="<u4")
    assert list(header) == [SCH1_MAGIC, COVERAGE_VERSION, classes.shape[1], 24, 4, 0]


def test_the_cells_file_holds_the_rasters_of_the_reference(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    bundle = _bundle_with_coverage(wednesday_state)
    stats = _coverage_stats(write_day(bundle, tmp_path), tmp_path)
    data = (tmp_path / stats["cells_file"]).read_bytes()
    nx, ny, municipality, drawn = decode_coverage_cells(data)
    assert bundle.reference is not None
    assert (nx, ny) == (bundle.reference.grid.nx, bundle.reference.grid.ny)
    expected_municipality, expected_drawn = coverage_rasters(bundle.reference)
    assert np.array_equal(municipality, expected_municipality)
    assert np.array_equal(drawn, expected_drawn)
    header = np.frombuffer(gzip.decompress(data)[:16], dtype="<u4")
    assert list(header) == [SCC1_MAGIC, COVERAGE_VERSION, nx, ny]
    hours, _ = decode_coverage_hours((tmp_path / stats["hours_file"]).read_bytes())
    assert hours.shape[1] == int(drawn.sum())


def test_the_municipalities_file_gives_the_grid_bounds_names_and_sources(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    stats = _coverage_stats(write_day(_bundle_with_coverage(wednesday_state), tmp_path), tmp_path)
    payload = json.loads((tmp_path / stats["municipalities_file"]).read_text(encoding="utf-8"))
    west, south, east, north = payload["grid"]["bounds"]
    assert west < 4.345 < 4.375 < east
    assert south < 50.845 < 50.865 < north
    assert [m["name"] for m in payload["municipalities"]] == ["Ouest", "Est"]
    assert payload["municipalities"][1]["label"] == [4.37, 50.855]
    assert payload["sources"] == {"test": "synthetic"}
    assert payload["borders"] == []


def test_coverage_files_are_named_by_what_is_in_them(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    bundle = _bundle_with_coverage(wednesday_state)
    first = _coverage_stats(write_day(bundle, tmp_path / "a"), tmp_path / "a")
    second = _coverage_stats(write_day(bundle, tmp_path / "b"), tmp_path / "b")
    assert first == second  # gzip without a timestamp: the same day, the same bytes, the same names
    for key in ("municipalities_file", "cells_file", "hours_file"):
        assert re.search(r"-[0-9a-f]{12}(-hours)?\.(json|bin)$", first[key])

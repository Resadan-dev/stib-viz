"""Quality checks: blocking failures, tolerated per-object anomalies, file-level checks."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest
from tests.conftest import PipelineState
from tests.test_encode import _bundle, _bundle_with_coverage

from stibviz.checks import (
    ANOMALY_TOLERANCE,
    MAX_DAY_BYTES,
    MAX_SLICE_BYTES,
    CheckReport,
    check_build,
    check_day_dir,
)
from stibviz.encode import DayBundle, encode_coverage_hours, write_day
from stibviz.shapes import project_patterns, trip_patterns


def _build_report(state: PipelineState, **kwargs: object) -> CheckReport:
    patterns = trip_patterns(state.day)
    projections = project_patterns(set(patterns.values), state.shapes, state.feed.stops)
    return check_build(_bundle(state), state.day, patterns, projections, state.shapes, **kwargs)


def test_thresholds_match_the_architecture() -> None:
    assert MAX_SLICE_BYTES == 2_500_000
    assert MAX_DAY_BYTES == 35_000_000
    assert ANOMALY_TOLERANCE == 0.001


def test_sample_day_passes_with_a_lenient_tolerance(wednesday_state: PipelineState) -> None:
    report = _build_report(wednesday_state, anomaly_tolerance=1.0)
    assert isinstance(report, CheckReport)
    assert report.ok, report.blocking
    assert report.blocking == []
    assert report.anomalies["block_overlap"] == 1
    assert report.anomalies["time_repaired"] == 1  # T3
    assert report.anomalies["truncated_after_28h"] == 0
    assert report.anomalies["dropped_before_start"] == 1  # T5
    assert report.anomalies["stop_offset"] == 0
    assert report.anomalies["stop_order"] == 0
    assert report.info["deadheads"] == 1
    assert report.info["stop_offset_median_m"] < 15


def test_anomalies_above_tolerance_block_the_day(wednesday_state: PipelineState) -> None:
    report = _build_report(wednesday_state)  # default tolerance: 0.1 % of nine trips
    assert not report.ok
    assert any("block_overlap" in message for message in report.blocking)


def test_friday_counts_the_truncated_night_trip(friday_state: PipelineState) -> None:
    report = _build_report(friday_state, anomaly_tolerance=1.0)
    assert report.anomalies["truncated_after_28h"] == 1


def _report_with_wrong_lengths(
    state: PipelineState, *shape_ids: str, **kwargs: object
) -> CheckReport:
    """The sample day, with the feed's ``shape_dist_traveled`` 5 % off on the given shapes."""
    shapes = {
        shape_id: replace(shape, feed_length_m=shape.length_m * 1.05)
        if shape_id in shape_ids
        else shape
        for shape_id, shape in state.shapes.items()
    }
    patterns = trip_patterns(state.day)
    projections = project_patterns(set(patterns.values), state.shapes, state.feed.stops)
    return check_build(_bundle(state), state.day, patterns, projections, shapes, **kwargs)


def test_a_wrong_shape_length_on_one_trip_does_not_block_the_day(
    wednesday_state: PipelineState,
) -> None:
    # shpC carries T4 alone. The real feed of 2026-10-02 had a metro variant like this one: a
    # single trip a day on a shape missing 378 m of geometry, which refused the whole day.
    report = _report_with_wrong_lengths(wednesday_state, "shpC", anomaly_tolerance=0.2)
    assert report.ok, report.blocking
    assert report.anomalies["shape_length"] == 1
    assert report.info["shape_length_shapes"] == "shpC"


def test_a_wrong_shape_length_is_counted_in_trips_not_in_shapes(
    wednesday_state: PipelineState,
) -> None:
    # shpB carries T2 and T10: one shape, two trips, above 0.2 of nine trips.
    report = _report_with_wrong_lengths(wednesday_state, "shpB", anomaly_tolerance=0.2)
    assert report.anomalies["shape_length"] == 2
    assert not report.ok
    assert any("shape_length" in message and "shpB" in message for message in report.blocking)


def test_a_shape_without_a_distance_in_the_feed_is_not_counted(
    wednesday_state: PipelineState,
) -> None:
    shapes = {
        shape_id: replace(shape, feed_length_m=None)
        for shape_id, shape in wednesday_state.shapes.items()
    }
    patterns = trip_patterns(wednesday_state.day)
    projections = project_patterns(
        set(patterns.values), wednesday_state.shapes, wednesday_state.feed.stops
    )
    report = check_build(
        _bundle(wednesday_state),
        wednesday_state.day,
        patterns,
        projections,
        shapes,
        anomaly_tolerance=1.0,
    )
    assert report.anomalies["shape_length"] == 0


def test_counts_must_match_the_direct_count(wednesday_state: PipelineState) -> None:
    state = wednesday_state
    patterns = trip_patterns(state.day)
    projections = project_patterns(set(patterns.values), state.shapes, state.feed.stops)
    bundle = _bundle(state)
    forged = bundle.stats.__class__(
        **{**bundle.stats.__dict__, "total_trips": bundle.stats.total_trips + 1}
    )
    forged_bundle = bundle.__class__(**{**bundle.__dict__, "stats": forged})
    report = check_build(
        forged_bundle, state.day, patterns, projections, state.shapes, anomaly_tolerance=1.0
    )
    assert not report.ok
    assert any("trips" in message for message in report.blocking)


def test_oversized_slice_is_blocking(wednesday_state: PipelineState) -> None:
    report = _build_report(wednesday_state, anomaly_tolerance=1.0, max_slice_bytes=10)
    assert not report.ok
    assert any("slice" in message for message in report.blocking)


def test_written_day_passes_file_checks(wednesday_state: PipelineState, tmp_path: Path) -> None:
    write_day(_bundle(wednesday_state), tmp_path)
    report = check_day_dir(tmp_path / "2026-09-09")
    assert report.ok, report.blocking


def test_missing_or_unlisted_slice_is_blocking(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    write_day(_bundle(wednesday_state), tmp_path)
    day_dir = tmp_path / "2026-09-09"
    listed = sorted((day_dir / "slices").iterdir())[0]
    listed.rename(day_dir / "slices" / "99-ghost.bin")
    report = check_day_dir(day_dir)
    assert not report.ok
    assert any(listed.name in message for message in report.blocking)
    assert any("99-ghost.bin" in message for message in report.blocking)


def test_corrupted_slice_is_blocking(wednesday_state: PipelineState, tmp_path: Path) -> None:
    write_day(_bundle(wednesday_state), tmp_path)
    day_dir = tmp_path / "2026-09-09"
    target = sorted((day_dir / "slices").iterdir())[0]
    target.write_bytes(target.read_bytes()[:-4])
    report = check_day_dir(day_dir)
    assert not report.ok
    assert any(target.name in message for message in report.blocking)


def test_malformed_manifest_is_blocking(wednesday_state: PipelineState, tmp_path: Path) -> None:
    write_day(_bundle(wednesday_state), tmp_path)
    day_dir = tmp_path / "2026-09-09"
    manifest = json.loads((day_dir / "manifest.json").read_text(encoding="utf-8"))
    manifest["per_minute"]["vehicles"]["metro"] = [0, 1, 2]
    (day_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    report = check_day_dir(day_dir)
    assert not report.ok
    assert any("per_minute" in message for message in report.blocking)


def _coverage_report(bundle: DayBundle, state: PipelineState) -> CheckReport:
    patterns = trip_patterns(state.day)
    projections = project_patterns(set(patterns.values), state.shapes, state.feed.stops)
    return check_build(
        bundle, state.day, patterns, projections, state.shapes, anomaly_tolerance=1.0
    )


def test_a_day_with_coverage_passes_the_build_and_file_checks(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    bundle = _bundle_with_coverage(wednesday_state)
    report = _coverage_report(bundle, wednesday_state)
    assert report.ok, report.blocking
    assert bundle.coverage is not None
    assert report.info["coverage_cells"] == bundle.coverage.classes.shape[1]
    write_day(bundle, tmp_path)
    verdict = check_day_dir(tmp_path / "2026-09-09")
    assert verdict.ok, verdict.blocking


def test_coverage_that_loses_residents_is_blocking(wednesday_state: PipelineState) -> None:
    bundle = _bundle_with_coverage(wednesday_state)
    assert bundle.coverage is not None
    region = replace(bundle.coverage.region, residents=2000)
    broken = replace(bundle, coverage=replace(bundle.coverage, region=region))
    report = _coverage_report(broken, wednesday_state)
    assert any("coverage" in message and "3000" in message for message in report.blocking)


def test_a_missing_coverage_file_is_blocking(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    manifest = write_day(_bundle_with_coverage(wednesday_state), tmp_path)
    stats = json.loads((tmp_path / manifest["coverage"]).read_text(encoding="utf-8"))
    (tmp_path / stats["hours_file"]).unlink()
    report = check_day_dir(tmp_path / "2026-09-09")
    assert not report.ok
    assert any("hours_file" in message for message in report.blocking)


def test_coverage_hours_that_disagree_with_the_cells_are_blocking(
    wednesday_state: PipelineState, tmp_path: Path
) -> None:
    bundle = _bundle_with_coverage(wednesday_state)
    manifest = write_day(bundle, tmp_path)
    stats = json.loads((tmp_path / manifest["coverage"]).read_text(encoding="utf-8"))
    assert bundle.coverage is not None
    short = replace(
        bundle.coverage,
        classes=bundle.coverage.classes[:, 1:],
        departures=bundle.coverage.departures[:, 1:],
    )
    (tmp_path / stats["hours_file"]).write_bytes(encode_coverage_hours(short))
    report = check_day_dir(tmp_path / "2026-09-09")
    assert any("drawn cells" in message for message in report.blocking)


def test_missing_manifest_is_blocking(tmp_path: Path) -> None:
    (tmp_path / "2026-09-09").mkdir()
    report = check_day_dir(tmp_path / "2026-09-09")
    assert not report.ok
    assert any("manifest" in message for message in report.blocking)


def test_report_renders_as_text(wednesday_state: PipelineState) -> None:
    report = _build_report(wednesday_state, anomaly_tolerance=1.0)
    text = report.render()
    assert "OK" in text
    assert "block_overlap" in text


@pytest.mark.parametrize("key", ["stop_offset", "stop_order", "time_repaired"])
def test_every_anomaly_key_is_present(wednesday_state: PipelineState, key: str) -> None:
    assert key in _build_report(wednesday_state, anomaly_tolerance=1.0).anomalies

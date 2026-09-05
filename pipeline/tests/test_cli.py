"""Command line tests, milestone M0: version reporting and default help."""

import json
from pathlib import Path

import pytest
from tests.conftest import SAMPLE_TABLES, gtfs_zip_bytes

from stibviz import __version__
from stibviz.cli import main


def test_version_flag_prints_version_and_exits_zero(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        main(["--version"])
    assert exc.value.code == 0
    assert capsys.readouterr().out.strip() == f"stibviz {__version__}"


def test_no_arguments_prints_help_and_succeeds(capsys: pytest.CaptureFixture[str]) -> None:
    assert main([]) == 0
    out = capsys.readouterr().out
    assert "stibviz" in out
    assert "--version" in out


# --- Milestone M1 commands -----------------------------------------------------------------

WEDNESDAY_ARGS = ["--date", "2026-09-09"]


def _build(sample_gtfs_zip: Path, out: Path, *extra: str) -> int:
    return main(
        ["build", "--gtfs", str(sample_gtfs_zip), *WEDNESDAY_ARGS, "--out", str(out), *extra]
    )


def test_build_writes_a_day_and_reports_ok(
    sample_gtfs_zip: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    out = tmp_path / "data"
    assert _build(sample_gtfs_zip, out, "--anomaly-tolerance", "1") == 0
    manifest = json.loads((out / "2026-09-09" / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["totals"]["trips"] == 9
    assert (out / "index.json").is_file()
    assert "OK" in capsys.readouterr().out


def test_blocked_day_is_not_written_and_fails(
    sample_gtfs_zip: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    out = tmp_path / "data"
    assert _build(sample_gtfs_zip, out) == 1  # default tolerance blocks the synthetic day
    assert not (out / "2026-09-09").exists()
    assert "BLOCKED" in capsys.readouterr().out


def test_build_refuses_a_date_outside_the_feed(
    sample_gtfs_zip: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = main(
        ["build", "--gtfs", str(sample_gtfs_zip), "--date", "2026-10-01", "--out", str(tmp_path)]
    )
    assert code == 1
    assert "2026-10-01" in capsys.readouterr().err


def test_check_command_reports_on_a_written_day(sample_gtfs_zip: Path, tmp_path: Path) -> None:
    out = tmp_path / "data"
    _build(sample_gtfs_zip, out, "--anomaly-tolerance", "1")
    assert main(["check", "--day", str(out / "2026-09-09")]) == 0
    (out / "2026-09-09" / "manifest.json").unlink()
    assert main(["check", "--day", str(out / "2026-09-09")]) == 1


def test_index_command_lists_the_written_days(sample_gtfs_zip: Path, tmp_path: Path) -> None:
    out = tmp_path / "data"
    _build(sample_gtfs_zip, out, "--anomaly-tolerance", "1")
    (out / "index.json").unlink()
    assert main(["index", "--data", str(out), "--gtfs", str(sample_gtfs_zip)]) == 0
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    assert [d["date"] for d in index["days"]] == ["2026-09-09"]


def test_fetch_command_uses_the_cache_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    body = gtfs_zip_bytes(SAMPLE_TABLES)

    def fake(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
        return 200, {"ETag": '"x"'}, body

    monkeypatch.setattr("stibviz.fetch._urllib_transport", fake)
    assert main(["fetch", "--url", "https://example.invalid/g.zip", "--out", str(tmp_path)]) == 0
    assert (tmp_path / "gtfs.zip").read_bytes() == body


def test_fetch_failure_returns_1(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr("stibviz.fetch._urllib_transport", lambda url, headers: (500, {}, b""))
    assert main(["fetch", "--url", "https://example.invalid/g.zip", "--out", str(tmp_path)]) == 1
    assert "500" in capsys.readouterr().err


def test_build_removes_a_day_whose_files_fail_the_checks(
    sample_gtfs_zip: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from stibviz.checks import CheckReport

    monkeypatch.setattr("stibviz.cli.check_day_dir", lambda day: CheckReport(blocking=["boom"]))
    out = tmp_path / "data"
    assert _build(sample_gtfs_zip, out, "--anomaly-tolerance", "1") == 1
    assert not (out / "2026-09-09").exists()

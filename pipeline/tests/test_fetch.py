"""Downloading the GTFS feed: conditional requests, digest, archive validation."""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from pathlib import Path

import pytest
from tests.conftest import SAMPLE_TABLES, gtfs_zip_bytes

from stibviz import fetch as fetch_module
from stibviz.fetch import (
    FetchError,
    FetchResult,
    fetch_gtfs,
    uncompressed_size,
    validate_archive,
)

URL = "https://example.invalid/gtfs.zip"


class FakeServer:
    """A transport double that answers like the portal: 200 with an ETag, or 304 when it matches."""

    def __init__(self, body: bytes, etag: str = '"v1"', status: int = 200) -> None:
        self.body = body
        self.etag = etag
        self.status = status
        self.requests: list[dict[str, str]] = []

    def __call__(self, url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
        assert url == URL
        self.requests.append(dict(headers))
        if self.status != 200:
            return self.status, {}, b""
        if headers.get("If-None-Match") == self.etag:
            return 304, {"ETag": self.etag}, b""
        return 200, {"ETag": self.etag}, self.body


@pytest.fixture
def body() -> bytes:
    return gtfs_zip_bytes(SAMPLE_TABLES)


def test_first_fetch_downloads_and_records_metadata(tmp_path: Path, body: bytes) -> None:
    server = FakeServer(body)
    result = fetch_gtfs(URL, tmp_path, transport=server)
    assert isinstance(result, FetchResult)
    assert result.changed
    assert result.path == tmp_path / "gtfs.zip"
    assert result.path.read_bytes() == body
    assert result.etag == '"v1"'
    assert result.sha256 == hashlib.sha256(body).hexdigest()
    assert result.size == len(body)
    meta = json.loads((tmp_path / "gtfs.json").read_text(encoding="utf-8"))
    assert meta["etag"] == '"v1"' and meta["sha256"] == result.sha256 and meta["url"] == URL
    assert "If-None-Match" not in server.requests[0]
    assert "stib-viz" in server.requests[0]["User-Agent"]


def test_second_fetch_sends_the_etag_and_keeps_the_cached_file(tmp_path: Path, body: bytes) -> None:
    server = FakeServer(body)
    first = fetch_gtfs(URL, tmp_path, transport=server)
    second = fetch_gtfs(URL, tmp_path, transport=server)
    assert server.requests[1]["If-None-Match"] == '"v1"'
    assert not second.changed
    assert second.sha256 == first.sha256
    assert second.path.read_bytes() == body


def test_a_new_version_replaces_the_cached_file(tmp_path: Path, body: bytes) -> None:
    fetch_gtfs(URL, tmp_path, transport=FakeServer(body, etag='"v1"'))
    feed_info = SAMPLE_TABLES["feed_info.txt"].replace("test_2026", "test_2027")
    other = gtfs_zip_bytes({**SAMPLE_TABLES, "feed_info.txt": feed_info})
    result = fetch_gtfs(URL, tmp_path, transport=FakeServer(other, etag='"v2"'))
    assert result.changed and result.etag == '"v2"'
    assert (tmp_path / "gtfs.zip").read_bytes() == other


def test_http_error_is_reported(tmp_path: Path, body: bytes) -> None:
    with pytest.raises(FetchError, match="503"):
        fetch_gtfs(URL, tmp_path, transport=FakeServer(body, status=503))
    assert not (tmp_path / "gtfs.zip").exists()


def test_body_that_is_not_a_zip_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(FetchError, match="zip"):
        fetch_gtfs(URL, tmp_path, transport=FakeServer(b"<html>maintenance</html>"))


def test_zip_missing_a_required_file_is_rejected(tmp_path: Path) -> None:
    tables = {k: v for k, v in SAMPLE_TABLES.items() if k != "stop_times.txt"}
    with pytest.raises(FetchError, match=r"stop_times.txt"):
        fetch_gtfs(URL, tmp_path, transport=FakeServer(gtfs_zip_bytes(tables)))


def test_zip_with_an_escaping_path_is_rejected(tmp_path: Path, body: bytes) -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(body)) as source, zipfile.ZipFile(buffer, "w") as target:
        for name in source.namelist():
            target.writestr(name, source.read(name))
        target.writestr("../evil.txt", "x")
    with pytest.raises(FetchError, match="path"):
        fetch_gtfs(URL, tmp_path, transport=FakeServer(buffer.getvalue()))


def test_a_rejected_download_does_not_clobber_the_previous_file(
    tmp_path: Path, body: bytes
) -> None:
    fetch_gtfs(URL, tmp_path, transport=FakeServer(body))
    with pytest.raises(FetchError):
        fetch_gtfs(URL, tmp_path, transport=FakeServer(b"broken", etag='"v2"'))
    assert (tmp_path / "gtfs.zip").read_bytes() == body


def test_the_expanded_size_is_measured_rather_than_taken_from_the_archive(body: bytes) -> None:
    # The per-member sizes are the archive's own word; a crafted feed can under-report them.
    archive = zipfile.ZipFile(io.BytesIO(body))
    with pytest.raises(FetchError, match="expands"):
        uncompressed_size(archive, 10)
    assert uncompressed_size(archive, 10_000_000) > 10


def test_a_download_beyond_the_size_cap_is_refused(
    monkeypatch: pytest.MonkeyPatch, body: bytes
) -> None:
    monkeypatch.setattr(fetch_module, "MAX_DOWNLOAD_BYTES", 10)
    with pytest.raises(FetchError, match="larger than"):
        validate_archive(body)

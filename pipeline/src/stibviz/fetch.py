"""Downloading the GTFS feed with an ETag cache and archive validation.

ARCHITECTURE.md, step 1. The portal publishes a new archive every morning; most nights nothing
changed. A conditional request with the cached ETag costs one round trip and no download when
the feed is the same. The archive is validated before it replaces the cached one: it must be a
zip, hold the files the pipeline needs, and contain no member whose name escapes the directory
it would be extracted to.

The HTTP transport is injectable so tests never touch the network.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import io
import json
import urllib.error
import urllib.request
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from stibviz.gtfs import REQUIRED_FILES

USER_AGENT = "stib-viz pipeline (+https://github.com/Resadan-dev/stib-viz)"
TIMEOUT_S = 120
# A GTFS archive for one city is tens of megabytes uncompressed; anything near this is not one.
MAX_UNCOMPRESSED_BYTES = 2_000_000_000

Transport = Callable[[str, dict[str, str]], tuple[int, dict[str, str], bytes]]


class FetchError(RuntimeError):
    """The feed could not be downloaded or is not a usable GTFS archive."""


@dataclass(frozen=True)
class FetchResult:
    path: Path
    etag: str | None
    sha256: str
    size: int
    changed: bool


def validate_archive(body: bytes) -> None:
    """Raise :class:`FetchError` unless ``body`` is a safe, complete GTFS zip."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(body))
    except zipfile.BadZipFile as exc:
        raise FetchError("the download is not a zip archive") from exc
    with archive:
        members = archive.infolist()
        for member in members:
            parts = PurePosixPath(member.filename).parts
            if member.filename.startswith(("/", "\\")) or ".." in parts or ":" in member.filename:
                raise FetchError(f"archive member with an unsafe path: {member.filename!r}")
        names = {PurePosixPath(m.filename).name for m in members if not m.is_dir()}
        missing = sorted(set(REQUIRED_FILES) - names)
        if missing:
            raise FetchError(f"archive is missing {', '.join(missing)}")
        total = sum(m.file_size for m in members)
        if total > MAX_UNCOMPRESSED_BYTES:
            raise FetchError(f"archive expands to {total} bytes, more than allowed")


def _urllib_transport(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as exc:
        # 304 Not Modified arrives here as an "error"; so do real failures.
        return exc.code, dict(exc.headers), b""
    except urllib.error.URLError as exc:
        raise FetchError(f"network error while downloading {url}: {exc.reason}") from exc


def _header(headers: dict[str, str], name: str) -> str | None:
    for key, value in headers.items():
        if key.lower() == name.lower():
            return value
    return None


def fetch_gtfs(url: str, cache_dir: Path, transport: Transport | None = None) -> FetchResult:
    """Download the feed into ``cache_dir/gtfs.zip`` unless the cached copy is still current."""
    send = transport or _urllib_transport
    cache_dir.mkdir(parents=True, exist_ok=True)
    zip_path = cache_dir / "gtfs.zip"
    meta_path = cache_dir / "gtfs.json"

    meta = None
    if zip_path.is_file() and meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))

    headers = {"User-Agent": USER_AGENT, "Accept": "application/zip, application/octet-stream"}
    if meta and meta.get("etag"):
        headers["If-None-Match"] = meta["etag"]

    status, response_headers, body = send(url, headers)
    if status == 304 and meta:
        return FetchResult(
            path=zip_path,
            etag=meta.get("etag"),
            sha256=meta["sha256"],
            size=zip_path.stat().st_size,
            changed=False,
        )
    if status != 200:
        raise FetchError(f"HTTP {status} when downloading {url}")

    validate_archive(body)
    digest = hashlib.sha256(body).hexdigest()
    etag = _header(response_headers, "ETag")
    partial = zip_path.with_name(zip_path.name + ".part")
    partial.write_bytes(body)
    partial.replace(zip_path)
    meta_path.write_text(
        json.dumps(
            {
                "url": url,
                "etag": etag,
                "sha256": digest,
                "size": len(body),
                "fetched_at": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
        ),
        encoding="utf-8",
    )
    return FetchResult(path=zip_path, etag=etag, sha256=digest, size=len(body), changed=True)

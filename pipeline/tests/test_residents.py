"""The reference of residents: Statbel sectors and population to a grid, borders and labels.

The fixture is a small Statbel look-alike in Lambert 2008 metres around central Brussels:
municipality 21001 is two squares side by side, A1 and A2, sharing one edge; municipality 21002
is B1, a rectangle along their top, plus T, an island smaller than one cell; one Flemish sector
and a row of unlocated residents must both be left out.

    y=800  +---------------------------+
           |            B1             |       T (10 m square) at (+1000, +1000)
    y=400  +-------------+-------------+
           |     A1      |     A2      |
    y=0    +-------------+-------------+
          x=0          x=400         x=800     (metres east and north of ORIGIN)
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import numpy as np
import pytest

from stibviz.cli import main
from stibviz.lambert2008 import to_lambert2008
from stibviz.residents import (
    CELL_MERCATOR_M,
    DEFAULT_REFERENCE,
    Reference,
    ReferenceError,
    build_reference,
    load_reference,
    read_statbel_population,
    read_statbel_sectors,
    write_reference,
)

ORIGIN = (649_000.0, 670_000.0)
POPULATION = {"21001A1": 100, "21001A2": 60, "21002B1": 400, "21002T": 5}


def _ring(*points: tuple[float, float]) -> list[list[float]]:
    ring = [[ORIGIN[0] + x, ORIGIN[1] + y] for x, y in points]
    return [*ring, ring[0]]


def _feature(code: str, rings: list[list[list[float]]], fr: str, nl: str) -> dict:
    return {
        "type": "Feature",
        "properties": {
            "cd_sector": code,
            "cd_munty_refnis": code[:5],
            "tx_munty_descr_fr": fr,
            "tx_munty_descr_nl": nl,
            "tx_sector_descr_fr": f"SECTOR {code}",
            "dt_situation": "2026-01-01",
        },
        "geometry": {"type": "Polygon", "coordinates": rings},
    }


ANDERLECHT = ("Anderlecht", "Anderlecht")
AUDERGHEM = ("Auderghem", "Oudergem")
FEATURES = [
    _feature("21001A1", [_ring((0, 0), (400, 0), (400, 400), (0, 400))], *ANDERLECHT),
    _feature("21001A2", [_ring((400, 0), (800, 0), (800, 400), (400, 400))], *ANDERLECHT),
    _feature(
        "21002B1", [_ring((0, 400), (400, 400), (800, 400), (800, 800), (0, 800))], *AUDERGHEM
    ),
    _feature("21002T", [_ring((1000, 1000), (1010, 1000), (1010, 1010), (1000, 1010))], *AUDERGHEM),
    _feature(
        "23002F1", [_ring((-900, 0), (-500, 0), (-500, 400), (-900, 400))], "Wemmel", "Wemmel"
    ),
]


def _sectors_zip(folder: Path, features: list[dict], crs: str = "EPSG::3812") -> Path:
    """One feature per line, as Statbel writes its national file."""
    lines = [
        "{",
        '"type": "FeatureCollection",',
        '"name": "sh_statbel_statistical_sectors_3812_20260101",',
        f'"crs": {{ "type": "name", "properties": {{ "name": "urn:ogc:def:crs:{crs}" }} }},',
        '"features": [',
        ",\n".join(json.dumps(feature) for feature in features),
        "]",
        "}",
    ]
    path = folder / "sectors.geojson.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("sectors/sectors.geojson", "\n".join(lines))
        archive.writestr("sectors/Licence open data_FR.pdf", b"%PDF")
    return path


def _population_zip(folder: Path, name: str = "OPENDATA_SECTOREN_2025_NEW") -> Path:
    header = (
        "CD_REFNIS|CD_SECTOR|TOTAL|DT_STRT_SECTOR|DT_STOP_SECTOR|OPPERVLAKKTE IN HM²|"
        "TX_DESCR_SECTOR_NL|TX_DESCR_SECTOR_FR|TX_DESCR_NL|TX_DESCR_FR"
    )
    rows = {**POPULATION, "21001ZZZZ": 7, "23002F1": 50}
    body = [f"{code[:5]}|{code}|{n}|01/01/2025|31/12/9999|1,5|x|x|x|x" for code, n in rows.items()]
    path = folder / f"{name}.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(f"{name}.txt", "\n".join([header, *body]).encode("cp1252"))
    return path


@pytest.fixture
def reference(tmp_path: Path) -> Reference:
    sectors = read_statbel_sectors(_sectors_zip(tmp_path, FEATURES))
    population = read_statbel_population(_population_zip(tmp_path))
    return build_reference(sectors, population, sources={"test": "fixture"})


def _lambert(lon: np.ndarray, lat: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    x, y = to_lambert2008(lon, lat)
    return x - ORIGIN[0], y - ORIGIN[1]


def _length_m(lon: np.ndarray, lat: np.ndarray) -> float:
    x, y = _lambert(lon, lat)
    return float(np.hypot(np.diff(x), np.diff(y)).sum())


# --- Reading Statbel ----------------------------------------------------------------------------


def test_read_statbel_sectors_keeps_the_brussels_sectors(tmp_path: Path) -> None:
    sectors = read_statbel_sectors(_sectors_zip(tmp_path, FEATURES))
    assert [s.code for s in sectors] == ["21001A1", "21001A2", "21002B1", "21002T"]
    assert {s.municipality: (s.name_fr, s.name_nl) for s in sectors} == {
        "21001": ("Anderlecht", "Anderlecht"),
        "21002": ("Auderghem", "Oudergem"),
    }
    assert sectors[0].situation == "2026-01-01"
    assert sectors[2].rings[0].shape == (6, 2)


def test_read_statbel_sectors_refuses_another_projection(tmp_path: Path) -> None:
    with pytest.raises(ReferenceError, match="3812"):
        read_statbel_sectors(_sectors_zip(tmp_path, FEATURES, crs="EPSG::31370"))


def test_read_statbel_sectors_refuses_an_archive_without_geojson(tmp_path: Path) -> None:
    path = tmp_path / "empty.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("readme.txt", "nothing here")
    with pytest.raises(ReferenceError, match="GeoJSON"):
        read_statbel_sectors(path)


def test_read_statbel_population_sets_the_unlocated_apart(tmp_path: Path) -> None:
    population = read_statbel_population(_population_zip(tmp_path))
    assert population.residents == POPULATION
    assert population.unlocated == 7
    assert population.reference_date == "2025-01-01"


def test_read_statbel_population_needs_its_columns(tmp_path: Path) -> None:
    path = tmp_path / "OPENDATA_SECTOREN_2025_NEW.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("x.txt", "CD_SECTOR|SOMETHING\n21001A1|3".encode("cp1252"))
    with pytest.raises(ReferenceError, match="TOTAL"):
        read_statbel_population(path)


# --- Building the reference ---------------------------------------------------------------------


def test_every_located_resident_is_on_the_grid(reference: Reference) -> None:
    assert reference.cell_residents().sum() == pytest.approx(565)
    assert reference.unlocated == 7


def test_a_sector_shares_its_residents_evenly_among_its_cells(reference: Reference) -> None:
    a1 = reference.sector_codes.index("21001A1")
    cells = reference.cell_sector == a1
    residents = reference.cell_residents()[cells]
    assert np.allclose(residents, 100 / cells.sum())
    # A 400 m square holds about 64 cells of 50 m.
    assert 50 <= cells.sum() <= 80


def test_a_sector_smaller_than_a_cell_keeps_its_residents(reference: Reference) -> None:
    island = reference.sector_codes.index("21002T")
    assert reference.cell_residents()[reference.cell_sector == island].sum() == pytest.approx(5)


def test_the_grid_sits_on_whole_cells(reference: Reference) -> None:
    grid = reference.grid
    assert grid.cell_m == pytest.approx(CELL_MERCATOR_M)
    assert grid.x0 / grid.cell_m == pytest.approx(round(grid.x0 / grid.cell_m))
    assert grid.y0 / grid.cell_m == pytest.approx(round(grid.y0 / grid.cell_m))
    assert np.all(np.diff(reference.cell_index) >= 0)


def test_cell_centres_fall_inside_their_sector(reference: Reference) -> None:
    lon, lat = reference.cell_centres()
    x, y = _lambert(lon, lat)
    a2 = reference.sector_codes.index("21001A2")
    inside = reference.cell_sector == a2
    assert np.all((x[inside] > 400) & (x[inside] < 800) & (y[inside] > 0) & (y[inside] < 400))


def test_municipalities_carry_their_names_and_residents(reference: Reference) -> None:
    assert [(m.code, m.name_fr, m.name_nl, m.residents) for m in reference.municipalities] == [
        ("21001", "Anderlecht", "Anderlecht", 160),
        ("21002", "Auderghem", "Oudergem", 405),
    ]


def test_borders_leave_out_the_edges_inside_a_municipality(reference: Reference) -> None:
    # A1 and A2 share x=400 between y=0 and y=400; no border may run along it.
    for border in reference.borders:
        x, y = _lambert(border.lon, border.lat)
        middle = (np.abs(x - 400) < 1) & (y > 1) & (y < 399)
        assert not middle.any()


def test_each_border_is_stored_once_with_the_municipalities_it_separates(
    reference: Reference,
) -> None:
    shared = [b for b in reference.borders if b.municipalities == (0, 1)]
    assert sum(_length_m(b.lon, b.lat) for b in shared) == pytest.approx(800, rel=1e-3)
    outer_a = [b for b in reference.borders if b.municipalities == (0,)]
    # Anderlecht's outline is 2,400 m, of which 800 m are shared with Auderghem.
    assert sum(_length_m(b.lon, b.lat) for b in outer_a) == pytest.approx(1600, rel=1e-3)
    outer_b = [b for b in reference.borders if b.municipalities == (1,)]
    # Auderghem: the rest of B1's outline, 1,600 m, and the island's 40 m.
    assert sum(_length_m(b.lon, b.lat) for b in outer_b) == pytest.approx(1640, rel=1e-3)


def test_the_borders_of_each_municipality_close_into_rings(reference: Reference) -> None:
    # Three stretches may meet at a junction; around any one municipality, ends come in pairs.
    for m in range(len(reference.municipalities)):
        ends: dict[tuple[float, float], int] = {}
        for border in reference.borders:
            if m not in border.municipalities:
                continue
            for lon, lat in ((border.lon[0], border.lat[0]), (border.lon[-1], border.lat[-1])):
                key = (round(float(lon), 7), round(float(lat), 7))
                ends[key] = ends.get(key, 0) + 1
        assert ends and all(count % 2 == 0 for count in ends.values())


def test_names_sit_inside_their_municipality(reference: Reference) -> None:
    lon = np.array([m.label[0] for m in reference.municipalities])
    lat = np.array([m.label[1] for m in reference.municipalities])
    x, y = _lambert(lon, lat)
    assert 0 < x[0] < 800 and 0 < y[0] < 400
    assert 0 < x[1] < 800 and 400 < y[1] < 800


# --- The reference file -------------------------------------------------------------------------


def test_the_reference_round_trips_through_its_file(reference: Reference, tmp_path: Path) -> None:
    path = tmp_path / "reference.json"
    assert write_reference(reference, path) == path.stat().st_size
    loaded = load_reference(path)
    assert loaded.grid == reference.grid
    assert loaded.municipalities == reference.municipalities
    assert np.array_equal(loaded.cell_index, reference.cell_index)
    assert np.array_equal(loaded.cell_sector, reference.cell_sector)
    assert np.allclose(loaded.cell_residents(), reference.cell_residents())
    assert [b.municipalities for b in loaded.borders] == [
        b.municipalities for b in reference.borders
    ]
    assert loaded.sources == reference.sources


def test_load_reference_refuses_an_unknown_format(tmp_path: Path) -> None:
    path = tmp_path / "reference.json"
    path.write_text(json.dumps({"format": 99}), encoding="utf-8")
    with pytest.raises(ReferenceError, match="format"):
        load_reference(path)


def test_the_committed_reference_holds_the_nineteen_municipalities() -> None:
    reference = load_reference(DEFAULT_REFERENCE)
    codes = [m.code for m in reference.municipalities]
    assert codes == [f"210{n:02d}" for n in range(1, 20)]
    assert reference.cell_residents().sum() == pytest.approx(
        sum(m.residents for m in reference.municipalities)
    )
    assert sum(m.residents for m in reference.municipalities) > 1_000_000


def test_the_residents_command_writes_the_reference(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    out = tmp_path / "reference.json"
    code = main(
        [
            "residents",
            "--sectors",
            str(_sectors_zip(tmp_path, FEATURES)),
            "--population",
            str(_population_zip(tmp_path)),
            "--out",
            str(out),
        ]
    )
    assert code == 0
    loaded = load_reference(out)
    assert loaded.municipalities[1].name_nl == "Oudergem"
    assert loaded.sources["population_date"] == "2025-01-01"
    assert loaded.sources["attribution"] == "Source: Statbel (modified)"
    assert "2 municipalities" in capsys.readouterr().out


def test_the_residents_command_reports_a_file_it_cannot_use(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = main(
        [
            "residents",
            "--sectors",
            str(_sectors_zip(tmp_path, FEATURES, crs="EPSG::31370")),
            "--population",
            str(_population_zip(tmp_path)),
            "--out",
            str(tmp_path / "reference.json"),
        ]
    )
    assert code == 1
    assert "3812" in capsys.readouterr().err
    assert not (tmp_path / "reference.json").exists()


def test_statbel_text_is_read_as_windows_1252(tmp_path: Path) -> None:
    raw = io.BytesIO()
    with zipfile.ZipFile(raw, "w") as archive:
        text = "CD_REFNIS|CD_SECTOR|TOTAL|OPPERVLAKKTE IN HM²\n21001|21001A1|12|1,5"
        archive.writestr("OPENDATA_SECTOREN_2024_NEW.txt", text.encode("cp1252"))
    path = tmp_path / "OPENDATA_SECTOREN_2024_NEW.zip"
    path.write_bytes(raw.getvalue())
    population = read_statbel_population(path)
    assert population.residents == {"21001A1": 12}
    assert population.reference_date == "2024-01-01"

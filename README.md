# stib-viz — Brussels in motion

A night-time map of Brussels where you watch, minute by minute, every STIB metro, tram and bus run
according to the scheduled timetable of one service day. A static site, rebuilt every night from
the open data published on the Belgian Mobility portal.

Inspired by [france-rail-traffic](https://github.com/magrinj/france-rail-traffic).

**Status: milestone M1 (one day).** The pipeline turns the GTFS feed into the data files the
site will consume, for one service day, and checks them. No animation yet.

## Documents

- [SCOPE.md](SCOPE.md) — version 1 scope, framing decisions, milestones and task checklists.
- [ARCHITECTURE.md](ARCHITECTURE.md) — pipeline, data contract, site, continuous integration.
- [docs/01-exploration.md](docs/01-exploration.md) — initial exploration of the data and of the
  technical options (historical record).
- [SECURITY.md](SECURITY.md) — how to report a vulnerability.

## Layout

- `pipeline/` — Python 3.12, managed by [uv](https://docs.astral.sh/uv/). Turns the STIB GTFS feed
  into the trajectory files the site consumes.
- `web/` — Vite and TypeScript, managed by pnpm 10 (version pinned in `package.json`). The static
  site itself. Its user interface is in French, for a Brussels audience; everything else in this
  repository is in English.
- `.github/workflows/` — continuous integration.

## Requirements

- Node.js 22.12 or later
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (it installs Python 3.12 itself)

## Running the checks

Pipeline:

```bash
cd pipeline
uv sync
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

Site. Without pnpm installed, `npx` fetches the pinned version:

```bash
cd web
npx --yes pnpm@10 install
npx --yes pnpm@10 lint
npx --yes pnpm@10 typecheck
npx --yes pnpm@10 test
npx --yes pnpm@10 build
```

With pnpm available (`corepack enable`, or a direct install), `pnpm install`, `pnpm lint`,
`pnpm typecheck`, `pnpm test` and `pnpm build` are enough. `pnpm dev` starts the development
server.

## Building one day

From `pipeline/`, download the feed (only when it changed), build one service day and check the
written files:

```bash
uv run stibviz fetch --out ../cache
```

```bash
uv run stibviz build --gtfs ../cache/gtfs.zip --date 2026-09-09 --out ../dist/data
```

```bash
uv run stibviz check --day ../dist/data/2026-09-09
```

`build` prints the check report and the figures of the day, and refuses to write a day that fails
a blocking check. `cache/` and `dist/` are ignored by git.

### A note on toolchain versions

ESLint stays on version 9 and TypeScript on 5.9, because ESLint 10 requires Node 22.13 and the
TypeScript ESLint rules do not yet support TypeScript 7. Both move up once the constraints lift.

## Licensing and attribution

Code is released under the [MIT licence](LICENSE).

Data comes from **STIB-MIVB — Open Data**, published on the
[Belgian Mobility](https://data.belgianmobility.io/) portal under CC BY 4.0. The published site
credits the source with its feed date.

The basemap is **OpenFreeMap © OpenMapTiles**, with data from **OpenStreetMap** contributors.

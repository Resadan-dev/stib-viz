# stib-viz — Brussels in motion

A night-time map of Brussels where you watch, minute by minute, every STIB metro, tram and bus run
according to the scheduled timetable of one service day. A static site, rebuilt every night from
the open data published on the Belgian Mobility portal.

**Live at [stib-viz.pages.dev](https://stib-viz.pages.dev/).**

Inspired by [france-rail-traffic](https://github.com/magrinj/france-rail-traffic).

**Status: version 1 complete, milestone M5 closed on 6 September 2026.** The pipeline builds a
rolling week of service days and the site replays any of them: night map, network layer, animated vehicles, clock, day
selector, speeds, per-mode counters and filters, line selection, official colours, a speed map
of the network, vehicle panel
with stepping and follow mode, activity curve doubling as the scrubber, about panel, keyboard
shortcuts and a shareable URL. A nightly workflow rebuilds the rolling week from the feed. On a
phone the control panel is a sheet folded at the bottom of the screen, so the map keeps most of
it.

## Documents

- [SCOPE.md](SCOPE.md) — version 1 scope, framing decisions, milestones and task checklists.
- [ARCHITECTURE.md](ARCHITECTURE.md) — pipeline, data contract, site, continuous integration.
- [docs/01-exploration.md](docs/01-exploration.md) — initial exploration of the data and of the
  technical options (historical record).
- [docs/02-operations.md](docs/02-operations.md) — runbook: reading a nightly run, what to do when
  a day fails, building the window by hand, the budgets to watch.
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
server. `pnpm e2e` runs the Playwright suites against the built site: smoke, interface, the
phone layout, response headers and an axe accessibility audit (see Running the site for the data they expect).

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

## Running the site

The site reads its data from `web/public/data`, which git ignores. From `pipeline/`, build the
rolling week (yesterday to five days ahead) into it with one command, then start the development
server:

```bash
uv run stibviz week --gtfs ../cache/gtfs.zip --out ../web/public/data
```

```bash
cd ../web && npx --yes pnpm@10 dev
```

The week takes about two minutes and 260 MB. `stibviz week --today 2026-09-09` builds the week
around another date, `stibviz build --date 2026-09-09` a single day. Then open
`http://localhost:5173`: the day selector lists what `web/public/data` holds. The URL carries the
whole scene and is rewritten as you play: `d` (day), `t` (civil time `HH:MM`), `s` (speed, 60 to
1200), `m` (visible modes), `l` (selected line), `colours` (`official`), `network` (`speed`, the
speed map of the network), `c` (`lat,lon,zoom`) and `p` (`1` playing, `0` paused). Space plays and pauses, the arrows step one minute (ten with
Shift), the digits 1 to 5 pick a speed (×60 to ×1200) and Escape closes one thing at a time: the line
picker, then the phone sheet, then the selected vehicle.

The Playwright suites run on the **fixture day** in `web/public/data`: the three-route extract
of 11 September 2026, the only data continuous integration ever has. With the real week in place,
the tests that count on the extract skip themselves and say so; the others run on the real data.
To run everything, swap the fixture in from `pipeline/`, run the tests, and build the week again
afterwards:

```bash
uv run stibviz build --gtfs tests/fixtures/gtfs-extract/gtfs.zip --date 2026-09-11 --out ../web/public/data
```

Once, `pnpm e2e:install` downloads the browser; then `pnpm build` and `pnpm e2e` from `web/`.

## Publishing

`pnpm build` writes a self-contained static directory to `web/dist`: the site, its assets and the
data it was built with. Nothing else is needed to serve it, and nothing in the repository assumes
a particular host. How the public instance is hosted is the maintainer's own setup and is not
documented here.

`web/public/_headers` travels with that directory. It carries the cache rules and the security
headers, including the Content-Security-Policy that
[SECURITY.md](SECURITY.md) describes.

### A note on toolchain versions

ESLint stays on version 9 and TypeScript on 5.9, because ESLint 10 requires Node 22.13 and the
TypeScript ESLint rules do not yet support TypeScript 7. Both move up once the constraints lift.

## Licensing and attribution

Code is released under the [MIT licence](LICENSE).

Data comes from **STIB-MIVB — Open Data**, published on the
[Belgian Mobility](https://data.belgianmobility.io/) portal under CC BY 4.0. The published site
credits the source with its feed date.

The basemap is **OpenFreeMap © OpenMapTiles**, with data from **OpenStreetMap** contributors.

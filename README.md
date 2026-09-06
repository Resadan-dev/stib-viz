# stib-viz — Brussels in motion

A night-time map of Brussels where you watch, minute by minute, every STIB metro, tram and bus run
according to the scheduled timetable of one service day. A static site, rebuilt every night from
the open data published on the Belgian Mobility portal.

Inspired by [france-rail-traffic](https://github.com/magrinj/france-rail-traffic).

**Status: milestone M5 (polish) in progress.** The pipeline builds a rolling week of service
days and the site replays any of them: night map, network layer, animated vehicles, clock, day
selector, speeds, per-mode counters and filters, line selection, official colours, vehicle panel
with stepping and follow mode, activity curve doubling as the scrubber, about panel, keyboard
shortcuts and a shareable URL. A nightly workflow rebuilds the week and deploys it to Cloudflare
Pages once the project and its secrets exist (see Deployment). Accessibility and performance are
done; the night style still has to be tuned on the real render before the final review.

## Documents

- [SCOPE.md](SCOPE.md) — version 1 scope, framing decisions, milestones and task checklists.
- [ARCHITECTURE.md](ARCHITECTURE.md) — pipeline, data contract, site, continuous integration.
- [docs/01-exploration.md](docs/01-exploration.md) — initial exploration of the data and of the
  technical options (historical record).
- [docs/02-operations.md](docs/02-operations.md) — runbook: reading a nightly run, what to do when
  a day fails or the deployment breaks, rotating the token, the budgets to watch.
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
server. `pnpm e2e` runs the Playwright suites against the built site: smoke, interface, response
headers and an axe accessibility audit (see Running the site for the data they expect).

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
1200), `m` (visible modes), `l` (selected line), `colours` (`official`), `c` (`lat,lon,zoom`) and
`p` (`1` playing, `0` paused). Space plays and pauses, the arrows step one minute (ten with
Shift), the digits 1 to 5 pick a speed (×60 to ×1200) and Escape closes the vehicle panel.

The Playwright suites run on the **fixture day** in `web/public/data`: the three-route extract
of 11 September 2026, the only data continuous integration ever has. With the real week in place,
the tests that count on the extract skip themselves and say so; the others run on the real data.
To run everything, swap the fixture in from `pipeline/`, run the tests, and build the week again
afterwards:

```bash
uv run stibviz build --gtfs tests/fixtures/gtfs-extract/gtfs.zip --date 2026-09-11 --out ../web/public/data
```

Once, `pnpm e2e:install` downloads the browser; then `pnpm build` and `pnpm e2e` from `web/`.

## Deployment

The `Nightly` workflow (`.github/workflows/nightly.yml`) runs twice a day: it downloads the feed,
plans which days of the rolling week are missing from the published site, builds them, builds the
site and deploys it with wrangler. Without Cloudflare credentials it builds and tests but skips the
deployment, so a fork works out of the box. To publish, once:

1. Create a Cloudflare Pages project with direct upload, for example named `stib-viz`, with `main`
   as its production branch (Workers & Pages, Create, Pages, Upload assets), or from a terminal:

   ```bash
   npx wrangler pages project create stib-viz --production-branch main
   ```

2. Create an API token limited to Cloudflare Pages edits on the account (My Profile, API Tokens,
   Create Token, a custom token with the permission Account, Cloudflare Pages, Edit).
3. In the GitHub repository, add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`,
   and the variables `CLOUDFLARE_PAGES_PROJECT` (the project name) and `SITE_URL` (the site
   address, `https://stib-viz.pages.dev` for the example above).
4. Run the `Nightly` workflow by hand once from the Actions tab; the following runs are scheduled.

The headers Cloudflare Pages serves, cache rules and security headers including the
Content-Security-Policy, live in `web/public/_headers`.

### A note on toolchain versions

ESLint stays on version 9 and TypeScript on 5.9, because ESLint 10 requires Node 22.13 and the
TypeScript ESLint rules do not yet support TypeScript 7. Both move up once the constraints lift.

## Licensing and attribution

Code is released under the [MIT licence](LICENSE).

Data comes from **STIB-MIVB — Open Data**, published on the
[Belgian Mobility](https://data.belgianmobility.io/) portal under CC BY 4.0. The published site
credits the source with its feed date.

The basemap is **OpenFreeMap © OpenMapTiles**, with data from **OpenStreetMap** contributors.

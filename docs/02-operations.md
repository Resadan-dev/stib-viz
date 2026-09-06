# Operations runbook

Date: 6 September 2026. What to look at when a nightly run is red or the published site looks
wrong, and how to do by hand what the workflow does. The workflow itself is described in
[ARCHITECTURE.md](../ARCHITECTURE.md), section 7.2; the one-time setup of the Cloudflare project
and of the GitHub secrets is in the [README](../README.md), section Deployment.

## 1. What a run does

`Nightly` (`.github/workflows/nightly.yml`) runs at 04:45 and 10:45 UTC and on manual dispatch:

1. `stibviz fetch` downloads the feed when its ETag changed, otherwise keeps the cached copy.
2. The published `index.json` is read from `SITE_URL`, when that variable exists.
3. `stibviz week` plans the window (yesterday to five days ahead, within the feed validity).
   Nothing is built when the feed version and every covered day are already published; the
   whole window is rebuilt otherwise, because a deployment replaces the site.
4. Each day is built and checked on its own; a failing day is set aside, the others are written.
5. The site is built with the data, then deployed with wrangler, only when at least one day was
   built and the Cloudflare secrets exist.
6. The run ends red when a day failed, after the valid days reached the site.

## 2. Reading a run

Open the run in the Actions tab and download the `nightly-report` artifact (kept fourteen
days). It holds one line per day of the window and a summary:

```
2026-09-05: built
2026-09-06: FAILED blocked: stop_order: 31 anomalies exceed 0.1% of 24310 trips
2026-09-07: skipped, outside the feed validity
built: 6, failed: 1, skipped: 1
```

The step "Build the week" prints the same lines with the figures of each day: trips, vehicles,
peak, slices, bytes and seconds. A run that had nothing to do prints
`up to date: feed <version> and every covered day published` and ends within a minute, green.

| Outcome | Meaning |
|---|---|
| Green, "up to date" | Feed unchanged and every day published; the site was not touched |
| Green, days built, deployment ran | The window was rebuilt and published |
| Green, days built, deployment skipped | No Cloudflare secrets: a fork or a fresh clone |
| Red at "Fetch the feed" | The portal did not answer; nothing else ran, the site is unchanged |
| Red at "Fail if a day failed" | At least one day failed its checks; the other days were deployed |
| Red at "Deploy to Cloudflare Pages" | The data is fine; the token, the account id or the project name is not |

## 3. When something goes wrong

**The fetch failed.** The Belgian Mobility portal is unreachable or answered an error. The site
keeps the days it has. The 10:45 run retries; dispatch the workflow by hand once the portal is
back. Nothing to fix in the repository unless the feed URL moved, in which case
`DEFAULT_GTFS_URL` in `pipeline/src/stibviz/cli.py` follows it, with its test.

**One day failed.** The report line names the blocking check. Reproduce it locally, from
`pipeline/`, with the same feed:

```bash
uv run stibviz fetch --out ../cache
```

```bash
uv run stibviz build --gtfs ../cache/gtfs.zip --date 2026-09-06 --out ../dist/data
```

`build` prints the check report, then either `written:` and the figures, or `build failed:` and
the reason. A day fails in one of three ways, and the message says which:

- the build itself raised: the date is outside the feed (`DateNotCoveredError`), or a trip
  pattern references a shape or a stop the feed does not define (`ShapeError`);
- `blocked:` followed by the checks of `pipeline/src/stibviz/checks.py` that failed: trip,
  vehicle or peak counts that disagree with the manifest, a slice or a day above its byte budget,
  a route without name or colour, shape lengths that differ from `shape_dist_traveled` by over
  1%, a median stop offset above the threshold, or a per-object anomaly counter above 0.1% of the
  trips (stop offset, stop order, truncation after 28:00, trips dropped before or after the span,
  trips without stop times, overlapping blocks);
- `written files failed their checks:` the files on disk do not match their manifest; the day
  directory is removed. This one points at a bug in `encode.py`, not at the feed.

Two ways out of a `blocked:` day:

- The feed is wrong for that day only, and the anomaly is harmless on the map: build the day
  locally with a relaxed threshold, `--anomaly-tolerance 0.005` for example, and look at it. The
  workflow has no such switch on purpose: the day stays out of the site and the run stays red
  until the feed is fixed upstream, while the other days are published. If the day matters more
  than the rule, the switch is a `workflow_dispatch` input to add to `nightly.yml` and pass to
  `stibviz week`, for that dispatch only.
- The pipeline mishandles a legitimate case: write the failing case as a test in
  `pipeline/tests/`, fix the code, and let the next run rebuild the window.

Never raise the default tolerance in `checks.py` to make a run green: the check exists so that an
aberrant trip cannot deprive the site of a whole day silently, and the 0.1% share was chosen so
that the real feed passes it with margin.

**Every day failed.** Nothing was deployed and the live site is untouched; the report says why.
Almost always a change in the feed that the readers do not expect (a new column, a missing file,
a route type): `uv run pytest` and a local `build` show it. Fix with a test, then dispatch.

**The deployment failed.** `wrangler` could not publish: the token expired or was revoked, the
account id is wrong, or the project name in `CLOUDFLARE_PAGES_PROJECT` does not exist. The step
log says which. Follow section 5 to replace the token, then dispatch the workflow: the week is
rebuilt, in under three minutes, because the published index still lists the old feed version
or the old days.

**The site shows an old week.** `index.json` is served without caching and the day files with
a one-hour cache (`web/public/_headers`), so a fresh deployment appears within the hour at
worst. Check the run first: a green "up to date" run means the published index already listed
the window, so the site is what the workflow believes it is; compare `SITE_URL/data/index.json`
with the report. A day that disappears from the selector at the end of the feed validity is
expected: the window only offers the days the feed covers, and the run that sees the next feed
rebuilds the full window.

**A new feed version.** The plan rebuilds the whole window, under three minutes. Nothing to do.
The about panel shows the feed version the site runs on.

## 4. Doing it by hand

From `pipeline/`, with the feed in `../cache`:

```bash
uv run stibviz plan --gtfs ../cache/gtfs.zip --published published.json
```

```bash
uv run stibviz week --gtfs ../cache/gtfs.zip --out ../web/public/data --report ../week.txt
```

`plan` prints the days the window needs, one per line; `published.json` is the live
`index.json`, saved with `curl`, and without it every covered day is planned. `week` builds them,
removes the day directories that left the window, writes `index.json`, and returns 1 when a day
failed. `--today 2026-09-09` moves the window; `--days-before` and `--days-after` resize it.
`check --day ../web/public/data/2026-09-09` re-reads a written day and lists what is wrong with
it, if anything.

The workflow can also be run from the Actions tab, "Run workflow": same steps, same report.

## 5. Rotating the Cloudflare token

1. In Cloudflare, My Profile, API Tokens: create a new token with the single permission
   Account, Cloudflare Pages, Edit, on this account only.
2. In the GitHub repository settings, replace the secret `CLOUDFLARE_API_TOKEN`.
3. Dispatch `Nightly` and check that "Deploy to Cloudflare Pages" ran.
4. Revoke the old token in Cloudflare.

The account id (`CLOUDFLARE_ACCOUNT_ID`) and the project name (`CLOUDFLARE_PAGES_PROJECT`) do
not rotate. A token that leaked must be revoked first, then replaced: the order above holds for a
planned rotation only.

## 6. Budgets

| Item | Target | Measured |
|---|---|---|
| Seven days of data | 20,000 files and 25 MB per file on Cloudflare Pages | 651 files, none above 3 MB, 260 MB on disk (6 September 2026) |
| One day in the pipeline | under 60 s | 15 to 25 s on a laptop, a weekday being the heaviest |
| The week in Actions | under 8 minutes for the seven days | 2 minutes 06 for the seven days, 2 minutes 30 for the whole run (6 September 2026) |
| A run with nothing to do | stop within a minute | not observed yet: it needs the published index, hence a live `SITE_URL` |
| Actions minutes | two runs a day | about 5 minutes a day while every run rebuilds, less once the index is published; a public repository is not charged for standard runners |
| Deployed site | one hashed bundle per engine | maplibre and deck in their own chunks, about 460 KB gzipped, application chunk under 10 KB |

The M4 checklist keeps "budgets verified on a real week" open until a week of nightly runs has
confirmed these figures on the live project; record them here when it has.

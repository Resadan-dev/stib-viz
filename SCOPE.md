# stib-viz: version 1 scope

Status: scope frozen on 5 September 2026, after an exploration phase
([docs/01-exploration.md](docs/01-exploration.md)) and ten framing questions; adjusted the same
day after an architecture review (playback speeds, budgets, anomaly policy); widened on
6 September to a phone layout, which the milestone list had left for version 2.
The companion technical document is [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Vision

**Brussels in motion**: a night-time map of Brussels where you watch, minute by minute, every
STIB metro, tram and bus run according to the scheduled timetable of one service day. A static
site, with no account, no API key and no server, rebuilt every night from open data.

The model is [france-rail-traffic](https://github.com/magrinj/france-rail-traffic). The Brussels
version differs by its urban density, four modes including an underground one, vehicles that
chain their trips, and a service day that crosses midnight.

## 2. Framing decisions

| Topic | Decision | Why |
|---|---|---|
| Data | Scheduled timetables from the STIB GTFS feed, no real-time data in v1 | Deterministic, no key, no server; real time arrives in v2 through a recorder |
| Visual direction | Night-time: very dark basemap, luminous vehicles with trails | The rhythm of the city is what we want to show |
| Published window | Seven rolling days: yesterday, today, the next five. The first milestone handles a single day to validate the pipeline | Same as the reference; the single day is the test bench |
| Time axis | Service day from 04:00 to 04:00 the next morning, one continuous span that includes Noctis night lines | No seam at midnight; STIB service runs from 04:22 to 03:58 at the widest |
| Trajectories | Pre-computed by the pipeline, simplified shapes, cut into hour slices | Simple, proven by the reference; the browser stays light |
| Animated unit | The vehicle, obtained by chaining trips through `block_id` | Visible layover at termini, exact vehicle count, and the follow mode comes for free |
| Basemap | OpenFreeMap, custom dark style, no key | Free, no quota; a self-hosted alternative is documented for v2 |
| Hosting | Cloudflare Pages, deployed by GitHub Actions | Static, free, same as the reference |
| Web stack | Vite and strict TypeScript, no UI framework | Small, typed, testable |
| Pipeline stack | Python 3.12 and uv | Already used for the feasibility analysis |
| Quality | Mandatory unit tests, test-driven development, 80% minimum coverage | Single developer: the tests are the only review |
| v1 interactions | Play, pause, speed, scrubber on the activity curve, per-mode filters, one line selected with its vehicles stepped through and followed, official colours, click a vehicle, shareable URL state | Everything else is documented for v2 |
| UI language | French UI copy, centralised so Dutch and English can follow later | Brussels is bilingual, but v1 stays small |
| Repository language | Documentation, code comments and commit messages in English | The repository will be made public; English is the language contributors expect |
| Targets | Desktop first, with a phone layout of its own; no smoothness promise on a phone | The interface has to be usable on the screen most people carry; rendering 800 vehicles with trails stays demanding |

## 3. Reference figures

Measured on 5 September 2026 against the official GTFS feed (version `2_20_20260831_010702`,
valid from 31 August to 27 September 2026). They size the project and serve as expected values
for the pipeline checks.

| Measure | Wed 9 Sep | Sat 12 Sep | Sun 13 Sep |
|---|---|---|---|
| Trips in the service day | 18,784 | 13,769 | 11,933 |
| Peak simultaneous vehicles | 776 at 17:03 | 479 | 357 |
| Distinct vehicles in service | 1,299 | | |
| Service span (first departure, last arrival) | 04:26 to 01:41 | 04:22 to 03:58 with Noctis | 04:22 to 01:46 |
| Distance covered | 164,000 km | 117,000 km | 101,000 km |

The peak above counts every trip that touches the minute. The pipeline counts vehicles
**at the top of the minute** (a trip counts at 17:03 when it is under way at 17:03:00), which
gives 752 at 17:03 for the same Wednesday; the site shows this instantaneous figure. Kilometres
are summed stop to stop along the shapes, 162,834 km against 164,365 km for the full shapes.

Network: 89 routes (4 metro, 18 tram, 67 bus of which 12 Noctis), 2,784 stops, 750 shapes.
Each vehicle chains 13 trips at the median with an 11-minute layover; no overlap anywhere.

Trajectory size for one Wednesday by shape simplification tolerance, excluding slice overlap:

| Tolerance | Vertices | Raw size | Per average hour slice |
|---|---|---|---|
| None (one vertex every 11 m) | 8.2 M | 99 MB | 4.7 MB |
| 2 m | 2.1 M | 25 MB | 1.2 MB |
| 5 m | 1.3 M | 15 MB | 0.7 MB |

v1 uses 2 m, which brings Brussels down to the volume of the French reference (2.3 M vertices).
Slice overlap adds about 12%: the Wednesday of section 3 comes to 30.5 MB of slices, the
largest slice being 1.29 MB.

## 4. What version 1 does

### 4.1 Data

- Single source: the static STIB GTFS feed published on the Belgian Mobility portal, downloaded
  without a key, licensed CC BY 4.0.
- Seven service days available: yesterday, today and the next five, within the validity window of
  the feed.
- Four modes: metro, tram, bus, Noctis (routes named `N…`). The `NAV` event shuttle counts as a bus.
- Trips of the same vehicle (`block_id`) are chained; the vehicle stays visible at the terminus
  during its layover. A deadhead move between two distinct termini is not drawn: the trajectory
  stops and resumes.
- Constant speed between two consecutive stops, along the official shape simplified to 2 m.
  Dwell times are those of the GTFS feed (usually zero).

### 4.2 Map and night-time rendering

- Dark OpenFreeMap basemap, customised: roads and water barely visible, no points of interest,
  place names rare and discreet.
- Network layer: every shape, very dark, with intensity rising with the number of daily runs. It
  keeps the map readable even if the basemap tiles fail to load. Metro appears as an underground
  layer, dimmer still.
- Vehicles: a luminous dot and a trail whose length encodes elapsed time, therefore speed, with
  no computation. Colours: warm white for metro, official `route_color` for trams, a single cool
  blue for buses, violet for Noctis.
- A stopped vehicle keeps its dot; its trail fades out.

### 4.3 Time

- The span runs from 04:00 to 04:00 the next morning. The clock shows civil time (01:30, not
  25:30) and marks the crossing into the next day.
- Speeds: ×60, ×120, ×300, ×600, ×1200. Default ×300, which plays the day in under five minutes.
  At ×1200 a frame advances twenty seconds of service time, so the vehicles step rather than
  glide: it is there to cross a quiet night quickly, not to watch the traffic. Pause by button or
  space bar; arrow keys step one minute, ten minutes with Shift.
- If the next hour is not loaded when the slice changes, playback waits visibly rather than
  showing an incomplete hour.
- The activity curve (vehicles running per minute, stacked by mode) doubles as the scrubber:
  click and drag. It sits at the bottom of the control panel, at the panel's width.

### 4.4 Interface

- Clock, date and day type (weekday, Saturday, Sunday), selector for the seven days.
- Per-mode counters: vehicles running, trips departed since 04:00, kilometres.
- Per-mode filters (show or hide metro, tram, bus, Noctis).
- Single-line selection: a picker in the bottom right corner of the map, half-opaque and not
  modal, lists every line of the day as a badge in its official colours with one tab per mode,
  the way the STIB site presents its network; the title, the tabs and the footer stay in view
  while the badges scroll, and a badge in the control panel shows the choice. The
  picker stays open while lines are compared, keeps the choice when closed, and one button brings
  every line back. Every other vehicle dims, the chosen line stays at full opacity; nothing is
  hidden, so context is kept, and clearing the selection restores normal colours.
- With a line selected, the picker gains a second half: previous and next buttons that step
  through the vehicles of that line, for people who find the dots too small to click. It names
  the line, says how many of its vehicles are running and which one is selected, in words rather
  than as a fraction. Stepping centres the map on the vehicle and turns on a follow mode that
  keeps the camera on it during playback, until the map is dragged by hand.
- A colour toggle: the mode palette (default, one flat colour per mode) or every route's official
  STIB colour. The official colour is not unique per line — STIB reuses a palette of about a
  dozen colours across its routes — so the toggle trades a uniform mode colour for a genuine but
  imperfect identification.
- Click a vehicle: route badge in its own colour, destination, next stop, scheduled time.
- About panel: method, GTFS date, attributions, link to the repository.
- Shareable URL state: day, instant, speed, filters, selected line, colour mode, map position,
  playing or paused.

### 4.5 Platforms and performance

- Browsers: current versions of Chrome, Edge, Firefox and Safari on desktop.
- Mobile: the page loads, reads and plays with no horizontal scrolling from 360 px wide; no
  smoothness promise. Under 600 px the control panel is a sheet at the bottom of the screen,
  folded on every load: a bar with the clock, playback and the scrubber, which leaves the map
  the rest of the screen, and unfolds over at most seven tenths of it for everything else.
  The selected vehicle moves to the top, the line picker becomes a sheet of its own, and
  opening either one folds the other. Portrait only; landscape is not addressed in v1.
- Budgets: first frame under 4 MB of site-owned data excluding tiles, meaning a manifest of at
  most 300 KB, a network layer of at most 1 MB and one hour of slices of at most 2.5 MB; at most
  35 MB per day including overlap; 60 frames per second at peak on a 2020 laptop. The vehicle
  list (about 1.7 MB) is read after the first frame, when the panel first opens.
- Accessibility: keyboard controls, visible focus states, colour never the sole carrier of meaning
  (filters carry their names), playback starting paused when `prefers-reduced-motion` is set.

### 4.6 Operations

- Automatic nightly rebuild by GitHub Actions after the GTFS feed is published, then deployment to
  Cloudflare Pages. A day that fails is excluded and the run reports it.
- Continuous integration budget: under ten minutes per run, around five expected.

## 5. What version 1 does not do

- No real-time data, no delays, no diversions, no disruptions.
- No position recording; only the extension points are prepared.
- No selection of several lines at once, no video export.
- No Dutch or English user interface.
- No mobile-optimised data build: a phone downloads and draws the same slices as a desktop,
  and the phone layout is portrait only. No 3D, no self-hosted basemap.
- No other operators (SNCB, De Lijn, TEC), no accounts, no analytics.

## 6. Version 2: documented directions

| Direction | Note |
|---|---|
| Real-time recorder and replay of observed days | The v1 data contract is designed for it; see ARCHITECTURE.md section 8 |
| Scheduled versus observed comparison, delay heat map | Depends on the recorder |
| Video export of a day | The player runs on a deterministic clock; an off-screen render at a fixed frame rate is the missing piece |
| Several lines selected at once | The single-line picker keeps the dimming rule simple; a list of lines needs a legend |
| Dutch and English UI | Copy is already centralised in v1 |
| Self-hosted basemap (Protomaps / PMTiles) | Removes the last external dependency |
| Smooth playback on a phone | The layout is v1; what is left is the volume of data: 5 to 10 m tolerance, shorter slices, measurement on real devices |
| Quantised binary format | 16-bit positions relative to the bounding box: half the size |
| Other operators in Brussels | The SNCB, De Lijn and TEC GTFS feeds live on the same portal |
| 3D metro under UrbIS buildings | Idea borrowed from Mini Tokyo 3D |

## 7. Milestones

Every milestone ends with green tests, a code review and a demonstration.

| Milestone | Content | Done when |
|---|---|---|
| M0 Foundation | Repository, Python and TypeScript tooling, lint, empty tests, continuous integration running the tests | A trivial change passes CI end to end |
| M1 One day | Full pipeline for a single Wednesday: download, day selection, stop projection, simplification, per-vehicle trajectories, hour slices, manifest, checks; a versioned three-route GTFS extract for tests | The checks pass; a manual verification confirms that manifest counters reproduce the section 3 figures (18,784 trips, 1,299 vehicles, peak of 752 at 17:03 under the instantaneous definition of section 3) trip for trip; CI itself validates the versioned extract |
| M2 See it move | Minimal site: map, network layer, animated vehicles of the M1 day, clock, play and pause | A tram 7 and a metro 1 visibly follow their route; 60 frames per second at peak on desktop |
| M3 Interface | Activity curve and scrubber, speeds, counters, filters, vehicle click, URL, about panel, keyboard, centralised copy | Every flow in section 4 works; Playwright smoke test green |
| M4 Seven days and production | Rolling window, day selector, nightly rebuild, Cloudflare Pages deployment, budgets verified | The public site updates itself for a week with no intervention |
| M5 Polish | Refined night-time style, performance, accessibility, documentation, README | Final review, v2 list up to date |

### 7.1 Tasks per milestone

One checkbox per module or behaviour, in the terms of [ARCHITECTURE.md](ARCHITECTURE.md).
A box is ticked when its tests are green.

**M0 Foundation**

- [x] Local Git repository, `.gitignore`, `.gitattributes`, `.editorconfig`, `README.md`
- [x] `pipeline/`: uv project on Python 3.12, `pyproject.toml`, ruff, pytest with 80% minimum
      coverage, `stibviz --version` command
- [x] `web/`: Vite and strict TypeScript project, pnpm, eslint, prettier, vitest with 80% minimum
      coverage, `i18n/fr.ts` and its test
- [x] `.github/workflows/ci.yml`: lint, types and tests on both sides for every push and PR
- [x] MIT `LICENSE`, `SECURITY.md`, Dependabot, English documentation
- [x] GitHub repository created (private for now), first CI run green

**M1 One day**

- [x] `fetch`: conditional download by ETag, SHA-256 digest, archive validation
- [x] `gtfs`: table reading and validation, times beyond 24:00
- [x] `service_day`: active services for a date, `[04:00, 28:00)` span rule
- [x] `shapes`: cumulative distance on the original shape, checked against `shape_dist_traveled`
- [x] `shapes`: monotonic stop projection onto the original shape, offsets measured
- [x] `shapes`: 2 m simplification preserving original distances
- [x] `vehicles`: chaining by `block_id`, layovers, deadhead cuts, trips without `block_id`,
      overlapping blocks split
- [x] `trajectories`: (lon, lat, t) sampling at constant speed between stops
- [x] `slicing`: hour slices with 300 s / 120 s overlap, interpolated cuts, empty slices not written
- [x] `network`: stop-to-stop segments, intensity classes, stop dictionary, v2 lookup table
- [x] `stats`: per-minute series (vehicles, cumulative departures, cumulative kilometres), routes
- [x] `encode`: STV1 binary slices, per-hour stop files, manifest, index
- [x] `checks`: blocking checks, per-object anomalies, report
- [x] `cli`: `fetch`, `build`, `check` and `index` commands
- [x] Versioned three-route GTFS extract with its expected values
- [x] Wednesday 9 September 2026 built, figures verified by hand

**M2 See it move**

- [x] `data/`: index and manifest reading, STV1 slice decoding, contract test on the fixture day
- [x] `time/`: service-day clock, variable-speed player, play and pause
- [x] `render/`: MapLibre map with the night style, network layer
- [x] `render/`: one `TripsLayer` per mode fed by binary attributes, unfolded colours,
      no-copy test
- [x] `render/`: `ScatterplotLayer` for vehicle heads, position by binary search, layover
- [x] `ui/`: clock, play and pause button
- [x] Visual check of tram 7 and metro 1, 60 frames per second measured

Measured on 5 September 2026 on an integrated Intel UHD GPU, 1,600 × 1,000 window, Wednesday
9 September at the 17:03 peak with about 930 vehicles drawn: 55 to 60 frames per second once the
trail joints and caps were made square. Metro 1 and tram 7 follow their routes on the real day and
on the fixture day; the Playwright suite checks the movement of both routes minute by minute.

**M3 Interface**

- [x] `ui/`: activity curve doubling as the scrubber
- [x] `ui/`: speeds ×60 to ×600, keyboard shortcuts (×1200 added in M5)
- [x] `ui/`: per-mode counters read from the manifest series
- [x] `ui/`: per-mode filters, layers and prefetching
- [x] `ui/` `render/`: single-line selection within a mode, dims every other vehicle
- [x] `render/` `theme/`: colour mode toggle, mode palette or each route's official colour
- [x] `render/` and `ui/`: vehicle selection, stops loaded on demand, panel
- [x] `state/`: single state object, URL synchronisation, round trip tested
- [x] `data/`: next-hour prefetch, three-hour cache, visible waiting
- [x] `ui/`: about panel and attributions
- [x] `i18n/`: complete French copy
- [x] Playwright smoke test on the fixture day

Delivered on 5 September 2026 against the Wednesday and the fixture Friday: the state lives in one
frozen object that the URL follows on a debounce and recreates on load; the scrubber is a native
range input over the stacked activity curve; lines are selected by their public number, since the
GTFS route id of tram 7 is 8; the stops of an hour are fetched on the first selection only.

**M4 Seven days and production**

- [x] Pipeline: seven-day rolling window, `plan` against the published index, index of valid
      days only
- [x] `ui/`: day selector
- [x] `nightly.yml`: ETag fetch, early exit, per-day build and check, index, site build, wrangler
      deployment, deferred exit code, report kept fourteen days
- [x] Cloudflare Pages `_headers`: cache rules and security headers, the Content-Security-Policy
      exercised by a Playwright test
- [x] Cloudflare Pages project, GitHub secrets and variables created (by hand, see README)
- [x] Budgets verified on a real week: size, pipeline duration, CI minutes

**M5 Polish**

- [ ] Night style: mode colours tuned on the real render, basemap adjusted
- [x] Performance: device pixels capped at 1.5, measured at the peak on desktop and on a phone
- [x] Accessibility: focus, keyboard, `prefers-reduced-motion`, axe audit in the smoke suite
- [x] Line picker: badges in official colours, one tab per mode, translucent non-modal dialog
      in the bottom right corner, replacing the text field (asked for on 6 September)
- [x] Phone layout: the control panel as a two-position sheet, the vehicle card at the top,
      the line picker as a full-width sheet, 44 px targets, safe areas (asked for on
      6 September)
- [x] Documentation: README, about panel, `docs/` runbook, v2 list up to date
- [ ] Final review

## 8. Quality and method

- Test-driven development: every behaviour starts with a failing test.
- 80% minimum coverage on logic (pipeline and non-graphical TypeScript modules). WebGL rendering
  code is covered by the smoke test and by visual verification.
- Systematic review before merging, even alone: the tooled review is the only review there is.
- No key and no secret in the repository; Cloudflare credentials live in GitHub secrets.
- Pipeline checks separate global anomalies, which block the day, from per-object anomalies,
  tolerated under 0.1% of trips, logged and summarised in the manifest. A blocked day is never
  published; the other days are.

## 9. Licensing and attribution

- Code: MIT licence, same as the reference. See [LICENSE](LICENSE).
- Data: CC BY 4.0. Mandatory credit, in the about panel and the footer:
  "Source: STIB-MIVB – Open Data – [GTFS date]", with a link to Belgian Mobility Company.
- Basemap: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap".
- Libraries: MapLibre GL JS (BSD), deck.gl (MIT).

## 10. Main risks

| Risk | Mitigation |
|---|---|
| Very dense shapes, excessive size | 2 m simplification, per-slice budget enforced by the pipeline |
| The feed does not place stops along shapes | Monotonic stop projection, offset check (median and p99) |
| Loops and route variants | Shape chosen by the trip's `shape_id`, projection constrained by stop order |
| Service day crossing midnight | 04:00 → 04:00 span by construction |
| Feed format change | Strict input validation, explicit failure, day excluded |
| OpenFreeMap unavailable | The network layer keeps the map readable on its own; self-hosting in v2 |
| Continuous integration minutes | One run per night, under ten minutes, early exit when the feed has not changed |

## 11. Glossary

- **Trip**: a GTFS `trip`, from one terminus to the other.
- **Vehicle**: a GTFS `block_id`, a sequence of trips run by the same unit.
- **Shape**: a GTFS `shape`, the geographic polyline of a route variant.
- **Service day**: the trips attached to a GTFS date, from 04:00 to 04:00 the next morning.
- **Hour slice**: the subset of trajectories active during one hour, with overlap.
- **Layover**: the idle time a vehicle spends at a terminus between two trips.
- **Deadhead**: a repositioning move with no passengers, not drawn in v1.
- **Manifest**: the JSON file describing a published day: statistics, routes, slices.

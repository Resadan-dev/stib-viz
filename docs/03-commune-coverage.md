# How well does the STIB serve each of the 19 municipalities?

Dates: 10 and 11 September 2026. Status: exploration and prototype. Nothing is in the pipeline or
the site yet.

This is the decision record of the feature. Every choice is written down as it is made: what was
decided, by whom, why, and what was set aside. Entries are numbered and dated. An entry that
overturns an earlier one says so, and the earlier one stays in place.

---

## 1. The question

On 10 September 2026 the user asked two things. Can the map show the perimeter of each
municipality (*commune*)? And how can we measure how well the STIB network serves each one?

## 2. Decision log

### D1. Scope: the 19 municipalities of the Brussels-Capital Region (10 September, user)

"Concentre-toi sur les 19 communes bruxelloises, clairement."

The STIB also stops in 13 Flemish municipalities, 143 stop points in all (research of
10 September, stop points matched against the VRBG2025 and UrbIS boundary services):

| Municipality | Stop points |
|---|---|
| Wezembeek-Oppem | 41 |
| Vilvoorde | 24 |
| Drogenbos | 16 |
| Kraainem | 14 |
| Sint-Pieters-Leeuw | 10 |
| Machelen | 9 |
| Tervuren | 7 |
| Beersel | 6 |
| Grimbergen | 5 |
| Zaventem | 5 |
| Dilbeek | 2 |
| Linkebeek | 2 |
| Wemmel | 2 |

These municipalities get no score. De Lijn is their main operator, so a score counting the STIB
alone would say little about them.

### D2. Every STIB stop counts, wherever it stands (10 September, Claude, told to the user without objection)

A resident of Woluwe-Saint-Pierre near the Kraainem boundary can board a vehicle beyond it.
Leaving those stops out would penalise the municipalities on the edge of the Region for no reason.
On Wednesday 9 September, 137 of the quays served stand outside the Region.

### D3. Three figures per municipality (11 September, user)

"ok pour ces 3 chiffres". The three figures are:

- the share of residents with high service at the displayed time, S;
- the departures within reach of the median resident, M;
- the amplitude, A, which is the hours per day of high service.

They are defined exactly in section 3.

### D4. A fine grid alongside the municipalities (11 September, user)

"+ grille fine". A single figure per municipality hides gaps inside it. The City of Brussels, for
instance, covers the Pentagon as well as Haren and Neder-Over-Heembeek.

### D5. Prototype first, outside the repository (11 September, user)

"+prototype". With the user's permission, two Statbel files were downloaded to the session's
temporary folder:

- the statistical sectors, 59,332,852 bytes;
- the population by sector, 546,045 bytes.

The repository holds no code for this feature until the method is validated.

### D6. Statbel for both the boundaries and the population (proposed 10 September, files chosen 11 September, Claude)

**Files used**

- Geometry: `sh_statbel_statistical_sectors_3812_20260101.geojson`.
  - Situation on 1 January 2026, in EPSG:3812.
  - 227 MB unzipped for the whole of Belgium, one feature per line.
  - Fields used: `cd_sector`, `cd_munty_refnis`, `tx_munty_descr_fr`, `tx_munty_descr_nl`,
    `tx_sector_descr_fr`, `dt_situation`.
- Population: `OPENDATA_SECTOREN_2025_NEW.txt`.
  - Population on 1 January 2025, in the "NEW" sector division of the REDEGEO reform.
  - Pipe-separated, cp1252, decimal comma.
  - Fields used: `CD_SECTOR`, `TOTAL`, and the area in hectares.

**Why Statbel**

A municipality is the union of its sectors, so the boundaries and the population come from a
single source and cannot disagree.

**Licence**

Both files are CC BY 4.0, "Source: Statbel". Any derived file will carry that attribution and say
that it was modified. It will be licensed separately from the MIT code.

**Set aside**

- UrbIS: its licence contradicts itself. The WFS service declares CC0, while the datastore sheet
  applies the SPF Finances licence to municipalities.
- OpenStreetMap: ODbL share-alike would bind every derived file.
- IGN AdminVector: sound (CC BY 4.0, WGS84), but it is a second source, and its boundaries need
  not match the sectors.
- The Statbel 1 km² population grid: too coarse, and last issued for 2020.

### D7. Weight by residents, not by area (10 September, Claude)

The Forêt de Soignes covers much of Watermael-Boitsfort, Uccle and Auderghem. Weighting by area
would score trees.

### D8. Residents are spread evenly within their sector (11 September, Claude)

**Grid**

- Cells of 50 m, in Lambert 2008 metres.
- A cell belongs to the sector that contains its centre, by the even-odd rule over every ring of
  the sector, holes included.
- The median sector is 0.145 km², about 58 cells.

**Spreading**

- A sector's residents are shared equally among its cells. The IBSA's area prorata makes the same
  assumption.
- A sector smaller than one cell would place its residents at the mean of its outer ring's
  vertices. No Brussels sector needed this.
- 3,443 residents sit on "ZZZZ" rows, with no known sector (0.27 %). They are left out, and every
  share is taken over the 1,252,352 residents that are located.

**Set aside for now**

Placement on buildings (dasymetric mapping) would be more accurate, but it needs another source
with another licence.

### D9. Projection without pyproj (11 September, Claude)

Statbel publishes in Lambert 72 or Lambert 2008 only. Converting Lambert 2008 to longitude and
latitude is a closed formula: Lambert conic conformal with two standard parallels, EPSG method
9802, on the GRS80 ellipsoid. The difference between ETRS89 and WGS84, under a metre, is ignored.
This keeps the choice recorded in [ARCHITECTURE.md](../ARCHITECTURE.md), section 9: no pyproj.

Checks:

- The false origin maps exactly onto the false easting and northing.
- A round trip over 1,000 random points of the Region is off by at most 2.4 × 10⁻⁹ m.
- The centre of the "GRAND-PLACE" sector reprojects about 100 m from the square itself, which lies
  inside that sector.

### D10. What counts as a departure (11 September, Claude)

- A departure is a trip calling at a quay other than its last stop.
- It is counted in the hour of its departure time since 04:00. Hour 0 is 04:00–05:00 and hour 23
  is 03:00–04:00.
- The service day is the pipeline's: trips whose first departure falls in [04:00, 28:00).
- A quay with no departure on the day is not a stop that day.

### D11. Two groups of modes (11 September, Claude)

| Group | Modes |
|---|---|
| Surface | Bus, tram (including the pre-metro) and Noctis |
| Metro | Lines 1, 2, 5 and 6 |

SDG 11.2.1 and the European Commission tell low-capacity systems (bus, tram) from high-capacity
ones (metro, train), and give them different walking distances.

### D12. Places (11 September, Claude)

Quays that share a name and stand within 250 m of one another, by single linkage, form one place.
A place's departures are those of all its quays, in both directions and on every line.

The Commission groups stops within 50 m, which joins the two sides of a street. A STIB stop can
spread its quays 100 m or more around a junction; 250 m links them without merging stops of the
same name elsewhere in the city.

On Wednesday this gives 860 places from 2,216 quays, against 857 distinct names. The largest
places have not been reviewed yet.

### D13. Walking reach as the crow flies (10 September, Claude)

The reach is measured in a straight line from the cell centre to the quay:

- 400 m for surface stops;
- 800 m for metro stations.

These are the 500 m and 1 km on foot of SDG 11.2.1, divided by a detour factor of 1.25. The
Swiss norm SN 640 290 allows 20 to 30 % for detours, and measured factors around stations are
1.21 to 1.23.

Set aside for now: distances along streets. They need a pedestrian graph (OSM, under ODbL) and
routing, and at the scale of a municipality the gain averages out. To revisit for the grid, where
barriers such as the canal, the railways and the ring matter locally.

### D14. Departures within reach (10 September, Claude)

For each group, the best place within reach (the maximum); then the two groups are added. This is
the Commission's rule. It counts a line that passes several nearby stops once, and it errs on the
conservative side.

Set aside: PTAL's best stop per line, weighted by waiting time. It is calibrated for London and
harder to explain.

### D15. Classes (10 September, Claude)

The Commission's thresholds, applied to the departures in the hour:

| Class | Departures in the hour |
|---|---|
| None | 0 |
| Low | fewer than 4 |
| Medium | 4 to 10 |
| High | more than 10 |
| Very high | more than 10 in each of the two groups |

At the scale of an hour, "none" also covers a cell whose stops are silent that hour. "High" means,
for example, one line every 10 minutes in each direction, which is 12 departures.

### D16. Hours (11 September, Claude, prototype only)

The prototype uses whole clock hours of the service day. The window the site will use is open
question Q2.

### D17. Days computed (11 September, Claude)

- Wednesday 9 September 2026, the project's reference weekday.
- Sunday 13 September 2026.

Both come from feed `2_20_20260831_010702`.

### D18. Validation plan (10 September, Claude)

1. Reproduce the IBSA indicator.
2. Compare with the European Commission.
3. Look for Lebrun's poorly served areas on the grid. Not done yet.

### D19. Figures are kept at full precision and rounded once, for display (11 September, Claude)

The first run stored the figures rounded to two or four decimals, then rounded them again to one
decimal for display. The two roundings disagreed at the edges. Saint-Josse's amplitude of 19.95 h
printed as 19.9 in Python, which rounds the binary value half to even, and as 20.0 in the page,
which rounds the shortest decimal half away from zero.

The figures are now written at full precision. After the change, eleven cells of the tables moved
by one tenth; section 5 shows the full-precision values. The same rule will hold in the pipeline:
round where a figure is shown, never before.

### D20. The prototype page (11 September, Claude)

The page is a single HTML file and is not published. It was built before D23 and D24, so it shows
the first definition (section 5.2).

**Colours**

- The classes are ordered magnitudes (none < low < medium < high < very high). They take a one-hue
  ordinal ramp, blue, checked with the ordinal validator of the data-visualisation guide:
  - light theme: `#86b6ef`, `#5598e7`, `#2a78d6`, `#1c5cab`, `#0d366b` on `#fcfcfb`, lightest step
    at 2.06:1 against the surface;
  - dark theme: `#184f95` to `#b7d3f6` on `#1a1a19`, at 2.15:1.
- Set aside: a red-to-blue diverging scale. The classes have no neutral midpoint; they are not two
  sides of a baseline.

**Sparsely populated cells**

A cell with fewer than 0.5 residents, that is under 200 per km², is drawn in neutral grey as "few
or no residents". That is 17,080 of the 63,148 cells that carry residents, and only 1,340
residents (0.107 %). This is a display choice only: those residents still count in every figure.
Even spreading gives woods and parks a few residents each, and without the grey the Forêt de
Soignes would read as a vast district with no service.

**Municipal borders and names**

- Borders are the cell edges where the municipality changes. They are drawn in the surface
  colour, as a gap rather than a stroke.
- The municipality under the pointer is outlined in ink.
- Each name sits at the cell farthest from the municipality's border. Six long names are
  shortened (for example "St-Josse").

**Table**

- The 19 municipalities are sorted by the day's amplitude A. That order stays still while the hour
  changes; sorting by S would shuffle the rows during playback.
- Columns: a stacked bar of the class shares at the hour, from very high on the left to none,
  then S, M and A.
- The table is also the text version of the map.

**Controls**

- The day: Wednesday or Sunday.
- The hour: a slider over the 24 hours of the service day, starting at 08:00.
- A play button that steps one hour every 0.7 s.
- The Region's S and M at the hour, and its A, sit above the map.

**Data**

For every drawn cell and every hour, the page carries the class and the departures (capped at
255), one byte each. The bytes are compressed with gzip, encoded in base64, and decoded in the
browser with `DecompressionStream`. The page weighs 0.74 MB for two days.

**Checks in the browser pane**

- No console error.
- Figures identical to the report.
- No horizontal page scroll at 375 px or at 896 px; the table scrolls within its own box.
- The map is the right way up: Uccle south, Anderlecht west, Ixelles east.

### D21. Test the Ganshoren gap against the old sector division (11 September, user)

"oui pour Ganshoren". Two more Statbel files make the test possible:

- the sectors in the division that was in force before the 2025 reform;
- the 2025 population in that same "OLD" division.

The IBSA replication is then rerun on them. The outcome is recorded under Q1.

### D22. A stricter top class: more than 20 departures in the hour (11 September, user)

"classe > 20". At 08:00, 97 % of residents reached the Commission's "high" class, so the top of
the scale said nothing about Brussels.

### D23. Departures are counted per direction (11 September, user)

"par sens". A traveller rides one way, so a stop served every 10 minutes in each direction offers 6
departures to that traveller, not 12.

**How it is counted (Claude)**

For each place, route and hour, the departures are counted in each GTFS `direction_id`. The route
counts for the larger of its two directions, and the place counts for the sum over its routes. This
is PTAL's rule, "the most frequent direction", applied route by route.

**Set aside**

- Halving the two-way total, as the Swiss ARE does: it is wrong at a terminus and on one-way
  loops.
- A single maximum over the whole place: it would ignore that different lines lead to different
  places.

### D24. The class scale that follows from D22 and D23 (11 September, Claude)

With departures counted per direction, the classes become a pure scale of frequency:

| Class | Departures per direction in the hour | Roughly one departure every |
|---|---|---|
| None | 0 | — |
| Low | fewer than 4 | more than 15 min |
| Medium | 4 to 10 | 6 to 15 min |
| High | more than 10, up to 20 | 3 to 6 min |
| Very high | more than 20 | less than 3 min |

The Commission's rule for "very high", high in both the surface and the metro group, gives way to
the threshold of 20. A scale that ranked some classes by frequency and others by mode would no
longer be ordered.

The three figures keep their definitions from section 3, now read on this scale:

- S is the share of residents with more than 10 departures per direction within reach.
- M is the median of the departures per direction within reach.
- A is the number of hours at more than 10.

The comparison with the Commission keeps the Commission's own rules (both directions, its classes),
as a validation check only.

### D25. Commit this record, then build the feature into the pipeline and the site (11 September, user)

"et commite, et on passe à l'intégration dans le pipeline et site".

## 3. Definitions

**For each resident point**

A resident point i carries a weight wᵢ, its number of residents. For each hour h:

- dₚ,g(h): the departures per direction of place p in group g during hour h (D23). For each route
  of group g at p, take the larger of its two directions, then add up over the routes.
- fᵢ,g(h) = the largest dₚ,g(h) over the places p of group g within reach of i, or 0 when there
  is none.
- fᵢ(h) = fᵢ,surface(h) + fᵢ,metro(h).
- classᵢ(h): the class of fᵢ(h) under D24. "High" means more than 10.

Under the first definition (section 5.2), dₚ,g(h) counted both directions and the classes were
those of D15.

**For each municipality c**

- **S꜀(h)** = Σᵢ∈꜀ wᵢ · [classᵢ(h) ≥ high] / Σᵢ∈꜀ wᵢ
- **M꜀(h)** = the median of fᵢ(h) over the residents of c, weighted by wᵢ.
- **A꜀** = Σᵢ∈꜀ wᵢ · #{h : classᵢ(h) ≥ high} / Σᵢ∈꜀ wᵢ, in hours of the service day, from 0 to 24.

**IBSA replication**

The share of residents with a quay served on the day within:

- 250 m for bus and Noctis;
- 400 m for tram;
- 500 m for metro.

A quay that serves several modes takes its largest radius. The IBSA's 500 m for "Chrono" trams is
not reproduced. These radii come from the research and were not re-read at the source, whose site
refuses automated access.

**Commission comparison**

For each place, the mean departures per hour from 06:00 to 20:00. Then, for each point, the best
place per group, the sum of the two groups, and the classes of D15.

## 4. Checks

| Check | Result |
|---|---|
| Sectors in the Region | 749, in 19 municipalities |
| Population rows | 768, that is 749 sectors plus 19 "ZZZZ" rows; all 749 sectors joined |
| Polygon area against Statbel's area | largest relative gap 0.07 % |
| Area of the Region | 162.42 km²; 64,960 cells of 50 m, which is 162.40 km² |
| Cells carrying residents | 63,148, because even spreading also gives a few residents to wooded cells |
| Residents located | 1,252,352, plus 3,443 not located |
| Quays outside the Region, Wednesday | 137; the research counted 143 stop points in Flanders across the whole stops file, served or not |
| Quays and places, Wednesday | 2,216 quays, 860 places, 374,003 departures |
| Quays and places, Sunday | 2,178 quays, 841 places, 229,010 departures |

## 5. Results of the prototype

### 5.1 Current definition: departures per direction (D23, D24)

Wednesday 9 September 2026:

| Municipality | Residents | IBSA 2018 | IBSA rules, 2026 network | S 08h | S 13h | S 21h | S 23h | M 08h | M 21h | A (h) |
|---|---|---|---|---|---|---|---|---|---|---|
| Saint-Josse-ten-Noode | 27,046 | 100.00 | 100.00 | 99.2 | 99.2 | 99.2 | 99.2 | 49 | 28 | 19.8 |
| Saint-Gilles | 48,757 | 100.00 | 98.13 | 100.0 | 100.0 | 100.0 | 100.0 | 48 | 27 | 19.7 |
| Koekelberg | 22,956 | 100.00 | 100.00 | 100.0 | 98.0 | 87.4 | 87.4 | 44 | 25 | 19.3 |
| Molenbeek-Saint-Jean | 98,564 | 96.63 | 97.06 | 97.3 | 96.9 | 94.2 | 94.2 | 43 | 21 | 19.1 |
| Etterbeek | 49,014 | 99.63 | 99.73 | 100.0 | 96.7 | 96.5 | 96.2 | 36 | 19 | 19.1 |
| Schaerbeek | 129,394 | 98.86 | 98.70 | 97.2 | 95.6 | 92.0 | 75.6 | 34 | 19 | 18.6 |
| Brussels | 197,076 | 94.57 | 96.71 | 97.6 | 96.0 | 84.8 | 82.6 | 37 | 20 | 18.5 |
| Jette | 54,255 | 98.09 | 99.96 | 99.8 | 93.8 | 87.7 | 80.3 | 30 | 14 | 18.1 |
| Ixelles | 89,669 | 97.34 | 97.73 | 95.6 | 92.1 | 82.8 | 82.3 | 36 | 19 | 17.8 |
| Woluwe-Saint-Lambert | 60,878 | 95.16 | 95.00 | 98.8 | 93.5 | 74.0 | 74.5 | 31 | 14 | 17.5 |
| Anderlecht | 128,358 | 89.60 | 89.44 | 95.1 | 93.5 | 81.1 | 74.0 | 26 | 15 | 17.5 |
| Evere | 45,775 | 95.96 | 95.42 | 97.9 | 88.5 | 80.7 | 68.2 | 21 | 12 | 17.0 |
| Forest | 58,575 | 97.94 | 98.66 | 96.9 | 96.4 | 65.0 | 61.2 | 23 | 13 | 17.0 |
| Auderghem | 35,649 | 88.45 | 89.23 | 86.8 | 83.5 | 55.3 | 44.1 | 21 | 11 | 14.7 |
| Berchem-Sainte-Agathe | 25,792 | 96.34 | 94.16 | 81.9 | 68.1 | 38.8 | 38.8 | 20 | 9 | 13.5 |
| Ganshoren | 25,676 | 86.65 | 97.99 | 85.6 | 83.6 | 19.3 | 19.3 | 22 | 10 | 13.0 |
| Uccle | 87,100 | 88.48 | 86.83 | 75.6 | 66.3 | 49.7 | 36.4 | 20 | 10 | 12.5 |
| Watermael-Boitsfort | 25,314 | 88.56 | 88.45 | 74.4 | 67.3 | 35.6 | 32.1 | 18 | 10 | 11.8 |
| Woluwe-Saint-Pierre | 42,504 | 79.99 | 80.62 | 65.6 | 62.9 | 31.8 | 31.2 | 17 | 9 | 10.8 |
| **Region** | 1,252,352 | 94.62 | 95.04 | 93.6 | 90.4 | 77.3 | 72.3 | 31 | 16 | 17.2 |

S is in per cent of residents with more than 10 departures per direction within reach. M is in
departures per direction per hour. The rows are sorted by A.

Sunday 13 September 2026:

| Municipality | S 08h | S 13h | S 21h | S 23h | M 08h | M 21h | A (h) |
|---|---|---|---|---|---|---|---|
| Saint-Josse-ten-Noode | 97.2 | 99.2 | 99.2 | 99.2 | 24 | 25 | 19.5 |
| Saint-Gilles | 86.1 | 100.0 | 100.0 | 100.0 | 25 | 27 | 19.1 |
| Molenbeek-Saint-Jean | 94.1 | 94.2 | 94.2 | 94.2 | 21 | 22 | 18.1 |
| Etterbeek | 68.3 | 94.3 | 95.9 | 95.9 | 17 | 18 | 17.3 |
| Koekelberg | 86.6 | 87.4 | 87.4 | 87.4 | 24 | 25 | 16.9 |
| Brussels | 83.4 | 84.2 | 84.8 | 82.6 | 19 | 20 | 16.1 |
| Ixelles | 74.2 | 81.8 | 82.3 | 81.8 | 15 | 18 | 14.9 |
| Schaerbeek | 73.8 | 75.6 | 83.0 | 75.5 | 17 | 19 | 14.8 |
| Jette | 69.9 | 80.6 | 81.0 | 80.3 | 15 | 14 | 14.2 |
| Anderlecht | 77.1 | 77.5 | 77.2 | 74.0 | 14 | 15 | 14.1 |
| Woluwe-Saint-Lambert | 64.7 | 74.3 | 74.3 | 74.8 | 12 | 14 | 13.5 |
| Forest | 53.4 | 61.2 | 61.2 | 61.2 | 11 | 14 | 11.4 |
| Evere | 20.9 | 77.4 | 65.5 | 68.2 | 9 | 11 | 11.0 |
| Auderghem | 43.3 | 43.2 | 44.0 | 44.0 | 10 | 10 | 8.1 |
| Watermael-Boitsfort | 31.8 | 50.2 | 52.4 | 32.3 | 9 | 11 | 7.4 |
| Uccle | 28.6 | 38.1 | 37.8 | 33.9 | 8 | 9 | 7.0 |
| Berchem-Sainte-Agathe | 31.9 | 38.8 | 38.8 | 38.8 | 8 | 8 | 7.0 |
| Woluwe-Saint-Pierre | 31.2 | 31.2 | 31.2 | 31.2 | 8 | 9 | 5.5 |
| Ganshoren | 14.3 | 19.3 | 19.3 | 19.3 | 9 | 10 | 3.7 |
| **Region** | 66.4 | 73.5 | 74.1 | 72.0 | 14 | 16 | 13.6 |

The IBSA replication and the Commission comparison do not depend on D23 and D24. Their figures
are those of section 5.2.

### 5.2 First definition: both directions, the Commission's classes (superseded by D23 and D24)

Kept for the record.

Wednesday 9 September 2026:

| Municipality | Residents | IBSA 2018 | IBSA rules, 2026 network | S 08h | S 13h | S 21h | S 23h | M 08h | M 21h | A (h) |
|---|---|---|---|---|---|---|---|---|---|---|
| Saint-Gilles | 48,757 | 100.00 | 98.13 | 100.0 | 100.0 | 100.0 | 100.0 | 88 | 53 | 20.0 |
| Saint-Josse-ten-Noode | 27,046 | 100.00 | 100.00 | 100.0 | 99.2 | 100.0 | 99.2 | 93 | 49 | 19.9 |
| Koekelberg | 22,956 | 100.00 | 100.00 | 100.0 | 100.0 | 98.0 | 98.0 | 86 | 48 | 19.9 |
| Jette | 54,255 | 98.09 | 99.96 | 100.0 | 100.0 | 99.7 | 99.7 | 57 | 28 | 19.8 |
| Etterbeek | 49,014 | 99.63 | 99.73 | 100.0 | 100.0 | 100.0 | 100.0 | 71 | 37 | 19.6 |
| Schaerbeek | 129,394 | 98.86 | 98.70 | 99.4 | 98.8 | 97.5 | 96.7 | 67 | 36 | 19.6 |
| Forest | 58,575 | 97.94 | 98.66 | 99.6 | 99.6 | 98.4 | 97.5 | 44 | 22 | 19.6 |
| Molenbeek-Saint-Jean | 98,564 | 96.63 | 97.06 | 98.3 | 98.3 | 96.4 | 96.4 | 74 | 40 | 19.5 |
| Woluwe-Saint-Lambert | 60,878 | 95.16 | 95.00 | 99.8 | 99.4 | 96.7 | 96.7 | 60 | 27 | 19.4 |
| Brussels | 197,076 | 94.57 | 96.71 | 99.1 | 98.2 | 96.2 | 94.9 | 71 | 38 | 19.4 |
| Ixelles | 89,669 | 97.34 | 97.73 | 99.9 | 99.8 | 95.6 | 93.8 | 70 | 35 | 19.3 |
| Anderlecht | 128,358 | 89.60 | 89.44 | 98.0 | 97.1 | 94.2 | 94.2 | 49 | 28 | 19.1 |
| Evere | 45,775 | 95.96 | 95.42 | 97.9 | 97.9 | 97.0 | 91.8 | 41 | 23 | 18.9 |
| Ganshoren | 25,676 | 86.65 | 97.99 | 99.9 | 97.2 | 83.7 | 83.7 | 43 | 20 | 18.2 |
| Berchem-Sainte-Agathe | 25,792 | 96.34 | 94.16 | 97.0 | 96.9 | 68.0 | 68.0 | 39 | 17 | 17.8 |
| Auderghem | 35,649 | 88.45 | 89.23 | 91.0 | 90.6 | 85.1 | 85.1 | 42 | 21 | 17.5 |
| Uccle | 87,100 | 88.48 | 86.83 | 89.6 | 86.7 | 78.3 | 73.7 | 39 | 18 | 16.4 |
| Watermael-Boitsfort | 25,314 | 88.56 | 88.45 | 91.5 | 82.8 | 72.9 | 67.6 | 32 | 19 | 15.9 |
| Woluwe-Saint-Pierre | 42,504 | 79.99 | 80.62 | 69.4 | 69.4 | 63.6 | 63.6 | 34 | 15 | 13.2 |
| **Region** | 1,252,352 | 94.62 | 95.04 | 97.1 | 96.3 | 92.9 | 91.8 | 58 | 29 | 18.8 |

How to read the table:

- S is in per cent of residents.
- "08h" is the hour from 08:00 to 09:00, and likewise for the other columns.
- M is in departures per hour.
- The rows are sorted by A.

Sunday 13 September 2026:

| Municipality | S 08h | S 13h | S 21h | S 23h | M 08h | M 21h | A (h) |
|---|---|---|---|---|---|---|---|
| Saint-Gilles | 99.8 | 100.0 | 100.0 | 100.0 | 46 | 53 | 19.9 |
| Saint-Josse-ten-Noode | 99.2 | 99.2 | 99.2 | 99.2 | 44 | 49 | 19.8 |
| Etterbeek | 97.2 | 99.3 | 100.0 | 100.0 | 33 | 35 | 19.6 |
| Koekelberg | 98.0 | 98.0 | 98.0 | 98.0 | 43 | 48 | 19.3 |
| Molenbeek-Saint-Jean | 96.4 | 96.4 | 96.4 | 96.4 | 36 | 40 | 19.2 |
| Jette | 96.0 | 99.7 | 99.7 | 99.7 | 26 | 28 | 19.2 |
| Schaerbeek | 95.8 | 96.4 | 96.6 | 96.3 | 31 | 37 | 19.0 |
| Brussels | 92.7 | 96.6 | 96.3 | 94.9 | 32 | 39 | 18.8 |
| Forest | 93.7 | 97.6 | 97.5 | 97.5 | 19 | 22 | 18.8 |
| Ixelles | 92.2 | 95.6 | 95.6 | 93.8 | 28 | 34 | 18.6 |
| Woluwe-Saint-Lambert | 93.2 | 97.0 | 97.0 | 97.0 | 24 | 27 | 18.5 |
| Anderlecht | 93.4 | 94.6 | 94.2 | 94.2 | 26 | 29 | 18.4 |
| Evere | 91.3 | 91.8 | 91.8 | 91.8 | 17 | 22 | 17.2 |
| Auderghem | 77.8 | 83.0 | 85.1 | 85.1 | 19 | 20 | 15.8 |
| Ganshoren | 83.6 | 83.7 | 83.7 | 83.7 | 16 | 20 | 15.5 |
| Uccle | 64.4 | 73.8 | 75.7 | 73.7 | 15 | 17 | 13.8 |
| Watermael-Boitsfort | 73.0 | 73.0 | 73.1 | 67.8 | 17 | 20 | 13.5 |
| Berchem-Sainte-Agathe | 68.0 | 68.0 | 68.0 | 68.0 | 13 | 16 | 12.8 |
| Woluwe-Saint-Pierre | 63.4 | 63.6 | 63.6 | 63.6 | 13 | 15 | 11.7 |
| **Region** | 89.7 | 92.2 | 92.4 | 91.7 | 26 | 29 | 17.9 |

Share of the Region's residents per class, weekday average from 06:00 to 20:00:

| | None | Low | Medium | High | Very high |
|---|---|---|---|---|---|
| Prototype, Wednesday | 1.1 | 0.0 | 1.9 | 54.2 | 42.7 |
| Prototype, Sunday | 1.1 | 0.2 | 6.5 | 55.2 | 36.9 |
| European Commission, 2020 | 2.0 | 0.7 | 5.2 | 48.1 | 44.1 |

The Commission's perimeter differs from the Region, see findings.

## 6. Findings so far

1. **The chain from boundaries to population to stops holds.** With the IBSA's rules on the 2026
   network, the Region comes out at 95.04 % against the IBSA's 94.62 % for 2018. Eighteen of the
   nineteen municipalities fall within 2.2 points.
2. **Ganshoren is the exception, 97.99 % against 86.65 %, and the network explains it** (D21):
   - **The sector reform is ruled out.** With the sectors of 1 January 2024 (724 in the Region)
     and the 2025 population in the "OLD" division, Ganshoren comes out at 97.96 %, against 97.99 %
     in the new division. Both files join perfectly: 724 sectors, the same 1,252,352 located
     residents.
   - **Removing each route in turn** shows how much of Ganshoren's share rests on each one:

     | Route removed | Loss |
     |---|---|
     | Bus 87 | 17.55 points |
     | Bus 83 | 9.10 points |
     | Tram 9 | 3.76 points |
     | Bus 13 | 0.80 points |
     | Every other route | none |

     Without bus 87 alone, Ganshoren falls to 80.44 %, below the IBSA's figure.
   - **Line 83 did not exist in 2018.** The STIB created it on 4 November 2019, "une desserte
     inédite via l'avenue Charles-Quint" (press release of 28 October 2019). It changed again on
     1 September 2021 "pour permettre une meilleure optimisation des trajets avec la ligne de bus
     87 qui traverse déjà Ganshoren" (BX1, 1 September 2021).
   - Network changes after 2018 therefore account for the gap. What remains open is whether bus
     87 took its present route in Ganshoren before or after 2018; it matters little, since the
     method is not at fault.
3. **Proximity alone saturates**, as expected: 95 % of residents.
4. **S separates the outer municipalities, and the evening does so most:**
   - Berchem-Sainte-Agathe falls from 97.0 % at 08:00 to 68.0 % at 21:00.
   - Woluwe-Saint-Pierre stays between 63.6 and 69.4 % all day.
   - Uccle goes from 89.6 % at 08:00 to 73.7 % at 23:00.
5. **M separates the centre.** At 08:00 the median resident has within reach:
   - 93 departures in Saint-Josse, 88 in Saint-Gilles and 86 in Koekelberg;
   - 32 in Watermael-Boitsfort and 34 in Woluwe-Saint-Pierre.
6. **A runs from 20.0 h in Saint-Gilles to 13.2 h in Woluwe-Saint-Pierre** on the Wednesday. On
   the Sunday it runs from 19.9 h to 11.7 h.
7. **Sunday mornings are the thinnest time.** At 08:00, Uccle is at 64.4 % and the Region at
   89.7 %. By 21:00 the Sunday median resident has more departures within reach than at 08:00.
8. **The Commission comparison is consistent**: 96.9 % in the high or very high class, against the
   Commission's 92.2 %. The differences are all in the Commission's direction:
   - its perimeter is the urban centre of 177 km², which reaches beyond the Region into less
     served areas;
   - its catchments follow the streets;
   - its data are older.
9. **"High" is a low bar for Brussels**: 97 % of residents reach it at 08:00. See Q3.

Findings 4 to 7 and 9 were read under the first definition. Under the current one (section 5.1):

10. **The municipalities spread out much further.**
    - At 08:00 on the Wednesday, S runs from 65.6 % (Woluwe-Saint-Pierre) to 100 %, and the
      Region is at 93.6 %.
    - At 21:00 the Region falls to 77.3 %.
    - Ganshoren falls to 19.3 % from 21:00, Berchem-Sainte-Agathe to 38.8 %.
11. **A runs from 10.8 h (Woluwe-Saint-Pierre) to 19.8 h (Saint-Josse)** on the Wednesday. On the
    Sunday it runs from 3.7 h (Ganshoren) to 19.5 h. On a Sunday, a resident of Ganshoren has on
    average under four hours of service at more than 10 departures per direction.
12. **The median resident of the Region has 31 departures per direction within reach at 08:00**,
    and 16 at 21:00.

## 7. Open questions

- **Q1.** Ganshoren. Answered on 11 September: network changes after 2018 (finding 2).
- **Q2.** The time window on the site: the whole hour that contains the displayed time, as the
  speed views do, or 60 minutes centred on it?
- **Q3.** A stricter class. Answered on 11 September: more than 20 departures (D22, D24).
- **Q4.** Both directions or per direction. Answered on 11 September: per direction (D23).
- **Q5.** Distances along streets for the grid (D13).
- **Q6.** Where the reference data live. The proposal: a derived file, committed and refreshed once
  a year, rather than a download in the nightly.
- **Q7.** Wording and scope: "desserte STIB". Add the SNCB, De Lijn and TEC later?
- **Q8.** The size of the grid for the site. The prototype page puts 46,068 drawn cells × 24 hours
  × 2 bytes, for two days, into 0.74 MB after gzip. The site's budget can take one day, loaded
  when the view is opened, as it does for the hourly speeds.

## 8. Known limits

- The STIB only. Municipalities with railway stations (Watermael-Boitsfort, Uccle, Haren, Evere)
  are under-rated.
- Straight-line reach with an average detour factor. It ignores barriers locally.
- Residents spread evenly within each sector.
- The scheduled timetable, as everywhere on the site. Delays are not counted.
- Residents only: jobs, schools and visitors are not counted.

## 9. Prototype files

The prototype lives outside the repository, in the session's temporary folder, and is not
versioned. The sections above describe the method completely enough to rebuild it.

| File | Role |
|---|---|
| `extract.py` | Keeps the Brussels sectors out of the national file and joins the population |
| `lambert2008.py` | Converts between Lambert 2008 and longitude/latitude |
| `coverage.py` | Grid, places, departures within reach, the three figures, the IBSA replication and the Commission comparison |
| `ganshoren.py` | Ganshoren's share under the IBSA's rules, without each route in turn (finding 2) |
| `build_page.py` | Packs both days into one page, from `page_template.html` |
| `page_template.html` | The page: map canvas, controls, table, legend, light and dark themes |

Outputs:

- `coverage-<date>.json`, per municipality;
- `grid-<date>.json`, per cell;
- `desserte-prototype.html`, the page (D20).

## 10. Sources

- IBSA, Monitoring des Quartiers, indicator for 2018:
  <https://geodata.perspective.brussels/api/geodata/mdq/dataset/23254>. Identifiers 2851 to 2869
  follow the order of the NIS codes 21001 to 21019.
- European Commission, Poelman and Dijkstra, 2020, city figures:
  <https://ec.europa.eu/regional_policy/sources/work/urban_accessibility_list.pdf>
- SDG 11.2.1 metadata: <https://unstats.un.org/sdgs/metadata/files/Metadata-11-02-01.pdf>
- Statbel, statistical sectors: <https://statbel.fgov.be/fr/open-data/secteurs-statistiques-2026>
- Statbel, population by sector:
  <https://statbel.fgov.be/en/open-data/population-statistical-sector-12>
- Brussels urban planning regulation (RRU), title VIII, accessibility zones A, B and C:
  <https://urbanisme.irisnet.be/pdf/RRU_Titre_8_FR.pdf>
- Lebrun, Brussels Studies no. 123, 2018: <https://journals.openedition.org/brussels/1652>
- STIB, press release of 28 October 2019 on line 83:
  <https://stib.prezly.com/nouvelle-etape-pour-le-plan-directeur-bus-de-la-stib>
- BX1, 1 September 2021, network changes including line 83:
  <https://bx1.be/categories/news/une-nouvelle-ligne-de-bus-traces-modifies-voici-les-changements-sur-le-reseau-stib-en-septembre/>
- Swiss ARE, public transport quality classes, January 2022:
  <https://www.are.admin.ch/dam/de/sd-web/AZsFQRE7tiOY/oev-gueteklassen-berechnungsmethodikare.pdf>
- Transport for London, PTAL: <https://content.tfl.gov.uk/connectivity-assessment-guide.pdf>

# Restaurant and activity expansion handoff

Last updated: September 29, 2026.

## Purpose and user intent

Expand DateBloom's verified Tampa restaurants and nearby activities so customers can generate more useful dates across cuisines, budgets, neighborhoods, settings, and schedules. The user agreed that broader coverage is the next implementation priority and asked for this document so a new chat can resume with the context intact.

This document records the recommended batching approach and execution steps. Creating it did not add any venues. Start future implementation by reading this file, the relevant project documents, and the current catalog; update the progress section as work proceeds.

Suggested prompt for a new chat:

> Read restaurant-additions.md and continue the restaurant and activity expansion. Check the progress tracker and current catalog first, then work through the next unfinished batch, retaining sources and verification dates.

## Current project and existing data

Project root: `D:\Michael\Programming\ProjectsV2\DatePlanner`.

The working local app generates named Tampa itineraries, checks constraints, saves snapshots in SQLite, and supports guest plans and optional accounts. Phase 3 in `Date_Planning_Implementation_Plan.md` is the main expansion milestone.

The starting catalog contained four restaurants: Forbici Tampa, Eddie & Sam's, Nueva Cantina's downtown patio, and Noble Rice. The first expansion group adds Columbia Cafe, Bavaro's downtown and Boulon, plus Tampa Bay History Center, Henry B. Plant Museum and Cotanchobee Park. See the progress tracker and current code for the latest additions.

Two datasets already provide discovery candidates:

| Dataset | Location | Snapshot and useful details |
| --- | --- | --- |
| DateBloom discovery registry | `data/restaurant-registry.json` | September 28, 2026 import; 7,545 unique DBPR licenses across Hillsborough and Pinellas. Discovery records are not loaded into the generator. |
| Older Bay Bites project | `D:\Michael\Programming\Projects\tampa` | September 17, 2026 snapshot; 7,551 listings, including 2,949 with Tampa city addresses. Useful editorial tags, websites, and approximate coordinates. |

Counts are dated snapshots, not counts of restaurants currently open. The older directory has 55 website links and 51 price categories; its records have no opening-hours fields. Most cuisines are unknown or inferred from business names. Editorial tags and price categories need fresh verification before use in the planner.

The older project need not run to inspect its files:

- `catalog/directory.json`: full directory with branch addresses, licenses, and enrichment.
- `catalog/hrfood3.csv`: original downloaded DBPR source.
- `data.js`: curated cuisine, neighborhood, atmosphere, price categories, and website links.
- `catalog-builder.js`: parses licenses and attaches editorial enrichment.
- `refresh-catalog.js`: downloads and rebuilds the directory.
- `catalog/locations.json`: US Census geocoding for 6,945 addresses; coordinates are approximate address locations.
- `catalog/location-corrections.json`: separately sourced corrections.
- `parking.js` / `catalog/parking-cache.json`: OpenStreetMap parking information; not route times or live availability.

Both projects use the same DBPR source. Prefer DateBloom's newer registry for license discovery. Use Bay Bites to find promising candidates, websites, and locations; keep DateBloom independent of the older project's runtime.

## Sources

- User-supplied discovery list: <https://www.visittampabay.com/food-and-drink/>. This was supplied as a starting source; this handoff does not imply its current entries have been reviewed.
- DBPR District 3 CSV: <https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood3.csv>.
- DBPR source documentation: <https://www2.myfloridalicense.com/hotels-restaurants/public-records/>.
- Restaurant official branch pages, menus, and reservation links.
- Official attraction/operator, City of Tampa park, museum, and event organizer pages for activities.
- Ordering or ticket providers linked by the official venue can corroborate branch prices and booking methods.

Use tourism lists and editorial records to discover candidates. Record official evidence for facts needed to schedule and budget a date. A license alone does not establish current opening, hours, cuisine, seating, or prices. Resolve contradictions by checking the exact branch and retaining the explanation; leave unresolved candidates pending.

## Batch strategy

Work by neighborhood, pairing restaurants with nearby activities. A candidate shortlist can contain about 100 restaurants. Implementation batches should normally contain 10-15 verified restaurants and 5-8 verified activities, adjusted to available evidence and useful combinations.

First milestone: **15 additional restaurants and 8 additional activities** beyond the starting catalog, focused on Downtown / Water Street. These are targets, not permission to invent missing facts. If the area cannot support that many verifiable, useful additions, document the gap and continue with the next neighborhood.

Recommended neighborhood order:

1. Downtown / Water Street: broaden the existing working combinations.
2. Hyde Park / SoHo: expand restaurants and add nearby activities. The existing app neighborhood label is `Hyde Park`; check the actual branch location before mapping a SoHo candidate to it.
3. Seminole Heights: establish useful meal/activity combinations in this currently unsupported area.
4. Other Tampa neighborhoods after updating the supported area choices consistently.

Prioritize missing cuisines, a mix of lower/moderate/higher costs for two, indoor and outdoor options, evening/weekend hours, free and paid activities, and combinations with short supported travel. Repeated branches or many similar restaurants should not crowd out missing activity coverage.

## Files to read and update

| File | Role |
| --- | --- |
| `Date_Planning_Implementation_Plan.md` | Overall roadmap and progress |
| `docs/restaurant-registry.md` | Discovery commands, safeguards, and promotion checklist |
| `docs/venue-source-reviews.md` | Existing source evidence; extend with each promoted venue |
| `apps/web/lib/venue-catalog.ts` | `CatalogVenue`, `CatalogEvent`, curated records, and walking buffers |
| `apps/web/lib/generate-plan.ts` | Selection, hours, prices, scheduling, descriptions, and travel behavior |
| `packages/contracts/src/index.ts` | Supported cuisines/activities and request/result validation |
| `apps/web/app/request/request-form.tsx` | Customer area and preference controls |
| `apps/web/lib/local-db.ts` | City coverage seed and persistent local data |
| `apps/web/lib/generate-plan.test.ts` | Planner/contract regression checks |
| `apps/web/scripts/verify-browser.mjs` | Isolated live acceptance suite |
| `README.md` | Customer-facing coverage and current limitations |

## Execution steps

### 1. Establish the starting point

Read repository instructions and the files above. Check existing venues and candidate progress to avoid duplicate work. Inspect the discovery snapshot's source date. Refresh when needed; a refresh downloads licenses, not verified planning facts.

From the DateBloom root:

```powershell
pnpm restaurants:refresh
pnpm restaurants:review --city TAMPA --limit 100
pnpm restaurants:review --city TAMPA --search "RESTAURANT NAME"
```

Offline import is available when needed:

```powershell
pnpm restaurants:refresh --input "D:\Michael\Programming\Projects\tampa\catalog\hrfood3.csv"
```

That CSV is older; offline source freshness is unknown. Do not replace a newer useful snapshot casually. Personal journal additions or corrections in Bay Bites browser localStorage are not necessarily present in repository files.

### 2. Build and track the candidate shortlist

Review the newer registry, Bay Bites editorial records, Visit Tampa Bay, and other discovery sources. Group exact branches by neighborhood and prioritize the gaps above. Add activity candidates alongside restaurants.

Use the candidate table at the end of this document. Give each candidate a stable proposed ID, exact branch/address, sources, status, missing facts, and next action. Use statuses `candidate`, `researching`, `blocked`, `verified`, and `added`. A blocked candidate should retain its reason so another chat can continue research.

### 3. Verify each restaurant

For every branch, record:

- Name, full address, neighborhood, and DBPR license when available; resolve name/address/status conflicts.
- Official branch URL and menu URL; ensure the menu applies to that branch.
- Supported cuisine labels, with evidence for the selected categories.
- Regular dining hours by day, closed days, published holiday exceptions, kitchen cutoffs, and seating restrictions.
- Evidence for the enabled indoor or outdoor setting; avoid claiming patio availability from a generic chain page.
- A reproducible meal example for two with item quantities, individual prices, subtotal, and drinks/water assumptions.
- Direct booking link if the venue supplies one; booking availability remains unconfirmed.
- Actual source review date, review deadline, evidence URLs, and unresolved limitations.

Variable closing times, unpriced menus, unknown seating, or unresolved identity can prevent promotion. Keep such candidates in research rather than guessing. A missing DBPR record is a research issue, not automatic proof that a venue does not exist.

### 4. Verify each activity and its potential pairings

Record the exact venue, address, category, setting, official hours, adult admission/cost for two, ticket requirements, duration assumptions, and source dates. Check whether private groups, advance booking, minimum group sizes, age limits, or special schedules affect a two-person date.

For live performances and timed events, record explicitly published dates and start/end times in `CatalogEvent`; general music advertising is insufficient. Free admission also needs a source. Note weather/seasonal limitations for outdoor options.

Identify restaurants that can pair with each activity within overlapping hours, the requested duration, and budget. Approximate Census coordinates can help find nearby candidates, but do not establish walking routes, entrances, driving times, or accessibility.

### 5. Add the verified records and required supporting code

Add reviewed records to `apps/web/lib/venue-catalog.ts` using stable IDs and matching types. Record evidence in `docs/venue-source-reviews.md` with each venue's identity, hours, priced example, source dates, and limits.

Implementation details to preserve:

- `hours` is Sunday through Saturday, indexed 0-6; entries use minutes after midnight, and `null` means closed. The current model has one interval per day. Split service, overnight hours, timed sessions, or closure exceptions may require model/scheduler changes rather than an inaccurate flattened interval.
- Store monetary values in integer cents. Current meal estimate: `ceil(subtotalForTwoCents * 1.3) + 1000`, plus 3000 cents when alcohol is preferred. Activities use `ceil(subtotalForTwoCents * 1.1)`. These are existing allowances, not actual tax quotes. Avoid double-counting fees already included in a sourced price.
- Set new records' own `sourceCheckedOn` and `sourceExpiresOn`; existing records commonly use a 30-day review interval. Adding venues must not re-date unreviewed older records.
- Current cuisine and activity options are finite lists in the shared contracts. Prefer accurate existing categories; add a new option consistently across contracts, controls, and generation if necessary.
- Restaurant neighborhood matching uses exact strings. Current choices are `Downtown / Water Street`, `Hyde Park`, and `Seminole Heights`. New areas require consistent form and city coverage updates; changing an `INSERT OR IGNORE` seed alone does not update an existing SQLite city row.
- Regular activities now use each venue's `description` in `generate-plan.ts`. Every new activity must have its own sourced description; do not reuse another venue's copy.
- `schedule` supports finite `availableThrough` coverage, dated and annual closures, Thanksgiving, and annual early closing times. `venue-hours.ts` applies those exceptions both to eligibility and the scheduler's closing boundary. Split service intervals still require a separate extension.
- `CatalogVenue.setting` currently represents one setting. If both settings are supported, implement an intentional representation and account for venue identity; do not accidentally duplicate a restaurant just to inflate coverage.
- Add walking buffers only with supporting route evidence, recording method and review date. Missing walking routes should retain the existing no-match behavior. Driving currently uses a disclosed 15-minute planning allowance with unknown actual time; live routing and parking costs remain separate roadmap work.
- The current result contract allows at most two stops. The expansion adds choices, not an implicit change to longer multi-stop itineraries.

### 6. Check behavior for the batch

Use meaningful planner checks for successful selection, closed hours/days, exact budget boundaries, cuisine/setting enforcement, full duration, and missing routes. Verify new activity descriptions. Use future dates in Tampa's `America/New_York` timezone and explicitly dated event fixtures.

Check generated results, My Dates, persisted source snapshots, and retry behavior. Existing saved plans must retain their original venue/source snapshots. At least representative new combinations should be exercised through the live browser journey, including no-match recovery and mobile display.

Existing commands:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:browser
```

Browser verification uses an isolated app/database. See `docs/local-verification.md` for setup and limitations. Run checks when implementing batches; writing this handoff does not itself verify additions.

### 7. Finish the batch and leave a usable handoff

Update the candidate table, source reviews, README coverage, and implementation plan. Record exactly what was added, what remains blocked, which combinations/checks passed, and which work should start next. Keep historical check results separate from checks performed in the current batch.

A completed batch has verified records integrated into the generator, correct descriptions and area/category choices, representative usable meal/activity combinations, preserved constraints and saved snapshots, documented evidence, and passing relevant checks. Report any shortfall against the target instead of claiming completion based only on a candidate count.

## Planning rules that expansion must preserve

- Every meal lasts at least 60 minutes; the itinerary covers the full requested duration.
- Selected cuisines, activities, area, and setting are enforced without silent substitution.
- Ordinary food dislikes are unconfirmed ordering requests using standard prices. Allergies/strict dietary requirements and accessibility needs require verified support; the current generator rejects these requirements globally.
- Sources do not establish reservation confirmation, live availability, exact traffic time, parking cost, or kitchen acceptance unless explicitly verified through a supported capability.
- An unsupported request returns an actionable no-match result and retains form answers.
- Published source facts and planner assumptions must be distinguishable.

## Progress tracker

Status as of September 29, 2026: batch 1's catalog target is implemented: 15 additional restaurants and 8 additional activities (first group 3 / 3; completion group 12 / 5). Total planner coverage is 19 restaurants and 10 regular activities plus dated music events. Nueva Cantina and Noble Rice belong to the previous expansion and do not count toward batch 1. Evidence: `docs/venue-source-reviews.md` and `docs/batch-one-source-reviews.md`. Unknown walking routes, live availability, strict dietary/accessibility facts and automatic refresh are not claimed complete.

| Batch | Area | Additional restaurant target | Additional activity target | Status |
| --- | --- | --- | --- | --- |
| 1 | Downtown / Water Street restaurant cluster + nearby activities | 15 | 8 | Target implemented: 15 restaurants / 8 activities added |
| 2 | Hyde Park / SoHo | 10-15 | 5-8 | In progress: candidate queue started; 0 restaurants / 1 activity added |
| 3 | Seminole Heights | 10-15 | 5-8 | Pending |

Candidate tracker: added records have source reviews; other rows are research leads and do not count as planner coverage. This is an initial shortlist, not the eventual 100-candidate review queue.

| Proposed ID | Restaurant/activity and exact branch | Address / area | Evidence URLs | Status | Missing facts / next action | Reviewed on | Added in batch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| columbia-cafe-history | Columbia Cafe at History Center | 801 Water St / Downtown | [Official branch](https://www.columbiarestaurant.com/columbia-cafe-at-the-tbhc) | added | Patio only; five-minute on-site buffer to galleries; other routes pending | 2026-09-29 | 1 |
| bavaros-downtown | Bavaro's downtown | 514 N Franklin St #101 / Downtown | [Official branch/menu](https://bavarospizza.com/locations/tampa/) | added | Dinner prices; outdoor only; walking routes pending | 2026-09-29 | 1 |
| boulon-water-street | Boulon Brasserie | 1001 Water St / Water Street | [Official venue](https://www.boulontampa.com/) | added | Full dinner window only; walking routes pending | 2026-09-29 | 1 |
| tampa-history | Tampa Bay History Center | 801 Water St / Downtown | [Visit](https://tampabayhistorycenter.org/visit/) | added | Check dates against published holiday exceptions | 2026-09-29 | 1 |
| plant-museum | Henry B. Plant Museum | 401 W Kennedy Blvd / across river from Downtown | [Visit](https://www.plantmuseum.com/discover/visit-accessibility) | added | Extend beyond 2026-11-30 only after seasonal/event review | 2026-09-29 | 1 |
| cotanchobee | Cotanchobee Fort Brooke Park | 601 Old Water St / Downtown | [City page](https://www.tampa.gov/parks-and-recreation/featured-parks/cotanchobee-park) | added | Ordinary park walk only; walking routes pending | 2026-09-29 | 1 |
| malios-prime | Malio's Prime Steakhouse | 400 N Ashley Dr / Downtown; SEA3916250 | [Official site](https://maliosprime.com/) | added | Indoor dinner coverage from 17:00; two-person example documented | 2026-09-29 | 1 |
| dio-downtown | Dio Modern Mediterranean | 519 N Franklin St / Downtown; SEA3916307 | [Official site](https://diotampa.com/) | blocked | Inspected sources lack usable closing time and priced individual meal; not added | 2026-09-29 | Pending |
| spain-downtown | Spain Restaurant & Toma Bar | 513 N Tampa St / Downtown; SEA3915455 | [Inspected contact](https://www.tomaspain.com/contact-locations/) | blocked | Contact page contains unrelated Dallas template locations; find trustworthy current Tampa source | 2026-09-29 | Pending |
| yeomans-downtown | Yeoman's | 202 N Morgan St / Downtown; SEA3911382 | [Official menu](https://yeomanstopgolfswingsuite.com/tampa-menu/) | added | Outdoor meal; games excluded; midnight kitchen cutoff enforced | 2026-09-29 | 1 |
| anchor-brine | Anchor and Brine | Marriott Water Street / SEA3912229 | Operator hotel menu inspected | blocked | Published menu lacked prices; do not infer a budget | 2026-09-29 | Pending |
| florida-aquarium | The Florida Aquarium | Channelside / exact visit details pending | Official operator site to inspect | candidate | Date-based admission and hours; add accurate activity category if promoted | Not verified | Pending |
| splitsville-channelside | Splitsville Tampa bowling | 615 Channelside Dr Suite 120 | [Operator](https://www.splitsvillelanes.com/location/tampa/) | added | 45-minute two-person session; Mon-Sat rate including shoes; Sunday excluded; booking inquiry disclosed | 2026-09-29 | 1 |
| tampa-theatre | Tampa Theatre | Downtown / exact visit details pending | Official theater schedule to inspect | candidate | Check renovation/reopening and explicitly dated show/tour tickets before promotion | Not verified | Pending |
| candle-pour-hyde-park | The Candle Pour | 1619 W Snow Cir / Hyde Park | [FAQ](https://thecandlepour.com/pages/faq), [pricing](https://thecandlepour.com/pages/custom-products), [reservations](https://thecandlepour.com/pages/reservations-locations) | added | Wednesday-Saturday only; confirm conflicting other-day hours and booking before visit | 2026-09-30 | 2 |
| timpano-hyde-park | Timpano | 1610 W Swann Ave / Hyde Park | [Official menu](https://www.timpanohydepark.com/menu) | researching | Menu has no usable individual prices; verify current dinner example for two | 2026-09-30 | Pending |
| irish31-hyde-park | Irish 31 | 1611 W Swann Ave / Hyde Park | [Official branch](https://irish31.com/hyde-park/), [menu](https://irish31.com/menu/) | researching | Current menu omits meal prices; dated 2023 PDF is insufficient | 2026-09-30 | Pending |
| on-swann | On Swann | 1501 W Swann Ave / Hyde Park | [Official site](https://www.onswann.com/), [Village branch](https://hydeparkvillage.com/tenants/on-swann/) | researching | Linked priced PDF is dated 2025 and menu is seasonal; check current price and dinner service | 2026-09-30 | Pending |
| ro-hyde-park | Ro | 1500 W Swann Ave / Hyde Park | [Official dinner menu](https://www.rohydepark.com/menu/dinner/) | researching | Entrée prices absent; account for published additional fee | 2026-09-30 | Pending |
| meat-market-hyde-park | Meat Market | 1606 W Snow Ave / Hyde Park | [Official branch](https://www.meatmarket.net/location/meat-market-tampa/) | researching | Verify a current priced dinner for two and dress code; published hours alone are insufficient | 2026-09-30 | Pending |
| bartaco-hyde-park | Bartaco | 1601 W Snow Ave / Hyde Park | [Official branch](https://bartaco.com/location/tampa/) | researching | “11am-late” lacks a cutoff; verify current priced meal and patio choice | 2026-09-30 | Pending |
| sweetgreen-hyde-park | Sweetgreen | 722 S Village Cir / Hyde Park | [Village branch](https://hydeparkvillage.com/tenants/sweetgreen/) | candidate | Verify operator menu price, exact branch service and seating | 2026-09-30 | Pending |
| jekyll-hyde-park | Jekyll | Hyde Park Village / exact address pending | [Village directory](https://hydeparkvillage.com/explore/) | candidate | Identify exact branch, full meal, prices, hours and seating | 2026-09-30 | Pending |
| bouzy-hyde-park | Bouzy | Hyde Park Village / exact address pending | [Village directory](https://hydeparkvillage.com/explore/) | candidate | Identify exact branch, full meal, prices, hours and seating | 2026-09-30 | Pending |
| sesame-hyde-park | Sesame | 1500 W Swann Ave / Hyde Park | [Village branch](https://hydeparkvillage.com/tenants/sesame/) | researching | Page conflicts on closing hours; verify current priced meal and service cutoff | 2026-09-30 | Pending |
| color-me-mine-tampa | Color Me Mine | 730 S Village Cir / Hyde Park | [Operator](https://tampa.colormemine.com/) | researching | Verify exact two-person pottery price and available piece; hours alone are insufficient | 2026-09-30 | Pending |
| cinebistro-hyde-park | CinéBistro | 1609 W Swann Ave / Hyde Park | [Village branch](https://hydeparkvillage.com/tenants/cinebistro/) | researching | Showtimes and ticket prices vary; age 21+; needs event-aware scheduling | 2026-09-30 | Pending |
| bayshore-linear-trail | Bayshore Linear Park Trail | 312 Bayshore Blvd listed by City; trail extends past Hyde Park | [City trail page](https://www.tampa.gov/parks-and-recreation/programs/parks-and-facilities/greenways-and-trails/trail-maps/bayshore-trail) | researching | Sunrise-to-sunset hours need date-aware scheduling and an exact entry point | 2026-09-30 | Pending |
| kate-jackson-park | Kate Jackson park/center | 821 S Rome Ave / Hyde Park | [City recreation centers](https://www.tampa.gov/parks-and-recreation/activities-recreation/recreation-centers) | candidate | Confirm adult date activity, park hours, and free entry; center listing is mostly youth programs | 2026-09-30 | Pending |
| sur-la-table-hyde-park | Sur La Table | Hyde Park Village / exact address pending | [Village directory](https://hydeparkvillage.com/explore/) | candidate | Verify dated two-person class slots, cost and age rules | 2026-09-30 | Pending |

Verification completed September 29, 2026: all 82 automated tests pass (43 existing planner/contract checks, 23 expansion/schedule checks and 16 registry checks), along with lint, typecheck and 19 live browser acceptance checks. The live suite exercises all six new venues across five combinations, saved snapshots, reloads, identical retries and desktop/mobile layouts. Report and screenshots: `.verification-tmp/run-DPw9KW/artifacts`. The Plant Museum browser journey runs only when its future fixture falls within verified seasonal coverage; fixed-date unit tests always cover that venue.

The preceding 82-test / 19-browser result is historical verification of the first group, not the completion group.

Final completion verification, September 29, 2026: **102 automated tests passed** (43 planner/contract, 23 first-group/schedule, 20 completion-group, 16 registry), plus lint, typecheck and **23 live browser acceptance checks**. Browser artifacts: `.verification-tmp/run-yBabNE/artifacts`. Four new live journeys cover Mediterranean dinner, American bowling, outdoor ship museum and the free indoor police museum; all exercise saved snapshots, reloads and identical retries. Normal user data was not changed by the isolated test run.

Completion group inventory (all added September 29, batch 1; see source review for addresses, licenses, hours and prices):

| IDs | Added coverage |
| --- | --- |
| malios-prime, yeomans-downtown, small-giant, cws-gin-joint | American dinner/pub options |
| district-tavern | American / Seafood |
| predalina-water-street | Mediterranean |
| market-edition, tampa-pizza-downtown, fabrica-channelside | Italian; Tampa Pizza also vegetarian category |
| wagamama-water-street | Japanese outside dining |
| lona-water-street, urban-cantina | Mexican indoor dining |
| splitsville-channelside | Indoor Bowling, 45-minute session for two |
| american-victory | Museum with exposed decks; outdoors classification |
| water-works-park, perry-harvey-park | Outdoor walks; Water Works is actually in Tampa Heights |
| tampa-police-museum | Short free indoor Museum visit |

Implementation files: `apps/web/lib/venue-batch-one.ts`, imported into the existing catalog. `venue-batch-one.test.ts` exercises every completion record. Browser coverage adds Mediterranean, bowling, ship museum and free museum journeys. Exact-cost arithmetic uses integer percentage numerators to avoid phantom one-cent floating-point rounding.

Batch 2 started September 30: ten restaurant leads and six activity leads were queued; The Candle Pour was the only newly promoted record. The 10-15 restaurant / 5-8 activity integration target remains open. Next: verify current, branch-specific priced meals and exact service hours for the queue, then promote a coherent group. Resolve sunrise/sunset and showtime scheduling before promoting those activities. See `docs/batch-two-source-reviews.md`. Checked routes remain separate work; never infer them from Census coordinates. Keep after-midnight service, date-variable admissions and booking restrictions out of unsupported fixed-price records.

Batch 2 first-slice verification, September 30: typecheck, lint and 104 automated tests passed. The isolated live suite passed 24 browser checks, including an hour-aligned Hyde Park Candle Pour journey on mobile with generated result, saved snapshot, reload and idempotent retry. Artifacts: `.verification-tmp/run-yCyzMX/artifacts`. The normal local database was not used by the browser suite.

# DateBloom

Automatic date planning for Tampa. Enter a schedule, budget, neighborhood, and preferences to get a named venue itinerary. Plans are saved locally and shown in My Dates.

The generator selects specific restaurants, activities and dated concerts from sourced Tampa records. It checks published hours, your start window and an approximate price range for two. A restaurant can use a broad price band without an exact menu price. The low end must fit your budget; if the high end exceeds it, the plan warns you rather than claiming the bill is guaranteed. Cuisines, area, selected activities and setting determine which venues are eligible. The itinerary must cover the full allotted duration. Travel preferences rank matches, with unmeasured route times disclosed. If the full allotted duration cannot fit, it explains why and keeps your answers. There is no generic-category fallback.

## How preferences are used

- Every meal stop lasts at least one hour. The scheduler rejects a meal that cannot fit a full hour before closing.

- Restaurants must match one of your cuisines and your starting area.
- If you select activities, the plan must include one of them. Leaving activities blank lets the planner choose.
- Indoor/outdoor selections filter venues; unavailable choices are explained rather than substituted.
- Dinner-only plans are allowed only when you explicitly allow a single stop and have not selected an activity.
- Duration is allotted time: a four-hour request requires a four-hour itinerary. The scheduler cannot shorten it to fit closing times.
- Travel between stops can be drive/rideshare, walking, or open to either. Open to either favors walks within your comfortable limit (15 minutes when left blank) and considers driving if walking cannot fit. Your trip to the first stop is separate.
- A comfortable walking limit filters approximate walking options. If you leave a car at the first stop, select the return-to-car option to include the estimated walk back in your allotted date time.
- Preferred travel time is optional and affects ranking. Actual driving times remain unverified until routing is connected.
- Budget, future start dates, venue hours, actual event dates, dietary requirements and accessibility needs remain constraints.
- There is no matching-mode selector and no automatic replacement of selected activities.

## Current venue coverage

- **Hyde Park:** Forbici Modern Italian (Tampa).
- **Downtown / Water Street:** 18 restaurants, including the original six plus Malio's, Yeoman's, Predalina, Market at EDITION, Wagamama, Tampa Pizza Company, Small Giant, Fabrica, Lona, Urban Cantina, District Tavern and CW's Gin Joint. Together with Forbici and Green Lemon in Hyde Park / SoHo, the planner has 20 restaurants. There are 11 regular activities, including Splitsville bowling, American Victory Ship & Museum, Water Works Park in Tampa Heights and Perry Harvey Sr. Park, the free Tampa Police Museum, and The Candle Pour in Hyde Park Village.
- **Hyde Park / SoHo Batch 2:** Green Lemon is the first added restaurant, with a conservative indoor Mexican meal window; The Candle Pour is the first added activity. Its $42-per-person Classic Soy Candle experience is scheduled Wednesday–Saturday within a conservative 10 AM–8 PM window; reserve directly and allow about two hours for candles to set. The remaining restaurant and activity candidates need further verification. See [Batch 2 source reviews](docs/batch-two-source-reviews.md).
- **Live music:** Rock the Park on October 1, November 5 and December 3, 2026 (18:00-21:00), and Keys in the Park on October 9, 2026 (17:30-19:30).
- Cuisine coverage is Italian/vegetarian, Mexican, Japanese, Spanish, French, American, Seafood and Mediterranean. Spanish selects Columbia Cafe's patio; French selects Boulon's indoor dinner service. Mexican indoor dining and Japanese patio dining are now supported. Unsupported cuisines and Seminole Heights still return no match.
- Splitsville uses the published 45-minute lane session for two, with shoes included. Sunday's different price is excluded, not treated as a venue closure; Friday/Saturday and advance bookings require contacting the venue. The ship museum includes exposed decks and is not offered for indoor-only requests. See [batch-one source reviews](docs/batch-one-source-reviews.md) for pricing, booking limits and conservative service windows.
- The History Center allows two to three hours for its galleries and observes published holiday closures. Plant Museum closes Mondays, opens at noon Sundays, and is enabled only through November 30, 2026 pending verification of its seasonal schedule. Check [source reviews](docs/venue-source-reviews.md) for admission examples and planning assumptions.
- Live music requires an explicitly dated event. A venue advertising music generally does not establish a performance on a requested date.
- Ordinary food dislikes do not exclude restaurants. Entering `cheese` carries a request to leave cheese out into the meal description, adjustment notice and saved plan. Kitchen acceptance is unconfirmed; standard menu prices are retained without assuming a discount.
- The food field defaults to a preference/dislike. Its checkbox marks an allergy or strict dietary requirement; explicit allergy/medical/required wording is also guarded for older clients. Strict dietary and accessibility requirements still return no match until suitability is verified. The review repeats the food request and selected type; strict-requirement errors return to Preferences without losing answers.
- Driving time is unknown until a routing provider is connected; the schedule uses a disclosed 15-minute transition allowance. Walking, including any scheduled return to your parked car, uses approximate catalog buffers. Neither is a live route measurement; an exact drive-time limit cannot be verified.
- Columbia Cafe and the History Center galleries share a building and use a disclosed five-minute on-site walking allowance. Other new pairings, Nueva Cantina and Noble Rice have no checked walking buffers; walking-only requests cannot use those combinations. Flexible travel suggests driving without claiming a measured driving time.
- Meal estimates use published menu examples for two, a 10% tax allowance, 20% tip, and $10 cushion. Paid activities include a 10% tax allowance. Initial travel, parking and optional purchases are excluded and disclosed.
- Availability and reservations are separate: the app supplies direct booking/ticket links and does not make a booking.

### Source maintenance

Records and source links live in `apps/web/lib/venue-catalog.ts` and `venue-batch-one.ts`. Original seed records were reviewed on 2026-09-27 and become due on 2026-10-27. Nueva Cantina and Noble Rice were reviewed on 2026-09-28 and become due on 2026-10-28. Batch one's 15 restaurants and 8 activities were reviewed on 2026-09-29 and become due on 2026-10-29. Results warn when any selected record is due for review. Recheck official menus, hours and event listings, then update only the records actually reviewed and their dates. Do not extend event recurrence beyond explicitly published dates or re-date older sources when adding a venue. Verified menu/hour refresh remains manual. See [source reviews](docs/venue-source-reviews.md) for evidence and [restaurant-additions.md](restaurant-additions.md) for batch progress.

Saved itineraries retain their venue and source snapshots; retries return the same saved result. Earlier category-only results, meals shorter than one hour, and results shorter than the requested duration are retained as history but are no longer presented as valid itineraries. Regenerate those results; retries cannot return them as valid plans.

### Restaurant discovery

Run `pnpm restaurants:refresh` to import the Florida DBPR food-service registry for Hillsborough and Pinellas. Run `pnpm restaurants:review --city TAMPA --search "NUEVA CANTINA"` to inspect candidates. An existing CSV can be imported with `pnpm restaurants:refresh --input "C:\path\hrfood3.csv"`.

The snapshot powers the searchable `/restaurants` directory, preserving license/status details, flagging conflicts and mobile locations, and archiving missing records. The snapshot is local and ignored by Git, so each deployment must refresh its own copy. Listings are discovery only: official cuisine, hours, setting and a broad price band still need verification. Use `pnpm restaurants:enrich --input path/to/reviewed-records.json` to merge a batch of reviewed records into the versioned enrichment file; only complete, explicitly approved records enter the planner. No Google Places, Yelp or metered lookup API is used. See [restaurant discovery and verification](docs/restaurant-registry.md) for fields, safeguards and limits.

## Prerequisites

- Node.js 24.15 or newer (the app uses built-in SQLite)
- pnpm 10

## Run locally

1. Run `pnpm install`.
2. Optionally copy `.env.example` to `apps/web/.env.local` to choose a database path. The default is `data/datebloom.sqlite` in the project root.
3. Run `pnpm dev`.
4. Open http://localhost:3000 and choose **Plan my date**.

The database and Tampa coverage settings initialize automatically. No container, database server, cloud account, or privileged account setup is required.

## Accounts and saved plans

An account is optional. Guest plans are tied to this browser with an opaque HTTP-only cookie. Signing in or creating an account claims plans from the same browser, so they can be retrieved on other devices.

Account creation does not send email. Passwords use scrypt hashes, and account sessions use opaque HTTP-only cookies. Keep the SQLite file private because it contains saved preferences and dietary/accessibility notes. Never commit database files or credentials.

## Commands

- `pnpm dev` — start the website
- `pnpm --filter @datebloom/web build` — production build
- `pnpm lint`, `pnpm typecheck`, `pnpm test` — quality checks
- `pnpm hooks` — enable the local pre-commit and pre-push checks

Pull requests are required for changes to `main`. GitHub Actions runs typecheck, lint, tests, the production build, and a full-history secret scan for every pull request. Create a feature branch, run `pnpm hooks` once, and open a pull request instead of pushing directly to `main`.

SQLite is currently intended for development on one machine and one app instance. Production hosting/storage is a later milestone.

## Live acceptance checks

Run `pnpm test:browser` to verify the real generation, saving, retries, and account journeys in an isolated app copy with a fresh test database. It does not change your normal database or stop your dev server. The command prints the location of its verification report and desktop/mobile screenshots.

If the browser is missing, install it with `pnpm --filter @datebloom/web exec puppeteer browsers install chrome`. See `docs/local-verification.md` for the live checks (including the seasonally conditional Plant Museum journey) and remaining verification limits.

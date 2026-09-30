# Date Planning — Implementation Plan

**Status:** In progress; named itineraries, sunset design, flexible travel, live persistence/account verification, DBPR discovery, and the first verified Mexican/Japanese downtown expansion are complete. More neighborhoods, activities and checked routes remain next.
**Expansion update (2026-09-29):** Batch 1's catalog target is implemented: 15 additional restaurants and 8 additional activities. Overall coverage is 19 restaurants and 10 regular activities plus dated music events. See `restaurant-additions.md` and `docs/batch-one-source-reviews.md` for sources, verification and remaining limitations.
**Launch market:** Tampa, Florida.
**Delivery order:** Local website → verified venue catalog → public web pilot → additional cities and mobile.

## 1. Product goal

Customers enter their schedule, budget, neighborhood, cuisines, activities, and other preferences. The system creates a date itinerary automatically and displays it immediately. Customers can save the result and generate alternatives.

The local version selects named restaurants, activities and explicitly dated events from sourced Tampa records. There is no generic-category fallback. Generated text must not invent venues, prices, hours, suitability, availability, or booking confirmations.

No account is required to generate a date. Guest plans are saved to the current browser through an opaque HTTP-only session cookie. Optional accounts make saved plans available across devices.

## 2. Customer journey

1. **Schedule:** Choose a future preferred date, alternative dates, start window, and duration.
2. **Budget and area:** Set the total budget for two and starting neighborhood. Choose driving, walking, or open to either between stops, with an optional comfortable walking limit and return to a parked car.
3. **Preferences:** Select a mood and preset cuisines; optionally select activities, setting, alcohol preferences, occasion, dietary needs, and accessibility needs.
4. **Review:** Display the collected answers. Missing required fields block advancement on their own step.
5. **Generate:** The API validates the request, creates an itinerary, persists it, and returns it in the same response.
6. **Result:** Show named venues, addresses, event identities and times, estimated costs, sources, directions and direct booking links.
7. **My Dates:** Display saved plans; optional account sign-in claims plans created in the same browser.

Generation is free in the local version. There is no fixed advance-notice cutoff; each date option must have a future start time in Tampa. The app does not book or charge a venue in this milestone.

## 3. Architecture

- pnpm workspace with a Next.js website and versioned Route Handler API.
- Shared Zod contracts for input, generated plans, response shapes, and errors.
- Node SQLite for local account sessions, browser sessions, requests, and saved plans.
- Deterministic generation first: use explicit constraints, ranking, schedules, and integer-cent budgets.
- The planning package supplies reusable catalog filtering and budget functions as verified data is added.
- AI may later help interpret preferences or write descriptions, but it cannot override hard constraints or create factual venue data.
- Venue and reservation integrations are separate capabilities with documented provider requirements. Secrets stay on the server.

No container, external database service, paid AI account, or cloud account is needed for the current local website.

## 4. Generation rules

### Current implementation

- Every meal stop must last at least 60 minutes, regardless of venue; closing times cannot shorten it below that minimum.

- Select a sourced restaurant matching cuisine and the starting neighborhood.
- Select a named activity from the requested interests; music requires a published event date, start and end.
- Search the preferred and alternative dates and all minutes in the requested start window.
- Fit stops inside opening/event hours. Require the full allotted duration; never shorten it to fit closing times. Selected cuisines and activities are never substituted.
- Rank feasible combinations by preferred date, mood, selected interests and walking time.
- Open-to-either travel favors walks within the comfortable walking limit (15 minutes when blank), with driving considered when the walk is too long or cannot fit. Getting to the first stop is separate.
- When requested, include a walking return to a car parked at the first stop in the full allotted duration; show return timing and directions.
- Compare estimated costs for two including tax/tip allowances and contingency with the total cap.
- Select only matching cuisines, activities, area and setting. Explain an unavailable match without replacing the selections. Preserve the full allotted duration and disclose unverified travel time. Keep form answers.
- Carry ordinary food dislikes as unconfirmed ordering requests without excluding restaurants or assuming discounts. Reject unverified allergy/strict dietary and accessibility requirements instead of claiming suitability.
- Snapshot venue facts and source timestamps when saving. Idempotent retries return the snapshot.
- Do not regenerate old category-only saved results as if they were venue itineraries.

### Venue itinerary generator

1. Load active venues for the requested city from sourced records.
2. Exclude choices that violate known schedule, budget, setting, dietary, accessibility, age, or travel requirements.
3. Treat missing facts that affect a hard requirement as unresolved data. Do not silently assume suitability.
4. Rank valid combinations by cuisines, activities, atmosphere, neighborhood, travel, and variety.
5. Calculate stop timing, travel buffers, and total estimated cost, including taxes, tips, parking, and deposits where known.
6. Select a feasible combination automatically and explain its fit.
7. If no verified combination satisfies the constraints, show an explicit no-match result and useful changes the customer can make. Never silently relax a hard constraint.
8. Persist a snapshot so later catalog edits do not silently change saved dates.

Alternative dates are searched automatically when the preferred date has no feasible combination. Regeneration diversity is still pending.

## 5. Venue data

The sourced catalog contains Forbici Tampa, Eddie & Sam's N.Y. Pizza, Nueva Cantina's downtown patio, Noble Rice, Tampa Museum of Art, Curtis Hixon Waterfront Park, and the site of Keys in the Park. Music coverage contains explicitly published 2026 dates for Rock the Park and Keys in the Park. Artist names are not invented when the listing does not publish them.

Original records retain their 2026-09-27 review and 2026-10-27 deadline. Nueva Cantina and Noble Rice have their own 2026-09-28 review and 2026-10-28 deadline; freshness warnings check selected venues only. Verified menu/hour refresh is manual. Walking buffers remain approximate; neither new restaurant has a checked walking buffer. Flexible travel suggests driving with a disclosed 15-minute allowance and unknown actual time. Cuisine coverage is Italian/vegetarian in Hyde Park and Downtown, plus Mexican patio and Japanese indoor dining Downtown / Water Street. Ordinary food dislikes allow restaurant recommendations with unconfirmed ordering requests. Unsupported selections, allergies/strict dietary requirements and unverified accessibility needs return no match. See `docs/venue-source-reviews.md` for exact branches, official evidence, prices and limits.

Continue expanding records with:

- City, neighborhood, address, official URL, categories, cuisines, and activities.
- Opening hours and exceptions, typical duration, indoor/outdoor setting, and age limits.
- Price ranges for two people, deposits, tax/tip assumptions, and source timestamps.
- Structured dietary and accessibility facts with explicit unknown values.
- Coordinates and reliable travel estimates; distance alone is not drive time.
- Booking method, official booking URL, and any availability integration supported by the provider.

Keep illustrative fixtures separate from real records. Use original or licensed imagery. Provider failures and stale records must produce clear uncertainty or a no-match result rather than fabricated availability.

Restaurant discovery now imports the official Florida DBPR District 3 CSV, filtered to Hillsborough/Pinellas permanent restaurants and mobile vendors. `pnpm restaurants:refresh` supports live and offline sources; `pnpm restaurants:review` searches names, streets and license numbers. The September 28 live import retained 7,545 licenses, with 1,603 status/location warnings and one conflicting identity. All are discovery-only, not planner-eligible. Missing records are archived; suspicious or failed refreshes preserve the prior snapshot. See `docs/restaurant-registry.md` for the verification checklist. This does not verify menu prices, hours, cuisine, seating or today's opening status.

## 6. Reservations

Generation and reservation status are separate. A generated plan is not a reservation.

For the first venue release, provide official booking links and let customers reserve directly. Automated bookings can be added only through supported integrations with explicit customer authorization and confirmed provider responses. The app must show pending or failed actions accurately; a recommendation or approval never confirms a booking.

## 7. Data and API

Current data includes accounts, account sessions, guest browser sessions, city settings, request preferences, and generated-plan snapshots. The local implementation stores the request and generated plan together in request details.

Future normalized records include venues, venue sources, generated plans, itinerary stops, user exclusions, feedback, and integration results.

API:

- `POST /api/v1/date-requests`: validate, generate, save, and return the result immediately.
- `GET /api/v1/date-requests`: list the current account or browser's saved plans.
- Add separate owner-visible plan detail and regeneration endpoints; My Dates already renders saved snapshots.
- Add city coverage and feedback endpoints when needed.

Scope every saved plan to its account or opaque browser session. Use server-side validation, origin checks, and idempotency keys. Avoid duplicate plans on retry. Never expose another customer's preferences through predictable links. Preserve local dates and the city's IANA timezone; store absolute event timestamps where actual scheduled events are known.

## 8. Implementation phases

### Phase 1 — Local foundation

- [x] Create pnpm workspace, Next.js site, SQLite storage, and Tampa coverage seed.
- [x] Add shared request/response validation contracts.
- [x] Add optional email/password accounts and HTTP-only account sessions.
- [x] Add browser-bound guest requests and account claiming.
- [x] Document local setup and optional database path.
- [x] Generate the pnpm lockfile.
- [ ] Initialize version control and commit the lockfile.
- [x] Verify fresh database initialization, persistent sign-in, guest-to-account claiming, sign-out, and browser/account ownership isolation with the live app.
- [ ] Verify a clean dependency installation from a fresh checkout; the browser suite currently reuses installed dependencies.

### Phase 2 — Submission and saved plans

- [x] Build landing page, required-field stepper, review screen, and My Dates.
- [x] Apply the playful sunset palette, rounded Fredoka/Nunito typography, sticker buttons, doodles, tilted date ticket, full-bleed sunset illustration, and page-wide grain.
- [x] Verify responsive layouts at phone, tablet, desktop, and wide-desktop sizes with browser screenshots and overflow checks.
- [x] Validate future date/time options in Tampa without a fixed lead-time cutoff.
- [x] Generate a named venue itinerary from the submitted criteria or return no match.
- [x] Return the generated itinerary immediately.
- [x] Persist and display generated plans on submission and in My Dates.
- [x] Verify the earlier submission API and idempotent retries (before venue selection).
- [x] Recheck live submission, saved snapshots, selected-preference enforcement, alternative-date persistence and idempotency after the venue-selection change.
- [x] Label estimated costs, source dates, walking buffers and unconfirmed reservations clearly.
- [x] Verify stepper validation, review/back navigation, no-match recovery, generated results, and reset with mocked browser responses.
- [x] Verify the full live browser journey, including blocked empty steps, no-match recovery, successful generation, saved plans, and accounts.
- [x] Add repeatable isolated browser verification (`pnpm test:browser`) with 14 live acceptance checks, desktop/mobile saved-plan/new-cuisine screenshots, and app-restart persistence.
- [x] Preserve guest plans during account claiming when account and guest request keys collide.
- [x] Clarify foods/ingredients to avoid, distinguish ordinary dislikes from allergies/strict needs with a checkbox and explicit-wording guard, display the request type in review, and return strict-requirement errors to Preferences without losing answers.
- [x] Generate Nueva Cantina plans for ordinary cheese dislikes, carry the unconfirmed customization in meal details and saved adjustment notices, retain standard prices, and verify saved snapshots/reloads/retries; add 10 preference/strict-mode regression tests.

**Done when:** A customer generates a named itinerary immediately, sees their selected preferences reflected in it, and can retrieve the saved plan without another person's involvement.

### Phase 3 — Verified Tampa itineraries

- [x] Add reusable catalog filtering/ranking and integer-cent budget functions.
- [x] Replace generic-category output with named plans or clear no-match handling.
- [x] Enforce a universal minimum of one hour for every meal stop in generation, response validation, saved-plan display and retries.
- [x] Reject shortened results and preserve the full allotted duration.
- [x] Display local times using AM/PM in itineraries, event listings and review summaries.
- [x] Make travel optional, add driving, walking, or open to either, and disclose the suggested mode and unverified travel times.
- [x] Add an optional comfortable walking limit and include a requested parked-car return in the allotted duration.
- [x] Add 17 planner/contract tests for walking thresholds, driving fallbacks, legacy defaults, and parked-car return scheduling; verify the travel controls and result display in desktop/mobile browsers.
- [x] Remove the matching-mode selector; enforce selected cuisines, activities, area and setting without automatic substitutions.
- [x] Add a small sourced Tampa venue/event catalog with source review timestamps and expiry.
- [x] Add on-demand automated DBPR restaurant discovery refresh, offline CSV import, source provenance, status/conflict warnings, archived missing records, and a searchable review queue.
- [x] Verify the live DBPR feed and add 16 import/refresh regression tests; preserve the verified planner catalog and saved snapshots.
- [x] Promote exact downtown Nueva Cantina and Noble Rice branches using official cuisine, seating, hours, menus and prices; add 14 planner tests and two live browser journeys for this first expansion.
- [x] Preserve per-venue source review/expiry dates, derive coverage notices from records, remove Italian-only meal descriptions, and enforce outdoor settings on both meals and activities.
- [ ] Schedule registry refresh and automate verified restaurant menu/hour updates with closure exceptions.
- [ ] Expand planner-eligible cuisine/activity/neighborhood coverage using verified official sources.
- [x] Implement the first neighborhood batch group: three additional restaurants and three activities, with venue-specific activity descriptions, known schedule exceptions and finite Plant Museum seasonal coverage.
- [x] Finish batch 1's target of 15 additional restaurants and 8 additional activities: the first group contributes 3 / 3, and the completion group adds 12 / 5.
- [x] Apply cuisine, area, schedule and budget constraints; enforce selected activities and setting; enforce allotted duration and rank travel preferences; reject unknown dietary/accessibility suitability.
- [ ] Add structured dietary/accessibility facts and venue exclusions.
- [x] Build the combination scheduler with published hours/event times and estimated-budget checks; duration is allotted time and travel time is optional.
- [ ] Replace static walking buffers with live route estimates and include transport/parking costs.
- [x] Search alternative dates without silently changing other constraints.
- [ ] Generate different valid combinations on regeneration.
- [x] Display specific venues, addresses, event identities, sources, directions and direct booking/ticket links.

**Done when:** The system generates a feasible named-venue itinerary from the customer's criteria, or explains why none is available without inventing facts.

### Phase 4 — Saved plans and integrations

- [ ] Add plan detail and regeneration endpoints with ownership checks.
- [ ] Add venue exclusions based on catalog identifiers.
- [ ] Add optional calendar-file export and feedback.
- [ ] Add supported availability integrations when useful.
- [ ] Add automated booking only when provider confirmation, authorization, failure recovery, and cancellation handling are implemented.

### Phase 5 — Public website

- [ ] Choose hosting and production storage after checking current costs.
- [ ] Configure HTTPS, production session settings, backups, monitoring, rate limits, and account deletion.
- [ ] Verify mobile layouts, keyboard use, clear error recovery, and generated-plan quality.
- [ ] Add payment only if a priced product has been chosen; the local generator stays free.

### Phase 6 — Expansion and mobile

- [ ] Add new cities with their own verified data, timezone, coverage, and travel model.
- [ ] Add Expo only after web use shows a reason to install a native app.
- [ ] Reuse contracts and generation rules across clients.
- [ ] Keep account tokens secure and test actual devices and deep links.

## 9. Verification priorities

- Required fields block the relevant step before review.
- A valid submission generates and returns a saved plan in one request.
- Cuisine, activity, mood, setting, duration, and budget changes affect the result.
- Budget allocations stay in integer cents and do not exceed the cap.
- Schedules cover the full allotted duration and show AM/PM times with explicit next-day markers.
- Unknown dietary, accessibility, travel, or availability facts are never presented as verified.
- Closest-plan differences are prominent; remaining no-match results are immediate and actionable.
- Duplicate retries do not create duplicate plans.
- Account and guest ownership remain isolated; signing in claims only that browser's plans.
- Generated plans and confirmed reservations remain distinct.

## 10. Next milestone

Batch 1's 15-restaurant / 8-activity catalog addition target is implemented. Next, review the completed batch and start batch 2 in Hyde Park / SoHo using `restaurant-additions.md`; do not count registry-only candidates as coverage. Checked walking routes, verified-source refresh, refresh scheduling and live routing remain pending, followed by structured dietary/accessibility facts and regeneration diversity. Current verification results are recorded in the handoff and `docs/local-verification.md`. Plant Museum's live journey remains conditional on seasonal coverage. Version-control initialization and a clean-install check remain open. See [the development roadmap](docs/development-roadmap.md) for the ordered follow-on work.

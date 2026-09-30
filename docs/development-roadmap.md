# DateBloom development roadmap

This roadmap is the recommended implementation order after the local CI and repository workflow are in place. It follows the delivery order and unfinished work in `Date_Planning_Implementation_Plan.md`, the next-action guidance in `restaurant-additions.md`, and the limitations recorded in the phase progress and source-review documents.

The current launch market remains Tampa. New venue facts must be verified from exact official sources, retain review dates and expiry dates, and remain separate from discovery-only DBPR records. The planner must continue to return named, feasible itineraries or an explicit no-match result; it must not invent availability, suitability, prices, hours, routes, or booking confirmations.

Pricing now uses approximate bands for new plans. Restaurant records may use a sourced band instead of an exact menu subtotal; legacy subtotals are retained for compatibility. Budget handling rejects only when the low end of the approximate range exceeds the requested budget and warns if its high end does. No third-party price API is required. The DBPR list supplies identity/discovery, not verified cuisine, hours or a price band. Internal registry search and batch enrichment import have promoted four reviewed Hyde Park restaurants; source facts still require branch-specific review before further promotion.

## 1. Build Batch 2: Hyde Park / SoHo

This remains the next product milestone. The candidate queue exists and five restaurants / one activity are now integrated. Continue toward approximately 10–15 restaurants and 5–8 activities in Hyde Park / SoHo, prioritizing verified activity coverage and blocked restaurant evidence over raw DBPR counts.

For every candidate:

- Record a stable ID, exact branch, address, area, official sources, status, missing facts, next action, review date, and batch number.
- Verify cuisine, hours and exceptions, duration, setting, age limits, a sourced approximate price band, and the available booking method before planner promotion. Keep an unknown price band marked unknown in discovery instead of inventing one. Do not require an exact two-person menu bill or invent a reservation URL.
- Keep blocked candidates and their reasons in the tracker rather than filling gaps with assumptions.
- Add venue-specific catalog records, source reviews, coverage documentation, and planner/regression tests only for verified additions.
- Keep walking routes, dynamic availability, and other unverified facts explicitly disclosed.

Done when the verified subset is integrated, its constraints are tested, source dates are recorded, and the README and implementation plan accurately describe the resulting coverage.

## 2. Improve venue freshness and closure handling

Automate the DBPR discovery refresh separately from verified planner data. Add a scheduled or otherwise repeatable process for reviewing official menus, hours, holiday closures, seasonal schedules, and event listings.

The refresh process must preserve the prior snapshot when acquisition fails, distinguish import timestamps from verification timestamps, warn about stale selected records, and never promote a discovery-only record automatically.

Done when a failed or stale refresh produces clear review work without silently changing planner eligibility or saved-plan snapshots.

## 3. Replace approximate travel with checked routes and costs

Add a routing abstraction that can provide checked walking and driving estimates for supported venue pairs. Include transportation and parking costs where they are known, while retaining the current disclosed fallback when routing is unavailable.

Do not infer driving time from distance or use a walking buffer as an accessibility guarantee. Preserve the distinction between the trip to the first stop, between-stop travel, and a requested return to a parked car.

Done when route mode, duration, uncertainty, and added costs are visible in generated plans and covered by planner, API, and browser tests.

## 4. Add regeneration diversity

Make regeneration select a different valid combination when alternatives exist while preserving every hard constraint: selected cuisines and activities, area, setting, duration, budget, schedule, dietary/accessibility requirements, and travel limits.

If no distinct valid combination exists, explain that clearly rather than weakening constraints. Saved snapshots and idempotent retries must remain stable.

Done when repeated regeneration has deterministic, testable diversity and never changes the user's answers or turns an invalid result into a valid-looking one.

## 5. Add structured dietary, accessibility, and venue exclusions

Expand catalog records with explicit verified facts and explicit unknown values for dietary and accessibility suitability. Add exclusions based on stable catalog identifiers and apply them before ranking and scheduling.

Unknown suitability must remain a no-match or unresolved condition for strict requirements. Ordinary dislikes may remain ordering requests only when the UI and result clearly identify them as unconfirmed.

Done when strict requirements and exclusions are enforced server-side, preserved in saved snapshots, and covered by negative and positive tests.

## 6. Complete saved-plan APIs and feedback

Add ownership-checked plan-detail and regeneration endpoints. Then add optional calendar-file export and feedback capture without exposing another user's preferences or venue snapshots through predictable URLs.

Keep generated recommendations separate from reservations. Availability integrations and automated booking belong after provider confirmation, authorization, failure recovery, and cancellation behavior are defined.

Done when API contracts, ownership checks, idempotency behavior, and browser flows are documented and tested.

## 7. Prepare the Tampa public web pilot

Choose hosting and production storage after checking current costs. Configure HTTPS, production session settings, backups, monitoring, rate limits, account deletion, and operational recovery.

Before launch, repeat the browser journey on a clean environment and audit mobile layouts, keyboard use, accessibility behavior, no-match recovery, stale-data messaging, and generated-plan quality. Keep SQLite as a local/development option unless production storage is deliberately selected and tested.

Done when deployment, data protection, observability, and user recovery paths are verified rather than assumed.

## 8. Expand cities and consider mobile

Add another city only with its own verified venue data, timezone, coverage rules, source review process, and travel model. Consider Expo/native work only after web usage demonstrates a clear reason to install an app.

Reuse the shared contracts and generation rules across clients, and test actual devices and deep links before treating mobile as a release milestone.

## Work that remains out of order

Do not add generic-category fallbacks, silently substitute selected activities or cuisines, claim reservation availability, infer route times, promote DBPR discovery records directly, or add payment/automated booking before the supporting constraints and provider behavior are verified.

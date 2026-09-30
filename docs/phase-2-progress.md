# Automatic generation progress

- [x] Required-field stepper and review screen.
- [x] Client and server validation and future date/time checks in Tampa.
- [x] Generate named restaurants, activities, and explicitly dated events, or an actionable no-match result.
- [x] Enforce selected cuisines, activities, area, setting, budget, one-hour meals, and the full allotted duration.
- [x] Return the generated plan immediately and persist a venue/source snapshot.
- [x] Display generated results and saved plans in My Dates.
- [x] Implement idempotent retries and account/browser ownership.
- [x] Show venue addresses, published sources, AM/PM times, directions, and direct booking links.
- [x] Clearly label estimated costs, approximate travel, source review dates, and unconfirmed reservations.
- [x] Add the sunset visual redesign and verify responsive layouts with browser screenshots.
- [x] Add open-to-either travel, comfortable walking limits, and timed returns to a parked car.
- [x] Pass 43 planner/contract tests, plus 16 registry tests; retain desktop/mobile form checks with mocked responses.
- [x] Recheck real generation, snapshot persistence, selected preferences, alternative dates, and idempotency after venue selection.
- [x] Verify the full live browser journey, including empty-step blocking and no-match recovery.
- [x] Verify guest/account isolation, claiming, revoked sessions, and persistence across an app restart.
- [x] Add `pnpm test:browser`: 14 live checks against a disposable app copy and fresh SQLite database, with screenshots and a verification report.
- [x] Add sourced Mexican patio and Japanese indoor restaurants downtown; retain honest per-venue review dates and disclose missing walking routes.
- [x] Treat ordinary food dislikes as unconfirmed ordering requests instead of restaurant exclusions; add a strict-requirement checkbox, explicit-allergy guard, review category and saved preference snapshots. Verify Nueva Cantina generation with cheese disliked, plus strict-mode error recovery.

September 29 expansion verification: three additional restaurants and three activities are integrated, with 23 expansion/schedule tests bringing the automated total to 82. The live suite now passes 19 checks, including five expansion combinations (the Plant Museum journey is seasonal), and lint/typecheck pass. See `restaurant-additions.md` for remaining batch targets and `docs/local-verification.md` for artifacts.

Current output selects sourced Tampa venues and published event dates. Coverage is still small; unsupported preferences return no match. Walking times use approximate catalog buffers, driving time is unverified, and reservations are made directly with venues.

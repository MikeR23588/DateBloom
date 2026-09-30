# Local acceptance verification

Run `pnpm test:browser` from the project root.

The suite copies the app into an ignored `.verification-tmp/run-*/workspace` directory, links the installed dependencies, starts its own server on an available port, and creates a fresh SQLite database. It uses real Route Handlers and server actions, not mocked API responses. The normal running app and its database are untouched.

If Chrome is not installed, run `pnpm --filter @datebloom/web exec puppeteer browsers install chrome` first.

## Verified checks

1. Empty required steps cannot advance.
2. Unsupported preferences return no match, keep form answers, and save no incomplete plan.
3. Generation selects named venues on an alternative date and includes a requested return to the car.
4. Saved snapshots survive navigation and reload; identical retries reuse the plan and changed payloads cannot reuse a request key.
5. The API enforces cuisine, activity, setting, budget, duration, dietary/accessibility uncertainty, walking-limit validation, and origin checks.
6. Separate guest browsers have isolated plans and request-key scopes.
7. Signup claims only the current browser's guest plans.
8. Persistent HTTP-only session cookies restore sign-in in another browser context.
9. Different accounts see only their own plans.
10. Sign-out revokes the server-side session; incorrect credentials do not sign in.
11. Existing-account sign-in claims new guest plans without discarding them when request keys collide.
12. Saved snapshots and account sessions survive an app restart; desktop/mobile saved-plan pages render without horizontal overflow or browser errors.
13. A live Mexican patio request enters `cheese` with the strict-requirement checkbox off and successfully selects Nueva Cantina. Its unconfirmed ordering request, unchanged menu estimate and source dates survive persistence, reload and identical retry; an explicit dairy-allergy request is rejected without saving an extra plan.
14. The mobile Japanese journey enters `cheese` with the strict-requirement checkbox on, confirms it under Foods to avoid, checks the strict-requirement no-match response and that no plan is saved, then uses Edit preferences with its text and checkbox preserved. Its unrestricted fixture subsequently selects Noble Rice and survives saved-plan reload.

15. A French dinner selects Boulon and preserves its exact estimate, sources and snapshot across retries and reloads.
16. A Spanish daytime museum date selects Columbia Cafe and Tampa Bay History Center, using the disclosed five-minute on-site walking allowance rather than driving between locations in the same building.
17. A Spanish outdoor date selects Columbia Cafe and Cotanchobee Park and covers the full requested duration.
18. An Italian patio date selects Bavaro's downtown with its dinner menu estimate and outdoor setting.
19. A Spanish daytime museum date selects Columbia Cafe and Henry B. Plant Museum when the future fixture is within the museum's verified seasonal coverage. The suite reports this conditional check as omitted after November 30, 2026; fixed-date unit tests still cover its seasonal cutoff and closures.

The alternative-date fixture explicitly requests walking so later additions with unknown routes cannot turn its preferred date into a driving match. Expansion journeys verify named venue IDs, estimates, duration, descriptions, sources, saved snapshots, retries, reloads and horizontal overflow at desktop/mobile sizes.

September 29, 2026 verification: all 19 live checks passed; report and screenshots are in `.verification-tmp/run-DPw9KW/artifacts`. All 82 automated tests, lint and typecheck also passed.

The passing run preserves a JSON report, desktop/mobile screenshots, and its test database in the run directory. Failures preserve their disposable workspace and captured server output for diagnosis. The suite stops its own server and browser; successful runs remove only their disposable workspace.

### Batch one completion verification

September 29, 2026 final run passed all **23 live checks**, all **102 automated tests**, lint and typecheck. Report/screenshots: `.verification-tmp/run-yBabNE/artifacts`. The 19-check / 82-test result above is historical.

Additional live journeys:

20. Mediterranean dinner selects Predalina, with a $72.40 total and a park walk.
21. American bowling selects Yeoman's and Splitsville: $103.38 total, with the published 45-minute two-person lane session.
22. Outdoor Spanish museum request selects Columbia Cafe and American Victory Ship: $82.00 total, preserving the mixed interior/exposed-deck description.
23. Short Spanish museum request selects Columbia Cafe and the free Tampa Police Museum: $49.00 total, with its own police-history description.

Each new journey verifies the full requested duration, named venue IDs, source date, exact budget, saved snapshot, identical retry, reload and desktop/mobile overflow. The completion unit suite additionally schedules every new restaurant/activity in isolation and rejects one cent below its budget. The budget calculation now uses integer percentage numerators so the 10% activity allowance cannot produce a phantom cent through floating-point multiplication.

## Remaining limits

September 30 Batch 2 first-slice run: 24 live checks passed, including an hour-aligned Hyde Park / The Candle Pour pairing and mobile saved-plan/retry journey. Report and screenshots: `.verification-tmp/run-yCyzMX/artifacts`. The earlier 23-check result remains historical.

Installed dependencies are reused, so this does not verify a fresh dependency installation. Venue records are not refreshed by the test. Live routing, reservation availability, keyboard/accessibility auditing, production HTTPS/session configuration, and deployment are separate pending milestones.

September 30 directory/enrichment run: 112 automated tests, 26 live browser checks, lint, typecheck and production build passed. The added live check covers DBPR directory search, unknown facts, empty results and mobile overflow. Report/screenshots: `.verification-tmp/run-nU1TCe/artifacts`. The production build reported the pre-existing dynamic-filesystem tracing warning in `local-db.ts`.

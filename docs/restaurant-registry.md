# Restaurant discovery and verification

## Refresh and search

From the project root:

```powershell
pnpm restaurants:refresh
pnpm restaurants:review --city TAMPA --search "NUEVA CANTINA"
pnpm restaurants:review --city TAMPA --search "NOBLE RICE"
pnpm restaurants:review --city "" --search SEA6218885
```

The refresh command downloads the official [DBPR District 3 food-service extract](https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood3.csv). The review command defaults to Tampa and shows at most 30 records. `--limit 100` increases this; `--archived` includes records missing from the latest extract. Search matches registered names, streets and license numbers, not verified cuisine or neighborhoods.

Offline imports accept an existing CSV without modifying it:

```powershell
pnpm restaurants:refresh --input "D:\Michael\Programming\Projects\tampa\catalog\hrfood3.csv"
```

That path is an example from the neighboring project, not a runtime dependency. Offline imports explicitly have unknown source freshness. The generated snapshot is `data/restaurant-registry.json`, ignored by version control. It is not served publicly, does not alter the SQLite database, and is not loaded by the itinerary generator.

## Source and scope

The [DBPR public-records page](https://www2.myfloridalicense.com/hotels-restaurants/public-records/) and [file-layout/code reference](https://www2.myfloridalicense.com/sto/documents/readme.pdf) document the source. The importer uses the facility's location fields, not the licensee's mailing address.

- Location county codes: 39 (Hillsborough), 62 (Pinellas).
- License types: 2010 (permanent food service), 2014 (mobile food dispensing vehicles).
- Primary codes retained: 20 (Current), 30 (Current with probation), 31 (Current with obligations), 32 (Current conditional), 45 (Delinquent).
- Secondary code 20 is Active; 10 is Inactive. Inactive and unknown secondary codes remain clearly flagged for review, not silently treated as active.
- Mobile vendors are flagged because their registered address is not necessarily a place to visit.
- Different identities sharing a license retain all source variants with a conflict warning. No branch is arbitrarily selected.

No cuisine is inferred from a business name. Every imported record has `plannerEligible: false` and an explicit list of missing planning facts. A current license is not proof of current opening, dining suitability or availability.

## Refresh safety

The parser handles quoted commas, escaped quotes, multiline fields and a BOM. Missing/duplicate headers, inconsistent row lengths and incomplete quotations fail the refresh. Downloads have a two-minute timeout and 25 MB size limit. Fewer than 1,000 retained licenses, or a reduction greater than 20% from the prior snapshot, requires investigation rather than publishing a suspicious result.

Updates use an exclusive lock and a temporary file followed by atomic replacement. A failed fetch or validation leaves the previous snapshot unchanged. A crash can leave a `.lock` file: inspect for an ongoing refresh before manually removing it. Missing records are archived with their last observed details; they are not presented as currently listed. Returning records become unarchived.

The snapshot records a content SHA-256, import timestamp, acquisition method and the server's Last-Modified header when available. An import timestamp is not a verification timestamp. DBPR says extracts are normally refreshed weekly; this command runs on demand, not on an installed schedule. Official menu/hour refresh and closure verification remain separate, pending work.

## Promote a restaurant into the planner

1. Confirm the exact branch and identity using the license, facility address and official restaurant site. Resolve conflicting or concerning statuses; do not equate a license record with today's operating status.
2. Verify cuisine, the supported starting neighborhood, actual seating/setting, published hours and closure exceptions from official sources.
3. Capture a reproducible menu example for two with prices and source links. Keep the planner's tax/tip/cushion assumptions explicit.
4. Add the verified record to `apps/web/lib/venue-catalog.ts`, preserving an honest source review date. Do not import editorial estimates from the neighboring directory as verified facts.
5. Add walking buffers only when supported and disclose their approximate nature. Do not invent routing, parking, dietary, accessibility or booking availability facts.
6. Test a matching request, a closed-time rejection and budget boundaries. Saved plans must retain their old snapshots after catalog changes.

## Verified on September 28, 2026

The live command imported 12,311 source rows: 7,977 were in the target counties; 431 were excluded by type/status. It retained 7,545 unique licenses, with 1,603 requiring additional status/location review and one conflicting license. Counts are a snapshot, not a guaranteed number of open restaurants.

The live feed's `SEA6218885` has both a McDonald's address in Largo and a Yo Mama Fried Chicken address in St. Petersburg. Both remain in the review queue as conflicting identities. Search across all cities to inspect this example.

Sixteen focused automated tests cover parsing, scope, status warnings, duplicates/conflicts, archives, search, offline/live provenance, failed refresh preservation, size/count guards and lock isolation. There are now 43 planner/contract tests alongside these import tests.

Nueva Cantina's downtown patio and Noble Rice have been independently checked and added to the curated planner catalog. The raw discovery snapshot is deliberately unchanged and does not automatically promote records. See [restaurant source reviews](venue-source-reviews.md) for their source evidence, exact branch identities, prices and remaining limits.

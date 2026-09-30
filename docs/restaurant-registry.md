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

That path is an example from the neighboring project, not a runtime dependency. Offline imports explicitly have unknown source freshness. The generated snapshot is `data/restaurant-registry.json`, ignored by version control. It is an internal review source, not a customer-facing page. It does not alter the SQLite database or directly supply the itinerary generator; the import command uses it to check enrichment licenses.

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

## Bulk enrichment and planner promotion

### Open bulk discovery queue

Overture Places is a downloadable, open-licensed source of place names, addresses, categories and optional websites. Install the [Overture Python client](https://docs.overturemaps.org/getting-data/) separately (`pip install overturemaps`), then obtain a Tampa-area GeoJSON `place` extract (for example, `overturemaps download --bbox=-82.60,27.80,-82.30,28.10 --type=place -f geojson -o tampa-places.geojson`). Record the release ID from the [Overture catalog](https://stac.overturemaps.org/catalog.json), then run:

```powershell
pnpm restaurants:refresh
pnpm restaurants:bulk-review --input .\tampa-places.geojson --release 2026-09-23.1
```

Replace the example release with the actual extract's release; the CLI cannot infer it from GeoJSON. The command reads the local DBPR snapshot and the Overture extract, and writes ignored `data/restaurant-review-queue.json` for internal use only. It considers Tampa/Florida restaurant-like categories and requires the normalized branch name **and** street to match uniquely. Duplicate place IDs, mismatches, flagged DBPR licenses and previously reviewed records stay distinct. A candidate match is a research lead, not verified identity. The queue lists evidence links and every remaining planning fact; it never writes `restaurant-enrichment.json` or changes planner eligibility. GeoJSON over 100 MB and empty/wrong-city extracts fail without replacing the prior queue.

Overture Places has no opening-hours or price-tier fields in its [current schema](https://docs.overturemaps.org/schema/v1.18.0/reference/places/place/). Category is not a verified cuisine; optional websites may be stale or point to a chain rather than this branch. The queue therefore cannot by itself meet planner promotion requirements. Review the exact branch, official hours and exceptions, and a sourced approximate price band before using `restaurants:enrich`. A weekly bulk pull can be repeated without a per-place API, but the extract has transfer/storage costs and needs a recorded release ID; this command does not install a scheduler. Overture Places uses [CDLA Permissive 2.0 / Apache 2.0](https://docs.overturemaps.org/guides/places/) terms. Keep the source and release metadata with derivative records.

Live pilot on September 30, 2026: Overture release `2026-09-23.1`, bbox `-82.60,27.80,-82.30,28.10`, yielded 70,491 place features (98.6 MB GeoJSON); 2,857 were Tampa restaurant-like places with an address. The refreshed DBPR snapshot had 2,914 Tampa rows not already promoted. The queue classified 328 unique candidate matches, 20 ambiguous, 731 registry-review, and 1,835 unmatched; 154 matched candidates carried an HTTPS website. This is about 11% candidate-match yield, **not** 328 new planner restaurants. Website presence does not establish that the URL is official or current. The live test also caught and fixed a GeoJSON parsing error: Overture emits `id` on the Feature, not inside `properties`.

### Reviewed planner data

`data/restaurant-enrichment.json` is versioned and separate from the DBPR snapshot. It currently contains four reviewed Hyde Park records. Import a JSON array of further reviewed records in one operation:

```powershell
pnpm restaurants:enrich --input .\reviewed-restaurants.json
```

The command resolves `--input` relative to the project root, matches by DBPR license, merges existing records, validates evidence fields, and atomically updates the enrichment file. Unknown licenses and flagged/archived/conflicting registry rows cannot be promoted. Clearly multi-concept comma-list names are also rejected pending identity review. Planner-eligible records must carry the exact DBPR `registryStreet` for branch matching. The reviewed source must be the exact restaurant branch, not a generic listing. Discovery-only enrichment can omit unverified fields and set `plannerEligible: false`.

To make a record available to the planner, set `plannerEligible: true` and provide `name`, `address`, `registryStreet`, `neighborhood`, `cuisines`, `moods`, `priceBand`, `setting`, seven `hours` entries, official `sourceUrl`, separate `priceSourceUrl`, `reviewedOn`, and `expiresOn`. Price bands are `budget`, `moderate`, `upscale`, or `splurge`; they are broad estimates for two, not exact bills. `hours` is a Sunday-through-Saturday array of `[openingMinute, closingMinute]` in local time (or `null` for closed). `setting` is `indoors` or `outdoors`. Optional fields are `menuUrl`, `bookingUrl`, and `notes`. Mood tags must describe the setting rather than defaulting every venue to romantic or dressy. Example shape (illustrative, not a real reviewed restaurant):

```json
[{"license":"EXAMPLE123","plannerEligible":true,"registryStreet":"123 EXAMPLE ST","name":"Example Restaurant","address":"123 Example St, Tampa, FL","neighborhood":"Downtown / Water Street","cuisines":["American"],"moods":["relaxed"],"priceBand":"moderate","setting":"indoors","hours":[null,[660,1320],[660,1320],[660,1320],[660,1380],[660,1380],[660,1320]],"sourceUrl":"https://example.com/official-branch","priceSourceUrl":"https://example.com/menu","reviewedOn":"2026-09-30","expiresOn":"2026-10-30"}]
```

Confirm the identity, current operation, official hours (including exceptions), setting and a defensible broad price band before import. Add checked walking buffers separately when supported. Never invent routing, dietary/accessibility suitability, or booking availability. Test a matching request, a closed-time rejection, and budget boundaries; saved plans retain their old snapshots. Recheck enriched records after each DBPR refresh because later license status changes do not automatically revoke a previously reviewed record. The importer is batch-capable, but source verification still requires trustworthy data; no Yelp/Google API or paid per-lookup dependency is used.

The September 30 Hyde Park batch promoted four exact-branch records; see [Batch 2 source reviews](batch-two-source-reviews.md). The current planner catalog has 24 restaurants, not 7,545. DBPR refresh and official menu/hour rechecks are still on demand, and shared-license concepts need a separate identity-resolution workflow before import.

## Verified on September 28, 2026

The live command imported 12,311 source rows: 7,977 were in the target counties; 431 were excluded by type/status. It retained 7,545 unique licenses, with 1,603 requiring additional status/location review and one conflicting license. Counts are a snapshot, not a guaranteed number of open restaurants.

The live feed's `SEA6218885` has both a McDonald's address in Largo and a Yo Mama Fried Chicken address in St. Petersburg. Both remain in the review queue as conflicting identities. Search across all cities to inspect this example.

Sixteen focused automated tests cover parsing, scope, status warnings, duplicates/conflicts, archives, search, offline/live provenance, failed refresh preservation, size/count guards and lock isolation. There are now 43 planner/contract tests alongside these import tests.

Nueva Cantina's downtown patio and Noble Rice have been independently checked and added to the curated planner catalog. The raw discovery snapshot is deliberately unchanged and does not automatically promote records. See [restaurant source reviews](venue-source-reviews.md) for their source evidence, exact branch identities, prices and remaining limits.

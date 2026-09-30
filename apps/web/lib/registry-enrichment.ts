import enrichmentFile from "../../../data/restaurant-enrichment.json";
import { validateEnrichment } from "./restaurant-enrichment.mjs";
import type { CatalogVenue } from "./venue-catalog";

type EnrichmentRecord = {
  license: string; plannerEligible?: boolean; name?: string; address?: string; registryStreet?: string; neighborhood?: string;
  cuisines?: string[]; moods?: CatalogVenue["moods"]; priceBand?: CatalogVenue["priceBand"]; setting?: CatalogVenue["setting"];
  hours?: (readonly [number, number] | null)[]; sourceUrl?: string; priceSourceUrl?: string; reviewedOn?: string; expiresOn?: string;
  menuUrl?: string; bookingUrl?: string; notes?: string;
};

export const restaurantEnrichment = validateEnrichment(enrichmentFile) as { version: number; records: EnrichmentRecord[] };

export const enrichedPlannerVenues: readonly CatalogVenue[] = restaurantEnrichment.records
  .filter(record => record.plannerEligible)
  .map(record => ({
    id: `registry-${record.license.toLowerCase()}`,
    registryLicense: record.license,
    name: record.name!, address: record.address!, neighborhood: record.neighborhood!,
    cuisines: record.cuisines!, priceBand: record.priceBand!, setting: record.setting!,
    hours: record.hours!, sourceUrl: record.sourceUrl!, sourceCheckedOn: record.reviewedOn!, sourceExpiresOn: record.expiresOn!,
    ...(record.menuUrl ? { menuUrl: record.menuUrl } : {}),
    ...(record.bookingUrl ? { bookingUrl: record.bookingUrl } : {}),
    moods: record.moods!,
    costDescription: "Broad reviewed price band for two; check the current menu before ordering.",
    planningNotes: ["Imported from reviewed restaurant enrichment, not from the DBPR license alone.", `Price-band evidence: ${record.priceSourceUrl}`, ...(record.notes ? [record.notes] : [])],
    minimumMinutes: 60, maximumMinutes: 120,
  }));

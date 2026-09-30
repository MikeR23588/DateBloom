import { afterEach, describe, expect, it, vi } from "vitest";
import { dateRequestCreateSchema, generatedPlanSchema } from "@datebloom/contracts";
import * as catalog from "./venue-catalog";
import { enrichedPlannerVenues } from "./registry-enrichment";
import { venueHoursOnDate } from "./venue-hours";

const now = new Date("2026-09-30T12:00:00Z");
const fixtures = [
  { license: "SEA3919086", cuisine: "Vegetarian", start: "18:00", end: "18:01", band: "budget", low: 2000 },
  { license: "SEA3916891", cuisine: "American", start: "20:30", end: "20:31", band: "moderate", low: 4500 },
  { license: "SEA3912568", cuisine: "Italian", start: "18:00", end: "18:01", band: "upscale", low: 9000 },
  { license: "SEA3918427", cuisine: "Seafood", start: "18:00", end: "18:01", band: "upscale", low: 9000 },
] as const;

afterEach(() => { vi.doUnmock("./venue-catalog"); vi.resetModules(); });

describe("reviewed batch-2 restaurant import", () => {
  it("adds four distinct DBPR-checked restaurants without altering hand-reviewed records", () => {
    expect(enrichedPlannerVenues).toHaveLength(4);
    expect(catalog.venues.filter(venue => venue.cuisines)).toHaveLength(24);
    expect(new Set(catalog.venues.map(venue => venue.id)).size).toBe(catalog.venues.length);
    expect(catalog.venues.find(venue => venue.id === "green-lemon-soho")).toBeDefined();
  });

  it.each(fixtures)("schedules $license with its reviewed band and rejects a lower budget or closed hour", async fixture => {
    const venue = enrichedPlannerVenues.find(item => item.registryLicense === fixture.license)!;
    expect(venue).toBeDefined();
    expect(venue.priceBand).toBe(fixture.band);
    expect(venueHoursOnDate(venue, "2026-10-01")).not.toBeNull();
    vi.resetModules();
    vi.doMock("./venue-catalog", () => ({ ...catalog, venues: [venue], events: [] }));
    const { generateDatePlan, NoMatchingPlanError } = await import("./generate-plan");
    const input = dateRequestCreateSchema.parse({
      citySlug: "tampa", requestedLocalDate: "2026-10-01", alternativeLocalDates: [],
      startWindow: { startLocalTime: fixture.start, endLocalTime: fixture.end },
      durationMinutes: 120, budgetLimitCents: 20000, startingNeighborhood: "Hyde Park",
      travelMode: "flexible", atmosphere: venue.moods[0], occasion: "",
      preferredCuisines: [fixture.cuisine], preferredActivities: [],
      dietaryNeeds: "", accessibilityNeeds: "", alcoholPreference: "no_preference",
      settingPreference: "indoors", acceptsSingleStop: true,
    });
    const plan = generateDatePlan(input, now);
    expect(plan.stops[0].venueId).toBe(venue.id);
    expect(plan.stops[0].sourceCheckedOn).toBe("2026-09-30");
    expect(plan.priceEstimate?.lowCents).toBe(fixture.low);
    expect(generatedPlanSchema.safeParse(plan).success).toBe(true);
    expect(() => generateDatePlan({ ...input, budgetLimitCents: fixture.low - 1 }, now)).toThrow(NoMatchingPlanError);
    expect(() => generateDatePlan({ ...input, startWindow: { startLocalTime: "23:00", endLocalTime: "23:01" } }, now)).toThrow(NoMatchingPlanError);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { dateRequestCreateSchema } from "@datebloom/contracts";
import { bandFromMealSubtotal, mealBudgetRange } from "./price-bands";
import * as catalog from "./venue-catalog";

afterEach(() => { vi.doUnmock("./venue-catalog"); vi.resetModules(); });

describe("approximate restaurant pricing", () => {
  it("maps legacy menu examples to broad, stable planning bands", () => {
    expect(bandFromMealSubtotal(3000)).toBe("budget");
    expect(bandFromMealSubtotal(5400)).toBe("moderate");
    expect(bandFromMealSubtotal(12000)).toBe("upscale");
    expect(bandFromMealSubtotal(14300)).toBe("splurge");
    expect(bandFromMealSubtotal(20000)).toBe("splurge");
    expect(mealBudgetRange("moderate", true)).toEqual([4500, 13000]);
  });

  it("plans with a sourced band and no exact restaurant menu price", async () => {
    const original = catalog.venues.find(venue => venue.id === "green-lemon-soho")!;
    const candle = catalog.venues.find(venue => venue.id === "candle-pour-hyde-park")!;
    const { subtotalForTwoCents: _legacyPrice, ...bandVenue } = original;
    void _legacyPrice;
    vi.resetModules();
    vi.doMock("./venue-catalog", () => ({ ...catalog, venues: [{ ...bandVenue, id: "band-only-meal", priceBand: "moderate" }, candle], events: [] }));
    const { generateDatePlan, NoMatchingPlanError } = await import("./generate-plan");
    const input = dateRequestCreateSchema.parse({
      citySlug: "tampa", requestedLocalDate: "2026-10-01", alternativeLocalDates: [],
      startWindow: { startLocalTime: "15:45", endLocalTime: "15:46" }, durationMinutes: 180,
      budgetLimitCents: 18000, startingNeighborhood: "Hyde Park", travelMode: "flexible",
      atmosphere: "playful", occasion: "", preferredCuisines: ["Mexican"], preferredActivities: ["Candle making"],
      dietaryNeeds: "", accessibilityNeeds: "", alcoholPreference: "no_preference", settingPreference: "indoors", acceptsSingleStop: false,
    });
    const plan = generateDatePlan(input, new Date("2026-09-30T12:00:00Z"));
    expect(plan.stops[0].venueId).toBe("band-only-meal");
    expect(plan.stops[0].priceEstimate?.label).toBe("Moderate");
    expect(plan.stops[0].priceEstimate?.lowCents).toBe(4500);
    expect(plan.stops[0].description).not.toContain("$17");
    expect(plan.priceEstimate!.highCents).toBeGreaterThan(input.budgetLimitCents);
    expect(plan.adjustments.join(" ")).toContain("upper end of this estimated range exceeds your budget");
    expect(() => generateDatePlan({ ...input, budgetLimitCents: plan.priceEstimate!.lowCents - 1 }, new Date("2026-09-30T12:00:00Z"))).toThrow(NoMatchingPlanError);
  });

  it("does not silently price a restaurant whose band is unknown", async () => {
    const original = catalog.venues.find(venue => venue.id === "green-lemon-soho")!;
    const { subtotalForTwoCents: _legacyPrice, ...unknownPrice } = original;
    void _legacyPrice;
    vi.resetModules();
    vi.doMock("./venue-catalog", () => ({ ...catalog, venues: [{ ...unknownPrice, id: "unknown-price" }], events: [] }));
    const { generateDatePlan, NoMatchingPlanError } = await import("./generate-plan");
    const input = dateRequestCreateSchema.parse({
      citySlug: "tampa", requestedLocalDate: "2026-10-01", alternativeLocalDates: [],
      startWindow: { startLocalTime: "17:00", endLocalTime: "17:01" }, durationMinutes: 120,
      budgetLimitCents: 20000, startingNeighborhood: "Hyde Park", travelMode: "driving",
      atmosphere: "relaxed", occasion: "", preferredCuisines: ["Mexican"], preferredActivities: [],
      dietaryNeeds: "", accessibilityNeeds: "", alcoholPreference: "no_preference", settingPreference: "indoors", acceptsSingleStop: true,
    });
    expect(() => generateDatePlan(input, new Date("2026-09-30T12:00:00Z"))).toThrow(NoMatchingPlanError);
  });
});

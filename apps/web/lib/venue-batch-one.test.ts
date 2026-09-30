import { afterEach, describe, expect, it, vi } from "vitest";
import { dateRequestCreateSchema, generatedPlanSchema } from "@datebloom/contracts";
import { batchOneCompletionVenues } from "./venue-batch-one";
import * as catalog from "./venue-catalog";
import { venueHoursOnDate } from "./venue-hours";
import type { CatalogVenue } from "./venue-catalog";

const now = new Date("2026-09-29T12:00:00Z");
const restaurants = batchOneCompletionVenues.filter(venue => venue.cuisines);
const activities = batchOneCompletionVenues.filter(venue => venue.activity);
afterEach(() => { vi.doUnmock("./venue-catalog"); vi.resetModules(); });
async function isolatedPlanner(records: readonly CatalogVenue[]) {
  vi.resetModules();
  vi.doMock("./venue-catalog", () => ({ ...catalog, venues: records, events: [] }));
  return import("./generate-plan");
}
function input(overrides: Record<string, unknown> = {}) {
  return dateRequestCreateSchema.parse({
    citySlug: "tampa", requestedLocalDate: "2026-10-01", alternativeLocalDates: [],
    startWindow: { startLocalTime: "17:30", endLocalTime: "17:31" },
    durationMinutes: 120, budgetLimitCents: 30000, startingNeighborhood: "Downtown / Water Street",
    travelMode: "flexible", atmosphere: "relaxed", occasion: "", preferredCuisines: ["American"],
    preferredActivities: [], dietaryNeeds: "", accessibilityNeeds: "", alcoholPreference: "no_preference",
    settingPreference: "any", acceptsSingleStop: true, ...overrides,
  });
}
describe("batch one completion", () => {
  it("adds exactly twelve restaurants and five activities without duplicate IDs", () => {
    expect(restaurants).toHaveLength(12);
    expect(activities).toHaveLength(5);
    expect(catalog.venues.filter(venue => venue.cuisines)).toHaveLength(20);
    expect(new Set(catalog.venues.map(venue => venue.id)).size).toBe(catalog.venues.length);
  });
  it.each(restaurants)("generates a full meal at $id's exact budget and rejects one cent less", async venue => {
    const { generateDatePlan, NoMatchingPlanError } = await isolatedPlanner([venue]);
    const budget = Math.ceil(venue.subtotalForTwoCents * 130 / 100) + 1000;
    const request = input({ preferredCuisines: [venue.cuisines![0]], settingPreference: venue.setting, budgetLimitCents: budget });
    const plan = generateDatePlan(request, now);
    expect(plan.stops[0].venueId).toBe(venue.id);
    expect(plan.estimatedTotalCents).toBe(budget);
    expect(plan.durationMinutes).toBe(120);
    expect(plan.stops[0].sourceCheckedOn).toBe("2026-09-29");
    expect(generatedPlanSchema.safeParse(plan).success).toBe(true);
    expect(() => generateDatePlan({ ...request, budgetLimitCents: budget - 1 }, now)).toThrow(NoMatchingPlanError);
  });
  it.each(activities)("schedules $id with an actual meal and preserves exact cost", async activity => {
    const meal = catalog.expansionVenues.find(venue => venue.id === "columbia-cafe-history")!;
    const { generateDatePlan, NoMatchingPlanError } = await isolatedPlanner([meal, activity]);
    const daytime = activity.activity === "Museum";
    const budget = 4900 + Math.ceil(activity.subtotalForTwoCents * 110 / 100);
    const request = input({
      preferredCuisines: ["Spanish"], preferredActivities: [activity.activity], acceptsSingleStop: false,
      startWindow: daytime ? { startLocalTime: "11:00", endLocalTime: "11:01" } : { startLocalTime: "17:00", endLocalTime: "17:01" },
      durationMinutes: activity.id === "tampa-police-museum" || activity.id === "splitsville-channelside" ? 120 : 180,
      budgetLimitCents: budget,
    });
    const plan = generateDatePlan(request, now);
    expect(plan.stops.map(stop => stop.venueId)).toEqual([meal.id, activity.id]);
    expect(plan.estimatedTotalCents).toBe(budget);
    expect(plan.durationMinutes).toBe(request.durationMinutes);
    expect(generatedPlanSchema.safeParse(plan).success).toBe(true);
    expect(() => generateDatePlan({ ...request, budgetLimitCents: budget - 1 }, now)).toThrow(NoMatchingPlanError);
    expect(() => generateDatePlan({ ...request, travelMode: "walking" }, now)).toThrow(NoMatchingPlanError);
    expect(() => generateDatePlan({ ...request, accessibilityNeeds: "Step-free required" }, now)).toThrow(NoMatchingPlanError);
  });
  it("excludes Sunday's unsupported bowling rate and does not invent a longer two-person session", () => {
    const bowling = activities.find(venue => venue.id === "splitsville-channelside")!;
    expect(venueHoursOnDate(bowling, "2026-10-04")).toBeNull();
    expect(bowling.minimumMinutes).toBe(45);
    expect(bowling.maximumMinutes).toBe(45);
    expect(bowling.planningNotes!.join(" ")).toContain("not closed");
  });
  it("honors Monday closures and CW's published holiday closures", () => {
    for (const id of ["fabrica-channelside", "cws-gin-joint"]) {
      expect(venueHoursOnDate(restaurants.find(venue => venue.id === id)!, "2026-10-05")).toBeNull();
    }
    const cw = restaurants.find(venue => venue.id === "cws-gin-joint")!;
    for (const date of ["2026-11-26", "2026-12-25", "2027-01-01"]) expect(venueHoursOnDate(cw, date)).toBeNull();
  });
});

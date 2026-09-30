import { describe, expect, it } from "vitest";
import { dateRequestCreateSchema, generatedPlanSchema, type DateRequestCreate } from "@date-planner/contracts";
import { generateDatePlan, NoMatchingPlanError } from "./generate-plan";
import { expansionVenues, venues } from "./venue-catalog";
import { venueHoursOnDate } from "./venue-hours";

const now = new Date("2026-09-29T12:00:00Z");
function request(overrides: Partial<DateRequestCreate> = {}): DateRequestCreate {
  return dateRequestCreateSchema.parse({
    citySlug: "tampa", requestedLocalDate: "2026-10-01", alternativeLocalDates: [],
    startWindow: { startLocalTime: "17:00", endLocalTime: "17:01" },
    durationMinutes: 120, budgetLimitCents: 20000, startingNeighborhood: "Downtown / Water Street",
    travelMode: "flexible", atmosphere: "relaxed", occasion: "",
    preferredCuisines: ["French"], preferredActivities: ["Outdoor walk"],
    dietaryNeeds: "", accessibilityNeeds: "", alcoholPreference: "no_preference",
    settingPreference: "any", acceptsSingleStop: false, ...overrides,
  });
}
const venue = (id: string) => venues.find(item => item.id === id)!;
const lunch = { startWindow: { startLocalTime: "11:00", endLocalTime: "11:01" }, preferredCuisines: ["Spanish"] as DateRequestCreate["preferredCuisines"], preferredActivities: ["Museum"] as DateRequestCreate["preferredActivities"] };

describe("first neighborhood expansion group", () => {
  it.each([
    ["French", "any", "boulon-water-street", 9320],
    ["Spanish", "outdoors", "columbia-cafe-history", 4900],
    ["Italian", "outdoors", "bavaros-downtown", 5940],
  ] as const)("generates a %s date within the exact budget", (cuisine, setting, id, budget) => {
    const input = request({ preferredCuisines: [cuisine], settingPreference: setting, budgetLimitCents: budget });
    const plan = generateDatePlan(input, now);
    expect(plan.stops[0].venueId).toBe(id);
    expect(plan.stops[0].sourceCheckedOn).toBe("2026-09-29");
    expect(plan.estimatedTotalCents).toBe(budget);
    expect(plan.durationMinutes).toBe(120);
    expect(plan.travel?.estimatedMinutes).toBeNull();
    expect(generatedPlanSchema.safeParse(plan).success).toBe(true);
    expect(() => generateDatePlan({ ...input, budgetLimitCents: budget - 1 }, now)).toThrow(NoMatchingPlanError);
  });

  it("selects the History Center for a four-hour daytime date at its exact budget", () => {
    const input = request({ ...lunch, durationMinutes: 240, budgetLimitCents: 9069 });
    const plan = generateDatePlan(input, now);
    expect(plan.stops.map(stop => stop.venueId)).toEqual(["columbia-cafe-history", "tampa-history"]);
    expect(plan.stops[1].description).toContain("Tampa Bay history");
    expect(plan.stops[1].description).not.toContain("Tampa Museum of Art");
    expect(plan.stops[0].description).toContain("Meal at");
    expect(plan.travel?.mode).toBe("walking");
    expect(plan.travel?.estimatedMinutes).toBe(5);
    expect(plan.travel?.basis).toContain("on-site walk");
    expect(plan.estimatedTotalCents).toBe(9069);
    const cheaper = generateDatePlan({ ...input, budgetLimitCents: 9068 }, now);
    expect(cheaper.stops[1].venueId).toBe("plant-museum");
    expect(cheaper.estimatedTotalCents).toBeLessThanOrEqual(9068);
  });

  it("supports an on-site walking-only history date while honoring the walking limit", () => {
    const input = request({ ...lunch, durationMinutes: 240, budgetLimitCents: 9069, travelMode: "walking", maximumWalkingMinutes: 5 });
    expect(generateDatePlan(input, now).stops[1].venueId).toBe("tampa-history");
    expect(() => generateDatePlan({ ...input, maximumWalkingMinutes: 4 }, now)).toThrow(NoMatchingPlanError);
  });

  it("does not replace a disallowed on-site walk with a drive inside the building", () => {
    for (const overrides of [{ travelMode: "driving" as const }, { maximumWalkingMinutes: 4 }]) {
      const plan = generateDatePlan(request({ ...lunch, durationMinutes: 240, budgetLimitCents: 9069, ...overrides }), now);
      expect(plan.stops[1].venueId).toBe("plant-museum");
      expect(plan.travel?.mode).toBe("driving");
    }
  });

  it("selects Plant Museum for a lower-budget museum date and retains both venue notes", () => {
    const plan = generateDatePlan(request({ ...lunch, durationMinutes: 180, budgetLimitCents: 7540 }), now);
    expect(plan.stops.map(stop => stop.venueId)).toEqual(["columbia-cafe-history", "plant-museum"]);
    expect(plan.stops[1].description).toContain("Plant Hall");
    expect(plan.notes.join(" ")).toContain("waterfront patio");
    expect(plan.notes.join(" ")).toContain("November 30, 2026");
    expect(plan.estimatedTotalCents).toBe(7540);
  });

  it("selects Cotanchobee when a four-hour outdoor date needs more park time", () => {
    const plan = generateDatePlan(request({ preferredCuisines: ["Spanish"], preferredActivities: ["Outdoor walk"],
      settingPreference: "outdoors", durationMinutes: 240, budgetLimitCents: 4900 }), now);
    expect(plan.stops.map(stop => stop.venueId)).toEqual(["columbia-cafe-history", "cotanchobee"]);
    expect(plan.stops[1].description).toContain("Garrison Channel");
    expect(plan.stops[1].description).not.toContain("Curtis Hixon");
    expect(plan.stops[1].suggestedBudgetCents).toBe(0);
  });

  it.each(["French", "Spanish"] as const)("keeps missing %s walking routes unresolved", cuisine => {
    expect(() => generateDatePlan(request({ preferredCuisines: [cuisine], travelMode: "walking" }), now)).toThrow(NoMatchingPlanError);
  });

  it("enforces indoor/outdoor dining and the supported starting neighborhood", () => {
    expect(() => generateDatePlan(request({ settingPreference: "outdoors" }), now)).toThrow(NoMatchingPlanError);
    expect(() => generateDatePlan(request({ preferredCuisines: ["Spanish"], settingPreference: "indoors" }), now)).toThrow(NoMatchingPlanError);
    expect(() => generateDatePlan(request({ startingNeighborhood: "Seminole Heights" }), now)).toThrow(NoMatchingPlanError);
  });

  it("uses Boulon's dinner window instead of bakery or late-night bar hours", () => {
    const single = request({ preferredActivities: [], acceptsSingleStop: true,
      startWindow: { startLocalTime: "21:00", endLocalTime: "21:01" } });
    expect(generateDatePlan(single, now).stops[0].endLocalTime).toBe("23:00");
    expect(() => generateDatePlan({ ...single, startWindow: { startLocalTime: "21:01", endLocalTime: "21:02" } }, now)).toThrow(NoMatchingPlanError);
    expect(() => generateDatePlan({ ...single, startWindow: { startLocalTime: "15:00", endLocalTime: "15:01" } }, now)).toThrow(NoMatchingPlanError);
  });

  it("does not price Bavaro's lunch using its dinner-menu example", () => {
    expect(() => generateDatePlan(request({ preferredCuisines: ["Italian"], settingPreference: "outdoors",
      startWindow: { startLocalTime: "14:00", endLocalTime: "14:01" } }), now)).toThrow(NoMatchingPlanError);
  });

  it("rejects unknown strict requirements for the newly added cuisines", () => {
    expect(() => generateDatePlan(request({ dietaryNeeds: "dairy allergy" }), now)).toThrow(NoMatchingPlanError);
    expect(() => generateDatePlan(request({ accessibilityNeeds: "Step-free route" }), now)).toThrow(NoMatchingPlanError);
  });

  it("keeps source freshness and all notices within the response contract on an alternative date", () => {
    const input = request({ ...lunch, requestedLocalDate: "2026-11-02", alternativeLocalDates: ["2026-11-03"],
      durationMinutes: 240, budgetLimitCents: 10540, alcoholPreference: "prefer" });
    const plan = generateDatePlan(input, new Date("2026-10-30T12:00:00Z"));
    expect(plan.requestedLocalDate).toBe("2026-11-03");
    expect(plan.stops[1].venueId).toBe("plant-museum");
    expect(plan.notes.join(" ")).toContain("alternative date");
    expect(plan.notes.join(" ")).toContain("due for review");
    expect(plan.notes.join(" ")).toContain("$30 allowance");
    expect(plan.notes.join(" ")).toContain("waterfront patio");
    expect(plan.notes.join(" ")).toContain("November 30, 2026");
    expect(generatedPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("keeps stable venue identities and explicit descriptions on every regular activity", () => {
    expect(new Set(venues.map(item => item.id)).size).toBe(venues.length);
    for (const item of venues.filter(item => item.activity)) expect(item.description).toBeTruthy();
    expect(expansionVenues.filter(item => item.cuisines)).toHaveLength(3);
    expect(expansionVenues.filter(item => item.activity)).toHaveLength(3);
  });
});

describe("published schedule exceptions", () => {
  it.each(["2026-11-26", "2027-11-25", "2026-12-25"])("closes the History Center on %s", date => {
    expect(venueHoursOnDate(venue("tampa-history"), date)).toBeNull();
  });

  it.each(["2026-12-24", "2026-12-31"])("uses the History Center's 3 PM holiday closing on %s", date => {
    expect(venueHoursOnDate(venue("tampa-history"), date)).toEqual([600,900]);
  });

  it("does not extend Plant Museum's regular schedule into December or the following season", () => {
    expect(venueHoursOnDate(venue("plant-museum"), "2026-11-29")).toEqual([720,1020]);
    expect(venueHoursOnDate(venue("plant-museum"), "2026-11-30")).toBeNull();
    expect(venueHoursOnDate(venue("plant-museum"), "2026-12-01")).toBeNull();
    expect(venueHoursOnDate(venue("plant-museum"), "2027-01-05")).toBeNull();
    expect(() => generateDatePlan(request({ ...lunch, requestedLocalDate: "2026-12-01",
      durationMinutes: 240, budgetLimitCents: 7540 }), now)).toThrow(NoMatchingPlanError);
  });

  it("preserves the existing Art Museum's holiday and dated closures", () => {
    expect(venueHoursOnDate(venue("tampa-art"), "2027-01-30")).toBeNull();
    expect(venueHoursOnDate(venue("tampa-art"), "2026-11-26")).toBeNull();
    expect(venueHoursOnDate(venue("tampa-art"), "2026-12-24")).toEqual([600,900]);
    expect(venueHoursOnDate(venue("tampa-art"), "2026-10-01")).toEqual([600,1200]);
  });
});

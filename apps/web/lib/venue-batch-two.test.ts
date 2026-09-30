import { describe, expect, it } from "vitest";
import { dateRequestCreateSchema } from "@datebloom/contracts";
import { generateDatePlan, NoMatchingPlanError } from "./generate-plan";
import { venues } from "./venue-catalog";
import { venueHoursOnDate } from "./venue-hours";

const now = new Date("2026-09-30T12:00:00Z");
const candle = venues.find(venue => venue.id === "candle-pour-hyde-park")!;
const greenLemon = venues.find(venue => venue.id === "green-lemon-soho")!;
function request(overrides: Record<string, unknown> = {}) {
  return dateRequestCreateSchema.parse({
    citySlug: "tampa", requestedLocalDate: "2026-10-01", alternativeLocalDates: [],
    startWindow: { startLocalTime: "15:45", endLocalTime: "15:46" },
    durationMinutes: 180, budgetLimitCents: 17260, startingNeighborhood: "Hyde Park",
    travelMode: "flexible", atmosphere: "romantic", occasion: "",
    preferredCuisines: ["Italian"], preferredActivities: ["Candle making"],
    dietaryNeeds: "", accessibilityNeeds: "", alcoholPreference: "no_preference",
    settingPreference: "indoors", acceptsSingleStop: false, ...overrides,
  });
}

describe("Batch 2 Hyde Park activity", () => {
  it("pairs a full Forbici meal with a 45-minute candle session at the exact budget", () => {
    const plan = generateDatePlan(request(), now);
    expect(plan.stops.map(stop => stop.venueId)).toEqual(["forbici-tampa", candle.id]);
    expect(plan.stops[1].sourceCheckedOn).toBe("2026-09-30");
    expect(plan.stops[1].description).toContain("two hours to set");
    expect(plan.durationMinutes).toBe(180);
    expect(plan.stops[1].startLocalTime).toBe("18:00");
    expect(plan.estimatedTotalCents).toBe(17260);
    expect(() => generateDatePlan(request({ budgetLimitCents: 17259 }), now)).toThrow(NoMatchingPlanError);
    expect(() => generateDatePlan(request({ startWindow: { startLocalTime: "15:00", endLocalTime: "15:01" }, durationMinutes: 120 }), now)).toThrow(NoMatchingPlanError);
  });
  it("does not use uncertain Monday/Tuesday/Sunday hours or invent a walking route", () => {
    for (const date of ["2026-10-04", "2026-10-05", "2026-10-06"]) {
      expect(venueHoursOnDate(candle, date)).toBeNull();
      expect(() => generateDatePlan(request({ requestedLocalDate: date }), now)).toThrow(NoMatchingPlanError);
    }
    expect(() => generateDatePlan(request({ travelMode: "walking" }), now)).toThrow(NoMatchingPlanError);
    expect(() => generateDatePlan(request({ accessibilityNeeds: "step-free entry" }), now)).toThrow(NoMatchingPlanError);
  });
});

describe("Batch 2 SoHo restaurant", () => {
  it("pairs Green Lemon with Candle Pour within the exact estimated budget", () => {
    const plan = generateDatePlan(request({ preferredCuisines: ["Mexican"], budgetLimitCents: 14660 }), now);
    expect(plan.stops.map(stop => stop.venueId)).toEqual([greenLemon.id, candle.id]);
    expect(plan.stops[0].sourceCheckedOn).toBe("2026-09-30");
    expect(plan.stops[0].suggestedBudgetCents).toBe(5420);
    expect(plan.estimatedTotalCents).toBe(14660);
    expect(() => generateDatePlan(request({ preferredCuisines: ["Mexican"], budgetLimitCents: 14659 }), now)).toThrow(NoMatchingPlanError);
  });

  it("limits dinner to the conservative SoHo meal window and keeps unknown routes unresolved", () => {
    const single = request({ preferredCuisines: ["Mexican"], preferredActivities: [], acceptsSingleStop: true,
      startWindow: { startLocalTime: "19:00", endLocalTime: "19:01" }, durationMinutes: 120 });
    expect(generateDatePlan(single, now).stops[0].venueId).toBe(greenLemon.id);
    expect(() => generateDatePlan({ ...single, requestedLocalDate: "2026-10-05",
      startWindow: { startLocalTime: "20:00", endLocalTime: "20:01" } }, now)).toThrow(NoMatchingPlanError);
    expect(() => generateDatePlan(request({ preferredCuisines: ["Mexican"], travelMode: "walking" }), now)).toThrow(NoMatchingPlanError);
    expect(() => generateDatePlan({ ...single, settingPreference: "outdoors" }, now)).toThrow(NoMatchingPlanError);
  });
});

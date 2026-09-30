import { describe, expect, it } from "vitest";
import { dateRequestCreateSchema, generatedPlanSchema, type DateRequestCreate } from "@datebloom/contracts";
import { generateDatePlan, NoMatchingPlanError } from "./generate-plan";
import { restaurantCoverageSummary, venues } from "./venue-catalog";

const now = new Date("2026-09-28T12:00:00Z");
function request(overrides: Partial<DateRequestCreate> = {}): DateRequestCreate {
  return dateRequestCreateSchema.parse({
    citySlug: "tampa", requestedLocalDate: "2026-10-01", alternativeLocalDates: [],
    startWindow: { startLocalTime: "17:00", endLocalTime: "17:15" },
    durationMinutes: 120, budgetLimitCents: 20000, startingNeighborhood: "Downtown / Water Street",
    travelMode: "flexible", atmosphere: "relaxed", occasion: "",
    preferredCuisines: ["Italian"], preferredActivities: ["Outdoor walk"],
    dietaryNeeds: "", accessibilityNeeds: "", alcoholPreference: "no_preference",
    settingPreference: "any", acceptsSingleStop: false, ...overrides,
  });
}
const minute = (time: string, day = 0) => day * 1440 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

describe("expanded verified restaurant coverage", () => {
  it.each([
    [{ dietaryNeeds: "cheese", dietaryRequirementType: "strict" as const }, "strict dietary requirement", "accessibility"],
    [{ accessibilityNeeds: "Step-free entry" }, "accessibility", "food restrictions"],
  ])("explains the specific unverified requirement without conflating fields", (overrides, expected, absent) => {
    try { generateDatePlan(request(overrides), now); }
    catch (error) {
      expect(error).toBeInstanceOf(NoMatchingPlanError);
      const reasons = (error as NoMatchingPlanError).reasons.join(" ");
      expect(reasons).toContain(expected);
      expect(reasons).not.toContain(absent);
      expect(reasons).toContain("not ignored");
      return;
    }
    throw new Error("Unverified requirement unexpectedly generated a plan.");
  });

  it.each([["Mexican", "nueva-cantina-downtown", 4822], ["Japanese", "noble-rice", 9060]] as const)(
    "generates a %s meal and activity without inventing a walking route",
    (cuisine, venueId, estimate) => {
      const plan = generateDatePlan(request({ preferredCuisines: [cuisine] }), now);
      expect(plan.stops[0].venueId).toBe(venueId);
      expect(plan.stops[0].sourceCheckedOn).toBe("2026-09-28");
      expect(plan.stops[0].description).not.toContain("Italian dinner");
      expect(plan.stops[1].sourceCheckedOn).toBe("2026-09-27");
      expect(plan.estimatedTotalCents).toBe(estimate);
      expect(plan.durationMinutes).toBe(120);
      expect(plan.travel?.mode).toBe("driving");
      expect(plan.travel?.estimatedMinutes).toBeNull();
      expect(plan.adjustments.join(" ")).toContain("no walking estimate is available");
      expect(generatedPlanSchema.safeParse(plan).success).toBe(true);
    },
  );

  it("uses the exact downtown branches and keeps their registry identities traceable", () => {
    const mexican = venues.find(venue => venue.id === "nueva-cantina-downtown")!;
    const japanese = venues.find(venue => venue.id === "noble-rice")!;
    expect(mexican).toMatchObject({ registryLicense: "SEA3918247", address: "903 N Franklin St, Tampa, FL 33602" });
    expect(japanese).toMatchObject({ registryLicense: "SEA3918915", address: "615 Channelside Dr #112, Tampa, FL 33602" });
  });

  it.each(["Mexican", "Japanese"] as const)("rejects %s walking-only plans until routes are checked", cuisine => {
    expect(() => generateDatePlan(request({ preferredCuisines: [cuisine], travelMode: "walking" }), now)).toThrow(NoMatchingPlanError);
  });

  it("searches alternative dates when Noble Rice is closed on Monday", () => {
    const plan = generateDatePlan(request({ preferredCuisines: ["Japanese"], settingPreference: "indoors", preferredActivities: ["Museum"], durationMinutes: 180, requestedLocalDate: "2026-10-05", alternativeLocalDates: ["2026-10-01"] }), now);
    expect(plan.requestedLocalDate).toBe("2026-10-01");
    expect(plan.notes.join(" ")).toContain("alternative date");
    expect(() => generateDatePlan(request({ preferredCuisines: ["Japanese"], settingPreference: "indoors", requestedLocalDate: "2026-10-05" }), now)).toThrow(NoMatchingPlanError);
  });

  it("checks Noble Rice opening time and cannot fit a meal before 5 PM", () => {
    expect(() => generateDatePlan(request({ preferredCuisines: ["Japanese"], settingPreference: "indoors", startWindow: { startLocalTime: "15:00", endLocalTime: "16:00" } }), now)).toThrow(NoMatchingPlanError);
  });

  it("accepts the exact meal budget and rejects one cent below it", () => {
    expect(generateDatePlan(request({ preferredCuisines: ["Mexican"], budgetLimitCents: 4822 }), now).estimatedTotalCents).toBe(4822);
    expect(() => generateDatePlan(request({ preferredCuisines: ["Mexican"], settingPreference: "outdoors", budgetLimitCents: 4821 }), now)).toThrow(NoMatchingPlanError);
  });

  it("enforces the documented patio setting for the meal and activity", () => {
    const plan = generateDatePlan(request({ preferredCuisines: ["Mexican"], settingPreference: "outdoors" }), now);
    expect(plan.stops.map(stop => stop.venueId)).toEqual(["nueva-cantina-downtown", "curtis-hixon"]);
    expect(plan.notes.join(" ")).toContain("Patio seating and weather are not confirmed");
    const indoor = generateDatePlan(request({ preferredCuisines: ["Mexican"], settingPreference: "indoors", preferredActivities: ["Museum"], durationMinutes: 180 }), now);
    expect(indoor.stops[0].venueId).toBe("urban-cantina");
    expect(indoor.stops[1].venueId).toBe("tampa-art");
    expect(() => generateDatePlan(request({ preferredCuisines: ["Mexican"], settingPreference: "outdoors", preferredActivities: ["Museum"] }), now)).toThrow(NoMatchingPlanError);
  });

  it("does not substitute patio dining for an indoor Japanese request", () => {
    const plan = generateDatePlan(request({ preferredCuisines: ["Japanese"], settingPreference: "indoors", preferredActivities: ["Museum"], durationMinutes: 180 }), now);
    expect(plan.stops.map(stop => stop.venueId)).toEqual(["noble-rice", "tampa-art"]);
    expect(generateDatePlan(request({ preferredCuisines: ["Japanese"], settingPreference: "outdoors" }), now).stops[0].venueId).toBe("wagamama-water-street");
  });

  it("allows a dinner ending exactly at closing but rejects an overrun", () => {
    const evening = request({ preferredCuisines: ["Japanese"], preferredActivities: [], settingPreference: "indoors", acceptsSingleStop: true, startWindow: { startLocalTime: "20:00", endLocalTime: "20:01" } });
    const plan = generateDatePlan(evening, now);
    expect(plan.stops).toHaveLength(1);
    expect(plan.stops[0].endLocalTime).toBe("22:00");
    expect(() => generateDatePlan({ ...evening, startWindow: { startLocalTime: "20:01", endLocalTime: "20:02" } }, now)).toThrow(NoMatchingPlanError);
  });

  it("warns only when selected records are due for review, without re-dating older sources", () => {
    const evening = request({ requestedLocalDate: "2026-10-29", preferredCuisines: ["Japanese"], preferredActivities: [], settingPreference: "indoors", acceptsSingleStop: true, startWindow: { startLocalTime: "20:00", endLocalTime: "20:01" } });
    expect(generateDatePlan(evening, new Date("2026-10-27T12:00:00Z")).notes.join(" ")).not.toContain("due for review");
    expect(generateDatePlan(evening, new Date("2026-10-28T12:00:00Z")).notes.join(" ")).toContain("due for review");
    const older = generateDatePlan({ ...evening, preferredCuisines: ["Italian"], startingNeighborhood: "Hyde Park" }, new Date("2026-10-27T12:00:00Z"));
    expect(older.stops[0].sourceCheckedOn).toBe("2026-09-27");
    expect(older.notes.join(" ")).toContain("due for review");
  });

  it("does not equate a verified menu with verified dietary or accessibility suitability", () => {
    expect(() => generateDatePlan(request({ preferredCuisines: ["Mexican"], dietaryNeeds: "No dairy", dietaryRequirementType: "strict" }), now)).toThrow(NoMatchingPlanError);
    expect(() => generateDatePlan(request({ preferredCuisines: ["Japanese"], accessibilityNeeds: "Step-free entry" }), now)).toThrow(NoMatchingPlanError);
  });

  it("derives cuisine coverage from records instead of claiming Italian-only coverage", () => {
    expect(restaurantCoverageSummary()).toContain("Mexican, Japanese, Spanish, French, American, Seafood, Mediterranean in Downtown / Water Street");
    try { generateDatePlan(request({ preferredCuisines: ["Thai"] }), now); }
    catch (error) {
      expect(error).toBeInstanceOf(NoMatchingPlanError);
      expect((error as NoMatchingPlanError).reasons.join(" ")).toContain("Mexican, Japanese");
      return;
    }
    throw new Error("Unsupported cuisine unexpectedly generated a plan.");
  });
});

describe("food preferences versus strict requirements", () => {
  it("keeps Nueva Cantina eligible for cheese dislikes and saves an unconfirmed ordering request", () => {
    const input = request({ dietaryNeeds: "cheese", preferredCuisines: ["Mexican"], atmosphere: "playful", requestedLocalDate: "2026-09-29", startWindow: { startLocalTime: "16:00", endLocalTime: "19:00" }, budgetLimitCents: 10000 });
    expect(input.dietaryRequirementType).toBeUndefined();
    const plan = generateDatePlan(input, now);
    expect(plan.stops[0].venueId).toBe("nueva-cantina-downtown");
    expect(plan.estimatedTotalCents).toBe(4822);
    expect(plan.stops[0].description).toContain("Foods to avoid: cheese");
    expect(plan.stops[0].description).toContain("Request these be left out");
    expect(plan.stops[0].description).toContain("has not confirmed");
    expect(plan.stops[0].costDescription).toContain("Standard menu prices retained");
    expect(plan.adjustments.join(" ")).toContain("Foods to avoid: cheese");
    expect(plan.stops[1].description).not.toContain("Foods to avoid");
    expect(generatedPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("carries multiple dislikes without filtering restaurants or assuming a price discount", () => {
    const plan = generateDatePlan(request({ preferredCuisines: ["Mexican"], dietaryNeeds: "cheese, onions", dietaryRequirementType: "preference" }), now);
    expect(plan.stops[0].venueId).toBe("nueva-cantina-downtown");
    expect(plan.adjustments.join(" ")).toContain("cheese, onions");
    expect(plan.estimatedTotalCents).toBe(4822);
  });

  it.each(["dairy allergy", "allergic to cheese", "strict no cheese", "Verified gluten-free required", "celiac", "lactose intolerance"])("does not downgrade explicit strict wording: %s", dietaryNeeds => {
    expect(() => generateDatePlan(request({ preferredCuisines: ["Mexican"], dietaryNeeds, dietaryRequirementType: "preference" }), now)).toThrow(NoMatchingPlanError);
  });

  it("requires a description for strict needs and rejects an invalid requirement type", () => {
    expect(dateRequestCreateSchema.safeParse({ ...request(), dietaryRequirementType: "strict" }).success).toBe(false);
    expect(dateRequestCreateSchema.safeParse({ ...request(), dietaryRequirementType: "unknown" }).success).toBe(false);
  });

  it("still enforces budget, cuisine, travel, and accessibility for food preferences", () => {
    const impossible: Partial<DateRequestCreate>[] = [{ budgetLimitCents: 4000 }, { preferredCuisines: ["Thai"] }, { travelMode: "walking" }, { accessibilityNeeds: "Step-free entry" }];
    for (const overrides of impossible) {
      expect(() => generateDatePlan(request({ preferredCuisines: ["Mexican"], dietaryNeeds: "cheese", ...overrides }), now)).toThrow(NoMatchingPlanError);
    }
  });
});

describe("travel preferences", () => {
  it("favors a nearby walk when open to either, with a 15-minute default", () => {
    const plan = generateDatePlan(request(), now);
    expect(plan.travel?.mode).toBe("walking");
    expect(plan.travel?.estimatedMinutes).toBe(10);
    expect(plan.travel?.directionsUrl).toContain("travelmode=walking");
    expect(plan.adjustments.join(" ")).toContain("15-minute comfortable walking limit");
  });

  it.each([[10, "walking"], [9, "driving"], [0, "driving"]] as const)(
    "respects a %i-minute walking limit by choosing %s",
    (limit, mode) => {
      const plan = generateDatePlan(request({ maximumWalkingMinutes: limit }), now);
      expect(plan.travel?.mode).toBe(mode);
    },
  );

  it("suggests driving for a distant second stop without inventing a drive time", () => {
    const plan = generateDatePlan(request({ startingNeighborhood: "Hyde Park" }), now);
    expect(plan.travel?.mode).toBe("driving");
    expect(plan.travel?.estimatedMinutes).toBeNull();
    expect(plan.travel?.scheduledBufferMinutes).toBe(15);
    expect(plan.adjustments.join(" ")).toContain("50-minute walk");
    expect(plan.travel?.directionsUrl).toContain("travelmode=driving");
  });

  it("tries driving when an allowed walk cannot fit the date", () => {
    const plan = generateDatePlan(request({ startingNeighborhood: "Hyde Park", maximumWalkingMinutes: 60,
      preferredActivities: ["Museum"], durationMinutes: 150 }), now);
    expect(plan.travel?.mode).toBe("driving");
    expect(plan.adjustments.join(" ")).toContain("walking schedule does not fit");
  });

  it("does not change an explicit walking-only choice to driving", () => {
    expect(() => generateDatePlan(request({ travelMode: "walking", maximumWalkingMinutes: 9 }), now))
      .toThrow(NoMatchingPlanError);
    const plan = generateDatePlan(request({ travelMode: "walking", startingNeighborhood: "Hyde Park", durationMinutes: 180 }), now);
    expect(plan.travel?.mode).toBe("walking");
    expect(plan.travel?.estimatedMinutes).toBe(50);
  });

  it("keeps explicit driving and older request defaults compatible", () => {
    const plan = generateDatePlan(request({ travelMode: "driving", maximumWalkingMinutes: 0, returnToParkedCar: true }), now);
    expect(plan.travel?.mode).toBe("driving");
    expect(plan.travel?.returnToStart).toBeUndefined();
    const legacy = { ...request() };
    delete (legacy as Partial<DateRequestCreate>).travelMode;
    expect(dateRequestCreateSchema.parse(legacy).travelMode).toBe("driving");
    expect(generatedPlanSchema.safeParse(plan).success).toBe(true);
  });

  it.each([-1, 2.5, 241])("rejects an invalid walking limit of %s", (limit) => {
    expect(dateRequestCreateSchema.safeParse({ ...request(), maximumWalkingMinutes: limit }).success).toBe(false);
  });
});

describe("returning to a parked car", () => {
  it("includes the return walk in the full allotted time", () => {
    const plan = generateDatePlan(request({ returnToParkedCar: true }), now);
    const first = plan.stops[0], last = plan.stops[1], back = plan.travel!.returnToStart!;
    expect(back.estimatedMinutes).toBe(10);
    expect(back.startLocalTime).toBe(last.endLocalTime);
    expect(minute(back.endLocalTime, back.endDayOffset) - minute(first.startLocalTime, first.startDayOffset)).toBe(120);
    expect(minute(last.endLocalTime) - minute(last.startLocalTime)).toBeGreaterThanOrEqual(30);
    expect(minute(first.endLocalTime) - minute(first.startLocalTime)).toBeGreaterThanOrEqual(60);
    const route = new URL(back.directionsUrl);
    expect(route.searchParams.get("origin")).toBe(last.address);
    expect(route.searchParams.get("destination")).toBe(first.address);
    expect(route.searchParams.get("travelmode")).toBe("walking");
  });

  it("allows returning after the activity closes while ending the visit before closing", () => {
    const plan = generateDatePlan(request({
      travelMode: "walking", returnToParkedCar: true, preferredActivities: ["Museum"], durationMinutes: 180,
      startWindow: { startLocalTime: "17:12", endLocalTime: "17:13" },
    }), now);
    expect(plan.stops[1].endLocalTime).toBe("20:00");
    expect(plan.travel?.returnToStart?.endLocalTime).toBe("20:12");
  });

  it("falls back to driving when the return walk leaves too little activity time", () => {
    const plan = generateDatePlan(request({
      startingNeighborhood: "Hyde Park", durationMinutes: 180,
      maximumWalkingMinutes: 60, returnToParkedCar: true,
    }), now);
    expect(plan.travel?.mode).toBe("driving");
    expect(plan.travel?.returnToStart).toBeUndefined();
  });

  it("does not reserve a return walk unless requested", () => {
    const plan = generateDatePlan(request(), now);
    expect(plan.travel?.returnToStart).toBeUndefined();
    expect(plan.notes.join(" ")).toContain("that return is not included");
  });

  it("does not add travel or a phantom return to a dinner-only date", () => {
    const plan = generateDatePlan(request({
      startingNeighborhood: "Hyde Park", preferredActivities: [], acceptsSingleStop: true, returnToParkedCar: true,
      startWindow: { startLocalTime: "20:30", endLocalTime: "20:31" },
    }), now);
    expect(plan.stops).toHaveLength(1);
    expect(plan.travel).toBeUndefined();
    expect(plan.durationMinutes).toBe(120);
  });

  it("rejects a walking-only date when the return leaves too little activity time", () => {
    expect(() => generateDatePlan(request({
      travelMode: "walking", startingNeighborhood: "Hyde Park", durationMinutes: 180,
      maximumWalkingMinutes: 60, returnToParkedCar: true,
    }), now)).toThrow(NoMatchingPlanError);
  });
});

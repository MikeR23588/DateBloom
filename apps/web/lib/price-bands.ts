export type PriceBand = "budget" | "moderate" | "upscale" | "splurge";

// Editorial planning ranges for a meal for two, not a quote from any venue.
const mealRanges: Record<PriceBand, readonly [number, number]> = {
  budget: [2000, 5000],
  moderate: [4500, 10000],
  upscale: [9000, 18000],
  splurge: [16000, 32000],
};

export const priceBandLabel: Record<PriceBand, string> = {
  budget: "Budget-friendly",
  moderate: "Moderate",
  upscale: "Upscale",
  splurge: "Splurge",
};

export function bandFromMealSubtotal(cents: number): PriceBand {
  const legacyPlanningAnchor = Math.ceil(cents * 130 / 100) + 1000;
  if (legacyPlanningAnchor <= 5000) return "budget";
  if (legacyPlanningAnchor <= 10000) return "moderate";
  if (legacyPlanningAnchor <= 18000) return "upscale";
  return "splurge";
}

export function mealBudgetRange(band: PriceBand, drinksPreferred: boolean): readonly [number, number] {
  const [low, high] = mealRanges[band];
  return [low, high + (drinksPreferred ? 3000 : 0)];
}

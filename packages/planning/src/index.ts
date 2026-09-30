import type { DateRequestCreate } from "@date-planner/contracts";

export type VenueCategory = "meal" | "activity";
export type DataConfidence = "verified" | "estimate" | "unknown";

/** A planner candidate. Unknown facts stay explicit and may trigger automatic data validation. */
export interface PlanningVenue {
  id: string;
  citySlug: string;
  neighborhood: string;
  category: VenueCategory;
  name: string;
  typicalPriceCents: number | null;
  durationMinutes: number | null;
  ageMinimum: number | null;
  indoorOutdoor: "indoors" | "outdoors" | "mixed" | "unknown";
  cuisines: readonly string[];
  activities: readonly string[];
  atmosphere: readonly string[];
  dietaryConfidence: DataConfidence;
  accessibilityConfidence: DataConfidence;
  suitabilityVerified: boolean;
}

export interface BudgetEstimate {
  planningFeeCents: number;
  venueSubtotalCents: number;
  taxAndTipAllowanceCents: number;
  parkingAllowanceCents: number;
  depositsCents: number;
}

export interface PlannerPolicy {
  planningFeeCents: number;
  taxAndTipRateBasisPoints: number;
  parkingAllowanceCents: number;
  requiredDepositCents: number;
  /** Price cushion applied to catalog estimates, in basis points. */
  estimateBufferBasisPoints: number;
}

export interface CandidateScore {
  venue: PlanningVenue;
  score: number;
  reasons: string[];
  dataGaps: string[];
}

export interface PlannerResult {
  status: "suggestions" | "needs_data";
  candidates: CandidateScore[];
  dataGaps: string[];
}

const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US");
const matchesAny = (values: readonly string[], requested: readonly string[]) => {
  const haystack = new Set(values.map(normalize));
  return requested.some((item) => haystack.has(normalize(item)));
};
const money = (amount: number) => Number.isSafeInteger(amount) && amount >= 0;

/** Integer-only estimate; venue price is for the whole couple, never multiplied implicitly. */
export function estimateBudget(
  venueCostsCents: readonly number[],
  policy: PlannerPolicy,
): BudgetEstimate {
  if (venueCostsCents.some((amount) => !money(amount))) throw new RangeError("Venue costs must be non-negative integer cents.");
  if (![policy.planningFeeCents, policy.parkingAllowanceCents, policy.requiredDepositCents].every(money)) {
    throw new RangeError("Fees, parking, and deposits must be non-negative integer cents.");
  }
  if (![policy.taxAndTipRateBasisPoints, policy.estimateBufferBasisPoints].every((rate) => Number.isInteger(rate) && rate >= 0)) {
    throw new RangeError("Budget rates must be non-negative integer basis points.");
  }

  const venueSubtotalCents = venueCostsCents.reduce((total, cost) => total + cost, 0);
  const bufferedVenueCents = Math.ceil(venueSubtotalCents * (10_000 + policy.estimateBufferBasisPoints) / 10_000);
  const taxAndTipAllowanceCents = Math.ceil(bufferedVenueCents * policy.taxAndTipRateBasisPoints / 10_000);
  return {
    planningFeeCents: policy.planningFeeCents,
    venueSubtotalCents,
    taxAndTipAllowanceCents,
    parkingAllowanceCents: policy.parkingAllowanceCents,
    depositsCents: policy.requiredDepositCents,
  };
}

export function totalBudgetCents(estimate: BudgetEstimate, includesPlanningFee: boolean): number {
  return estimate.venueSubtotalCents + estimate.taxAndTipAllowanceCents + estimate.parkingAllowanceCents + estimate.depositsCents +
    (includesPlanningFee ? estimate.planningFeeCents : 0);
}

/** Filter impossible candidates first; flag unknown hard-requirement data for automatic data validation. */
export function rankCandidates(
  request: DateRequestCreate,
  catalog: readonly PlanningVenue[],
  options: { activeCitySlug: string; planningFeeCents: number; neighborhoodNovelty?: ReadonlySet<string> },
): PlannerResult {
  const dataGaps: string[] = [];

  const eligible: CandidateScore[] = [];
  for (const venue of catalog) {
    if (venue.citySlug !== options.activeCitySlug || venue.citySlug !== request.citySlug) continue;
    if (venue.ageMinimum !== null && venue.ageMinimum > 18) continue;
    if (venue.typicalPriceCents !== null && venue.typicalPriceCents > request.budgetLimitCents) continue;
    if (venue.category === "meal" && request.preferredCuisines.length && !matchesAny(venue.cuisines, request.preferredCuisines)) continue;
    if (venue.category === "activity" && request.preferredActivities.length && !matchesAny(venue.activities, request.preferredActivities)) continue;
    if (request.settingPreference === "indoors" && venue.indoorOutdoor === "outdoors") continue;
    if (request.settingPreference === "outdoors" && venue.indoorOutdoor === "indoors") continue;

    const reasons: string[] = [];
    let score = 0;
    if (venue.atmosphere.some((value) => normalize(value) === normalize(request.atmosphere))) {
      score += 3;
      reasons.push("Matches the requested atmosphere.");
    }
    if (normalize(venue.neighborhood) === normalize(request.startingNeighborhood)) {
      score += 2;
      reasons.push("In the starting neighborhood.");
    } else {
      reasons.push("Different neighborhood; travel data is required before selection.");
    }
    if (options.neighborhoodNovelty?.has(normalize(venue.neighborhood))) {
      score += 1;
      reasons.push("Adds neighborhood variety.");
    }

    const venueDataGaps: string[] = [];
    if (venue.typicalPriceCents === null) venueDataGaps.push("Price is unknown.");
    if (venue.durationMinutes === null) venueDataGaps.push("Typical duration is unknown.");
    if (!venue.suitabilityVerified) venueDataGaps.push("Suitability has not been verified.");
    if (normalize(venue.neighborhood) !== normalize(request.startingNeighborhood)) venueDataGaps.push("Travel time to another neighborhood must be checked.");
    if (request.dietaryNeeds.trim() && venue.dietaryConfidence !== "verified") venueDataGaps.push("Dietary requirements are unresolved.");
    if (request.accessibilityNeeds.trim() && venue.accessibilityConfidence !== "verified") venueDataGaps.push("Accessibility requirements are unresolved.");
    eligible.push({ venue, score, reasons, dataGaps: venueDataGaps });
  }

  eligible.sort((a, b) => b.score - a.score || a.venue.id.localeCompare(b.venue.id));
  if (!eligible.length) dataGaps.push("No catalog candidates meet the known requirements.");
  return { status: dataGaps.length || eligible.some(({ dataGaps: reasons }) => reasons.length) ? "needs_data" : "suggestions", candidates: eligible, dataGaps };
}

/** A two-stop estimate that refuses unknown prices and respects the request's cap policy. */
export function estimateCombination(
  meal: PlanningVenue,
  activity: PlanningVenue,
  request: DateRequestCreate,
  policy: PlannerPolicy,
): { estimate: BudgetEstimate; totalCents: number; fitsBudget: boolean } | null {
  if (meal.category !== "meal" || activity.category !== "activity" || meal.typicalPriceCents === null || activity.typicalPriceCents === null) return null;
  const estimate = estimateBudget([meal.typicalPriceCents, activity.typicalPriceCents], policy);
  const totalCents = totalBudgetCents(estimate, true);
  return { estimate, totalCents, fitsBudget: totalCents <= request.budgetLimitCents };
}


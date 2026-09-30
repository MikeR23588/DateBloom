import { generatedPlanSchema, type DateRequestCreate, type GeneratedPlan } from "@datebloom/contracts";
import { catalogCheckedOn, catalogExpiresOn, restaurantCoverageSummary, venues, events, walkingBuffers, walkingBufferBasis, onSiteWalkingPairs, type CatalogVenue, type CatalogEvent } from "./venue-catalog";
import { venueHoursOnDate } from "./venue-hours";
import { bandFromMealSubtotal, mealBudgetRange, priceBandLabel } from "./price-bands";

export class NoMatchingPlanError extends Error {
  readonly name = "NoMatchingPlanError";
  readonly code = "NO_MATCHING_ITINERARY";
  constructor(message: string, readonly reasons: string[]) { super(message); }
}
const minutes = (time: string) => Number(time.slice(0,2))*60 + Number(time.slice(3));
function clock(value: number) {
  return { time: `${String(Math.floor(value % 1440 / 60)).padStart(2,"0")}:${String(value % 60).padStart(2,"0")}`, dayOffset: Math.floor(value / 1440) };
}
function isOpen(venue: CatalogVenue, date: string, start: number, end: number) {
  const hours = venueHoursOnDate(venue, date);
  return hours !== null && hours !== undefined && start >= hours[0] && end <= hours[1];
}
function cost(venue: CatalogVenue, meal: boolean, alcohol: DateRequestCreate["alcoholPreference"]) {
  // Allowances, not a tax or availability quote. The meal estimate includes
  // 10% tax allowance, 20% tip, $10 contingency and optional $30 drink allowance.
  // Integer percentage numerators avoid floating-point artifacts adding a phantom cent.
  if (meal && venue.subtotalForTwoCents === undefined) {
    if (!venue.priceBand) throw new Error(`Restaurant ${venue.id} needs a price band or legacy subtotal.`);
    const [low, high] = mealBudgetRange(venue.priceBand, alcohol === "prefer");
    return Math.round((low + high) / 2000) * 1000;
  }
  return meal ? Math.ceil((venue.subtotalForTwoCents ?? 0) * 130 / 100) + 1000 + (alcohol === "prefer" ? 3000 : 0)
    : Math.ceil((venue.subtotalForTwoCents ?? 0) * 110 / 100);
}
function estimateRange(venue: CatalogVenue, meal: boolean, estimate: number, alcohol: DateRequestCreate["alcoholPreference"]) {
  if (meal) {
    const band = venue.priceBand ?? bandFromMealSubtotal(venue.subtotalForTwoCents!);
    const [lowCents, highCents] = mealBudgetRange(band, alcohol === "prefer");
    return { lowCents, highCents, label: priceBandLabel[band] };
  }
  const spread = estimate === 0 ? 0 : Math.max(500, Math.round(estimate * 0.1 / 100) * 100);
  return { lowCents: Math.max(0, estimate - spread), highCents: estimate + spread, label: estimate === 0 ? "Free" : "Approximate activity cost" };
}
function stop(venue: CatalogVenue, kind: "meal" | "activity", start: number, end: number, estimate: number, alcohol: DateRequestCreate["alcoholPreference"], event?: CatalogEvent, foodPreference?: string): GeneratedPlan["stops"][number] {
  return {
    kind, title: event ? `${event.name} — ${venue.name}` : venue.name,
    venueId: venue.id, venueName: venue.name, address: venue.address,
    sourceUrl: venue.sourceUrl, ...(venue.menuUrl ? {menuUrl: venue.menuUrl} : {}),
    ...(venue.bookingUrl ? {bookingUrl: venue.bookingUrl} : {}),
    directionsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}`,
    sourceCheckedOn: venue.sourceCheckedOn ?? catalogCheckedOn,
    description: kind === "meal" ? `Meal at ${venue.name}. Check the current menu before ordering.${foodPreference ? ` ${foodPreference}` : ""}`
      : event ? event.description
      : venue.description ?? `Visit ${venue.name}. Check the linked visitor information before going.`,
    costDescription: kind === "meal" ? `Price band is an approximate guide for two, not a quote or guaranteed budget. Food, drinks, tax and tip vary.${foodPreference ? " Customization and any price change are unconfirmed." : ""}`
      : venue.costDescription,
    startLocalTime: clock(start).time, endLocalTime: clock(end).time,
    startDayOffset: clock(start).dayOffset, endDayOffset: clock(end).dayOffset,
    suggestedBudgetCents: estimate,
    priceEstimate: estimateRange(venue, kind === "meal", estimate, alcohol),
    ...(event ? {event: {id: event.id, name: event.name, sourceUrl: event.sourceUrl,
      startLocalTime: clock(event.start).time, endLocalTime: clock(event.end).time}} : {}),
  };
}

/** Select sourced businesses/events. Never fall back to a category-only idea. */
export function generateDatePlan(request: DateRequestCreate, now = new Date()): GeneratedPlan {
  const reject = (reasons: string[]): never => { throw new NoMatchingPlanError("No itinerary in the current catalog fits these answers.", reasons); };
  if (request.citySlug !== "tampa") reject(["The venue catalog currently covers Tampa only."]);
  const unverifiedRequirements: string[] = [];
  // Older clients may describe an allergy/strict need without the new explicit flag.
  const strictDietaryRequest = request.dietaryRequirementType === "strict"
    || /\b(?:allerg\w*|anaphyl\w*|celiac|coeliac|intoleran\w*|medical|strict|required|require|must)\b/i.test(request.dietaryNeeds);
  if (request.dietaryNeeds.trim() && strictDietaryRequest) unverifiedRequirements.push("The current catalog cannot verify your allergy or strict dietary requirement. No itinerary was generated; that requirement was not ignored. Ordinary food dislikes can be carried as unconfirmed ordering requests, but this is not a verified allergy-safe plan.");
  if (request.accessibilityNeeds.trim()) unverifiedRequirements.push("The current catalog cannot verify your accessibility requirements. No itinerary was generated; those requirements were not ignored.");
  if (unverifiedRequirements.length) reject(unverifiedRequirements);
  const restaurants = venues.filter(v => v.cuisines?.some(c => request.preferredCuisines.includes(c as DateRequestCreate["preferredCuisines"][number]))
    && (v.priceBand !== undefined || v.subtotalForTwoCents !== undefined)
    && v.neighborhood === request.startingNeighborhood
    && (request.settingPreference === "any" || v.setting === request.settingPreference));
  if (!restaurants.length) reject([`No sourced restaurant matches ${request.preferredCuisines.join(", ")} in ${request.startingNeighborhood} with your ${request.settingPreference} setting. Current restaurant coverage: ${restaurantCoverageSummary()}. Seating coverage varies by restaurant.`]);
  const interests: readonly string[] = request.preferredActivities.length ? request.preferredActivities
    : request.settingPreference === "indoors" ? ["Museum"] : ["Outdoor walk","Museum","Live music"];
  const wantsSingle = request.acceptsSingleStop && request.preferredActivities.length === 0;
  const failures = new Set<string>();
  const candidates: {score:number; plan:GeneratedPlan}[] = [];
  const dates = [request.requestedLocalDate,...request.alternativeLocalDates];
  for (const [dateIndex, date] of dates.entries()) {
    const activities: {venue:CatalogVenue; event?:CatalogEvent}[] = [
      ...venues.filter(v => v.activity && interests.includes(v.activity)).map(venue => ({venue})),
      ...events.filter(e => interests.includes("Live music") && e.dates.includes(date)).map(event => ({venue: venues.find(v => v.id === event.venueId)!, event})),
    ].filter(({venue}) => request.settingPreference === "any" || venue.setting === request.settingPreference);
    if (!activities.length && !wantsSingle) failures.add(`No published ${interests.join(" or ")} option matches ${date} and your setting. Live music requires an explicitly dated event. Current music dates: Oct 1, Oct 9, Nov 5 and Dec 3, 2026.`);
    for (const meal of restaurants) {
      const foodPreference = request.dietaryNeeds.trim()
        ? `Foods to avoid: ${request.dietaryNeeds.trim()}. Request these be left out when ordering at ${meal.name}; the kitchen has not confirmed the customization.` : undefined;
      const mealCost = cost(meal,true,request.alcoholPreference);
      const choices: ({venue:CatalogVenue; event?:CatalogEvent} | null)[] = wantsSingle ? [null,...activities] : activities;
      for (const activity of choices) {
        const walkingEstimate = activity ? walkingBuffers[`${meal.id}:${activity.venue.id}`] : 0;
        const walkingLimit = request.maximumWalkingMinutes ?? (request.travelMode === "flexible" ? 15 : Infinity);
        const canWalk = walkingEstimate !== undefined && walkingEstimate <= walkingLimit;
        const modes: ("walking" | "driving")[] = request.travelMode === "flexible"
          ? activity && canWalk ? ["walking", "driving"] : ["driving"]
          : [request.travelMode ?? "driving"];
        for (const mode of modes) {
          if (activity && mode === "driving" && onSiteWalkingPairs.includes(`${meal.id}:${activity.venue.id}`)) {
            failures.add(`${meal.name} and ${activity.venue.name} share a building and require an on-site walk; driving cannot replace that transfer.`);
            continue;
          }
          if (activity && mode === "walking" && !canWalk) {
            failures.add(walkingEstimate === undefined ? "A walking estimate is missing for this combination."
              : `This walk is estimated at ${walkingEstimate} minutes, above your ${walkingLimit}-minute comfortable walking limit.`);
            continue;
          }
          // Driving durations need a routing provider. Reserve a clearly disclosed
          // transition allowance, rather than relabeling a walking estimate.
          const travel = activity ? mode === "walking" ? walkingEstimate : 15 : 0;
          if (travel === undefined) { failures.add("A route estimate is missing for this combination."); continue; }
          const returnMinutes = activity && mode === "walking" && request.returnToParkedCar ? travel : 0;
          const activityCost = activity ? cost(activity.venue,false,request.alcoholPreference) : 0;
          const mealRange = estimateRange(meal, true, mealCost, request.alcoholPreference);
          const activityRange = activity ? estimateRange(activity.venue, false, activityCost, request.alcoholPreference) : {lowCents: 0, highCents: 0};
          const lowCents = mealRange.lowCents + activityRange.lowCents;
          const highCents = mealRange.highCents + activityRange.highCents;
          if (lowCents > request.budgetLimitCents) { failures.add(`Even the low end of this approximate price range is above your budget. Choose a higher budget or another covered area.`); continue; }
          let found = false;
          let exactFound = false;
          let best: {score: number; plan: GeneratedPlan} | undefined;
          for (let start = minutes(request.startWindow.startLocalTime); start <= minutes(request.startWindow.endLocalTime) && !exactFound; start++) {
            for (let mealLength = Math.max(60, meal.minimumMinutes); mealLength <= meal.maximumMinutes; mealLength += 15) {
              const mealEnd = start + mealLength;
              const activityStart = mealEnd + travel;
              const activityClose = activity ? venueHoursOnDate(activity.venue, date)?.[1] ?? 0 : 0;
              const latestEnd = activity ? Math.min(activityClose, activity.event?.end ?? activityClose, activityStart + (activity.event ? activity.event.end-activity.event.start : activity.venue.maximumMinutes)) : mealEnd;
              const end = start + request.durationMinutes;
              const activityEnd = end - returnMinutes;
              if (activityEnd > latestEnd) continue;
              const activityLength = activityEnd - activityStart;
              if (!isOpen(meal,date,start,mealEnd)) continue;
              if (activity) {
                if (activity.venue.startMinuteStep && activityStart % activity.venue.startMinuteStep !== 0) continue;
                const min = activity.event ? 60 : activity.venue.minimumMinutes;
                const max = activity.event ? activity.event.end-activity.event.start : activity.venue.maximumMinutes;
                if (activityLength < min || activityLength > max || !isOpen(activity.venue,date,activityStart,activityEnd)) continue;
                if (activity.event && (activityStart < activity.event.start || activityEnd > activity.event.end)) continue;
              }
              const stops = [stop(meal,"meal",start,mealEnd,mealCost,request.alcoholPreference,undefined,foodPreference)];
              if (activity) stops.push(stop(activity.venue,"activity",activityStart,activityEnd,activityCost,request.alcoholPreference,activity.event));
              const route = activity ? {
                mode, estimatedMinutes: mode === "walking" ? travel : null, scheduledBufferMinutes: travel,
                directionsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(meal.address)}&destination=${encodeURIComponent(activity.venue.address)}&travelmode=${mode}`,
                basis: mode === "walking" ? walkingBufferBasis[`${meal.id}:${activity.venue.id}`] ?? "Estimated walking buffer; not a live route measurement."
                  : "15 minutes reserved between stops for planning only. Actual drive time, parking and rideshare cost are unknown; check the route before going.",
                ...(returnMinutes ? {returnToStart: {
                  estimatedMinutes: returnMinutes,
                  startLocalTime: clock(activityEnd).time, endLocalTime: clock(end).time,
                  startDayOffset: clock(activityEnd).dayOffset, endDayOffset: clock(end).dayOffset,
                  directionsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(activity.venue.address)}&destination=${encodeURIComponent(meal.address)}&travelmode=walking`,
                }} : {}),
              } : undefined;
              const notes = [
                "Price ranges are broad planning guides for two, not menu quotes. Actual food, drink, tax, tip and activity prices may differ.",
                activity ? `Between stops: ${mode === "driving" ? "drive / rideshare" : "walking"}. Travel to the first stop, transport costs, parking and optional purchases are outside this itinerary estimate.`
                  : "Travel to this stop, transport costs, parking and optional purchases are outside this itinerary estimate.",
                ...(activity && mode === "walking" && !returnMinutes ? [`If you park at the first stop, allow about ${travel} minutes to walk back afterward; that return is not included in this date's allotted time.`] : []),
                ...(returnMinutes ? [`The final ${returnMinutes} minutes are reserved to walk back to your car at ${meal.name}. The return uses the same approximate walking buffer; check the route before going.`] : []),
                "Published hours and event schedules can change; table and ticket availability are not confirmed.",
                ...((meal.planningNotes?.length || activity?.venue.planningNotes?.length)
                  ? [[...(meal.planningNotes ?? []), ...(activity?.venue.planningNotes ?? [])].join(" ")] : []),
                ...(request.alcoholPreference === "prefer" ? ["The meal estimate includes a $30 allowance for optional drinks."] : request.alcoholPreference === "avoid" ? ["The selected meal estimate does not include alcohol."] : []),
                ...(dateIndex ? [`This uses your alternative date ${date}.`] : []),
                ...([meal, ...(activity ? [activity.venue] : [])].some(venue => now.toISOString().slice(0,10) >= (venue.sourceExpiresOn ?? catalogExpiresOn))
                  ? ["Source records are due for review. Recheck the linked hours, menus and event listing before going."] : []),
              ];
              const adjustments: string[] = [];
              if (highCents > request.budgetLimitCents) adjustments.push("The upper end of this estimated range exceeds your budget. Check current prices before choosing this date.");
              if (foodPreference) adjustments.push(foodPreference);
              if (activity && request.travelMode === "flexible") adjustments.push(mode === "walking"
                ? `Walking is suggested: about ${travel} minutes between stops, within your ${walkingLimit}-minute comfortable walking limit. This is a catalog estimate, not a live route measurement.`
                : canWalk ? "Driving is suggested because the walking schedule does not fit as well. Actual driving time and parking remain unverified."
                : walkingEstimate === undefined ? "Driving is suggested because no walking estimate is available. Actual driving time and parking remain unverified."
                : `Driving is suggested: the estimated ${walkingEstimate}-minute walk exceeds your ${walkingLimit}-minute comfortable walking limit. Actual driving time and parking remain unverified.`);
              if (returnMinutes) adjustments.push(`${returnMinutes} minutes to walk back to your parked car are included in the allotted date time.`);
              const actualDuration = end-start;
              if (activity && request.maximumTravelMinutes != null) adjustments.push(mode === "driving" ? `Your ${request.maximumTravelMinutes}-minute travel preference is not verified. Check the driving route; the itinerary reserves ${travel} minutes between stops.`
                : travel > request.maximumTravelMinutes ? `This walk is estimated at ${travel} minutes, above your ${request.maximumTravelMinutes}-minute preference.` : `Walking time is an estimate, not a verified ${request.maximumTravelMinutes}-minute limit.`);
              const plan = generatedPlanSchema.parse({
                title: activity ? `${meal.name} & ${activity.event?.name ?? activity.venue.name}` : `Dinner at ${meal.name}`,
                requestedLocalDate: date, neighborhood: request.startingNeighborhood,
                durationMinutes: actualDuration, adjustments, budgetLimitCents: request.budgetLimitCents,
                estimatedTotalCents: mealCost+activityCost, stops, notes, ...(route ? {travel:route} : {}),
                priceEstimate: {lowCents, highCents},
                venueStatus: "venues_selected",
              });
              const candidate = {score: dateIndex*10000 + (request.durationMinutes-actualDuration)*10
                + (!activity ? 500 : 0)
                 + (meal.moods.includes(request.atmosphere) ? 0 : 100)
                + (activity && !activity.venue.moods.includes(request.atmosphere) ? 50 : 0)
                + (activity ? Math.max(0,interests.indexOf(activity.event ? "Live music" : activity.venue.activity ?? "Live music"))*10 : 0) + travel
                + (activity && request.travelMode === "flexible" && canWalk && mode === "driving" ? 100 : 0)
                + (activity && request.maximumTravelMinutes != null && mode === "walking" ? Math.max(0,travel-request.maximumTravelMinutes)*20 : 0), plan};
              candidate.score += Math.ceil(Math.max(0, highCents-request.budgetLimitCents) / 100) * 5;
              if (!best || candidate.score < best.score) best = candidate;
              if (!activity || actualDuration === request.durationMinutes) exactFound = true;
              found = true;
            }
          }
          if (best) candidates.push(best);
          if (!found) failures.add(`${meal.name}${activity ? " and "+(activity.event?.name ?? activity.venue.name) : ""} cannot fit the full ${request.durationMinutes/60}-hour date, including at least one hour for food, within your start window and published hours${activity?.event ? " and event times" : ""}. Try an earlier start or a shorter date.`);
        }
      }
    }
  }
  candidates.sort((a,b) => a.score-b.score);
  if (!candidates.length) reject([...failures].slice(0,5));
  return candidates[0].plan;
}

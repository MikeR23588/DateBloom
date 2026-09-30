import type { CatalogVenue } from "./venue-catalog";

/** Published service windows, narrowed by known closures and verified seasonal coverage. */
export function venueHoursOnDate(venue: CatalogVenue, date: string): readonly [number, number] | null {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const schedule = venue.schedule;
  const annualDate = date.slice(5);
  const thanksgiving = weekday === 4 && annualDate.startsWith("11-")
    && Number(annualDate.slice(3)) >= 22 && Number(annualDate.slice(3)) <= 28;
  if ((schedule?.availableThrough && date > schedule.availableThrough)
    || schedule?.closedDates?.includes(date)
    || schedule?.closedAnnualDates?.includes(annualDate)
    || (schedule?.closeOnThanksgiving && thanksgiving)) return null;
  const hours = venue.hours[weekday];
  if (!hours) return null;
  const close = Math.min(hours[1], schedule?.earlyClosingByAnnualDate?.[annualDate] ?? hours[1]);
  return close > hours[0] ? [hours[0], close] : null;
}

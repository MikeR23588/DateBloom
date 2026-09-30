import Link from "next/link";
import { generatedPlanSchema, type GeneratedPlan } from "@datebloom/contracts";
import { formatLocalTime } from "@/lib/dates/display-time";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const time = formatLocalTime;
export function GeneratedPlanView({ plan }: { plan: GeneratedPlan }) {
  if (!generatedPlanSchema.safeParse(plan).success) return (
    <section className="generated-plan" role="alert">
      <h2>This earlier itinerary needs to be regenerated</h2>
      <p>It does not meet the current timing rules. Every food stop must last at least one hour.</p>
      <Link className="button" href="/request">Generate a corrected itinerary</Link>
    </section>
  );
  return (
    <section className="generated-plan" aria-label="Your generated date">
      <p className="form-kicker">Your date itinerary</p>
      <h2>{plan.title}</h2>
      <p className="generated-plan-intro">{plan.requestedLocalDate} · Tampa local time · {plan.neighborhood} · {plan.durationMinutes >= 60 ? `${Math.floor(plan.durationMinutes/60)}h ${plan.durationMinutes%60}m` : `${plan.durationMinutes} minutes`}</p>
      {plan.adjustments.length > 0 && <div className="plan-adjustments" role="status"><strong>Timing and travel details</strong><ul>{plan.adjustments.map(item => <li key={item}>{item}</li>)}</ul></div>}
      <p><strong>Approximate total for two: {plan.priceEstimate ? `${money(plan.priceEstimate.lowCents)}–${money(plan.priceEstimate.highCents)}` : money(plan.estimatedTotalCents)}</strong> · Your budget: {money(plan.budgetLimitCents)}</p>
      <div className="generated-stops">
        {plan.stops.map((stop, index) => (
          <article className="generated-stop" key={stop.venueId}>
            <div className="generated-stop-time">{time(stop.startLocalTime, stop.startDayOffset)}–{time(stop.endLocalTime, stop.endDayOffset)}</div>
            <div>
              <span className="generated-stop-number">{String(index + 1).padStart(2, "0")} / {stop.kind.charAt(0).toUpperCase() + stop.kind.slice(1)}</span>
              <h3>{stop.title}</h3><p className="venue-address">{stop.address}</p><p>{stop.description}</p>
              {stop.event && <p><strong>Published event:</strong> {stop.event.name} · {plan.requestedLocalDate}, {time(stop.event.startLocalTime)}–{time(stop.event.endLocalTime)}. Your attendance time is shown on the left.</p>}
              <p><strong>{stop.priceEstimate ? `${stop.priceEstimate.label} · about ${money(stop.priceEstimate.lowCents)}–${money(stop.priceEstimate.highCents)} for two` : `Estimated cost for two: ${money(stop.suggestedBudgetCents)}`}</strong><br /><small>{stop.costDescription}</small></p>
              <div className="venue-links">
                <a href={stop.directionsUrl} target="_blank" rel="noopener noreferrer">Directions ↗</a>
                <a href={stop.sourceUrl} target="_blank" rel="noopener noreferrer">Official hours & details ↗</a>
                {stop.menuUrl && <a href={stop.menuUrl} target="_blank" rel="noopener noreferrer">Menu ↗</a>}
                {stop.bookingUrl && <a href={stop.bookingUrl} target="_blank" rel="noopener noreferrer">{stop.kind === "meal" ? "Reserve directly" : "Tickets"} ↗</a>}
                {stop.event && <a href={stop.event.sourceUrl} target="_blank" rel="noopener noreferrer">Event listing ↗</a>}
              </div>
              <small>Source reviewed {stop.sourceCheckedOn}</small>
              {index === 0 && plan.travel && <p className="venue-travel"><strong>Next stop:</strong> {plan.travel.mode === "walking" ? `Estimated ${plan.travel.estimatedMinutes} minutes walking.` : `Drive / rideshare; actual time unverified. ${plan.travel.scheduledBufferMinutes ?? 15} minutes reserved between stops.`} <a href={plan.travel.directionsUrl} target="_blank" rel="noopener noreferrer">View route ↗</a><br /><small>{plan.travel.basis}</small></p>}
              {index === plan.stops.length - 1 && plan.travel?.returnToStart && <p className="venue-travel"><strong>Back to your parked car:</strong> {time(plan.travel.returnToStart.startLocalTime, plan.travel.returnToStart.startDayOffset)}–{time(plan.travel.returnToStart.endLocalTime, plan.travel.returnToStart.endDayOffset)} · About {plan.travel.returnToStart.estimatedMinutes} minutes walking to {plan.stops[0].venueName}. <a href={plan.travel.returnToStart.directionsUrl} target="_blank" rel="noopener noreferrer">Return route ↗</a><br /><small>Included in your allotted date time. Approximate walking buffer, not a live route measurement.</small></p>}
            </div>
          </article>
        ))}
      </div>
      <div className="generated-plan-notes"><strong>Before you go</strong><ul>{plan.notes.map((note) => <li key={note}>{note}</li>)}</ul></div>
      <p className="generated-plan-disclosure">Venues are selected. Reservations and ticket availability are not confirmed; book directly using the links above.</p>
    </section>
  );
}

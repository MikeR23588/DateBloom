"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import {
  activityOptions, apiErrorSchema, cuisineOptions, dateRequestCreateSchema,
  dateRequestResponseSchema, type GeneratedPlan,
} from "@date-planner/contracts";
import { GeneratedPlanView } from "@/app/components/generated-plan";
import { formatLocalTime } from "@/lib/dates/display-time";

const steps = ["Schedule", "Budget & area", "Preferences", "Review"];
const travelLabels: Record<string, string> = { driving: "Drive / rideshare", walking: "Walk", flexible: "Open to either" };
function fieldValue(form: HTMLFormElement, name: string) {
  return form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value ?? "";
}
function checked(form: HTMLFormElement, name: string) {
  return form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;
}
function checkedValues(form: HTMLFormElement, name: string) {
  return Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)).map((input) => input.value);
}
function splitList(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function tampaNowLocal() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function RequestForm({ signedIn = false, restaurantCoverage }: { signedIn?: boolean; restaurantCoverage: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyKey = useRef<string | null>(null);
  const [step, setStep] = useState(0);
  const [travelMode, setTravelMode] = useState("flexible");
  const [review, setReview] = useState<{ date: string; time: string; budget: string; neighborhood: string; atmosphere: string; travel: string; walking: string; returnToCar: boolean; dietary: string; strictDietary: boolean; accessibility: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noMatchReasons, setNoMatchReasons] = useState<string[]>([]);
  const [noMatchStep, setNoMatchStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);

  function advance() {
    const form = formRef.current;
    const currentStep = form?.querySelectorAll<HTMLFieldSetElement>("fieldset.request-step")[step];
    if (!form || !currentStep) return;
    const invalid = currentStep.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:invalid, select:invalid, textarea:invalid");
    if (invalid) { setError("Complete the required fields on this step."); invalid.reportValidity(); invalid.focus(); return; }
    if (step === 0) {
      const options = [fieldValue(form, "requestedLocalDate"), ...splitList(fieldValue(form, "alternativeLocalDates"))];
      if (options.length > 4 || new Set(options).size !== options.length || options.some((date) => !isCalendarDate(date))) {
        setError("Use up to three different alternative dates in YYYY-MM-DD format."); return;
      }
      const start = fieldValue(form, "startLocalTime");
      if (options.some((date) => `${date}T${start}` <= tampaNowLocal())) { setError("Choose a future date and start time for every date option."); return; }
      if (start >= fieldValue(form, "endLocalTime")) { setError("The end of the start window must be later than its beginning."); return; }
    }
    if (step === 2) {
      const required = ["requestedLocalDate", "startLocalTime", "endLocalTime", "durationMinutes", "budgetDollars", "startingNeighborhood", "atmosphere"];
      const missing = required.find((name) => !fieldValue(form, name).trim());
      if (missing) { setStep(["requestedLocalDate", "startLocalTime", "endLocalTime", "durationMinutes"].includes(missing) ? 0 : ["budgetDollars", "startingNeighborhood", "maximumTravelMinutes"].includes(missing) ? 1 : 2); setError("Complete every required field before reviewing your date."); return; }
      if (!checkedValues(form, "preferredCuisines").length) { setError("Choose at least one cuisine."); return; }
      if (checked(form, "strictDietaryRequirement") && !fieldValue(form, "dietaryNeeds").trim()) { setError("Describe the allergy or strict dietary requirement."); return; }
      setReview({
        date: fieldValue(form, "requestedLocalDate"),
        time: `${formatLocalTime(fieldValue(form, "startLocalTime"))}–${formatLocalTime(fieldValue(form, "endLocalTime"))}`,
        budget: Number(fieldValue(form, "budgetDollars")).toFixed(2),
        neighborhood: fieldValue(form, "startingNeighborhood"), atmosphere: fieldValue(form, "atmosphere"),
        travel: travelLabels[fieldValue(form, "travelMode")],
        walking: fieldValue(form, "travelMode") === "driving" ? ""
          : fieldValue(form, "maximumWalkingMinutes").trim() ? `${fieldValue(form, "maximumWalkingMinutes")} minutes per walk`
          : fieldValue(form, "travelMode") === "flexible" ? "15 minutes per walk" : "No limit",
        returnToCar: fieldValue(form, "travelMode") !== "driving" && checked(form, "returnToParkedCar"),
        dietary: fieldValue(form, "dietaryNeeds").trim(),
        strictDietary: checked(form, "strictDietaryRequirement"),
        accessibility: fieldValue(form, "accessibilityNeeds").trim(),
      });
    }
    setError(null); setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) { advance(); return; }
    const form = event.currentTarget;
    const payload = {
      citySlug: "tampa",
      requestedLocalDate: fieldValue(form, "requestedLocalDate"),
      alternativeLocalDates: splitList(fieldValue(form, "alternativeLocalDates")),
      startWindow: { startLocalTime: fieldValue(form, "startLocalTime"), endLocalTime: fieldValue(form, "endLocalTime") },
      durationMinutes: Number(fieldValue(form, "durationMinutes")),
      budgetLimitCents: Math.round(Number(fieldValue(form, "budgetDollars")) * 100),
      startingNeighborhood: fieldValue(form, "startingNeighborhood"),
      maximumTravelMinutes: fieldValue(form, "maximumTravelMinutes").trim() ? Number(fieldValue(form, "maximumTravelMinutes")) : null,
      travelMode: fieldValue(form, "travelMode") || "flexible",
      maximumWalkingMinutes: travelMode !== "driving" && fieldValue(form, "maximumWalkingMinutes").trim() ? Number(fieldValue(form, "maximumWalkingMinutes")) : null,
      returnToParkedCar: travelMode !== "driving" && checked(form, "returnToParkedCar"),
      atmosphere: fieldValue(form, "atmosphere"), occasion: fieldValue(form, "occasion"),
      preferredCuisines: checkedValues(form, "preferredCuisines"),
      preferredActivities: checkedValues(form, "preferredActivities"),
      dietaryNeeds: fieldValue(form, "dietaryNeeds"), accessibilityNeeds: fieldValue(form, "accessibilityNeeds"),
      ...(checked(form, "strictDietaryRequirement") ? { dietaryRequirementType: "strict" } : {}),
      alcoholPreference: fieldValue(form, "alcoholPreference") || "no_preference",
      settingPreference: fieldValue(form, "settingPreference") || "any",
      acceptsSingleStop: checked(form, "acceptsSingleStop"),
    };
    const parsed = dateRequestCreateSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]; const field = String(issue?.path[0] ?? "");
      if (["budgetLimitCents", "startingNeighborhood", "maximumTravelMinutes", "travelMode", "maximumWalkingMinutes", "returnToParkedCar"].includes(field)) setStep(1);
      else if (["atmosphere", "preferredCuisines", "preferredActivities", "dietaryNeeds", "dietaryRequirementType", "accessibilityNeeds"].includes(field)) setStep(2);
      else setStep(0);
      setError(issue?.message ?? "Check your answers and try again."); return;
    }
    setBusy(true); setError(null); setNoMatchReasons([]);
    try {
      const requestKey = idempotencyKey.current ?? crypto.randomUUID(); idempotencyKey.current = requestKey;
      const response = await fetch("/api/v1/date-requests", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey }, body: JSON.stringify(parsed.data) });
      const body: unknown = await response.json();
      if (!response.ok) {
        setNoMatchStep(parsed.data.dietaryNeeds || parsed.data.accessibilityNeeds ? 2 : 0);
        const failure = apiErrorSchema.safeParse(body);
        setError(failure.success ? failure.data.error.message : "Your date could not be generated.");
        const details = failure.success ? failure.data.error.details : undefined;
        if (details && typeof details === "object" && "reasons" in details && Array.isArray(details.reasons)) {
          setNoMatchReasons(details.reasons.filter((reason): reason is string => typeof reason === "string"));
        }
        if (response.status < 500) idempotencyKey.current = null;
        return;
      }
      const success = dateRequestResponseSchema.safeParse(body);
      if (!success.success || success.data.plan.durationMinutes !== parsed.data.durationMinutes) {
        idempotencyKey.current = null;
        setError("This returned itinerary does not meet the current timing rules. Generate again to replace the earlier result.");
        return;
      }
      idempotencyKey.current = null; setGeneratedPlan(success.data.plan); form.reset(); setTravelMode("flexible");
    } catch { setError("We could not reach the local service. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  if (generatedPlan) return <div className="generated-result"><p className="success" role="status">Your itinerary is ready and saved. No venue has been booked.</p><GeneratedPlanView plan={generatedPlan} /><div className="request-actions"><button type="button" className="text-button" onClick={() => { setGeneratedPlan(null); setStep(0); setReview(null); }}>Generate another</button><Link className="button" href="/my-dates">View my dates <span aria-hidden="true">↗</span></Link></div>{!signedIn && <p className="success-note">This plan is saved in this browser. <Link href="/login">Create an account</Link> to keep it across devices.</p>}</div>;

  return (
    <form ref={formRef} className="request-form" noValidate onSubmit={submit} onChangeCapture={() => { setError(null); setNoMatchReasons([]); }}>
      <p className="sample">Restaurant coverage: {restaurantCoverage}. Activities include Tampa Museum of Art, Curtis Hixon park walks, and dated downtown concerts. Seating coverage varies; other selections may return no match.</p>
      <p className="sample">Required fields are marked. Your itinerary appears immediately and does not book a venue.</p>
      <ol className="request-progress" aria-label="Request steps">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}>{index + 1}. {label}</li>)}</ol>
      <fieldset className="request-step" hidden={step !== 0} disabled={busy}>
        <legend>When are you going?</legend><p className="field-guidance">Choose a future date and start time in Tampa.</p>
        <label>Preferred date <span className="required-label">Required</span><input name="requestedLocalDate" type="date" required /></label>
        <label>Flexible dates? Add up to three<input name="alternativeLocalDates" placeholder="YYYY-MM-DD, YYYY-MM-DD" /></label>
        <div className="time-window"><span>Start time window · Tampa local time</span><label>From <span className="required-label">Required</span><input name="startLocalTime" type="time" required /></label><label>To <span className="required-label">Required</span><input name="endLocalTime" type="time" required /></label></div>
        <label>Allotted time for the date <span className="required-label">Required</span><select name="durationMinutes" defaultValue="" required><option value="" disabled>Choose a duration</option><option value="120">2 hours</option><option value="180">3 hours</option><option value="240">4 hours</option><option value="360">6 hours</option></select></label>
      </fieldset>
      <fieldset className="request-step" hidden={step !== 1} disabled={busy}>
        <legend>Budget & area</legend>
        <label>Total budget for two people <span className="required-label">Required</span><input name="budgetDollars" type="number" min="0.01" step="0.01" placeholder="$ 200" required /></label>
        <label>Starting neighborhood <span className="required-label">Required</span><select name="startingNeighborhood" required defaultValue=""><option value="" disabled>Choose an area</option><option>Downtown / Water Street</option><option>Hyde Park</option><option>Seminole Heights</option></select></label>
        <label>How will you get between places?<select name="travelMode" defaultValue="flexible" onChange={(event) => setTravelMode(event.target.value)}><option value="flexible">Open to either</option><option value="driving">Drive / rideshare</option><option value="walking">Walk</option></select><small>This is travel between date stops, separate from getting to the first place.</small></label>
        <label hidden={travelMode === "driving"}>Maximum comfortable walk <span className="optional">Optional</span><input name="maximumWalkingMinutes" type="number" min="0" max="240" step="1" placeholder={travelMode === "flexible" ? "15 minutes" : "No limit"} disabled={travelMode === "driving"} /><small>Minutes per walk. {travelMode === "flexible" ? "Leave blank to favor walks of 15 minutes or less, with driving as another option." : "Leave blank for no walking limit."} Walking times are approximate.</small></label>
        <label className="checkbox" hidden={travelMode === "driving"}><input name="returnToParkedCar" type="checkbox" disabled={travelMode === "driving"} />Return to my parked car at the first stop. Include the walk back in my date time if we walk between places.</label>
        <label>Preferred travel time <span className="optional">Optional</span><input name="maximumTravelMinutes" type="number" min="0" max="240" placeholder="No preference" /><small>Minutes between stops. Leave blank if flexible. Route times are not measured yet, so this preference cannot be guaranteed.</small></label>
      </fieldset>
      <fieldset className="request-step" hidden={step !== 2} disabled={busy}>
        <legend>What sounds like you?</legend>
        <label>Feel of the evening <span className="required-label">Required</span><select name="atmosphere" defaultValue="" required><option value="" disabled>Choose the mood</option><option value="relaxed">Relaxed</option><option value="romantic">Romantic</option><option value="playful">Playful</option><option value="adventurous">Adventurous</option><option value="dressy">Dressy</option></select></label>
        <label>Occasion <span className="optional">Optional</span><input name="occasion" maxLength={120} placeholder="Birthday, anniversary, just because" /></label>
        <fieldset className="choice-group"><legend>Cuisines you enjoy <span className="required-label">Required</span></legend><p>Choose at least one cuisine.</p><div className="choice-options">{cuisineOptions.map((cuisine) => <label className="choice-chip" key={cuisine}><input type="checkbox" name="preferredCuisines" value={cuisine} /><span>{cuisine}</span></label>)}</div></fieldset>
        <fieldset className="choice-group"><legend>Activities you enjoy <span className="optional">Optional</span></legend><p>Select any that appeal to you. Choose the activities you would actually like to do. The plan must include one of your selections. Leave this blank to let us choose. Live music requires a published event on your date.</p><div className="choice-options">{activityOptions.map((activity) => <label className="choice-chip" key={activity}><input type="checkbox" name="preferredActivities" value={activity} /><span>{activity}</span></label>)}</div></fieldset>
        <label>Foods or ingredients to avoid <span className="optional">Optional</span><textarea name="dietaryNeeds" maxLength={1000} rows={2} placeholder="e.g. cheese, onions, mushrooms" aria-describedby="food-restrictions-help food-restrictions-limit" /><small id="food-restrictions-help">List what should be left out, not foods you like. Ordinary dislikes keep restaurants eligible and appear as requests when ordering; customizations are not confirmed.</small><small id="food-restrictions-limit">Allergies and strict dietary requirements need verified suitability, which the current catalog cannot provide. Allergy wording is treated as a strict requirement, even without the checkbox.</small></label>
        <label className="checkbox"><input name="strictDietaryRequirement" type="checkbox" />This is an allergy or strict dietary requirement, not just a food preference</label>
        <label>Accessibility needs<textarea name="accessibilityNeeds" maxLength={1000} rows={2} placeholder="Anything a venue should be checked for?" /></label>
        <label>Alcohol preference<select name="alcoholPreference"><option value="no_preference">No preference</option><option value="prefer">Prefer options with alcohol</option><option value="avoid">Avoid alcohol</option></select></label>
        <label>Setting<select name="settingPreference"><option value="any">Indoor or outdoor</option><option value="indoors">Prefer indoors</option><option value="outdoors">Prefer outdoors</option></select></label>
        <label className="checkbox"><input name="acceptsSingleStop" type="checkbox" />Dinner without a second activity is okay if I have not selected activities</label>
      </fieldset>
      <fieldset className="request-step" hidden={step !== 3} disabled={busy}>
        <legend>Review your answers</legend>
        {review && <dl className="request-review"><dt>Date</dt><dd>{review.date}</dd><dt>Start window</dt><dd>{review.time}</dd><dt>Budget</dt><dd>${review.budget}</dd><dt>Starting area</dt><dd>{review.neighborhood}</dd><dt>Style</dt><dd>{review.atmosphere}</dd><dt>Between stops</dt><dd>{review.travel}</dd>{review.walking && <><dt>Walking limit</dt><dd>{review.walking}</dd><dt>Parked car</dt><dd>{review.returnToCar ? "Include the walk back to the first stop" : "No return walk included"}</dd></>}<dt>Foods to avoid</dt><dd>{review.dietary || "None specified"}</dd>{review.dietary && <><dt>Food request type</dt><dd>{review.strictDietary ? "Allergy / strict requirement" : "Preference / dislike"}</dd></>}<dt>Accessibility requirements</dt><dd>{review.accessibility || "None specified"}</dd></dl>}
        <div className="consent-explainer"><h3>What you will get</h3><p>The app selects named venues and checks published opening hours, event times, your budget and the available date duration. You get addresses, estimated costs and direct links. The restaurant must match your cuisines and area, and the activity must match one of your picks. We explain when no matching option is available. The itinerary must fill your allotted time, with at least one hour for every meal. Nothing is booked or charged.</p></div>
      </fieldset>
      {error && <div className="error" role="alert"><strong>{error}</strong>{noMatchReasons.length > 0 && <><ul>{noMatchReasons.map(reason => <li key={reason}>{reason}</li>)}</ul><p>Your answers are kept; no incomplete plan was saved.</p><button type="button" className="text-button" onClick={() => { setStep(noMatchStep); setError(null); setNoMatchReasons([]); }}>{noMatchStep === 2 ? "Edit preferences" : "Edit schedule"}</button></>}</div>}
      <div className="request-actions">{step > 0 && <button type="button" className="text-button" onClick={() => setStep((current) => current - 1)} disabled={busy}>Back</button>}{step < 3 ? <button type="button" className="button" onClick={advance} disabled={busy}>Continue <span aria-hidden="true">→</span></button> : <button className="button" type="submit" disabled={busy}>{busy ? "Generating…" : "Generate my date"} <span aria-hidden="true">↗</span></button>}</div>
    </form>
  );
}

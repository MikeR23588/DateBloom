import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  apiErrorSchema,
  dateRequestCreateSchema,
  dateRequestListResponseSchema,
  dateRequestResponseSchema,
  dateRequestSummarySchema,
  idempotencyKeySchema,
  generatedPlanSchema,
} from "@date-planner/contracts";
import {
  activeCity, createDateRequest, createGuestDateRequest, ensureGuestSession,
  getCurrentUser, getExistingDateRequest, getExistingGuestDateRequest,
  getGuestOwnerHash, listDateRequests, listGuestDateRequests,
} from "@/lib/local-db";
import { localDateTimeToUtc } from "@/lib/dates/local-time";
import { generateDatePlan, NoMatchingPlanError } from "@/lib/generate-plan";

export const runtime = "nodejs";

function errorResponse(status: number, code: string, message: string, details?: unknown) {
  const body = apiErrorSchema.parse({ error: { code, message, ...(details === undefined ? {} : { details }) } });
  return NextResponse.json(body, { status });
}

function requestSummary(row: { id: string; requested_local_date: string; status: string; created_at: string }) {
  return dateRequestSummarySchema.parse({ id: row.id, requestedLocalDate: row.requested_local_date, status: row.status, createdAt: row.created_at });
}

function isFutureDateTime(date: string, time: string, zone: string) {
  const start = localDateTimeToUtc(date, time, zone);
  return start !== null && start.getTime() > Date.now();
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function GET() {
  const user = await getCurrentUser();
  const guestOwner = user ? null : await getGuestOwnerHash();
  const data = user ? listDateRequests(user.id).map(requestSummary)
    : guestOwner ? listGuestDateRequests(guestOwner).map(requestSummary) : [];
  return NextResponse.json(dateRequestListResponseSchema.parse({ data }));
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return errorResponse(403, "ORIGIN_REJECTED", "Submit this request from the Date Planner website.");
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON."); }
  const parsed = dateRequestCreateSchema.safeParse(payload);
  if (!parsed.success) return errorResponse(400, "INVALID_REQUEST", "Review the request fields and try again.", parsed.error.issues);
  const key = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!key.success) return errorResponse(400, "IDEMPOTENCY_KEY_REQUIRED", "Submit with a valid idempotency key.");

  const input = parsed.data;
  const user = await getCurrentUser();
  const guestOwner = user ? null : await getGuestOwnerHash();
  const requestPayloadHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const existing = user ? getExistingDateRequest(user.id, key.data)
    : guestOwner ? getExistingGuestDateRequest(guestOwner, key.data) : null;
  if (existing) {
    if (existing.request_payload_hash !== requestPayloadHash) return errorResponse(409, "IDEMPOTENCY_KEY_REUSED", "This request key was already used for different request details.");
    let saved: unknown;
    try { saved = JSON.parse(existing.details_json).plan; }
    catch { return errorResponse(409, "OLD_PLAN", "This saved plan cannot be read. Generate a new itinerary."); }
    const snapshot = generatedPlanSchema.safeParse(saved);
    if (!snapshot.success || snapshot.data.durationMinutes !== input.durationMinutes) return errorResponse(409, "OLD_PLAN", "This saved itinerary does not meet the current timing rules. Generate it again; meals require at least one hour.");
    return NextResponse.json(dateRequestResponseSchema.parse({ data: requestSummary(existing), plan: snapshot.data }), { status: 200 });
  }

  const city = activeCity(input.citySlug);
  if (!city) return errorResponse(422, "CITY_UNAVAILABLE", "Date planning is not available in that city.");
  if (!city.neighborhoods.includes(input.startingNeighborhood)) {
    return errorResponse(422, "NEIGHBORHOOD_UNAVAILABLE", "Choose a neighborhood in the selected service area.");
  }
  const dates = [input.requestedLocalDate, ...input.alternativeLocalDates];
  if (dates.some((date) => !isFutureDateTime(date, input.startWindow.startLocalTime, city.timezone))) {
    return errorResponse(422, "DATE_NOT_FUTURE", "Choose a valid future date and start time for every date option.");
  }

  try {
    const plan = generateDatePlan(input);
    const id = randomUUID();
    const result = user
      ? createDateRequest({ id, customerId: user.id, citySlug: city.slug, requestedLocalDate: plan.requestedLocalDate, details: { request: input, plan }, idempotencyKey: key.data, requestPayloadHash })
      : createGuestDateRequest({ id, guestOwnerHash: guestOwner ?? await ensureGuestSession(), citySlug: city.slug, requestedLocalDate: plan.requestedLocalDate, details: { request: input, plan }, idempotencyKey: key.data, requestPayloadHash });
    if (result.conflict) return errorResponse(409, "IDEMPOTENCY_KEY_REUSED", "This request key was already used for different request details.");
    return NextResponse.json(dateRequestResponseSchema.parse({ data: requestSummary(result.row), plan }), { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof NoMatchingPlanError) return errorResponse(422, error.code, error.message, { reasons: error.reasons });
    console.error("Date itinerary generation/save failed", error instanceof Error ? error.message : "Unknown error");
    return errorResponse(500, "REQUEST_NOT_SAVED", "Your request could not be saved. Please try again.");
  }
}


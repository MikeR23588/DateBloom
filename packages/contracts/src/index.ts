import { z } from "zod";

export const idempotencyKeySchema = z.uuid();
export const dateRequestStatusSchema = z.enum([
  "generated", "submitted", "reviewing", "proposal_ready", "approved", "arranging", "confirmed", "completed",
  "needs_customer_action", "revision_requested", "unable_to_fulfill", "cancelled",
]);
export const atmosphereSchema = z.enum(["relaxed", "romantic", "playful", "adventurous", "dressy"]);
export const alcoholPreferenceSchema = z.enum(["no_preference", "prefer", "avoid"]);
export const settingPreferenceSchema = z.enum(["any", "indoors", "outdoors"]);
export const cuisineOptions = ["Italian", "Japanese", "Mexican", "Mediterranean", "American", "Seafood", "Thai", "Indian", "Vietnamese", "French", "Spanish", "Vegetarian"] as const;
export const activityOptions = ["Live music", "Comedy", "Bowling", "Mini golf", "Arcade games", "Art class", "Museum", "Outdoor walk", "Escape room", "Board games", "Cooking class"] as const;
const cuisineListSchema = z.array(z.enum(cuisineOptions)).min(1, "Choose at least one cuisine.").max(cuisineOptions.length).refine((values) => new Set(values).size === values.length, "Choose each cuisine once.");
const activityListSchema = z.array(z.enum(activityOptions)).max(activityOptions.length).refine((values) => new Set(values).size === values.length, "Choose each activity once.");
const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour local time, such as 18:30.");

export const dateRequestCreateSchema = z.object({
  citySlug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  requestedLocalDate: z.iso.date(),
  alternativeLocalDates: z.array(z.iso.date()).max(3).refine((dates) => new Set(dates).size === dates.length, "Alternative dates must be unique."),
  startWindow: z.object({ startLocalTime: localTimeSchema, endLocalTime: localTimeSchema }).refine(
    ({ startLocalTime, endLocalTime }) => startLocalTime < endLocalTime, "The start of the window must come before its end.",
  ),
  durationMinutes: z.number().int().min(120).max(720),
  budgetLimitCents: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  startingNeighborhood: z.string().trim().min(2).max(100),
  maximumTravelMinutes: z.number().int().min(0).max(240).nullable().optional(),
  travelMode: z.enum(["driving", "walking", "flexible"]).default("driving"),
  maximumWalkingMinutes: z.number().int().min(0).max(240).nullable().optional(),
  returnToParkedCar: z.boolean().optional(),
  atmosphere: atmosphereSchema,
  occasion: z.string().trim().max(120),
  preferredCuisines: cuisineListSchema,
  preferredActivities: activityListSchema,
  dietaryNeeds: z.string().trim().max(1000),
  dietaryRequirementType: z.enum(["preference", "strict"]).optional(),
  accessibilityNeeds: z.string().trim().max(1000),
  alcoholPreference: alcoholPreferenceSchema,
  settingPreference: settingPreferenceSchema,
  acceptsSingleStop: z.boolean(),
}).strict().refine(
  ({ dietaryNeeds, dietaryRequirementType }) => dietaryRequirementType !== "strict" || dietaryNeeds.length > 0,
  { path: ["dietaryNeeds"], message: "Describe the allergy or strict dietary requirement." },
).refine(
  ({ requestedLocalDate, alternativeLocalDates }) => !alternativeLocalDates.includes(requestedLocalDate),
  { path: ["alternativeLocalDates"], message: "Alternative dates must differ from the requested date." },
);

export const generatedStopSchema = z.object({
  kind: z.enum(["meal", "activity"]),
  title: z.string().min(1),
  venueId: z.string().min(1),
  venueName: z.string().min(1),
  address: z.string().min(1),
  sourceUrl: z.url(),
  menuUrl: z.url().optional(),
  bookingUrl: z.url().optional(),
  directionsUrl: z.url(),
  sourceCheckedOn: z.iso.date(),
  costDescription: z.string().min(1),
  event: z.object({
    id: z.string().min(1), name: z.string().min(1), sourceUrl: z.url(),
    startLocalTime: localTimeSchema, endLocalTime: localTimeSchema,
  }).strict().optional(),
  description: z.string().min(1),
  startLocalTime: localTimeSchema,
  endLocalTime: localTimeSchema,
  startDayOffset: z.number().int().min(0).max(1),
  endDayOffset: z.number().int().min(0).max(1),
  suggestedBudgetCents: z.number().int().min(0),
}).strict().superRefine((stop, ctx) => {
  const minute = (time: string, day: number) => day * 1440 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const duration = minute(stop.endLocalTime, stop.endDayOffset) - minute(stop.startLocalTime, stop.startDayOffset);
  if (duration <= 0 || (stop.kind === "meal" && duration < 60)) ctx.addIssue({
    code: "custom", path: ["endLocalTime"],
    message: stop.kind === "meal" ? "Every meal stop must last at least one hour." : "A stop must end after it starts.",
  });
});
export const generatedPlanSchema = z.object({
  title: z.string().min(1),
  requestedLocalDate: z.iso.date(),
  neighborhood: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  budgetLimitCents: z.number().int().positive(),
  stops: z.array(generatedStopSchema).min(1).max(2),
  notes: z.array(z.string()).max(8),
  adjustments: z.array(z.string()).max(8).default([]),
  estimatedTotalCents: z.number().int().min(0),
  travel: z.object({
    mode: z.enum(["walking", "driving"]), estimatedMinutes: z.number().int().min(0).nullable(),
    scheduledBufferMinutes: z.number().int().min(0).optional(),
    directionsUrl: z.url(), basis: z.string().min(1),
    returnToStart: z.object({
      estimatedMinutes: z.number().int().min(0),
      startLocalTime: localTimeSchema, endLocalTime: localTimeSchema,
      startDayOffset: z.number().int().min(0).max(1), endDayOffset: z.number().int().min(0).max(1),
      directionsUrl: z.url(),
    }).strict().optional(),
  }).strict().optional(),
  venueStatus: z.literal("venues_selected"),
}).strict();
export const dateRequestSummarySchema = z.object({
  id: z.uuid(), requestedLocalDate: z.iso.date(), status: dateRequestStatusSchema, createdAt: z.iso.datetime(),
}).strict();
export const dateRequestListResponseSchema = z.object({ data: z.array(dateRequestSummarySchema) }).strict();
export const dateRequestResponseSchema = z.object({ data: dateRequestSummarySchema, plan: generatedPlanSchema }).strict();
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string().min(1), message: z.string().min(1), details: z.unknown().optional() }).strict(),
}).strict();

export type DateRequestCreate = z.infer<typeof dateRequestCreateSchema>;
export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;
export type DateRequestStatus = z.infer<typeof dateRequestStatusSchema>;
export type DateRequestSummary = z.infer<typeof dateRequestSummarySchema>;
export type DateRequestResponse = z.infer<typeof dateRequestResponseSchema>;
export type DateRequestListResponse = z.infer<typeof dateRequestListResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

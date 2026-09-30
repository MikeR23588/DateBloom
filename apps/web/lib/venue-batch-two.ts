import type { CatalogVenue } from "./venue-catalog";

// Reviewed Hyde Park / SoHo records. Evidence and limits: docs/batch-two-source-reviews.md.
export const batchTwoVenues: readonly CatalogVenue[] = [
  {
    id: "green-lemon-soho", name: "Green Lemon - SoHo",
    address: "915 S Howard Ave, Tampa, FL 33606", neighborhood: "Hyde Park",
    sourceUrl: "https://www.eatgreenlemon.com/contact",
    menuUrl: "https://www.eatgreenlemon.com/menu",
    sourceCheckedOn: "2026-09-30", sourceExpiresOn: "2026-10-30",
    // End meal planning one hour before the operator's published closing time.
    hours: [[660, 1260], [660, 1260], [660, 1320], [660, 1260], [660, 1260], [660, 1320], [660, 1320]],
    setting: "indoors", cuisines: ["Mexican"], moods: ["playful", "relaxed", "adventurous"],
    subtotalForTwoCents: 3400,
    costDescription: "Two all-day-menu chicken Fajita Bowls ($17 each); water assumed. Protein upgrades and drinks are excluded.",
    planningNotes: ["This is the SoHo branch at 915 S Howard Ave. The published menu and operator-linked ordering menu both list the chicken Fajita Bowl at $17. Indoor table and meal availability are unconfirmed; the planning window ends one hour before published closing. SoHo is grouped under the Hyde Park request area."],
    minimumMinutes: 60, maximumMinutes: 120,
  },
  {
    id: "candle-pour-hyde-park", name: "The Candle Pour - Hyde Park Village",
    address: "1619 W Snow Cir, Tampa, FL 33606", neighborhood: "Hyde Park",
    sourceUrl: "https://thecandlepour.com/pages/frequently-asked-questions",
    bookingUrl: "https://thecandlepour.com/pages/reservations-locations",
    sourceCheckedOn: "2026-09-30", sourceExpiresOn: "2026-10-30",
    // FAQ/contact pages disagree about Monday, Tuesday and Sunday experience hours.
    // Only the common Wednesday-Saturday experience window is promoted.
    hours: [null, null, null, [600, 1200], [600, 1200], [600, 1200], [600, 1200]],
    setting: "indoors", activity: "Candle making", moods: ["romantic", "playful", "relaxed"],
    subtotalForTwoCents: 8400,
    costDescription: "Two Classic Soy Candle experiences at $42 each; 10% activity tax allowance is added to the estimate. A refundable $10 per person reservation deposit may be required when booking.",
    description: "Blend scents and pour a Classic Soy Candle each at The Candle Pour in Hyde Park Village. The session takes about 30-45 minutes; finished candles need about two hours to set and may require a later pickup.",
    planningNotes: ["Reserve a session directly; walk-ins and product availability are unconfirmed. The reservation deposit is refundable on arrival, subject to the operator's cancellation rules. The visit is limited to Wednesday through Saturday until the conflicting other-day experience hours are clarified."],
    minimumMinutes: 30, maximumMinutes: 45,
    startMinuteStep: 60,
  },
];

import type { DateRequestCreate } from "@datebloom/contracts";
import { batchOneCompletionVenues } from "./venue-batch-one";

export type Hours = readonly (readonly [number, number] | null)[];
export type CatalogVenue = {
  id: string; name: string; address: string; neighborhood: string;
  sourceUrl: string; menuUrl?: string; bookingUrl?: string;
  sourceCheckedOn?: string; sourceExpiresOn?: string;
  registryLicense?: string; planningNotes?: readonly string[];
  description?: string;
  schedule?: {
    availableThrough?: string;
    closedDates?: readonly string[];
    closedAnnualDates?: readonly string[];
    closeOnThanksgiving?: boolean;
    earlyClosingByAnnualDate?: Readonly<Record<string, number>>;
  };
  hours: Hours; setting: "indoors" | "outdoors";
  cuisines?: readonly string[]; activity?: string;
  moods: readonly DateRequestCreate["atmosphere"][];
  subtotalForTwoCents: number; costDescription: string;
  minimumMinutes: number; maximumMinutes: number;
};
export type CatalogEvent = {
  id: string; venueId: string; name: string; dates: readonly string[];
  start: number; end: number; sourceUrl: string; description: string;
};

// Source snapshots reviewed on this date. The review date prompts a freshness warning;
// saved plans retain their original facts and source timestamps.
export const catalogCheckedOn = "2026-09-27";
export const catalogExpiresOn = "2026-10-27";
const seedVenues: readonly CatalogVenue[] = [
  {
    id: "forbici-tampa", name: "Forbici Modern Italian — Tampa",
    address: "1633 W Snow Ave, Tampa, FL 33606", neighborhood: "Hyde Park",
    sourceUrl: "https://www.eatforbici.com/forbici-tampa",
    menuUrl: "https://www.eatforbici.com/forbici-tampa-menu",
    bookingUrl: "https://www.eatforbici.com/forbici-tampa-reservations",
    hours: [[900,1320],[900,1320],[900,1320],[900,1320],[900,1380],[900,1440],[900,1440]],
    setting: "indoors", cuisines: ["Italian", "Vegetarian"],
    moods: ["romantic","relaxed","dressy"], subtotalForTwoCents: 5400,
    costDescription: "Two full-order rigatoni alla vodka ($24 each) and two soft drinks ($3 each).",
    minimumMinutes: 60, maximumMinutes: 120,
  },
  {
    id: "eddie-sams", name: "Eddie & Sam's N.Y. Pizza",
    address: "203 E Twiggs St, Tampa, FL 33602", neighborhood: "Downtown / Water Street",
    sourceUrl: "https://toast.app/r/eddieandsam/order",
    menuUrl: "https://toast.app/r/eddieandsam/order",
    hours: [[660,1320],null,null,[660,1320],[660,1320],[660,1320],[660,1320]],
    setting: "indoors", cuisines: ["Italian","Vegetarian"],
    moods: ["relaxed","playful","adventurous"], subtotalForTwoCents: 3598,
    costDescription: 'Two 14-inch cheese pizzas ($15 each) and two bottled drinks ($2.99 each).',
    minimumMinutes: 60, maximumMinutes: 90,
  },
  {
    id: "nueva-cantina-downtown", name: "Nueva Cantina - Downtown Tampa",
    address: "903 N Franklin St, Tampa, FL 33602", neighborhood: "Downtown / Water Street",
    sourceUrl: "https://nuevacantina.com/reservations/",
    menuUrl: "https://nuevacantina.com/food-menu/",
    bookingUrl: "https://nuevacantina.com/reservations/",
    sourceCheckedOn: "2026-09-28", sourceExpiresOn: "2026-10-28", registryLicense: "SEA3918247",
    hours: [[660,1320],[660,1320],[660,1320],[660,1320],[660,1320],[660,1440],[660,1440]],
    setting: "outdoors", cuisines: ["Mexican"], moods: ["relaxed","playful","adventurous"],
    subtotalForTwoCents: 2940,
    costDescription: "Two grilled-chicken burritos ($11.75 each) and two regular sodas ($2.95 each); no premium protein upgrades or specials assumed.",
    planningNotes: ["This Nueva Cantina record covers the downtown patio shown on the official reservations page. Patio seating and weather are not confirmed; request patio seating directly."],
    minimumMinutes: 60, maximumMinutes: 120,
  },
  {
    id: "noble-rice", name: "Noble Rice",
    address: "615 Channelside Dr #112, Tampa, FL 33602", neighborhood: "Downtown / Water Street",
    sourceUrl: "https://www.noblericeco.com/", menuUrl: "https://www.noblericeco.com/menu",
    bookingUrl: "https://www.exploretock.com/noble-rice",
    sourceCheckedOn: "2026-09-28", sourceExpiresOn: "2026-10-28", registryLicense: "SEA3918915",
    hours: [null,null,[1020,1320],[1020,1320],[1020,1320],[1020,1380],[1020,1380]],
    setting: "indoors", cuisines: ["Japanese"], moods: ["romantic","adventurous","dressy"],
    subtotalForTwoCents: 6200,
    costDescription: "Two chicken shio ramen bowls ($25 each) and one shared soy milk panna cotta ($12). Water assumed; other drinks and omakase are not included.",
    planningNotes: ["Noble Rice changes its menu seasonally. Check the current menu and reserve directly; omakase availability is not part of this itinerary."],
    minimumMinutes: 60, maximumMinutes: 120,
  },
  {
    id: "curtis-hixon", name: "Curtis Hixon Waterfront Park",
    description: "Walk the riverfront paths inside Curtis Hixon Waterfront Park, starting at the N Ashley Drive entrance.",
    address: "600 N Ashley Dr, Tampa, FL 33602", neighborhood: "Downtown / Water Street",
    sourceUrl: "https://www.tampa.gov/parks-and-recreation/featured-parks/curtis-hixon",
    hours: Array.from({length:7}, () => [420,1320] as const),
    setting: "outdoors", activity: "Outdoor walk", moods: ["romantic","relaxed","adventurous"],
    subtotalForTwoCents: 0, costDescription: "Public park; no admission charge.",
    minimumMinutes: 30, maximumMinutes: 90,
  },
  {
    id: "tampa-art", name: "Tampa Museum of Art",
    description: "Explore the galleries at Tampa Museum of Art. Check the museum's current exhibition list before your visit.",
    schedule: { closedAnnualDates: ["12-25"], closedDates: ["2027-01-30"], closeOnThanksgiving: true,
      earlyClosingByAnnualDate: { "07-04": 900, "12-24": 900, "12-31": 900 } },
    address: "120 W Gasparilla Plaza, Tampa, FL 33602", neighborhood: "Downtown / Water Street",
    sourceUrl: "https://tampamuseum.org/visit/", bookingUrl: "https://shop.tampamuseum.org/",
    hours: [[600,1020],[600,1020],[600,1020],[600,1020],[600,1200],[600,1020],[600,1020]],
    setting: "indoors", activity: "Museum", moods: ["romantic","relaxed","dressy"],
    subtotalForTwoCents: 5000, costDescription: "Two adult general-admission tickets at $25 each; no discounts assumed.",
    minimumMinutes: 60, maximumMinutes: 120,
  },
  {
    id: "lykes-gaslight", name: "Lykes Gaslight Square Park",
    address: "400 N Franklin St, Tampa, FL 33602", neighborhood: "Downtown / Water Street",
    sourceUrl: "https://www.tampa.gov/events/keys-park-melodic-duel/188241",
    // Only available for the explicitly dated event below; these are event hours.
    hours: Array.from({length:7}, () => [1050,1170] as const),
    setting: "outdoors", moods: ["romantic","relaxed","playful"],
    subtotalForTwoCents: 0, costDescription: "Free event admission.",
    minimumMinutes: 60, maximumMinutes: 120,
  },
];
// First group in the neighborhood expansion. Dates belong to these records only.
export const expansionVenues: readonly CatalogVenue[] = [
  {
    id: "columbia-cafe-history", name: "Columbia Cafe - Tampa Bay History Center",
    address: "801 Water St, Tampa, FL 33602", neighborhood: "Downtown / Water Street",
    sourceUrl: "https://www.columbiarestaurant.com/columbia-cafe-at-the-tbhc",
    menuUrl: "https://www.columbiarestaurant.com/columbia-cafe-at-the-tbhc",
    bookingUrl: "https://www.columbiarestaurant.com/columbia-cafe-at-the-tbhc",
    sourceCheckedOn: "2026-09-29", sourceExpiresOn: "2026-10-29", registryLicense: "SEA3916588",
    hours: [[660,1260],[660,1260],[660,1260],[660,1260],[660,1260],[660,1320],[660,1320]],
    setting: "outdoors", cuisines: ["Spanish"], moods: ["relaxed","romantic","adventurous"],
    subtotalForTwoCents: 3000,
    costDescription: "Two Original Cuban Sandwiches ($15 each), with included plantain chips. Water assumed; other drinks excluded.",
    planningNotes: ["This record covers Columbia Cafe's canopy-covered waterfront patio at the History Center, not the Ybor City or airport branches. Patio seating and weather are unconfirmed."],
    minimumMinutes: 60, maximumMinutes: 120,
  },
  {
    id: "bavaros-downtown", name: "Bavaro's Pizza Napoletana & Pastaria - Downtown Tampa",
    address: "514 N Franklin St #101, Tampa, FL 33602", neighborhood: "Downtown / Water Street",
    sourceUrl: "https://bavarospizza.com/locations/tampa/", menuUrl: "https://bavarospizza.com/locations/tampa/",
    bookingUrl: "https://bavarospizza.com/reservations/",
    sourceCheckedOn: "2026-09-29", sourceExpiresOn: "2026-10-29", registryLicense: "SEA3916581",
    // Dinner-menu coverage only; lunch portions/prices differ.
    hours: [[1020,1260],[1020,1260],[1020,1260],[1020,1260],[1020,1260],[1020,1320],[1020,1320]],
    setting: "outdoors", cuisines: ["Italian"], moods: ["romantic","dressy"],
    subtotalForTwoCents: 3800,
    costDescription: "Two dinner-menu Margherita pizzas ($19 each). Water assumed; toppings, substitutions and other drinks excluded.",
    planningNotes: ["Dinner-menu planning starts at 5 PM. This record covers the downtown branch's outdoor seating; seating and weather are unconfirmed. Other Bavaro's branches are not substitutes."],
    minimumMinutes: 60, maximumMinutes: 120,
  },
  {
    id: "boulon-water-street", name: "Boulon Brasserie - Water Street",
    address: "1001 Water St, Tampa, FL 33602", neighborhood: "Downtown / Water Street",
    sourceUrl: "https://www.boulontampa.com/",
    menuUrl: "https://www.boulontampa.com/menus/popmenu-dinner?location=boulon-brasserie-and-bakery",
    bookingUrl: "https://www.boulontampa.com/reservations",
    sourceCheckedOn: "2026-09-29", sourceExpiresOn: "2026-10-29", registryLicense: "SEA3919049",
    hours: Array.from({length:7}, () => [1020,1380] as const),
    setting: "indoors", cuisines: ["French"], moods: ["romantic","dressy"],
    subtotalForTwoCents: 6400,
    costDescription: "Two dinner-menu Coq au Vin mains ($32 each). Water assumed; other drinks and additional courses excluded.",
    planningNotes: ["Only the full dinner-menu window, 5-11 PM, is used. Bakery, brunch, limited mid-day menus and late-night bar service are excluded; reserve directly."],
    minimumMinutes: 60, maximumMinutes: 120,
  },
  {
    id: "tampa-history", name: "Tampa Bay History Center",
    address: "801 Water St, Tampa, FL 33602", neighborhood: "Downtown / Water Street",
    description: "Explore Tampa Bay history through the museum's galleries, historical artifacts and map collection. Allow two to three hours for the exhibits.",
    sourceUrl: "https://tampabayhistorycenter.org/visit/", bookingUrl: "https://tampabayhistorycenter.org/visit/",
    sourceCheckedOn: "2026-09-29", sourceExpiresOn: "2026-10-29",
    hours: Array.from({length:7}, () => [600,1020] as const),
    schedule: { closedAnnualDates: ["12-25"], closeOnThanksgiving: true,
      earlyClosingByAnnualDate: { "12-24": 900, "12-31": 900 } },
    setting: "indoors", activity: "Museum", moods: ["relaxed","adventurous"],
    subtotalForTwoCents: 3790,
    costDescription: "Two adult gallery admissions ($18.95 each); no discounts, guided tours or special events assumed.",
    minimumMinutes: 120, maximumMinutes: 180,
  },
  {
    id: "plant-museum", name: "Henry B. Plant Museum",
    address: "401 W Kennedy Blvd, Tampa, FL 33606", neighborhood: "Downtown / Water Street",
    description: "Visit the historic Tampa Bay Hotel exhibits inside Plant Hall at the Henry B. Plant Museum. This is the museum visit, not a campus tour or seasonal Christmas event.",
    sourceUrl: "https://www.plantmuseum.com/discover/visit-accessibility",
    bookingUrl: "https://www.plantmuseum.com/discover/visit-accessibility",
    sourceCheckedOn: "2026-09-29", sourceExpiresOn: "2026-10-29",
    hours: [[720,1020],null,[600,1020],[600,1020],[600,1020],[600,1020],[600,1020]],
    // Reverify December's unpublished seasonal schedule and the next season before extending coverage.
    schedule: { availableThrough: "2026-11-30", closedAnnualDates: ["07-04","12-24","12-25"], closeOnThanksgiving: true },
    setting: "indoors", activity: "Museum", moods: ["relaxed","romantic","dressy"],
    subtotalForTwoCents: 2400, costDescription: "Two adult museum admissions ($12 each); no discounts or seasonal-event admission assumed.",
    planningNotes: ["Plant Museum regular-hour coverage ends November 30, 2026. December's Christmas Stroll schedule and admission are unverified; the last regular ticket is sold 30 minutes before closing."],
    minimumMinutes: 60, maximumMinutes: 120,
  },
  {
    id: "cotanchobee", name: "Cotanchobee Fort Brooke Park",
    address: "601 Old Water St, Tampa, FL 33602", neighborhood: "Downtown / Water Street",
    description: "Walk Cotanchobee Fort Brooke Park's waterfront paths and Riverwalk section beside Garrison Channel. This visit excludes boat rentals, docking and organized events.",
    sourceUrl: "https://www.tampa.gov/parks-and-recreation/featured-parks/cotanchobee-park",
    sourceCheckedOn: "2026-09-29", sourceExpiresOn: "2026-10-29",
    hours: Array.from({length:7}, () => [420,1320] as const),
    setting: "outdoors", activity: "Outdoor walk", moods: ["relaxed","romantic","adventurous"],
    subtotalForTwoCents: 0, costDescription: "Public park walk; no admission charge. Parking, docking, rentals and purchases are excluded.",
    minimumMinutes: 30, maximumMinutes: 120,
  },
];
export const venues: readonly CatalogVenue[] = [...seedVenues, ...expansionVenues, ...batchOneCompletionVenues];
export function restaurantCoverageSummary() {
  const restaurants = venues.filter(venue => venue.cuisines);
  return [...new Set(restaurants.map(venue => venue.neighborhood))].map(neighborhood => {
    const cuisines = [...new Set(restaurants.filter(venue => venue.neighborhood === neighborhood).flatMap(venue => venue.cuisines ?? []))];
    return `${cuisines.join(", ")} in ${neighborhood}`;
  }).join("; ");
}
export const events: readonly CatalogEvent[] = [
  {
    id: "rock-the-park-2026", venueId: "curtis-hixon", name: "Rock the Park",
    dates: ["2026-10-01","2026-11-05","2026-12-03"], start: 1080, end: 1260,
    sourceUrl: "https://www.tampasdowntown.com/events/rock-the-park-tampa/",
    description: "A scheduled outdoor concert presented by Tampa Downtown Partnership and Brokenmold Entertainment. The source has not named the artists for this date.",
  },
  {
    id: "keys-in-the-park-oct-2026", venueId: "lykes-gaslight", name: "Keys in the Park: A Melodic Duel",
    dates: ["2026-10-09"], start: 1050, end: 1170,
    sourceUrl: "https://www.tampasdowntown.com/events/keys-in-the-park-a-melodic-duel/",
    description: "A scheduled dueling-piano performance in Lykes Gaslight Square Park. Individual pianist names are not published in the source.",
  },
];

// Conservative planning buffers, NOT live routing measurements.
// Unknown routes are never inferred from the customer's maximum travel time.
// All movement here is walking; no taxi charge or guessed traffic time.
export const walkingBuffers: Readonly<Record<string, number>> = {
  // Shared building confirmed by the History Center visitor page/FAQ. Five minutes is a planning allowance.
  "columbia-cafe-history:tampa-history": 5,
  "eddie-sams:curtis-hixon": 10, "eddie-sams:tampa-art": 12,
  "eddie-sams:lykes-gaslight": 8,
  "forbici-tampa:curtis-hixon": 50, "forbici-tampa:tampa-art": 50,
  "forbici-tampa:lykes-gaslight": 50,
};
export const walkingBufferBasis: Readonly<Record<string, string>> = {
  "columbia-cafe-history:tampa-history": "Allow 5 minutes for an on-site walk from Columbia Cafe to the History Center galleries at the same address. This is a planning allowance, not a measured route or verified accessible path; follow visitor signage.",
};
export const onSiteWalkingPairs: readonly string[] = ["columbia-cafe-history:tampa-history"];

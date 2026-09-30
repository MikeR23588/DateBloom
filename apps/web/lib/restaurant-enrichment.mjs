const PRICE_BANDS = new Set(['budget', 'moderate', 'upscale', 'splurge']);
const SETTINGS = new Set(['indoors', 'outdoors']);
const CUISINES = new Set(['Italian', 'Japanese', 'Mexican', 'Mediterranean', 'American', 'Seafood', 'Thai', 'Indian', 'Vietnamese', 'French', 'Spanish', 'Vegetarian']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = value => typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const validUrl = value => typeof value === 'string' && value.startsWith('https://') && URL.canParse(value);

export function validateEnrichment(input) {
  if (input?.version !== 1 || !Array.isArray(input.records)) throw new Error('Invalid restaurant enrichment file.');
  const seen = new Set();
  for (const row of input.records) {
    if (!row || typeof row.license !== 'string' || !row.license.trim() || seen.has(row.license)) throw new Error('Duplicate or missing enrichment license.');
    seen.add(row.license);
    if (row.priceBand != null && !PRICE_BANDS.has(row.priceBand)) throw new Error(`Invalid price band for ${row.license}.`);
    if (row.setting != null && !SETTINGS.has(row.setting)) throw new Error(`Invalid setting for ${row.license}.`);
    if (row.cuisines != null && (!Array.isArray(row.cuisines) || row.cuisines.some(value => !CUISINES.has(value)))) throw new Error(`Invalid cuisines for ${row.license}.`);
    if (row.reviewedOn != null && !validDate(row.reviewedOn)) throw new Error(`Invalid review date for ${row.license}.`);
    if (row.expiresOn != null && !validDate(row.expiresOn)) throw new Error(`Invalid expiry date for ${row.license}.`);
    for (const key of ['sourceUrl', 'menuUrl', 'bookingUrl']) if (row[key] != null && !validUrl(row[key])) throw new Error(`Invalid ${key} for ${row.license}.`);
    for (const key of ['name', 'address', 'neighborhood', 'notes']) if (row[key] != null && (typeof row[key] !== 'string' || !row[key].trim())) throw new Error(`Invalid ${key} for ${row.license}.`);
    if (row.plannerEligible != null && typeof row.plannerEligible !== 'boolean') throw new Error(`Invalid planner status for ${row.license}.`);
    if (row.plannerEligible) {
      const required = ['name', 'address', 'neighborhood', 'sourceUrl', 'reviewedOn', 'expiresOn', 'setting', 'priceBand'];
      if (required.some(key => !row[key]) || !row.cuisines?.length || !Array.isArray(row.hours) || row.hours.length !== 7) throw new Error(`Planner record ${row.license} is incomplete.`);
      for (const hours of row.hours) if (hours !== null && (!Array.isArray(hours) || hours.length !== 2 || !Number.isInteger(hours[0]) || !Number.isInteger(hours[1]) || hours[0] < 0 || hours[1] > 1440 || hours[1] <= hours[0])) throw new Error(`Invalid hours for ${row.license}.`);
      if (row.expiresOn < row.reviewedOn) throw new Error(`Expiry predates review for ${row.license}.`);
    }
  }
  return input;
}

export function mergeEnrichment(current, updates, snapshot) {
  validateEnrichment(current);
  validateEnrichment({ version: 1, records: updates });
  const registry = new Map(snapshot.restaurants.map(row => [row.license, row]));
  const merged = new Map(current.records.map(row => [row.license, row]));
  for (const update of updates) {
    const source = registry.get(update.license);
    if (!source) throw new Error(`License ${update.license} is not in the current registry snapshot.`);
    const row = { ...merged.get(update.license), ...update };
    if (row.plannerEligible && (source.archived || source.variants || source.warnings?.length)) throw new Error(`License ${update.license} has registry warnings and cannot be promoted.`);
    merged.set(update.license, row);
  }
  return validateEnrichment({ version: 1, records: [...merged.values()].sort((a, b) => a.license.localeCompare(b.license)) });
}

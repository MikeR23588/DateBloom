import { readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const defaultRegistry = fileURLToPath(new URL('../../../data/restaurant-registry.json', import.meta.url));
const defaultEnrichment = fileURLToPath(new URL('../../../data/restaurant-enrichment.json', import.meta.url));
const defaultOutput = fileURLToPath(new URL('../../../data/restaurant-review-queue.json', import.meta.url));
const source = 'https://docs.overturemaps.org/guides/places/';

function words(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/&/g, ' AND ').replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

const streetWords = new Map([
  ['WEST', 'W'], ['EAST', 'E'], ['NORTH', 'N'], ['SOUTH', 'S'],
  ['AVENUE', 'AVE'], ['STREET', 'ST'], ['BOULEVARD', 'BLVD'], ['ROAD', 'RD'],
  ['DRIVE', 'DR'], ['CIRCLE', 'CIR'], ['LANE', 'LN'], ['PLACE', 'PL'],
]);
function streetKey(value) {
  return words(value).split(' ').map(word => streetWords.get(word) ?? word).join(' ');
}
function venueKey(value) {
  return words(value).replace(/\b(THE|RESTAURANT|TAMPA|FLORIDA)\b/g, ' ').trim().replace(/\s+/g, ' ');
}
function recordsFromGeojson(raw) {
  const input = JSON.parse(raw);
  if (input?.type === 'FeatureCollection' && Array.isArray(input.features)) return input.features;
  if (input?.type === 'Feature' && input.properties) return [input];
  throw new Error('Expected Overture GeoJSON FeatureCollection or Feature.');
}
function placeFromFeature(feature) {
  const props = feature?.properties;
  const id = feature?.id ?? props?.id;
  if (feature?.type !== 'Feature' || !props || typeof id !== 'string') return null;
  const category = props.taxonomy?.primary ?? props.category ?? props.categories?.primary ?? '';
  if (!/(restaurant|casual_eatery|fast_food)/i.test(category)) return null;
  if (props.operating_status === 'permanently_closed') return null;
  const address = props.addresses?.[0] ?? {};
  const name = props.names?.primary ?? props.name ?? '';
  const street = address.freeform ?? props.address ?? '';
  const city = address.locality ?? props.locality ?? '';
  if (!name || !street || !city) return null;
  return { id, name, street, city, region: address.region ?? null, category,
    website: Array.isArray(props.websites) ? props.websites.find(url => typeof url === 'string' && url.startsWith('https://')) ?? null : null,
    confidence: typeof props.confidence === 'number' ? props.confidence : null };
}

export function buildBulkReviewQueue(snapshot, enrichment, geojson, { release, city = 'TAMPA', observedAt = new Date().toISOString() } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}(?:\.\d+)?$/.test(release ?? '')) throw new Error('Supply an Overture release ID (for example 2026-09-23.1).');
  if (!Array.isArray(snapshot?.restaurants) || !Array.isArray(enrichment?.records)) throw new Error('Invalid registry or enrichment file.');
  const places = recordsFromGeojson(geojson).map(placeFromFeature).filter(Boolean)
    .filter(place => place.city.toUpperCase() === city.toUpperCase() && (!place.region || place.region.toUpperCase() === 'FL'));
  const byStreet = new Map();
  for (const place of places) {
    const key = streetKey(place.street);
    if (!byStreet.has(key)) byStreet.set(key, []);
    byStreet.get(key).push(place);
  }
  const reviewed = new Set(enrichment.records.filter(row => row.plannerEligible).map(row => row.license));
  const registryIdentityCounts = new Map();
  for (const row of snapshot.restaurants) {
    if (row.city?.toUpperCase() !== city.toUpperCase()) continue;
    const key = `${streetKey(row.street)}|${venueKey(row.name)}`;
    registryIdentityCounts.set(key, (registryIdentityCounts.get(key) ?? 0) + 1);
  }
  const rows = snapshot.restaurants.filter(row => row.city?.toUpperCase() === city.toUpperCase() && !reviewed.has(row.license))
    .map(row => {
      const sameAddress = byStreet.get(streetKey(row.street)) ?? [];
      const normalizedName = venueKey(row.name);
      const exact = normalizedName ? sameAddress.filter(place => venueKey(place.name) === normalizedName) : [];
      const duplicateLicense = (registryIdentityCounts.get(`${streetKey(row.street)}|${normalizedName}`) ?? 0) > 1;
      const matches = exact.length === 1 && !row.variants && !duplicateLicense ? exact : [];
      const possible = matches.length ? matches : sameAddress;
      const matchStatus = row.archived || row.warnings?.length || row.variants ? 'registry-review'
        : matches.length ? 'candidate-match' : exact.length > 1 || duplicateLicense ? 'ambiguous' : 'unmatched';
      return {
        license: row.license, registryName: row.name, registryStreet: row.street,
        status: matchStatus, registryWarnings: row.warnings ?? [],
        candidates: possible.slice(0, 10).map(place => ({ ...place, sourceUrl: source })),
        missingFacts: ['Exact branch / operating status confirmation', 'Official opening and kitchen hours / exceptions',
          'Cuisine', 'Neighborhood', 'Broad price band with evidence', 'Seating / setting', 'Mood and date suitability'],
        plannerEligible: false,
      };
    }).sort((a, b) => a.status.localeCompare(b.status) || a.registryName.localeCompare(b.registryName) || a.license.localeCompare(b.license));
  return { version: 1, meta: { observedAt, release, sourceUrl: source, city, inputPlaces: places.length,
    registryRows: rows.length, candidateMatches: rows.filter(row => row.status === 'candidate-match').length,
    limitations: 'Discovery and review only. Overture provides neither hours nor price tiers. Matches are not branch verification and never change planner eligibility.' }, rows };
}

export async function refreshBulkReviewQueue({ input, release, city = 'TAMPA', registry = defaultRegistry, enrichment = defaultEnrichment, output = defaultOutput } = {}) {
  if (!input) throw new Error('Use --input path/to/overture-places.geojson.');
  const [snapshot, reviewed, raw] = await Promise.all([
    readFile(registry, 'utf8').then(JSON.parse), readFile(enrichment, 'utf8').then(JSON.parse), readFile(input, 'utf8'),
  ]);
  if (Buffer.byteLength(raw) > 100_000_000) throw new Error('GeoJSON extract exceeds the 100 MB limit; narrow the bounding box.');
  const next = buildBulkReviewQueue(snapshot, reviewed, raw, { release, city });
  if (!next.meta.inputPlaces) throw new Error('No restaurant places in the selected city; previous queue kept.');
  if (!next.meta.registryRows) throw new Error('No registry rows in the selected city; previous queue kept.');
  const lockPath = `${output}.lock`;
  const lock = await open(lockPath, 'wx');
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', 'utf8');
    await rename(temporary, output);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await lock.close();
    await unlink(lockPath);
  }
  return next;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { input: { type: 'string' }, release: { type: 'string' }, city: { type: 'string', default: 'TAMPA' } } });
    const result = await refreshBulkReviewQueue({ input: values.input && resolve(root, values.input), release: values.release, city: values.city });
    console.log(`Review queue: ${result.meta.candidateMatches} candidate matches from ${result.meta.inputPlaces} places; ${result.meta.registryRows} registry rows. No planner records changed.`);
    console.log(`Saved to ${defaultOutput}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

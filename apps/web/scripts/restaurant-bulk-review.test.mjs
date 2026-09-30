import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildBulkReviewQueue, refreshBulkReviewQueue } from './restaurant-bulk-review.mjs';

const registry = { restaurants: [
  { license: 'SEA1', name: 'Irish 31', street: '1611 WEST SWANN AVENUE', city: 'TAMPA', warnings: [], archived: false },
  { license: 'SEA2', name: 'Other Restaurant', street: '1611 W SWANN AVE', city: 'TAMPA', warnings: [], archived: false },
  { license: 'SEA3', name: 'Closed Place', street: '5 MAIN ST', city: 'TAMPA', warnings: ['Inactive secondary status'], archived: false },
] };
const feature = (id, name, street, overrides = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [-82.4, 27.9] }, properties: {
  id, names: { primary: name }, taxonomy: { primary: 'restaurant' },
  addresses: [{ freeform: street, locality: 'Tampa', region: 'FL' }], websites: ['https://example.com'], ...overrides,
} });
const data = (...features) => JSON.stringify({ type: 'FeatureCollection', features });
const options = { release: '2026-09-23.1', observedAt: '2026-09-30T00:00:00Z' };
const tempDirs = [];
afterEach(async () => {
  for (const path of tempDirs.splice(0)) {
    const resolved = await realpath(path);
    if (dirname(resolved) !== await realpath(tmpdir())) throw new Error('Unsafe test cleanup path.');
    await rm(resolved, { recursive: true, force: true });
  }
});

describe('bulk discovery review queue', () => {
  it('matches conservatively by exact normalized name and street but never promotes', () => {
    const queue = buildBulkReviewQueue(registry, { records: [] }, data(feature('place-1', 'Irish 31', '1611 W Swann Ave')), options);
    expect(queue.meta.candidateMatches).toBe(1);
    expect(queue.rows.find(row => row.license === 'SEA1')).toMatchObject({ status: 'candidate-match', plannerEligible: false, candidates: [{ id: 'place-1' }] });
    expect(queue.rows.find(row => row.license === 'SEA2').status).toBe('unmatched');
    expect(queue.rows.find(row => row.license === 'SEA1').missingFacts).toContain('Broad price band with evidence');
  });
  it('leaves duplicate places and warned registry records for manual identity review', () => {
    const queue = buildBulkReviewQueue(registry, { records: [] }, data(
      feature('a', 'Irish 31', '1611 W Swann Ave'), feature('b', 'Irish 31', '1611 W Swann Ave'),
      feature('c', 'Closed Place', '5 Main St'),
    ), options);
    expect(queue.rows.find(row => row.license === 'SEA1').status).toBe('ambiguous');
    expect(queue.rows.find(row => row.license === 'SEA3').status).toBe('registry-review');
    expect(queue.meta.candidateMatches).toBe(0);
  });
  it('ignores closed, nonrestaurant and out-of-city places and skips already promoted licenses', () => {
    const queue = buildBulkReviewQueue(registry, { records: [{ license: 'SEA1', plannerEligible: true }] }, data(
      feature('closed', 'Closed Place', '5 Main St', { operating_status: 'permanently_closed' }),
      feature('retail', 'Other Restaurant', '1611 W Swann Ave', { taxonomy: { primary: 'clothing_store' } }),
      feature('away', 'Other Restaurant', '1611 W Swann Ave', { addresses: [{ freeform: '1611 W Swann Ave', locality: 'Miami', region: 'FL' }] }),
    ), options);
    expect(queue.rows.map(row => row.license)).toEqual(['SEA3', 'SEA2']);
    expect(queue.meta.inputPlaces).toBe(0);
  });
  it('rejects missing release and unexpected input format', () => {
    expect(() => buildBulkReviewQueue(registry, { records: [] }, data(), {})).toThrow('release ID');
    expect(() => buildBulkReviewQueue(registry, { records: [] }, '{}', options)).toThrow('FeatureCollection');
  });
  it('keeps duplicate DBPR identities ambiguous', () => {
    const duplicate = { ...registry, restaurants: [...registry.restaurants, { ...registry.restaurants[0], license: 'SEA4' }] };
    const queue = buildBulkReviewQueue(duplicate, { records: [] }, data(feature('place-1', 'Irish 31', '1611 W Swann Ave')), options);
    expect(queue.rows.filter(row => row.status === 'ambiguous')).toHaveLength(2);
  });
  it('writes a local queue and preserves it when the next extract is empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'datebloom-bulk-'));
    tempDirs.push(dir);
    const paths = { input: join(dir, 'places.geojson'), registry: join(dir, 'registry.json'),
      enrichment: join(dir, 'enrichment.json'), output: join(dir, 'queue.json'), release: options.release };
    await Promise.all([
      writeFile(paths.registry, JSON.stringify(registry)), writeFile(paths.enrichment, JSON.stringify({ records: [] })),
      writeFile(paths.input, data(feature('place-1', 'Irish 31', '1611 W Swann Ave'))),
    ]);
    const first = await refreshBulkReviewQueue(paths);
    expect(first.meta.candidateMatches).toBe(1);
    const original = await readFile(paths.output, 'utf8');
    await writeFile(paths.input, data());
    await expect(refreshBulkReviewQueue(paths)).rejects.toThrow('No restaurant places');
    expect(await readFile(paths.output, 'utf8')).toBe(original);
  });
});

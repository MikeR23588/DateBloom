import { describe, expect, it } from 'vitest';
import { directorySearch, mergeEnrichment, validateEnrichment } from './restaurant-directory.mjs';

const record = (license, overrides = {}) => ({ license, name: `Cafe ${license}`, street: `${license} Main St`, city: 'TAMPA', archived: false, variants: null, warnings: [], ...overrides });
const snapshot = { restaurants: [record('A1'), record('A2'), record('B1', { city: 'ST PETERSBURG' }), record('X1', { archived: true }), record('X2', { variants: [{}] })] };
const empty = { version: 1, records: [] };
const reviewed = { license: 'A1', plannerEligible: true, name: 'Cafe A1', address: 'A1 Main St, Tampa, FL', neighborhood: 'Downtown / Water Street', cuisines: ['American'], priceBand: 'moderate', setting: 'indoors', hours: Array(7).fill([660, 1320]), sourceUrl: 'https://example.com/cafe', reviewedOn: '2026-09-30', expiresOn: '2026-10-30' };

describe('restaurant directory', () => {
  it('searches and paginates discovery records without promoting them', () => {
    expect(directorySearch(snapshot, empty, {}).count).toBe(2);
    expect(directorySearch(snapshot, empty, { search: 'a1' }).rows[0].enrichment).toBeNull();
    expect(directorySearch(snapshot, empty, { city: '', page: 2, pageSize: 2 }).rows.map(row => row.license)).toEqual(['B1']);
    expect(directorySearch(snapshot, empty, { page: 999, pageSize: 1 }).page).toBe(2);
  });
  it('requires complete evidence for planner eligibility', () => {
    expect(() => validateEnrichment({ version: 1, records: [{ license: 'A1', plannerEligible: true }] })).toThrow('incomplete');
    expect(() => validateEnrichment({ version: 1, records: [{ ...reviewed, priceBand: 'exact-$25' }] })).toThrow('price band');
    expect(() => validateEnrichment({ version: 1, records: [reviewed, reviewed] })).toThrow('Duplicate');
    expect(validateEnrichment({ version: 1, records: [reviewed] }).records).toHaveLength(1);
  });
  it('bulk merges by license and rejects conflicted or unknown licenses', () => {
    expect(mergeEnrichment(empty, [reviewed], snapshot).records).toEqual([reviewed]);
    expect(mergeEnrichment({ version: 1, records: [reviewed] }, [{ license: 'A1', plannerEligible: false }], snapshot).records[0].plannerEligible).toBe(false);
    expect(() => mergeEnrichment(empty, [{ ...reviewed, license: 'X2' }], snapshot)).toThrow('registry warnings');
    expect(() => mergeEnrichment(empty, [{ ...reviewed, license: 'Z9' }], snapshot)).toThrow('not in');
  });
});

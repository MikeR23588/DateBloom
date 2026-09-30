import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildRegistry, refreshRegistry, REQUIRED_HEADERS, reviewCandidates } from './restaurant-registry.mjs';

const row = (overrides = {}) => ({
  'Business Name': 'Fixture restaurant', 'License Number': 'SEA3910001',
  'Location County Code': '39', 'Location Street Address': '100 Fixture Street',
  'Location City': 'TAMPA', 'Location State Code': 'FL', 'Location Zip Code': '33602',
  'License Type Code': '2010', 'Primary Status Code': '20', 'Secondary Status Code': '20',
  'License Expiry Date': '02/01/2027', ...overrides,
});
const csv = (rows, headers = REQUIRED_HEADERS) => [headers, ...rows.map(record => headers.map(h => record[h] ?? ''))]
  .map(fields => fields.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\r\n');
const observedAt = '2026-09-28T12:00:00.000Z';
const temporaryDirectories = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'date-planner-registry-'));
  temporaryDirectories.push(root);
  return { root, input: join(root, 'registry.csv'), output: join(root, 'snapshot.json') };
}
afterEach(async () => {
  for (const root of temporaryDirectories.splice(0)) {
    const resolved = await realpath(root);
    if (dirname(resolved) !== await realpath(tmpdir())) throw new Error('Unsafe test cleanup path.');
    await rm(resolved, { recursive: true, force: true });
  }
});

describe('DBPR discovery catalog', () => {
  it('parses BOM, commas, escaped quotes and multiline names without inferring cuisine', () => {
    const name = 'Fixture "Taco",\nKitchen';
    const result = buildRegistry('\uFEFF' + csv([row({ 'Business Name': name })]), { observedAt });
    expect(result.restaurants[0]).toMatchObject({ name, license: 'SEA3910001', plannerEligible: false, warnings: [], observedAt });
    expect(result.restaurants[0]).not.toHaveProperty('cuisines');
    expect(result.meta.sha256).toHaveLength(64);
  });
  it('uses location county, excludes unrelated counties, license types and suspended status', () => {
    const result = buildRegistry(csv([
      row(), row({ 'License Number': 'SEA6210001', 'Location County Code': '62' }),
      row({ 'Location County Code': '19' }), row({ 'License Type Code': '2011' }),
      row({ 'Primary Status Code': '42' }),
    ]));
    expect(result.meta).toMatchObject({ sourceRows: 5, localRows: 4, excludedRows: 2, registryCount: 2 });
    expect(result.restaurants.map(r => r.county)).toEqual(['Hillsborough', 'Pinellas']);
  });
  it.each([['30', 'Current with probation'], ['31', 'Current with obligations'], ['32', 'Current conditional'], ['45', 'Delinquent']])('retains status %s without calling it current and clear', (code, description) => {
    const record = buildRegistry(csv([row({ 'Primary Status Code': code })])).restaurants[0];
    expect(record.primaryStatus).toBe(description);
    expect(record.warnings).toContain(description);
    expect(record.plannerEligible).toBe(false);
  });
  it('flags inactive secondary status and mobile registered addresses', () => {
    const record = buildRegistry(csv([row({ 'License Type Code': '2014', 'Secondary Status Code': '10' })])).restaurants[0];
    expect(record.warnings).toEqual(['Inactive secondary status', 'Mobile vendor: registered address is not a confirmed dining location']);
  });
  it('rejects missing or duplicate headers, truncated CSV and inconsistent row lengths', () => {
    expect(() => buildRegistry(csv([row()], REQUIRED_HEADERS.slice(1)))).toThrow('missing Business Name');
    expect(() => buildRegistry(csv([row()], [...REQUIRED_HEADERS, REQUIRED_HEADERS[0]]))).toThrow('Duplicate');
    expect(() => buildRegistry(csv([row()]) + '\r\n"unfinished')).toThrow();
    expect(() => buildRegistry(csv([row()]) + '\r\n"short"')).toThrow();
  });
  it('deduplicates identical licenses, retains conflicting identities and rejects missing IDs', () => {
    expect(buildRegistry(csv([row(), row()])).meta.registryCount).toBe(1);
    const other = row({ 'Business Name': 'Other fixture', 'Location City': 'LARGO', 'Location Street Address': '200 Other Street' });
    const conflict = buildRegistry(csv([row(), other, other]));
    expect(conflict.meta.conflictingLicenseCount).toBe(1);
    expect(conflict.restaurants[0]).toMatchObject({ city: '', street: '', primaryStatusCode: null, plannerEligible: false });
    expect(conflict.restaurants[0].variants).toHaveLength(2);
    expect(reviewCandidates(conflict, { city: 'LARGO', search: 'Other fixture' })).toHaveLength(1);
    expect(reviewCandidates(conflict, { city: 'TAMPA', search: 'Other fixture' })).toHaveLength(0);
    expect(() => buildRegistry(csv([row({ 'License Number': '' })]))).toThrow('missing license');
  });
  it('archives missing records and unarchives them when they reappear', () => {
    const previous = buildRegistry(csv([row()]), { observedAt });
    const removed = buildRegistry(csv([row({ 'License Number': 'SEA3910002' })]), { previous });
    expect(removed.meta).toMatchObject({ registryCount: 1, archivedCount: 1 });
    expect(removed.restaurants.find(r => r.license === 'SEA3910001')).toMatchObject({ archived: true, observedAt, plannerEligible: false });
    const returned = buildRegistry(csv([row()]), { previous: removed });
    expect(returned.restaurants.find(r => r.license === 'SEA3910001')).toMatchObject({ archived: false, warnings: [] });
  });
  it('searches by name, street or exact license and hides archived records by default', () => {
    const snapshot = buildRegistry(csv([row(), row({ 'License Number': 'SEA6210001', 'Location City': 'ST PETERSBURG', 'Location County Code': '62' })]));
    expect(reviewCandidates(snapshot, { search: 'sea3910001' })).toHaveLength(1);
    expect(reviewCandidates(snapshot, { search: 'Fixture Street' })).toHaveLength(1);
    expect(reviewCandidates(snapshot, { city: 'st petersburg' })).toHaveLength(1);
    snapshot.restaurants[0].archived = true;
    expect(reviewCandidates(snapshot)).toHaveLength(0);
    expect(reviewCandidates(snapshot, { includeArchived: true })).toHaveLength(1);
  });
});

describe('safe registry refresh', () => {
  it('imports an offline file with unknown source freshness and replaces a valid snapshot', async () => {
    const paths = await fixture();
    await writeFile(paths.input, csv([row()]));
    await refreshRegistry({ ...paths, minimumRecords: 1 });
    const saved = JSON.parse(await readFile(paths.output, 'utf8'));
    expect(saved.meta).toMatchObject({ acquisition: 'offline', inputName: 'registry.csv', sourceModified: null, registryCount: 1 });
    await refreshRegistry({ ...paths, minimumRecords: 1 });
    expect(JSON.parse(await readFile(paths.output, 'utf8')).restaurants).toHaveLength(1);
  });
  it('preserves the previous snapshot on HTTP failure, malformed data or a suspicious count drop', async () => {
    const paths = await fixture();
    await writeFile(paths.input, csv([row(), row({ 'License Number': 'SEA3910002' })]));
    await refreshRegistry({ ...paths, minimumRecords: 1 });
    const before = await readFile(paths.output, 'utf8');
    await expect(refreshRegistry({ output: paths.output, minimumRecords: 1, fetchImpl: async () => new Response('blocked', { status: 403 }) })).rejects.toThrow('HTTP 403');
    await writeFile(paths.input, 'invalid');
    await expect(refreshRegistry({ ...paths, minimumRecords: 1 })).rejects.toThrow();
    await writeFile(paths.input, csv([row()]));
    await expect(refreshRegistry({ ...paths, minimumRecords: 1 })).rejects.toThrow('20%');
    expect(await readFile(paths.output, 'utf8')).toBe(before);
    await expect(readFile(paths.output + '.lock')).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects undersized and oversized downloads before publishing', async () => {
    const paths = await fixture();
    await writeFile(paths.input, csv([row()]));
    await expect(refreshRegistry(paths)).rejects.toThrow('Incomplete');
    await expect(refreshRegistry({ output: paths.output, fetchImpl: async () => new Response('small', { headers: { 'content-length': '25000001' } }) })).rejects.toThrow('size limit');
    await expect(readFile(paths.output)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('records live source modification time separately from import time', async () => {
    const paths = await fixture();
    const sourceModified = 'Sun, 27 Sep 2026 12:00:00 GMT';
    const snapshot = await refreshRegistry({ output: paths.output, minimumRecords: 1, fetchImpl: async () => new Response(csv([row()]), { headers: { 'last-modified': sourceModified } }) });
    expect(snapshot.meta).toMatchObject({ acquisition: 'live', inputName: null, sourceModified });
  });
  it('does not steal another refresh lock', async () => {
    const paths = await fixture();
    await writeFile(paths.output + '.lock', 'existing lock');
    await expect(refreshRegistry(paths)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(paths.output + '.lock', 'utf8')).toBe('existing lock');
  });
});

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';

export const SOURCE_URL = 'https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood3.csv';
export const SOURCE_PAGE = 'https://www2.myfloridalicense.com/hotels-restaurants/public-records/';
export const DEFAULT_OUTPUT = new URL('../../../data/restaurant-registry.json', import.meta.url);
const MAX_BYTES = 25_000_000;
const COUNTIES = { '39': 'Hillsborough', '62': 'Pinellas' };
const STATUSES = { '20': 'Current', '30': 'Current with probation', '31': 'Current with obligations', '32': 'Current conditional', '45': 'Delinquent' };
export const REQUIRED_HEADERS = ['Business Name', 'License Number', 'Location County Code', 'Location Street Address', 'Location City', 'Location State Code', 'Location Zip Code', 'License Type Code', 'Primary Status Code', 'Secondary Status Code', 'License Expiry Date'];

export function buildRegistry(csv, { previous = null, observedAt = new Date().toISOString(), sourceModified = null, acquisition = 'live', inputName = null } = {}) {
  const rows = parse(csv, {
    bom: true, trim: true, skip_empty_lines: true,
    columns(headers) {
      if (new Set(headers).size !== headers.length) throw new Error('Duplicate registry headers.');
      for (const name of REQUIRED_HEADERS) if (!headers.includes(name)) throw new Error(`Registry schema changed: missing ${name}.`);
      return headers;
    },
  });
  const byLicense = new Map();
  let localRows = 0;
  let excludedRows = 0;
  for (const row of rows) {
    const county = COUNTIES[row['Location County Code']];
    if (!county) continue;
    localRows++;
    const type = row['License Type Code'];
    const primary = row['Primary Status Code'];
    if (!['2010', '2014'].includes(type) || !STATUSES[primary]) { excludedRows++; continue; }
    const license = row['License Number'];
    if (!license) throw new Error('Registry contains a missing license number.');
    const secondary = row['Secondary Status Code'];
    const street = [row['Location Street Address'], row['Location Address Line 2'], row['Location Address Line 3']].filter(Boolean).join(' ');
    const warnings = [];
    if (primary !== '20') warnings.push(STATUSES[primary]);
    if (secondary !== '20') warnings.push(secondary === '10' ? 'Inactive secondary status' : 'Unknown secondary status');
    if (type === '2014') warnings.push('Mobile vendor: registered address is not a confirmed dining location');
    if (!street || !row['Location City'] || row['Location State Code'] !== 'FL') warnings.push('Dining location needs verification');
    const record = {
      id: `dbpr-${license}`, license, name: row['Business Name'] || `Unnamed business (${license})`,
      county, city: row['Location City'], street, state: row['Location State Code'], zip: row['Location Zip Code'],
      kind: type === '2014' ? 'Food truck / cart' : 'Restaurant / takeout',
      licenseTypeCode: type, primaryStatusCode: primary, primaryStatus: STATUSES[primary],
      secondaryStatusCode: secondary, licenseExpiryDate: row['License Expiry Date'] || null,
      lastInspectionDate: row['Last Inspection Date'] || null,
      warnings, sourceUrl: SOURCE_PAGE, observedAt, archived: false,
      plannerEligible: false,
      missingFacts: ['Official website', 'Cuisine', 'Neighborhood', 'Opening hours and exceptions', 'Approximate price band', 'Seating / setting'],
    };
    // Conflicting source identities stay visible for review, never as a chosen branch.
    const existing = byLicense.get(license);
    if (!existing) byLicense.set(license, record);
    else {
      const variants = existing.variants ?? [existing];
      if (!variants.some(variant => JSON.stringify(variant) === JSON.stringify(record))) {
        variants.push(record);
        byLicense.set(license, {
          ...record, name: `Conflicting registry entries (${license})`, city: '', street: '', state: '', zip: '',
          county: [...new Set(variants.map(variant => variant.county))].join(' / '),
          kind: 'Conflicting registry entries', licenseTypeCode: null,
          primaryStatusCode: null, primaryStatus: 'Conflicting registry rows', secondaryStatusCode: null,
          licenseExpiryDate: null, lastInspectionDate: null,
          warnings: ['Conflicting names, locations or statuses; confirm identity', ...new Set(variants.flatMap(variant => variant.warnings))],
          variants,
        });
      }
    }
  }
  const registryCount = byLicense.size;
  for (const old of previous?.restaurants ?? []) {
    if (!byLicense.has(old.license)) byLicense.set(old.license, {
      ...old, archived: true, plannerEligible: false,
      warnings: [...new Set([...old.warnings, 'Not present in latest extract; verify before visiting'])],
    });
  }
  const restaurants = [...byLicense.values()].sort((a, b) => a.name.localeCompare(b.name) || a.license.localeCompare(b.license));
  return { version: 1, meta: {
    observedAt, sourceModified, acquisition, inputName, sourceUrl: SOURCE_URL, sourcePage: SOURCE_PAGE,
    sha256: createHash('sha256').update(csv).digest('hex'),
    sourceRows: rows.length, localRows, excludedRows, registryCount,
    archivedCount: restaurants.filter(r => r.archived).length,
    reviewRequiredCount: restaurants.filter(r => !r.archived && r.warnings.length).length,
    conflictingLicenseCount: restaurants.filter(r => !r.archived && r.variants).length,
    limitations: 'Discovery only. A license does not establish current opening, cuisine, hours, price band, seating, accessibility, or suitability. observedAt is import time, not verification time. Offline source freshness is unknown.',
  }, restaurants };
}

async function download(fetchImpl) {
  const response = await fetchImpl(SOURCE_URL, { signal: AbortSignal.timeout(120_000), headers: { 'User-Agent': 'DateBloomLocal/1.0' } });
  if (!response.ok) throw new Error(`DBPR returned HTTP ${response.status}; previous snapshot kept.`);
  if (!response.body) throw new Error('DBPR returned an empty download.');
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Registry download exceeds the size limit.');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) throw new Error('Registry download exceeds the size limit.');
    chunks.push(Buffer.from(chunk));
  }
  return { csv: Buffer.concat(chunks).toString('utf8'), sourceModified: response.headers.get('last-modified') };
}

export async function refreshRegistry({ input = null, output = DEFAULT_OUTPUT, fetchImpl = fetch, minimumRecords = 1000 } = {}) {
  const path = output instanceof URL ? output : pathToFileURL(resolve(output));
  await mkdir(dirname(fileURLToPath(path)), { recursive: true });
  const lockPath = new URL(`${path.href}.lock`);
  const lock = await open(lockPath, 'wx');
  const temporary = new URL(`${path.href}.${randomUUID()}.tmp`);
  try {
    let previous = null;
    try { previous = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous && (previous.version !== 1 || !Array.isArray(previous.restaurants) || !Number.isInteger(previous.meta?.registryCount))) throw new Error('Invalid previous registry snapshot; kept for review.');
    const downloaded = input ? { csv: await readFile(input, 'utf8'), sourceModified: null } : await download(fetchImpl);
    if (Buffer.byteLength(downloaded.csv) > MAX_BYTES) throw new Error('Registry download exceeds the size limit.');
    const next = buildRegistry(downloaded.csv, { previous, sourceModified: downloaded.sourceModified, acquisition: input ? 'offline' : 'live', inputName: input ? basename(input) : null });
    if (next.meta.registryCount < minimumRecords) throw new Error('Incomplete registry download; previous snapshot kept.');
    if (previous && next.meta.registryCount < previous.meta.registryCount * 0.8) throw new Error('Registry lost more than 20% of listings; previous snapshot kept for review.');
    await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', 'utf8');
    await rename(temporary, path);
    return next;
  } finally {
    try {
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
}

export function reviewCandidates(snapshot, { city = 'TAMPA', search = '', includeArchived = false } = {}) {
  return snapshot.restaurants.filter(record => {
    const locations = record.variants ?? [record];
    return (includeArchived || !record.archived)
      && locations.some(location => (!city || location.city.toLowerCase() === city.toLowerCase())
        && (!search || `${location.name} ${location.license} ${location.street}`.toLowerCase().includes(search.toLowerCase())));
  });
}

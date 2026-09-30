import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { DEFAULT_OUTPUT, reviewCandidates } from './restaurant-registry.mjs';

try {
  const { values } = parseArgs({ options: { city: { type: 'string', default: 'TAMPA' }, search: { type: 'string', default: '' }, archived: { type: 'boolean', default: false }, limit: { type: 'string', default: '30' } } });
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Limit must be an integer from 1 to 500.');
  const snapshot = JSON.parse(await readFile(DEFAULT_OUTPUT, 'utf8'));
  const records = reviewCandidates(snapshot, { city: values.city, search: values.search, includeArchived: values.archived });
  console.log(`Import: ${snapshot.meta.observedAt} (${snapshot.meta.acquisition}); ${records.length} matching discovery records.`);
  console.table(records.slice(0, limit).map(record => ({ license: record.license, name: record.name, city: record.city, street: record.street, status: record.primaryStatus, warnings: [record.archived ? 'Archived' : '', ...record.warnings].filter(Boolean).join('; ') })));
  for (const record of records.slice(0, limit).filter(record => record.variants)) {
    console.log(`Conflicting source entries for ${record.license}:`);
    console.table(record.variants.map(variant => ({ name: variant.name, city: variant.city, street: variant.street, status: variant.primaryStatus })));
  }
  console.log('Verify official cuisine, neighborhood, hours, prices and seating before adding any record to venue-catalog.ts.');
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'Run pnpm restaurants:refresh first.' : error.message);
  process.exitCode = 1;
}

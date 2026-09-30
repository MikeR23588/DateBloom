import { randomUUID } from 'node:crypto';
import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mergeEnrichment } from '../lib/restaurant-enrichment.mjs';

const enrichmentPath = fileURLToPath(new URL('../../../data/restaurant-enrichment.json', import.meta.url));
const registryPath = fileURLToPath(new URL('../../../data/restaurant-registry.json', import.meta.url));
const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));

export async function importEnrichment({ input, output = enrichmentPath, registry = registryPath }) {
  const updates = JSON.parse(await readFile(input, 'utf8'));
  if (!Array.isArray(updates)) throw new Error('Input must be a JSON array of enrichment records.');
  const lockPath = `${output}.lock`;
  const lock = await open(lockPath, 'wx');
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    const current = JSON.parse(await readFile(output, 'utf8'));
    const snapshot = JSON.parse(await readFile(registry, 'utf8'));
    const next = mergeEnrichment(current, updates, snapshot);
    await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', 'utf8');
    await rename(temporary, output);
    return next;
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { values } = parseArgs({ options: { input: { type: 'string' } } });
    if (!values.input) throw new Error('Use --input path/to/reviewed-records.json');
    const result = await importEnrichment({ input: resolve(projectRoot, values.input) });
    console.log(`Imported ${result.records.length} reviewed restaurant records. ${result.records.filter(row => row.plannerEligible).length} marked planner eligible.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

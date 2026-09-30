import { parseArgs } from 'node:util';
import { refreshRegistry } from './restaurant-registry.mjs';

try {
  const { values } = parseArgs({ options: { input: { type: 'string' } } });
  const snapshot = await refreshRegistry({ input: values.input ?? null });
  console.log(JSON.stringify(snapshot.meta, null, 2));
  console.log('Discovery snapshot saved to data/restaurant-registry.json. No planner venues were changed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

import { assertProductionConfig } from '../src/config.js';
import { migrate, closeDb } from '../src/db.js';
import { ensureAdminUser } from '../src/auth.js';
import { runDiscovery } from '../src/discovery.js';

try {
  assertProductionConfig();
  await migrate();
  await ensureAdminUser();
  const result = await runDiscovery({ createDigest: true });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await closeDb();
}

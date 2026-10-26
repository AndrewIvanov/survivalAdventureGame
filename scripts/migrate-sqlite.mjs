import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresSaveStore } from '../server/postgres.js';
import { readSqliteSnapshot, importSqliteSnapshot } from '../server/migrate-sqlite.js';

let store;
try {
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL_UNPOOLED in the ignored .env file before migrating.');
  if (new URL(databaseUrl).hostname.includes('-pooler.')) throw new Error('Migration requires a direct Neon connection.');
  const filename = process.argv[2] || fileURLToPath(new URL('../data/village.sqlite', import.meta.url));
  const snapshot = readSqliteSnapshot(path.resolve(filename));
  store = await PostgresSaveStore.open(databaseUrl);
  const result = await importSqliteSnapshot(store, snapshot);
  console.log(`Migration complete: ${result.worlds} worlds and ${result.identities} identities imported; ${result.skipped} identical worlds skipped. SQLite was not changed.`);
} catch (error) {
  // Do not print the URL, a driver stack, or a malformed URL's input field.
  console.error('Migration failed. No existing destination worlds were overwritten.', error.code || error.name);
  console.error('Check the direct DATABASE_URL_UNPOOLED (or DATABASE_URL), the SQLite path and destination world conflicts.');
  process.exitCode = 1;
} finally { await store?.close(); }

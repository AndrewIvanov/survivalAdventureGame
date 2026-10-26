import { SaveStore } from './persistence.js';
import { PostgresSaveStore } from './postgres.js';

export async function openStore({ database, databaseUrl, requirePostgres = false }) {
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
    return PostgresSaveStore.open(databaseUrl);
  }
  if (requirePostgres) throw new Error('DATABASE_URL is required on Render. SQLite files would be lost on restart.');
  return new SaveStore(database);
}

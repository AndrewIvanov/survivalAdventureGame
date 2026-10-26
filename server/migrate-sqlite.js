import { DatabaseSync } from 'node:sqlite';
import { decodeSave } from './save-format.js';

export function readSqliteSnapshot(filename) {
  // Read an existing file without creating or modifying it; all reads share one snapshot.
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    db.exec('BEGIN');
    const identities = db.prepare('SELECT * FROM identities').all();
    const backups = db.prepare('SELECT * FROM world_backups').all();
    const byId = new Map(backups.map(row => [row.id, row]));
    const worlds = db.prepare('SELECT * FROM worlds').all().map(row => {
      try { decodeSave(row); return row; }
      catch (error) {
        const backup = byId.get(row.id);
        if (!backup) throw error;
        decodeSave(backup); return backup;
      }
    });
    const verifiedBackups = backups.filter(row => {
      try { decodeSave(row); return true; } catch { return false; }
    });
    return { identities, worlds, backups: verifiedBackups };
  } finally { db.close(); }
}

export async function importSqliteSnapshot(store, snapshot) {
  const client = await store.pool.connect();
  const result = { identities: 0, worlds: 0, skipped: 0 };
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE identities, worlds, world_backups IN SHARE ROW EXCLUSIVE MODE');
    for (const row of snapshot.identities) {
      const existing = await client.query('SELECT * FROM identities WHERE id = $1 OR token_hash = $2', [row.id, row.token_hash]);
      if (existing.rows.some(other => other.id !== row.id || other.token_hash !== row.token_hash)) throw new Error('Identity conflict; migration cancelled.');
      const inserted = await client.query('INSERT INTO identities (id, token_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING', [row.id, row.token_hash]);
      result.identities += inserted.rowCount;
    }
    for (const row of snapshot.worlds) {
      const decoded = decodeSave(row);
      if (decoded.id !== row.id || decoded.code !== row.code) throw new Error('World metadata mismatch; migration cancelled.');
      const existing = await client.query('SELECT * FROM worlds WHERE id = $1 OR code = $2', [row.id, row.code]);
      if (existing.rows.length) {
        if (existing.rows.length !== 1 || existing.rows[0].id !== row.id || existing.rows[0].code !== row.code || existing.rows[0].checksum !== row.checksum) {
          throw new Error('A destination world already has different progress. Nothing was overwritten.');
        }
        result.skipped++; continue;
      }
      await client.query('INSERT INTO worlds (id, code, state, checksum, saved_at) VALUES ($1, $2, $3, $4, $5)', [row.id, row.code, row.state, row.checksum, row.saved_at]);
      const backup = snapshot.backups.find(other => other.id === row.id);
      if (backup) await client.query('INSERT INTO world_backups (id, code, state, checksum, saved_at) VALUES ($1, $2, $3, $4, $5)', [backup.id, backup.code, backup.state, backup.checksum, backup.saved_at]);
      result.worlds++;
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

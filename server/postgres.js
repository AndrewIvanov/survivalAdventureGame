import pg from 'pg';
import { checksum, decodeSave, summarizeSave } from './save-format.js';

export class PostgresSaveStore {
  static async open(connectionString) {
    const pool = new pg.Pool({ connectionString, max: 4, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, statement_timeout: 10000, query_timeout: 15000, enableChannelBinding: true });
    // Never log connection settings: the URL contains the database password.
    pool.on('error', () => console.error('PostgreSQL: idle connection lost; reconnecting on the next request.'));
    const store = new PostgresSaveStore(pool);
    try { await store.initialize(); return store; }
    catch (error) { await pool.end(); throw error; }
  }

  constructor(pool) { this.pool = pool; }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS identities (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, state TEXT NOT NULL, checksum TEXT NOT NULL, saved_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS world_backups (id TEXT PRIMARY KEY, code TEXT NOT NULL, state TEXT NOT NULL, checksum TEXT NOT NULL, saved_at TEXT NOT NULL);
    `);
  }

  async identity(token) {
    const hash = checksum(token), id = hash.slice(0, 24);
    const { rows } = await this.pool.query(`INSERT INTO identities (id, token_hash) VALUES ($1, $2)
      ON CONFLICT (token_hash) DO UPDATE SET token_hash = EXCLUDED.token_hash RETURNING id`, [id, hash]);
    return rows[0].id;
  }

  async save(world) {
    // Serialize before yielding: nested inventories and quest objects continue changing during a query.
    const state = JSON.stringify(world), digest = checksum(state), date = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [world.id]);
      await client.query(`INSERT INTO world_backups SELECT * FROM worlds WHERE id = $1
        ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, state = EXCLUDED.state, checksum = EXCLUDED.checksum, saved_at = EXCLUDED.saved_at`, [world.id]);
      await client.query(`INSERT INTO worlds (id, code, state, checksum, saved_at) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, state = EXCLUDED.state, checksum = EXCLUDED.checksum, saved_at = EXCLUDED.saved_at`, [world.id, world.code, state, digest, date]);
      await client.query('COMMIT');
      return date;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async load(code) {
    const { rows } = await this.pool.query('SELECT * FROM worlds WHERE code = $1', [code]);
    if (!rows.length) return null;
    try { return decodeSave(rows[0]); }
    catch (error) {
      const { rows: backups } = await this.pool.query('SELECT * FROM world_backups WHERE id = $1', [rows[0].id]);
      if (!backups.length) throw error;
      console.warn('Recovering world from its previous verified snapshot:', rows[0].id);
      return decodeSave(backups[0]);
    }
  }

  async list(playerId) {
    // One round trip for all worlds, including their recovery snapshots.
    const { rows } = await this.pool.query(`SELECT w.*, b.state AS backup_state, b.checksum AS backup_checksum
      FROM worlds w LEFT JOIN world_backups b ON b.id = w.id ORDER BY w.saved_at DESC`);
    return rows.flatMap(row => {
      try {
        let state;
        try { state = decodeSave(row); }
        catch (error) {
          if (!row.backup_state) throw error;
          state = decodeSave({ state: row.backup_state, checksum: row.backup_checksum });
        }
        return summarizeSave(state, playerId, row.saved_at);
      } catch { return []; }
    });
  }

  async close() { await this.pool.end(); }
}

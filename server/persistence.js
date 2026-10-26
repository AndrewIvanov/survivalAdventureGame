import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { checksum, decodeSave, summarizeSave } from './save-format.js';

export class SaveStore {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS identities (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, state TEXT NOT NULL, checksum TEXT NOT NULL, saved_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS world_backups (id TEXT PRIMARY KEY, code TEXT NOT NULL, state TEXT NOT NULL, checksum TEXT NOT NULL, saved_at TEXT NOT NULL);`);
    const integrity = this.db.prepare('PRAGMA quick_check').get();
    if (Object.values(integrity)[0] !== 'ok') throw new Error('SQLite integrity check failed. Restore a database backup.');
  }

  identity(token) {
    const hash = checksum(token);
    const existing = this.db.prepare('SELECT id FROM identities WHERE token_hash = ?').get(hash);
    if (existing) return existing.id;
    const id = hash.slice(0, 24);
    this.db.prepare('INSERT INTO identities (id, token_hash) VALUES (?, ?)').run(id, hash);
    return id;
  }

  save(world) {
    const state = JSON.stringify(world), digest = checksum(state), date = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR REPLACE INTO world_backups SELECT * FROM worlds WHERE id = ?').run(world.id);
      this.db.prepare('INSERT OR REPLACE INTO worlds (id, code, state, checksum, saved_at) VALUES (?, ?, ?, ?, ?)').run(world.id, world.code, state, digest, date);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return date;
  }

  load(code) {
    const row = this.db.prepare('SELECT * FROM worlds WHERE code = ?').get(code);
    if (!row) return null;
    try { return this.decode(row); } catch (error) {
      const backup = this.db.prepare('SELECT * FROM world_backups WHERE id = ?').get(row.id);
      if (!backup) throw error;
      console.warn('Recovering world from its previous verified snapshot:', row.id);
      return this.decode(backup);
    }
  }

  decode(row) {
    return decodeSave(row);
  }

  list(playerId) {
    return this.db.prepare('SELECT code, saved_at FROM worlds ORDER BY saved_at DESC').all().flatMap(row => {
      try {
        const state = this.load(row.code);
        return summarizeSave(state, playerId, row.saved_at);
      } catch { return []; }
    });
  }

  close() { this.db.close(); }
}

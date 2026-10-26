import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { io } from 'socket.io-client';
import { PostgresSaveStore } from '../server/postgres.js';
import { SaveStore } from '../server/persistence.js';
import { GameWorld } from '../server/world.js';
import { createGameServer } from '../server/index.js';
import { readSqliteSnapshot, importSqliteSnapshot } from '../server/migrate-sqlite.js';
import { SURVIVAL, CYCLE_MS } from '../shared/survival.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const options = { skip: !databaseUrl, timeout: 30000 };

async function isolatedDatabase() {
  const admin = new pg.Pool({ connectionString: databaseUrl });
  const schema = `test_survival_${randomBytes(10).toString('hex')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(databaseUrl); url.searchParams.set('options', `-c search_path=${schema}`);
  return { url: url.toString(), async close() { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); } };
}

test('PostgreSQL: stable identities, atomic snapshots, membership, backup recovery and transaction rollback', options, async t => {
  const database = await isolatedDatabase(), store = await PostgresSaveStore.open(database.url);
  t.after(async () => { await store.close(); await database.close(); });
  const [a, b] = await Promise.all([store.identity('a'.repeat(64)), store.identity('b'.repeat(64))]);
  assert.equal(await store.identity('a'.repeat(64)), a);
  const sqlite = new SaveStore(':memory:'); assert.equal(sqlite.identity('a'.repeat(64)), a); sqlite.close();
  const world = new GameWorld(); world.join(a, 'Альфа', 'ranger', 'mage'); world.join(b, 'Бета', 'sage', 'archer');
  const hero = world.players.get(a); hero.xp = 42; world.monsters[0].hp = 17;
  await store.save(world.serialize()); hero.xp = 60; await store.save(world.serialize());
  assert.equal((await store.load(world.code)).players[0].xp, 60);
  assert.equal((await store.list(a))[0].members, 2); assert.deepEqual(await store.list('outsider'), []);
  // A conflicting code rolls back the backup update as well as the failed world write.
  const other = new GameWorld(); await store.save(other.serialize());
  const conflicting = { ...world.serialize(), code: other.code };
  await assert.rejects(store.save(conflicting), { code: '23505' });
  await store.pool.query('UPDATE worlds SET state = $1 WHERE id = $2', ['{corrupt', world.id]);
  assert.equal((await store.load(world.code)).players[0].xp, 42);
  assert.equal((await store.load(world.code)).monsters[0].hp, 17);
  assert.equal((await store.list(a))[0].code, world.code);
});

test('SQLite migration preserves heroes, codes and backup rows, is repeatable and refuses to overwrite cloud progress', options, async t => {
  const database = await isolatedDatabase(), store = await PostgresSaveStore.open(database.url);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'village-migrate-'));
  t.after(async () => { await store.close(); await database.close(); await rm(directory, { recursive: true, force: true }); });
  const filename = path.join(directory, 'world.sqlite'), sqlite = new SaveStore(filename);
  const id = sqlite.identity('m'.repeat(64)), world = new GameWorld();
  world.join(id, 'Миграция', 'sage', 'mage'); world.players.get(id).gold = 91;
  sqlite.save(world.serialize()); world.players.get(id).gold = 92; sqlite.save(world.serialize()); sqlite.close();
  const snapshot = readSqliteSnapshot(filename);
  assert.deepEqual(await importSqliteSnapshot(store, snapshot), { identities: 1, worlds: 1, skipped: 0 });
  assert.equal(await store.identity('m'.repeat(64)), id);
  assert.equal((await store.load(world.code)).players[0].gold, 92);
  assert.deepEqual(await importSqliteSnapshot(store, snapshot), { identities: 0, worlds: 0, skipped: 1 });
  world.players.get(id).gold = 101; await store.save(world.serialize());
  const earlier = new GameWorld();
  snapshot.worlds.unshift({ id: earlier.id, code: earlier.code, state: JSON.stringify(earlier.serialize()), checksum: (await import('../server/save-format.js')).checksum(JSON.stringify(earlier.serialize())), saved_at: new Date().toISOString() });
  await assert.rejects(importSqliteSnapshot(store, snapshot), /different progress/);
  assert.equal(await store.load(earlier.code), null); // Entire import rolled back.
  assert.equal((await store.load(world.code)).players[0].gold, 101);
});

const request = (socket, event, data) => new Promise((resolve, reject) => {
  const callback = (error, result) => error ? reject(error) : resolve(result);
  if (data === undefined) socket.timeout(10000).emit(event, callback);
  else socket.timeout(10000).emit(event, data, callback);
});
async function connect(port, token) {
  const socket = io(`http://127.0.0.1:${port}`, { auth: { token: token.repeat(64) }, transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}

test('PostgreSQL network: simultaneous joins share one world, two heroes survive shutdown, and the world pauses offline', options, async t => {
  const database = await isolatedDatabase(), url = database.url;
  let server, a, b;
  t.after(async () => { a?.disconnect(); b?.disconnect(); await server?.close(); await database.close(); });
  server = await createGameServer({ databaseUrl: url });
  let { port } = await server.listen(0, '127.0.0.1');
  a = await connect(port, 'p');
  const created = await request(a, 'world:enter', { mode: 'create', name: 'Первый', classId: 'mage' });
  assert.equal(created.ok, true);
  const world = server.worlds.get(created.state.id), hero = world.players.get(created.playerId);
  hero.gold = 71; hero.quests.wolves = { status: 'active', progress: 3 };
  world.survival.clockMs = 4 * CYCLE_MS + SURVIVAL.dayMs + 100;
  world.village.hp = 644;
  assert.equal((await request(a, 'world:save')).ok, true);
  a.disconnect(); await server.close();
  const before = await PostgresSaveStore.open(url);
  const paused = (await before.load(world.code)).elapsed; await before.close();
  server = await createGameServer({ databaseUrl: url }); ({ port } = await server.listen(0, '127.0.0.1'));
  a = await connect(port, 'p'); b = await connect(port, 'q');
  const restored = await Promise.all([
    request(a, 'world:enter', { mode: 'join', code: world.code, name: 'Первый' }),
    request(b, 'world:enter', { mode: 'join', code: world.code, name: 'Второй', classId: 'archer' }),
  ]);
  assert.ok(restored.every(result => result.ok)); assert.equal(server.worlds.size, 1);
  const shared = server.worlds.get(world.id); assert.equal(shared.players.size, 2);
  assert.equal(shared.players.get(hero.id).gold, 71); assert.equal(shared.players.get(hero.id).classId, 'mage');
  assert.equal(shared.players.get(hero.id).quests.wolves.progress, 3); assert.ok(shared.elapsed >= paused);
  assert.equal(shared.village.hp, 644);
  const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json(); assert.equal(health.storage, 'postgresql');
  // Shutdown must flush the final snapshot, even when another write is in flight.
  shared.players.get(hero.id).gold = 99;
  // Disconnect deliberately rejects an outstanding acknowledgement. Handle it immediately:
  // a remote database can still be writing when the client closes its socket.
  const saving = request(a, 'world:save').catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 5));
  a.disconnect(); b.disconnect(); await server.close(); await saving;
  const verified = await PostgresSaveStore.open(url);
  const saved = await verified.load(world.code); await verified.close();
  assert.equal(saved.players.find(player => player.id === hero.id).gold, 99);
  assert.equal(saved.players.length, 2);
});

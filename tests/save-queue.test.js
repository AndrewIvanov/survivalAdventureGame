import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveQueue } from '../server/save-queue.js';
import { openStore } from '../server/open-store.js';

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test('slow writes retain immutable snapshots, coalesce pending saves, and acknowledge only committed progress', async () => {
  const writes = [], commits = [];
  const store = { save(snapshot) { writes.push(snapshot); return new Promise(resolve => commits.push(resolve)); } };
  const world = { id: 'world', criticalSave: true, inventory: { gold: 1 }, serialize() { return { id: this.id, inventory: this.inventory }; } };
  const queue = new SaveQueue(store);
  const first = queue.save(world);
  world.inventory.gold = 2; world.criticalSave = true;
  const second = queue.save(world);
  world.inventory.gold = 3;
  const third = queue.save(world);
  assert.equal(writes.length, 1); assert.equal(writes[0].inventory.gold, 1);
  assert.equal(queue.canAutosave(world), false);
  let acknowledged = false; third.then(() => { acknowledged = true; });
  commits.shift()('first'); assert.equal(await first, true);
  await nextTurn(); assert.equal(writes.length, 2); assert.equal(writes[1].inventory.gold, 3);
  assert.equal(acknowledged, false);
  // A change during the write must not be cleared when that write completes.
  world.inventory.gold = 4; world.criticalSave = true;
  commits.shift()('last'); assert.deepEqual(await Promise.all([second, third]), [true, true]);
  await queue.flush(); assert.equal(world.savedAt, 'last'); assert.equal(world.criticalSave, true);
  assert.equal(queue.busy(world), false);
});

test('failed writes retain dirty progress, back off autosaves, and allow a successful retry', async () => {
  let fail = true, errors = 0;
  const queue = new SaveQueue({ save() { if (fail) throw new Error('offline'); return 'saved'; } }, () => { errors++; });
  const world = { id: 'world', criticalSave: true, serialize() { return { id: this.id }; } };
  assert.equal(await queue.save(world), false);
  assert.equal(errors, 1); assert.equal(world.criticalSave, true); assert.equal(queue.canAutosave(world), false);
  fail = false;
  assert.equal(await queue.save(world), true); assert.equal(world.savedAt, 'saved');
  assert.equal(world.criticalSave, false); assert.equal(queue.canAutosave(world), true);
});

test('Render refuses an ephemeral SQLite fallback when DATABASE_URL is missing', async () => {
  await assert.rejects(openStore({ database: ':memory:', requirePostgres: true }), /DATABASE_URL is required/);
});

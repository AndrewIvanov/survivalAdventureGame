import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnMonster } from '../server/spawns.js';
import { SURVIVAL } from '../shared/survival.js';
import { updateMonsters } from '../server/ai.js';
import { GameWorld } from '../server/world.js';
import { WORLD, PLAYER, MONSTERS, distance } from '../shared/config.js';
import { canStand, createMap } from '../shared/map.js';
import { attack, hurtPlayer } from '../server/combat.js';
import { SaveStore } from '../server/persistence.js';

function combatWorld() {
  const world = new GameWorld();
  world.survival.clockMs = SURVIVAL.dayMs; world.survival.lastNight = 1;
  spawnMonster(world, 'wolf', 2100, 1152); return world;
}

test('deterministic nonempty map, valid spawn and monster homes', () => {
  assert.deepEqual(createMap(42), createMap(42));
  const world = new GameWorld();
  assert.ok(world.map.trees.length > 300);
  assert.ok(canStand(WORLD.spawn.x, WORLD.spawn.y, world.grid));
  for (const m of world.monsters) assert.ok(canStand(m.x, m.y, world.grid, 12), m.id);
});

test('movement is normalized and ignores client positions, stale inputs stop movement', () => {
  const world = new GameWorld(); const p = world.join('a', 'Hero', 'ranger');
  const original = { x: p.x, y: p.y };
  world.input(p.id, { x: 10000, y: 10000, angle: 0, worldX: 0, hp: 9999 }, 1000);
  world.tick(.05, 1000);
  assert.ok(distance(original, p) <= PLAYER.speed * .05 + .01);
  assert.equal(p.hp, PLAYER.maxHp);
  const moved = { x: p.x, y: p.y };
  world.tick(.05, 2000);
  assert.equal(distance(moved, p), 0);
  world.input(p.id, { x: NaN, y: 0, angle: 0 });
  assert.ok(Number.isFinite(p.x));
});

test('collisions stop movement and dashes cannot cross walls', () => {
  const world = new GameWorld(); const p = world.join('a', 'Hero', 'ranger');
  p.x = 1536; p.y = 1200;
  world.move(p, 0, -180);
  assert.ok(p.y >= 1189);
  assert.ok(canStand(p.x, p.y, world.grid));
});

test('shared enemy damage, attack cooldown, team experience and no double rewards', () => {
  const world = combatWorld(); const a = world.join('a', 'A', 'ranger'), b = world.join('b', 'B', 'sage');
  world.monsters = [{ ...world.monsters[0], x: a.x + 45, y: a.y, hp: 48, maxHp: 64 }];
  a.angle = 0; b.x = a.x + 10; b.y = a.y + 20;
  world.random = () => .5;
  attack(world, a);
  assert.equal(world.monsters[0].hp, 24);
  attack(world, a);
  assert.equal(world.monsters[0].hp, 24);
  world.elapsed += PLAYER.attackCooldown;
  attack(world, a);
  assert.equal(world.monsters[0].hp, 0);
  assert.equal(a.xp, MONSTERS.wolf.xp); assert.equal(b.xp, MONSTERS.wolf.xp);
  assert.equal(world.kills, 1); assert.equal(world.criticalSave, true);
  world.elapsed += PLAYER.attackCooldown; attack(world, b);
  assert.equal(world.kills, 1); assert.equal(a.gold, MONSTERS.wolf.gold);
});

test('attacks check direction and range and grant levels', () => {
  const world = combatWorld(), p = world.join('a', 'A', 'ranger');
  world.random = () => .5;
  const m = world.monsters[0]; m.x = p.x + 40; m.y = p.y; m.hp = 24;
  p.angle = Math.PI; attack(world, p); assert.equal(m.hp, 24);
  world.elapsed += 500; p.angle = 0; p.xp = 70; attack(world, p);
  assert.equal(p.level, 2); assert.equal(p.xp, 14); assert.equal(p.maxHp, 132);
});

test('death respawns in village; world pauses with no connected heroes', () => {
  const world = combatWorld(), p = world.join('a', 'A', 'ranger');
  p.hp = 1; const m = world.monsters[0]; hurtPlayer(world, m, p);
  assert.equal(p.hp, 0); assert.equal(p.respawnAt, PLAYER.respawnDelay);
  for (let i = 0; i < 101; i++) world.tick(.05);
  assert.equal(p.hp, p.maxHp); assert.equal(p.x, WORLD.spawn.x);
  world.leave('a'); const elapsed = world.elapsed;
  world.tick(1); assert.equal(world.elapsed, elapsed);
});

test('monsters pursue heroes across the map, including the village, without a home leash', () => {
  const world = combatWorld(), p = world.join('a', 'A', 'ranger'), monster = world.monsters[0];
  p.x = WORLD.spawn.x; p.y = WORLD.spawn.y;
  monster.x = 2500; monster.y = 1152;
  updateMonsters(world, .05); assert.equal(monster.state, 'chase'); assert.equal(monster.targetId, p.id);
  monster.x = p.x + 40; monster.y = p.y;
  updateMonsters(world, .05); assert.equal(monster.targetId, p.id);
  p.hp = 0; updateMonsters(world, .05); assert.equal(monster.state, 'roam');
});

test('SQLite transaction saves both heroes and enemies, identity is separate from world, corrupted snapshot recovers', () => {
  const store = new SaveStore(':memory:');
  const token = 'secure-token-'.repeat(5), id = store.identity(token);
  assert.equal(store.identity(token), id);
  const world = combatWorld(); const p = world.join(id, 'A', 'ranger');
  p.xp = 42; world.monsters[0].hp = 17; store.save(world.serialize());
  p.xp = 60; store.save(world.serialize());
  assert.equal(store.load(world.code).players[0].xp, 60);
  store.db.prepare('UPDATE worlds SET state = ? WHERE code = ?').run('{corrupt', world.code);
  assert.equal(store.load(world.code).players[0].xp, 42);
  assert.equal(store.load(world.code).monsters[0].hp, 17);
  store.close();
});

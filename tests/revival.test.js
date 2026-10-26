import test from 'node:test';
import assert from 'node:assert/strict';
import { GameWorld } from '../server/world.js';
import { damagePlayer } from '../server/combat.js';
import { rpgAction } from '../server/rpg.js';
import { carryGravestone } from '../server/revival.js';
import { beginNight, endWave } from '../server/survival.js';
import { SaveStore } from '../server/persistence.js';
import { REVIVAL } from '../shared/revival.js';
import { canStand } from '../shared/map.js';

function setup() {
  const world = new GameWorld(), a = world.join('a', 'Альфа', 'ranger'), b = world.join('b', 'Бета', 'sage');
  return { world, a, b };
}
const kill = (world, player) => { player.invulnerableUntil = 0; damagePlayer(world, { kind: 'wolf' }, player, 99999); };
const carry = (world, player, grave) => rpgAction(world, player, { type: 'grave:carry', graveId: grave.id });

test('death leaves exactly one gravestone at the death position and never revives on a timer', () => {
  const { world, a } = setup(); const position = { x: a.x, y: a.y };
  kill(world, a); kill(world, a);
  assert.equal(world.gravestones.length, 1);
  assert.deepEqual({ x: world.gravestones[0].x, y: world.gravestones[0].y }, position);
  assert.equal(world.gravestones[0].playerId, a.id); assert.equal(world.gravestones[0].carrierId, null);
  world.tick(60); assert.equal(a.hp, 0); assert.equal(world.gravestones.length, 1);
  world.input(a.id, { x: 1, y: 0, angle: 0 }); world.dash(a.id); world.tick(.05);
  assert.equal(a.x, position.x); assert.equal(a.y, position.y); assert.equal(world.gameOver, null);
});

test('only a nearby living teammate can carry a grave; arrival at the altar revives once with intact progress', () => {
  const { world, a, b } = setup(); a.gold = 87; a.xp = 12;
  const items = structuredClone(a.inventory); kill(world, a); const grave = world.gravestones[0];
  assert.throws(() => carry(world, a, grave));
  assert.throws(() => carryGravestone(world, { ...b }, grave.id));
  b.x += 500; assert.throws(() => carry(world, b, grave), /ближе/);
  b.x = grave.x; b.y = grave.y; carry(world, b, grave);
  assert.equal(grave.carrierId, b.id); assert.throws(() => carry(world, b, grave));
  world.tick(5); assert.equal(a.hp, 0);
  Object.assign(b, { x: REVIVAL.altar.x + REVIVAL.altarRange + 2, y: REVIVAL.altar.y });
  world.tick(.05); assert.equal(a.hp, 0);
  Object.assign(b, REVIVAL.altar, { id: 'b' }); world.tick(.05);
  assert.equal(a.hp, a.maxHp); assert.equal(a.mana, a.maxMana);
  assert.equal(a.x, REVIVAL.altar.x); assert.equal(a.y, REVIVAL.altar.y);
  assert.ok(canStand(a.x, a.y, world.grid)); assert.ok(a.invulnerableUntil > world.elapsed);
  assert.deepEqual(a.inventory, items); assert.equal(a.gold, 87); assert.equal(a.xp, 12);
  assert.equal(world.gravestones.length, 0); assert.throws(() => carry(world, b, grave));
  world.tick(1); assert.equal(world.events.filter(e => e.type === 'respawn').length, 1);
});

test('carrier death drops the carried stone and leaves their own; full party defeat remains permanent', () => {
  const { world, a, b } = setup(); kill(world, a); const grave = world.gravestones[0];
  carry(world, b, grave); b.x += 90; b.y += 30; kill(world, b);
  assert.equal(world.gravestones.length, 2); assert.ok(world.gravestones.every(g => !g.carrierId));
  for (const g of world.gravestones) { assert.equal(g.x, b.x); assert.equal(g.y, b.y); }
  assert.ok(world.gameOver); world.tick(60); assert.equal(a.hp, 0); assert.equal(b.hp, 0);
  const restored = new GameWorld(world.serialize()); assert.deepEqual(restored.gameOver, world.gameOver);
  assert.equal(restored.gravestones.length, 2);
});

test('stones survive saves, crashes and disconnects, and an offline fallen hero can be rescued', () => {
  const { world, a, b } = setup(); kill(world, a); const grave = world.gravestones[0]; carry(world, b, grave);
  b.x += 50; b.y += 20; world.tick(.05);
  const store = new SaveStore(':memory:'); store.save(world.serialize());
  const restored = new GameWorld(store.load(world.code)); store.close();
  assert.equal(restored.gravestones[0].id, grave.id); assert.equal(restored.gravestones[0].carrierId, null);
  assert.equal(restored.gravestones[0].x, b.x); assert.equal(restored.players.get(a.id).hp, 0);
  restored.join(a.id, 'Альфа', 'ranger'); const clock = restored.survival.clockMs;
  restored.tick(60); assert.equal(restored.gameOver, null); assert.equal(restored.survival.clockMs, clock);
  const carrier = restored.join(b.id, 'Бета', 'sage'); carry(restored, carrier, restored.gravestones[0]);
  restored.leave(a.id); restored.leave(b.id);
  assert.equal(restored.gravestones[0].carrierId, null); assert.equal(restored.gameOver, null);
  restored.join(b.id, 'Бета', 'sage'); carry(restored, carrier, restored.gravestones[0]);
  carrier.x = REVIVAL.altar.x; carrier.y = REVIVAL.altar.y; restored.tick(.05);
  assert.equal(restored.players.get(a.id).hp, restored.players.get(a.id).maxHp);
  assert.equal(restored.players.get(a.id).online, false);
  assert.ok(restored.join(a.id, 'Альфа', 'ranger').hp > 0);
});

test('night rewards and level-ups cannot revive a dead hero without returning the stone', () => {
  const { world, a } = setup(); beginNight(world, 1); a.xp = 79; kill(world, a);
  endWave(world, 'survived'); assert.equal(a.level, 2); assert.equal(a.hp, 0);
  assert.equal(world.gravestones.length, 1);
});

test('old dead heroes receive a stone once and the tavern becomes the altar without resetting the world', () => {
  const { world, a } = setup(); const saved = world.serialize(); saved.version = 4; delete saved.gravestones;
  saved.players[0].hp = 0; saved.players[0].respawnAt = 5000; saved.village.buildings[0] = 'tavern';
  const restored = new GameWorld(saved);
  assert.equal(restored.gravestones.length, 1); assert.equal(restored.gravestones[0].playerId, a.id);
  assert.equal(restored.players.get(a.id).hp, 0); assert.equal(restored.players.get(a.id).respawnAt, undefined);
  assert.ok(restored.village.buildings.includes('altar')); assert.ok(!restored.village.buildings.includes('tavern'));
  assert.equal(restored.survival.clockMs, saved.survival.clockMs);
  assert.equal(new GameWorld(restored.serialize()).gravestones.length, 1);
});

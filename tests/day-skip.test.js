import test from 'node:test';
import assert from 'node:assert/strict';
import { GameWorld } from '../server/world.js';
import { rpgAction } from '../server/rpg.js';
import { castAbility } from '../server/abilities.js';
import { skipDay, updateSurvival } from '../server/survival.js';
import { spawnMonster } from '../server/spawns.js';
import { damagePlayer, damageMonster } from '../server/combat.js';
import { SURVIVAL, CYCLE_MS } from '../shared/survival.js';
import { MONSTERS, PLAYER } from '../shared/config.js';
import { SaveStore } from '../server/persistence.js';
import { REVIVAL } from '../shared/revival.js';

function setup() {
  const world = new GameWorld(), a = world.join('a', 'Воин', 'ranger');
  return { world, a };
}
const vote = (world, player, ready = true) => rpgAction(world, player, { type: 'day:skip', ready });

test('each new hero starts with 50 gold, with no extra payout on rejoin or load', () => {
  const { world, a } = setup(), b = world.join('b', 'Маг', 'sage');
  assert.equal(a.gold, 50); assert.equal(b.gold, 50);
  a.gold = 12; world.leave(a.id); world.join(a.id, 'A', 'ranger'); assert.equal(a.gold, 12);
  const restored = new GameWorld(world.serialize()), hero = restored.join(a.id, 'A', 'ranger');
  assert.equal(hero.gold, 12); assert.equal(restored.players.get(b.id).gold, 50);
});

test('solo skip starts the current night once, spawns the smaller wave and advances no simulation time or rewards', () => {
  const { world, a } = setup(); a.hp = 20; a.mana = 10; a.cooldowns.q = 4000;
  vote(world, a); const snapshot = world.snapshot(a.id);
  assert.equal(snapshot.survival.phase, 'night'); assert.equal(snapshot.survival.remaining, SURVIVAL.nightMs);
  assert.equal(snapshot.survival.wave.total, 40); assert.equal(snapshot.survival.wave.spawned, 5);
  assert.equal(world.elapsed, 0); assert.equal(a.hp, 20); assert.equal(a.gold, 50); assert.equal(a.cooldowns.q, 4000);
  assert.equal(world.events.filter(e => e.type === 'night-start').length, 1);
  assert.throws(() => vote(world, a), /ночь/); assert.equal(world.survival.wave.spawned, 5);
});

test('two online heroes must both agree; votes can be cancelled and duplicate acknowledgements do not count twice', () => {
  const { world, a } = setup(), b = world.join('b', 'Друг', 'sage');
  vote(world, a); vote(world, a);
  assert.equal(world.snapshot().survival.phase, 'day'); assert.deepEqual(world.snapshot().survival.skipDayVotes, [a.id]);
  vote(world, a, false); assert.equal(world.daySkipVotes.size, 0);
  vote(world, b); assert.equal(world.snapshot().survival.phase, 'day'); vote(world, a);
  assert.equal(world.snapshot().survival.phase, 'night'); assert.equal(world.survival.wave.total, 40);
  assert.equal(world.daySkipVotes.size, 0);
});

test('joining, disconnecting, loading and natural nightfall clear previous day readiness', () => {
  const { world, a } = setup(), b = world.join('b', 'Друг', 'sage');
  vote(world, a); world.leave(b.id); assert.equal(world.daySkipVotes.size, 0);
  assert.equal(world.snapshot().survival.phase, 'day'); world.join(b.id, 'Друг', 'sage'); vote(world, a);
  const restored = new GameWorld(world.serialize()); assert.equal(restored.daySkipVotes.size, 0);
  world.survival.clockMs = SURVIVAL.dayMs - 50; world.tick(.05); assert.equal(world.daySkipVotes.size, 0);
  world.survival.clockMs = CYCLE_MS; assert.deepEqual(world.snapshot().survival.skipDayVotes, []);
});

test('dead, offline and forged heroes cannot cast day votes', () => {
  const { world, a } = setup(); a.hp = 0;
  assert.throws(() => vote(world, a)); a.hp = 10; a.online = false; assert.throws(() => vote(world, a));
  a.online = true; assert.throws(() => skipDay(world, { ...a, id: 'forged' })); assert.throws(() => vote(world, a, 'yes'));
  assert.equal(world.daySkipVotes.size, 0);
});

test('rebalance migrates current monsters exactly once, retains wound percentage, gold and calendar', () => {
  const { world, a } = setup(); vote(world, a);
  const saved = world.serialize(); saved.survival.rulesVersion = 2; saved.survival.wave.total = 100;
  const monster = saved.monsters[0]; monster.hp = 80; monster.maxHp = 320; monster.damage = 45;
  const restored = new GameWorld(saved), migrated = restored.monsters.find(m => m.id === monster.id);
  assert.equal(migrated.hp, 32); assert.equal(migrated.maxHp, 128); assert.equal(migrated.damage, 18);
  assert.equal(restored.survival.wave.total, 40); assert.equal(restored.survival.clockMs, saved.survival.clockMs);
  assert.equal(restored.players.get(a.id).gold, a.gold);
  const again = new GameWorld(restored.serialize()); assert.equal(again.monsters.find(m => m.id === monster.id).maxHp, 128);
});

test('rebalance retires excess slots from a fully spawned wave without granting rewards', () => {
  const { world, a } = setup(); vote(world, a);
  const saved = world.serialize(); saved.survival.rulesVersion = 2; saved.survival.wave.total = saved.survival.wave.spawned = 100;
  saved.monsters = Array.from({ length: 100 }, (_, i) => ({ ...saved.monsters[0], id: `old-${i}` }));
  const restored = new GameWorld(saved);
  assert.equal(restored.survival.wave.total, 40); assert.equal(restored.survival.wave.spawned, 40);
  assert.equal(restored.monsters.length, 40); assert.equal(restored.kills, 0); assert.equal(restored.players.get(a.id).gold, 50);
});

test('solo death permanently ends the world instead of respawning; reconnect cannot revive it', () => {
  const { world, a } = setup(), monster = spawnMonster(world, 'wolf', a.x + 30, a.y);
  damagePlayer(world, monster, a, 9999); assert.ok(world.gameOver); assert.equal(a.hp, 0);
  const elapsed = world.elapsed, clock = world.survival.clockMs; world.tick(30);
  assert.equal(a.hp, 0); assert.equal(world.elapsed, elapsed); assert.equal(world.survival.clockMs, clock);
  assert.throws(() => vote(world, a), /завершена/);
  assert.throws(() => castAbility(world, a, { key: 'q', x: 0, y: 0 }), /завершена/);
  world.leave(a.id); const hero = world.join(a.id, 'A', 'ranger'); assert.equal(hero.hp, 0); assert.ok(world.snapshot().gameOver);
  const saved = world.serialize(), store = new SaveStore(':memory:'); store.save(saved);
  const restored = new GameWorld(store.load(world.code)); restored.join(a.id, 'A', 'ranger'); restored.tick(30);
  assert.deepEqual(restored.gameOver, world.gameOver); assert.equal(restored.players.get(a.id).hp, 0); store.close();
  const newWorld = new GameWorld(), fresh = newWorld.join(a.id, 'A', 'ranger');
  assert.equal(newWorld.gameOver, null); assert.equal(fresh.gold, 50); assert.equal(fresh.hp, PLAYER.maxHp);
});

test('a fallen hero needs their stone returned to the altar; full party defeat ends the game only once', () => {
  const { world, a } = setup(), b = world.join('b', 'Друг', 'sage');
  const monster = spawnMonster(world, 'wolf', 2300, 1152); damagePlayer(world, monster, a, 9999);
  assert.equal(world.gameOver, null); world.tick(5.05); assert.equal(a.hp, 0);
  rpgAction(world, b, { type: 'grave:carry', graveId: world.gravestones[0].id });
  b.x = REVIVAL.altar.x; b.y = REVIVAL.altar.y; world.tick(.05); assert.equal(a.hp, a.maxHp);
  a.invulnerableUntil = 0; damagePlayer(world, monster, a, 9999); damagePlayer(world, monster, b, 9999);
  assert.ok(world.gameOver); world.tick(30); assert.equal(a.hp, 0); assert.equal(b.hp, 0);
  assert.equal(world.events.filter(e => e.type === 'game-over').length, 1);
  const hp = monster.hp; damageMonster(world, a, monster, 9999); assert.equal(monster.hp, hp);
});

test('a living offline teammate can return to rescue the fallen hero; shutdown does not cause defeat', () => {
  const { world, a } = setup(), b = world.join('b', 'Друг', 'sage'), monster = spawnMonster(world, 'wolf', 2300, 1152);
  world.leave(b.id); damagePlayer(world, monster, a, 9999); assert.equal(world.gameOver, null);
  const clock = world.survival.clockMs; world.tick(30); assert.equal(world.survival.clockMs, clock);
  world.join(b.id, 'Друг', 'sage'); assert.equal(world.gameOver, null);
  const other = setup(), ally = other.world.join('b', 'Друг', 'sage'); other.a.hp = 0;
  other.world.leave(ally.id, { checkDefeat: false }); other.world.leave(other.a.id, { checkDefeat: false });
  assert.equal(other.world.gameOver, null);
});

test('40 enemies arrive gradually for either party size in five-creature groups throughout the entire night', () => {
  for (const party of [1, 2]) {
    const { world, a } = setup();
    const b = party === 2 ? world.join('b', 'Друг', 'sage') : null;
    vote(world, a); if (b) vote(world, b);
    const total = 40;
    assert.equal(world.survival.wave.spawned, 5); assert.equal(world.monsters.length, 5);
    for (let i = 1; i <= 2399; i++) {
      const before = world.survival.wave.spawned;
      world.elapsed += 50; updateSurvival(world, .05);
      assert.ok(world.survival.wave.spawned - before <= 5);
      if ([600, 1200, 1800].includes(i)) {
        const expected = total * (i * 50 / SURVIVAL.nightMs);
        assert.ok(world.survival.wave.spawned >= expected);
        assert.ok(world.survival.wave.spawned <= expected + 5);
      }
      if (i === 2000) assert.ok(world.survival.wave.spawned < total, 'the complete wave must not arrive early');
    }
    assert.equal(world.survival.wave.spawned, total); assert.equal(world.monsters.length, total);
    world.elapsed += 50; updateSurvival(world, .05);
    assert.equal(world.snapshot().survival.phase, 'day'); assert.equal(world.monsters.length, 0);
  }
});

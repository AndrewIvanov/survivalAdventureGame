import test from 'node:test';
import assert from 'node:assert/strict';
import { GameWorld } from '../server/world.js';
import { rpgAction } from '../server/rpg.js';
import { castAbility } from '../server/abilities.js';
import { damageMonster, damagePlayer, attack, updateProjectiles } from '../server/combat.js';
import { spawnMonster } from '../server/spawns.js';
import { refreshStats } from '../server/inventory.js';
import { updateProfessions } from '../server/professions.js';
import { updateMonsters } from '../server/ai.js';
import { PROFESSIONS, skillScale } from '../shared/professions.js';

function setup(classId, profession = null) {
  const world = new GameWorld(), hero = world.join('a', 'Герой', 'ranger', classId);
  hero.level = 10; hero.skillPoints = 200; refreshStats(hero, true); world.random = () => .99;
  if (profession) rpgAction(world, hero, { type: 'profession', professionId: profession });
  return { world, hero };
}
function enemy(world, hero, hp = 10000) { const m = spawnMonster(world, 'wolf', hero.x + 50, hero.y); Object.assign(m, { x: hero.x + 50, y: hero.y, hp, maxHp: hp }); return m; }
const cast = (world, hero, key = 't', target = hero) => castAbility(world, hero, { key, x: target.x, y: target.y });

test('profession selection checks class and level, and cannot be changed or used before unlocking', () => {
  const { world, hero } = setup('mage'); hero.level = 9;
  assert.throws(() => rpgAction(world, hero, { type: 'profession', professionId: 'healer' })); assert.throws(() => cast(world, hero));
  hero.level = 10; assert.throws(() => rpgAction(world, hero, { type: 'profession', professionId: 'assassin' }));
  rpgAction(world, hero, { type: 'profession', professionId: 'healer' });
  assert.throws(() => rpgAction(world, hero, { type: 'profession', professionId: 'fire' }));
  const restored = new GameWorld(world.serialize()); assert.equal(restored.players.get(hero.id).profession, 'healer');
});

test('all skills reach rank 100 in small steps, reject forged bulk upgrades and preserve old ranks once', () => {
  const { world, hero } = setup('warrior', 'squire');
  for (let i = 0; i < 9; i++) rpgAction(world, hero, { type: 'skill', key: 'q', count: 10 });
  rpgAction(world, hero, { type: 'skill', key: 'q', count: 9 }); assert.equal(hero.abilityRanks.q, 100); assert.equal(skillScale(100), 1.99);
  const points = hero.skillPoints; assert.throws(() => rpgAction(world, hero, { type: 'skill', key: 'q' })); assert.equal(hero.skillPoints, points);
  for (const count of [0, -1, 11, 1.5, '10']) assert.throws(() => rpgAction(world, hero, { type: 'skill', key: 'e', count }));
  hero.skillPoints = 0; assert.throws(() => rpgAction(world, hero, { type: 'skill', key: 't' }));
  const saved = world.serialize(); delete saved.players[0].progressionVersion; saved.players[0].abilityRanks = { q: 2, e: 3, r: 2 }; saved.players[0].skillPoints = 7;
  const restored = new GameWorld(saved), p = restored.players.get(hero.id);
  assert.deepEqual(p.abilityRanks, { q: 21, e: 41, r: 41 }); assert.equal(p.skillPoints, 25);
  const again = new GameWorld(restored.serialize()).players.get(hero.id); assert.deepEqual(again.abilityRanks, p.abilityRanks); assert.equal(again.skillPoints, 25);
});

test('healer restores nearby living allies without bypassing gravestone resurrection', () => {
  const { world, hero } = setup('mage', 'healer'), friend = world.join('b', 'Друг', 'sage');
  hero.hp = 20; friend.hp = 20; cast(world, hero); assert.ok(hero.hp > 20); assert.ok(friend.hp > 20);
  damagePlayer(world, { kind: 'wolf' }, friend, 99999); const graveId = world.gravestones[0].id;
  world.elapsed = 15000; hero.mana = hero.maxMana; cast(world, hero);
  assert.equal(friend.hp, 0); assert.equal(world.gravestones[0].id, graveId);
});

test('fire damage burns over time, does not stack itself and ends after six ticks', () => {
  const { world, hero } = setup('mage', 'fire'), m = enemy(world, hero);
  damageMonster(world, hero, m, 1); const hp = m.hp;
  for (let i = 1; i <= 6; i++) { world.elapsed = i * 500; updateProfessions(world, .5); }
  assert.ok(m.hp < hp); assert.equal(m.burn, null); const after = m.hp;
  world.elapsed += 5000; updateProfessions(world, 5); assert.equal(m.hp, after);
});

test('ice has a chance to freeze on attack and the active spell freezes targets in place', () => {
  const { world, hero } = setup('mage', 'ice'), m = enemy(world, hero); world.random = () => 0;
  damageMonster(world, hero, m, 1); assert.ok(m.frozenUntil > world.elapsed);
  const x = m.x, y = m.y; updateMonsters(world, .2); assert.equal(m.x, x); assert.equal(m.y, y);
  world.elapsed = 2000; cast(world, hero, 't', m); assert.ok(m.frozenUntil > world.elapsed);
  world.elapsed = m.frozenUntil + 1; updateMonsters(world, .1); assert.ok(Math.hypot(m.x - x, m.y - y) > 0);
});

test('dark archer summons 1–4 temporary skeletons based on arrow rank; allied kills cannot create a chain', () => {
  const { world, hero } = setup('archer', 'dark');
  cast(world, hero); assert.equal(world.allies.length, 1);
  damageMonster(world, hero, enemy(world, hero, 1), 10); assert.equal(world.allies.length, 1);
  hero.abilityRanks.q = 26; damageMonster(world, hero, enemy(world, hero, 1), 10); assert.equal(world.allies.length, 2);
  hero.abilityRanks.q = 76;
  damageMonster(world, hero, enemy(world, hero, 1), 10, { proc: false }); assert.equal(world.allies.length, 2);
  damageMonster(world, hero, enemy(world, hero, 1), 10); damageMonster(world, hero, enemy(world, hero, 1), 10); assert.equal(world.allies.length, 4);
  damageMonster(world, hero, enemy(world, hero, 1), 10); assert.equal(world.allies.length, 4);
  world.elapsed = 26000; updateProfessions(world, 1); assert.equal(world.allies.length, 0);
});

test('assassin loses enemy aggro in stealth and guarantees exactly the first hit as critical', () => {
  const { world, hero } = setup('archer', 'assassin'), m = enemy(world, hero);
  cast(world, hero); updateMonsters(world, .05); assert.equal(m.targetId, null);
  m.x = hero.x + 35; m.y = hero.y; attack(world, hero);
  assert.equal(hero.stealthUntil, 0); assert.equal(world.events.filter(e => e.type === 'hit').at(-1).critical, true);
  world.elapsed += 700; attack(world, hero); assert.equal(world.events.filter(e => e.type === 'hit').at(-1).critical, false);
});

test('sniper arrow reaches a distant target beyond normal range and hits a wider corridor', () => {
  const { world, hero } = setup('archer', 'sniper'); hero.x = 1700; hero.y = 1152;
  const m = enemy(world, hero); m.x = 2700; m.y = 1175;
  cast(world, hero, 't', { x: 2900, y: 1152 });
  const shot = world.projectiles[0]; assert.equal(shot.radius, 26); assert.equal(shot.remaining, 1400);
  for (let i = 0; i < 30; i++) updateProjectiles(world, .05);
  assert.ok(m.hp < m.maxHp);
});

test('aggressor reflects incoming enemy damage only while the shield is active', () => {
  const { world, hero } = setup('warrior', 'aggressor'), m = enemy(world, hero); cast(world, hero);
  const hp = m.hp; damagePlayer(world, m, hero, 20); assert.ok(m.hp < hp); assert.equal(hero.hp, hero.maxHp - 17);
  world.elapsed = 6001; const after = m.hp; damagePlayer(world, m, hero, 20); assert.equal(m.hp, after);
});

test('squire swords deal bounded periodic area damage and stop after their duration', () => {
  const { world, hero } = setup('warrior', 'squire'), m = enemy(world, hero); hero.professionRank = 76; cast(world, hero);
  updateProfessions(world, .05); const hp = m.hp; assert.ok(hp < m.maxHp);
  world.elapsed = 100; updateProfessions(world, .05); assert.equal(m.hp, hp);
  world.elapsed = 701; updateProfessions(world, .05); assert.ok(m.hp < hp);
  world.elapsed = 9000; const after = m.hp; updateProfessions(world, 1); assert.equal(m.hp, after);
});

test('brave heart gains health and regeneration with each rank, while the active spell restores health', () => {
  const { world, hero } = setup('warrior', 'braveheart'); const max = hero.maxHp; hero.hp = 100;
  rpgAction(world, hero, { type: 'skill', key: 't', count: 10 }); assert.ok(hero.maxHp > max); assert.equal(hero.hp, 100);
  updateProfessions(world, 1); assert.ok(hero.hp > 100); const hp = hero.hp; cast(world, hero); assert.ok(hero.hp > hp);
  damagePlayer(world, { kind: 'wolf' }, hero, 99999); updateProfessions(world, 10); assert.equal(hero.hp, 0);
});

test('all base and profession skills emit an animation event on every successful cast', () => {
  for (const [id, profession] of Object.entries(PROFESSIONS)) {
    const { world, hero } = setup(profession.classId, id);
    for (const key of ['q', 'e', 'r', 't']) { hero.mana = hero.maxMana; cast(world, hero, key); }
    assert.deepEqual(world.events.filter(e => e.type === 'ability-cast').map(e => e.key), ['q', 'e', 'r', 't']);
  }
});

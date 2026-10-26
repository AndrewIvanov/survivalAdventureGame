import test from 'node:test';
import assert from 'node:assert/strict';
import { GameWorld } from '../server/world.js';
import { SURVIVAL, CYCLE_MS, clockInfo, sheltered } from '../shared/survival.js';
import { beginNight, updateSurvival, resolveWave, survivalSnapshot } from '../server/survival.js';
import { spawnGuardian, summonGuardian, updateBosses } from '../server/boss.js';
import { spawnMonster } from '../server/spawns.js';
import { damageMonster } from '../server/combat.js';
import { updateMonsters } from '../server/ai.js';
import { rpgAction } from '../server/rpg.js';
import { SaveStore } from '../server/persistence.js';
import { WORLD, distance } from '../shared/config.js';

function setup() {
  const world = new GameWorld(); world.random = () => .5;
  const player = world.join('a', 'Защитник', 'ranger'); return { world, player };
}
function night(world, n = 1) {
  world.survival.clockMs = (n - 1) * CYCLE_MS + SURVIVAL.dayMs - 50;
  world.tick(.05);
}

test('seven-minute cycle has five-minute days and two-minute nights', () => {
  assert.equal(clockInfo(0).remaining, 300000);
  assert.equal(clockInfo(299999).phase, 'day'); assert.equal(clockInfo(300000).phase, 'night');
  assert.equal(clockInfo(300000).remaining, 120000); assert.equal(clockInfo(419999).nightNumber, 1);
  assert.equal(clockInfo(420000).day, 2); assert.equal(clockInfo(420000).phase, 'day');
  assert.equal(clockInfo(CYCLE_MS + SURVIVAL.dayMs).nightNumber, 2);
});

test('warning is emitted once; night starts exactly once; empty world pauses the clock and wave', () => {
  const { world, player } = setup(); world.survival.clockMs = SURVIVAL.dayMs - SURVIVAL.warningMs - 50;
  world.tick(.05); world.tick(.05);
  assert.equal(world.events.filter(e => e.type === 'night-warning').length, 1);
  night(world); assert.equal(world.survival.wave.night, 1);
  world.tick(.05); assert.equal(world.events.filter(e => e.type === 'night-start').length, 1);
  assert.equal(world.survival.wave.spawned, 5);
  world.leave(player.id); const clock = world.survival.clockMs, elapsed = world.elapsed;
  world.tick(200); assert.equal(world.survival.clockMs, clock); assert.equal(world.elapsed, elapsed);
});

test('waves grow stronger, include night enemies, and every third night spawns one boss', () => {
  const { world } = setup(); night(world);
  const first = world.survival.wave.total, firstHp = world.monsters.find(m => m.raidNight === 1).maxHp;
  assert.ok(world.monsters.some(m => m.kind === 'nightstalker'));
  night(world, 3);
  assert.equal(world.survival.wave.total, first); assert.equal(world.survival.wave.bossRequired, true);
  assert.equal(world.monsters.filter(m => m.kind === 'guardian' && m.hp > 0).length, 1);
  assert.ok(world.monsters.find(m => m.raidNight === 3 && m.kind === 'wolf').maxHp > firstHp);
  world.tick(.05); assert.equal(world.monsters.filter(m => m.kind === 'guardian' && m.hp > 0).length, 1);
});

test('all raiders hunt heroes across the map and inside the village without attacking the fountain', () => {
  const { world, player } = setup(); night(world);
  const raider = world.monsters[0]; raider.x = SURVIVAL.core.x + 55; raider.y = SURVIVAL.core.y;
  player.x = 600; player.y = 1152;
  const hp = world.village.hp; updateMonsters(world, .05);
  assert.equal(world.village.hp, hp); assert.equal(raider.state, 'chase'); assert.equal(raider.targetId, player.id);
  player.x = WORLD.spawn.x; player.y = WORLD.spawn.y;
  updateMonsters(world, .05); assert.equal(raider.targetId, player.id);
});

test('village healing is disabled during a raid, enabled after dawn', () => {
  const { world, player } = setup(); player.hp = 60; night(world);
  assert.equal(sheltered(world, player), false);
  const hp = player.hp; world.tick(.05); assert.equal(player.hp, hp);
  world.survival.wave.spawned = world.survival.wave.total;
  for (const m of world.monsters.filter(m => m.raidId)) m.hp = 0;
  resolveWave(world); assert.equal(world.survival.wave.status, 'repelled');
  assert.equal(sheltered(world, player), false);
  world.survival.clockMs = CYCLE_MS - 50; world.tick(.05);
  assert.equal(sheltered(world, player), true); world.tick(.05); assert.ok(player.hp > hp);
});

test('victory grants one shared reward and quest progress, with no duplicate after reload', () => {
  const { world, player } = setup(); const friend = world.join('b', 'Напарник', 'sage');
  player.quests.defense = friend.quests.defense = { status: 'active', progress: 0 };
  night(world); world.survival.wave.spawned = world.survival.wave.total;
  for (const m of world.monsters.filter(m => m.raidId)) m.hp = 0;
  resolveWave(world); const gold = player.gold;
  assert.equal(gold, 15); assert.equal(friend.gold, 15); assert.equal(player.quests.defense.progress, 1);
  resolveWave(world); assert.equal(player.gold, gold);
  const restored = new GameWorld(world.serialize()); restored.join('a', 'A', 'ranger');
  resolveWave(restored); assert.equal(restored.players.get('a').gold, gold); assert.deepEqual(restored.survival.defendedNights, [1]);
});

test('dawn retreats remaining enemies without death rewards and repairs some village damage', () => {
  const { world, player } = setup(); night(world); world.village.hp = 300;
  const kills = world.kills; world.survival.clockMs = CYCLE_MS - 50;
  world.tick(.05); assert.equal(world.survival.wave.status, 'survived');
  assert.ok(world.village.hp > 300); assert.equal(world.kills, kills);
  assert.ok(!world.monsters.some(m => m.raidId && m.hp > 0)); assert.equal(player.gold, 15);
});

test('falling village ends the raid without resetting heroes; repair validates NPC, money and wave', () => {
  const { world, player } = setup(); player.gold = 50; player.xp = 33;
  night(world); world.village.hp = 0; resolveWave(world);
  assert.equal(world.survival.wave.status, 'failed'); assert.equal(player.xp, 33); assert.equal(player.gold, 50);
  player.x = 1588; player.y = 1260;
  assert.throws(() => rpgAction(world, player, { type: 'village:repair', npcId: 'elder' }));
  world.survival.clockMs = CYCLE_MS;
  rpgAction(world, player, { type: 'village:repair', npcId: 'elder' }); assert.equal(world.village.hp, 150); assert.equal(player.gold, 35);
  world.survival.wave.status = 'active';
  assert.throws(() => rpgAction(world, player, { type: 'village:repair', npcId: 'elder' }));
});

test('boss shrine checks distance, permits only one active boss and persists encounter', () => {
  const { world, player } = setup();
  assert.throws(() => summonGuardian(world, player));
  player.x = SURVIVAL.shrine.x; player.y = SURVIVAL.shrine.y;
  summonGuardian(world, player); assert.throws(() => summonGuardian(world, player));
  const boss = world.monsters.find(m => m.kind === 'guardian'); boss.hp -= 100;
  const restored = new GameWorld(world.serialize()); assert.equal(restored.monsters.find(m => m.id === boss.id).hp, boss.hp);
  assert.equal(survivalSnapshot(restored).guardianActive, true);
});

test('boss telegraphs damage after a delay; moving away and dash invulnerability avoid damage', () => {
  const { world, player } = setup(); player.x = 2180; player.y = 1152;
  const boss = spawnGuardian(world); boss.x = 2240; boss.y = 1152; boss.nextSpecialAt = 0;
  updateBosses(world, .05); assert.ok(boss.telegraph); const hp = player.hp;
  assert.equal(player.hp, hp);
  player.x = 2000; world.elapsed = boss.telegraph.resolveAt; updateBosses(world, .05); assert.equal(player.hp, hp);
  boss.nextSpecialAt = world.elapsed; player.x = 2180; updateBosses(world, .05);
  world.elapsed = boss.telegraph.resolveAt - 50; world.dash(player.id);
  world.elapsed += 50; updateBosses(world, .05); assert.equal(player.hp, hp);
  boss.nextSpecialAt = world.elapsed; updateBosses(world, .05);
  world.elapsed = boss.telegraph.resolveAt; updateBosses(world, .05); assert.ok(player.hp < hp);
});

test('boss changes phases without exceeding the fixed enemy budget', () => {
  const { world, player } = setup(); world.survival.clockMs = SURVIVAL.dayMs; player.x = 2180; player.y = 1152;
  const boss = spawnGuardian(world); boss.hp = boss.maxHp * .6; boss.nextSpecialAt = 999999;
  updateBosses(world, .05); assert.equal(boss.bossPhase, 2);
  assert.ok(!world.monsters.some(m => m.summonOwner === boss.id));
  boss.hp = boss.maxHp * .25; updateBosses(world, .05); assert.equal(boss.bossPhase, 3);
  assert.ok(world.monsters.filter(m => m.summonOwner === boss.id && m.hp > 0).length === 0);
});

test('overlapping root warnings damage each hero once per boss attack', () => {
  const { world, player } = setup(); const friend = world.join('b', 'Друг', 'sage');
  player.x = friend.x = 2180; player.y = friend.y = 1152;
  const boss = spawnGuardian(world); boss.nextSpecialAt = 99999;
  boss.telegraph = { kind: 'roots', startedAt: 0, resolveAt: 1, circles: [{ x: 2180, y: 1152, radius: 80 }, { x: 2180, y: 1152, radius: 80 }] };
  player.hp = 1000; const hp = player.hp; world.elapsed = 1; updateBosses(world, .05);
  assert.equal(player.hp, hp - Math.max(1, Math.round(boss.damage * 1.15 - player.stats.armor)));
});

test('boss victory yields personal persistent epic weapons and cannot be duplicated or stolen', () => {
  const { world, player } = setup(); const friend = world.join('b', 'Друг', 'sage', 'mage');
  player.x = friend.x = 2180; player.y = friend.y = 1152;
  player.quests.guardian = { status: 'active', progress: 0 };
  const boss = spawnGuardian(world); damageMonster(world, player, boss, 99999);
  assert.equal(world.survival.guardianDefeated, true); assert.equal(player.quests.guardian.progress, 1);
  assert.equal(world.loot.filter(l => l.permanent).length, 2);
  const mine = world.loot.find(l => l.ownerId === player.id), theirs = world.loot.find(l => l.ownerId === friend.id);
  assert.equal(mine.item.rarity, 'epic'); assert.equal(theirs.item.baseId, 'staff');
  player.x = theirs.x; player.y = theirs.y;
  assert.throws(() => rpgAction(world, player, { type: 'pickup', lootId: theirs.id }));
  player.x = mine.x; player.y = mine.y; rpgAction(world, player, { type: 'pickup', lootId: mine.id });
  damageMonster(world, player, boss, 9999); assert.equal(world.loot.length, 1);
  const restored = new GameWorld(world.serialize()); const hero = restored.join('a', 'A', 'ranger');
  assert.ok(hero.inventory.some(i => i.id === mine.item.id)); assert.equal(restored.loot.length, 1);
  hero.x = SURVIVAL.shrine.x; hero.y = SURVIVAL.shrine.y; summonGuardian(restored, hero);
  assert.throws(() => summonGuardian(restored, hero));
});

test('SQLite restores clock, wave identity, pending boss attack and village health together', () => {
  const { world, player } = setup(); night(world, 3); world.village.hp = 418;
  const boss = world.monsters.find(m => m.kind === 'guardian'); boss.nextSpecialAt = 0; updateBosses(world, .05);
  const store = new SaveStore(':memory:'); store.save(world.serialize());
  const restored = new GameWorld(store.load(world.code));
  assert.equal(restored.village.hp, 418); assert.equal(restored.survival.clockMs, world.survival.clockMs);
  assert.equal(restored.survival.wave.id, world.survival.wave.id); assert.equal(restored.survival.wave.spawned, 5);
  assert.deepEqual(restored.monsters.find(m => m.id === boss.id).telegraph, boss.telegraph);
  restored.join(player.id, 'A', 'ranger'); restored.tick(.05);
  assert.equal(restored.monsters.filter(m => m.kind === 'guardian' && m.hp > 0).length, 1); store.close();
});

test('migration starts a fresh survival day while preserving heroes and removing daytime monsters', () => {
  const { world, player } = setup(); player.level = 9; player.gold = 432; world.elapsed = 9999999;
  const old = world.serialize(); old.version = 2; delete old.survival; delete old.village.hp; delete old.village.maxHp;
  const restored = new GameWorld(old); assert.equal(restored.survival.clockMs, 0); assert.equal(restored.village.hp, 900);
  assert.equal(restored.players.get(player.id).gold, 432); assert.equal(restored.players.get(player.id).level, 9);
  assert.equal(restored.monsters.length, old.monsters.length);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { GameWorld } from '../server/world.js';
import { spawnMonster } from '../server/spawns.js';
import { beginNight, updateSurvival, survivalSnapshot } from '../server/survival.js';
import { spawnGuardian, summonGuardian, updateBosses } from '../server/boss.js';
import { updateMonsters } from '../server/ai.js';
import { damageMonster } from '../server/combat.js';
import { rpgAction } from '../server/rpg.js';
import { makeItem, addItem } from '../server/inventory.js';
import { SURVIVAL, CYCLE_MS, clockInfo, nightStrength, waveSize } from '../shared/survival.js';
import { MONSTERS, distance } from '../shared/config.js';
import { ITEMS, NPCS, EQUIPMENT_SLOTS, effectiveStats, itemStats } from '../shared/rpg.js';

function setup() {
  const world = new GameWorld(); world.random = () => .9;
  const hero = world.join('hero', 'Следопыт', 'ranger'); return { world, hero };
}
function night(world, number) {
  world.monsters = []; world.survival.clockMs = (number - 1) * CYCLE_MS + SURVIVAL.dayMs;
  beginNight(world, number); updateSurvival(world, 0);
}

test('waves always contain 50 enemies, with a boss only on nights 3, 6, 9 and 12', () => {
  for (const party of [1, 2]) {
    const { world } = setup();
    if (party === 2) world.join('friend', 'Друг', 'sage');
    for (let n = 1; n <= 12; n++) {
      night(world, n);
      assert.equal(world.survival.wave.total, 50);
      assert.equal(world.survival.wave.bossRequired, n % 3 === 0);
      assert.equal(world.monsters.filter(m => m.kind === 'guardian').length, n % 3 === 0 ? 1 : 0);
    }
  }
  assert.equal(waveSize(399), 50, 'the wave never grows beyond 50');
});

test('older balance saves migrate once, resize waves and remove extra helpers without healing wounds', () => {
  const { world, hero } = setup(); night(world, 3); hero.gold = 123;
  const saved = world.serialize(); saved.survival.rulesVersion = 3;
  saved.survival.wave.total = saved.survival.wave.spawned = 130;
  const wolf = saved.monsters.find(m => m.kind === 'wolf');
  const boss = saved.monsters.find(m => m.kind === 'guardian');
  boss.hp = 1000; boss.maxHp = 4000; boss.damage = 60;
  saved.monsters = [boss, { ...wolf, id: 'helper', summonOwner: boss.id }, ...Array.from({ length: 130 }, (_, i) => ({ ...wolf, id: `wolf-${i}`, hp: 40, maxHp: 160, damage: 22.5 }))];
  const restored = new GameWorld(saved);
  assert.equal(restored.survival.rulesVersion, 5); assert.equal(restored.survival.wave.total, 50);
  assert.equal(restored.survival.wave.spawned, 50); assert.equal(restored.monsters.length, 51);
  const migrated = restored.monsters.find(m => m.id === boss.id);
  assert.equal(migrated.maxHp, 3200); assert.equal(migrated.hp, 800); assert.equal(migrated.damage, 48);
  assert.equal(restored.monsters.find(m => m.id === 'wolf-129').hp, 32);
  assert.ok(!restored.monsters.some(m => m.id === 'helper'));
  assert.equal(restored.kills, 0); assert.equal(restored.players.get(hero.id).gold, 123);
  assert.equal(restored.survival.clockMs, saved.survival.clockMs);
  const again = new GameWorld(restored.serialize());
  assert.deepEqual(again.monsters, restored.monsters);
  assert.equal(again.survival.wave.nextSpawnAt, restored.survival.wave.nextSpawnAt);
});

test('daylight has no ambient monsters; dawn removes all night creatures with no kill rewards', () => {
  const { world, hero } = setup(); assert.equal(world.monsters.length, 0);
  const old = world.serialize(); old.version = 3; delete old.survival.rulesVersion;
  old.monsters = [{ id: 'legacy-wolf', kind: 'wolf', hp: 64, maxHp: 64 }];
  const migrated = new GameWorld(old); assert.equal(migrated.monsters.length, 0);
  night(world, 1); const boss = spawnGuardian(world); const kills = world.kills;
  spawnMonster(world, 'nightstalker', 2200, 1152, { summonOwner: boss.id });
  world.survival.clockMs = CYCLE_MS - 50; world.tick(.05);
  assert.ok(world.monsters.every(m => m.obelisk)); assert.equal(world.monsters.length, 1);
  assert.equal(world.monsters[0].id, boss.id); assert.equal(world.kills, kills);
  assert.equal(hero.gold, 15);
  world.tick(60); assert.ok(world.monsters.every(m => m.obelisk));
});

test('first two nights have 50 enemies and retain the existing HP and damage', () => {
  const { world } = setup(); night(world, 1);
  assert.equal(world.survival.wave.total, 50); assert.equal(world.survival.wave.spawned, 5);
  const wolf = world.monsters.find(m => m.kind === 'wolf');
  assert.equal(wolf.maxHp, 128); assert.equal(wolf.damage, 18);
  world.join('friend', 'Друг', 'sage'); night(world, 2);
  assert.equal(world.survival.wave.total, 50);
});

test('later waves still spawn throughout the two-minute night', () => {
  const { world } = setup(); night(world, 30);
  for (let i = 0; i < 2399; i++) { world.elapsed += 50; updateSurvival(world, .05); }
  assert.equal(world.survival.wave.total, 50); assert.equal(world.survival.wave.spawned, 50);
  assert.equal(world.monsters.length, 51); assert.ok(world.monsters.length <= SURVIVAL.maxRaiders);
});

test('every consecutive night increases both normal-monster HP and damage', () => {
  const { world } = setup(); let hp = 0, damage = 0;
  for (let n = 1; n <= 8; n++) {
    night(world, n); const wolf = world.monsters.find(m => m.kind === 'wolf');
    assert.ok(wolf.maxHp > hp); assert.ok(wolf.damage > damage);
    assert.equal(wolf.maxHp, Math.round(MONSTERS.wolf.hp * nightStrength(n).hp));
    hp = wolf.maxHp; damage = wolf.damage;
  }
});

test('bosses appear only every third night, change form, and always grow stronger', () => {
  const { world } = setup(); const forms = new Set(); let hp = 0, damage = 0;
  for (let n = 1; n <= 12; n++) {
    night(world, n); const boss = world.monsters.find(m => m.kind === 'guardian');
    assert.equal(!!boss, n % 3 === 0);
    if (boss) { forms.add(boss.variant); assert.ok(boss.maxHp > hp); assert.ok(boss.damage > damage); hp = boss.maxHp; damage = boss.damage; }
  }
  assert.equal(forms.size, 4);
});

test('obelisk allows one summon per day, persists its use, reopens at dawn, and rejects nighttime use', () => {
  const { world, hero } = setup(); Object.assign(hero, SURVIVAL.shrine, { id: 'hero' });
  summonGuardian(world, hero); const boss = world.monsters[0];
  damageMonster(world, hero, boss, boss.maxHp); assert.throws(() => summonGuardian(world, hero), /Сегодня/);
  const restored = new GameWorld(world.serialize()), player = restored.join(hero.id, 'A', 'ranger');
  assert.equal(survivalSnapshot(restored).summonAvailable, false); assert.throws(() => summonGuardian(restored, player));
  restored.survival.clockMs = SURVIVAL.dayMs; assert.throws(() => summonGuardian(restored, player), /днём/);
  restored.survival.clockMs = CYCLE_MS; assert.equal(survivalSnapshot(restored).summonAvailable, true);
  summonGuardian(restored, player); const next = restored.monsters.find(m => m.hp > 0);
  assert.ok(next.maxHp > boss.maxHp); assert.ok(next.damage > boss.damage); assert.equal(restored.survival.lastSummonDay, 2);
});

test('daily boss does not summon daylight helpers and hunts players inside the village', () => {
  const { world, hero } = setup(), boss = spawnGuardian(world);
  boss.hp *= .25; boss.nextSpecialAt = Infinity; updateBosses(world, .05);
  assert.equal(boss.state, 'chase'); assert.equal(world.monsters.length, 1);
  assert.ok(boss.angle < 0 || boss.angle > 0); assert.ok(distance(boss, hero) > 650);
});

test('NPC services reject nighttime trades, upgrades, repairs and quests without changing hero resources', () => {
  const { world, hero } = setup(); hero.gold = 1000;
  const actions = [['merchant', 'buy', { baseId: 'boots' }], ['merchant', 'sell', { itemId: hero.inventory[1].id }], ['smith', 'upgrade', { itemId: hero.equipment.weapon }], ['elder', 'village:repair', {}], ['hunter', 'quest:accept', { questId: 'wolves' }]];
  world.survival.clockMs = SURVIVAL.dayMs;
  for (const [npcId, type, extra] of actions) {
    const npc = NPCS.find(n => n.id === npcId); hero.x = npc.x; hero.y = npc.y;
    assert.throws(() => rpgAction(world, hero, { npcId, type, ...extra }), /рассвета/);
  }
  assert.equal(hero.gold, 1000); assert.equal(hero.inventory[0].upgrade, 0);
});

test('every equipment slot can be worn, removed, upgraded to +10 and restored with stats intact', () => {
  const { world, hero } = setup(); const smith = NPCS.find(n => n.id === 'smith'); hero.x = smith.x; hero.y = smith.y; hero.gold = 10000;
  for (const id of ['wood', 'ore']) { const material = makeItem(id); material.quantity = id === 'wood' ? 800 : 700; addItem(hero, material); }
  for (const slot of Object.keys(EQUIPMENT_SLOTS)) {
    const item = slot === 'weapon' ? hero.inventory[0] : addItem(hero, makeItem(slot));
    rpgAction(world, hero, { type: 'equip', itemId: item.id }); assert.equal(hero.equipment[slot], item.id);
    const before = itemStats(item);
    for (let i = 0; i < 10; i++) rpgAction(world, hero, { type: 'upgrade', npcId: 'smith', itemId: item.id });
    const after = itemStats(item); assert.equal(item.upgrade, 10);
    assert.ok(after.damage > before.damage || after.armor > before.armor || after.mana > before.mana);
    const gold = hero.gold; assert.throws(() => rpgAction(world, hero, { type: 'upgrade', npcId: 'smith', itemId: item.id }), /10/); assert.equal(hero.gold, gold);
    rpgAction(world, hero, { type: 'unequip', itemId: item.id }); assert.equal(hero.equipment[slot], undefined);
    rpgAction(world, hero, { type: 'equip', itemId: item.id });
  }
  assert.equal(effectiveStats(hero).speed, 203);
  const restored = new GameWorld(world.serialize()); assert.deepEqual(restored.players.get(hero.id).stats, hero.stats);
  assert.deepEqual(restored.players.get(hero.id).equipment, hero.equipment);
});

test('new gear is sold by village shops; invalid upgrades cannot spend money or affect another hero', () => {
  const { world, hero } = setup(); hero.gold = 1000;
  const npc = NPCS.find(n => n.id === 'merchant'); hero.x = npc.x; hero.y = npc.y;
  for (const baseId of ['armor', 'boots', 'helmet']) rpgAction(world, hero, { type: 'buy', npcId: npc.id, baseId });
  assert.ok(['boots', 'helmet'].every(id => hero.inventory.some(i => i.baseId === id)));
  const smith = NPCS.find(n => n.id === 'smith'); hero.x = smith.x; hero.y = smith.y;
  const friend = world.join('friend', 'Друг', 'sage'), gold = hero.gold;
  for (const itemId of [friend.equipment.weapon, hero.inventory.find(i => i.baseId === 'health').id]) assert.throws(() => rpgAction(world, hero, { type: 'upgrade', npcId: 'smith', itemId }));
  assert.equal(hero.gold, gold); assert.equal(friend.inventory[0].upgrade, 0);
});

test('old 7/3 saves retain day, phase and proportional progress exactly once', () => {
  const { world, hero } = setup(); hero.gold = 123; const saved = world.serialize(); saved.version = 3; delete saved.survival.rulesVersion;
  saved.survival.clockMs = 600000 + 420000 + 90000;
  const restored = new GameWorld(saved); assert.equal(clockInfo(restored.survival.clockMs).day, 2);
  assert.equal(clockInfo(restored.survival.clockMs).phase, 'night'); assert.equal(clockInfo(restored.survival.clockMs).remaining, 60000);
  assert.equal(restored.players.get(hero.id).gold, 123);
  assert.equal(new GameWorld(restored.serialize()).survival.clockMs, restored.survival.clockMs);
});

test('shared routes let hunters reach distant heroes around the village buildings', () => {
  const { world, hero } = setup(); hero.x = 1536; hero.y = 1298;
  const monster = spawnMonster(world, 'wolf', 2200, 1152);
  for (let i = 0; i < 800 && distance(monster, hero) > 40; i++) { world.elapsed += 50; updateMonsters(world, .05); }
  assert.ok(distance(monster, hero) < 45, `hunter stopped at ${monster.x},${monster.y}`);
});

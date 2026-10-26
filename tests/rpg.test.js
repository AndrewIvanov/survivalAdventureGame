import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnMonster } from '../server/spawns.js';
import { MONSTERS } from '../shared/config.js';
import { GameWorld } from '../server/world.js';
import { rpgAction } from '../server/rpg.js';
import { castAbility, updateZones } from '../server/abilities.js';
import { damageMonster, attack, updateProjectiles, hurtPlayer } from '../server/combat.js';
import { grantExperience } from '../server/progression.js';
import { makeItem, addItem, refreshStats } from '../server/inventory.js';
import { SaveStore } from '../server/persistence.js';
import { CLASSES, NPCS, QUESTS, effectiveStats } from '../shared/rpg.js';

function setup(classId = 'warrior') {
  const world = new GameWorld(); spawnMonster(world, 'wolf', 2100, 1152); world.random = () => .5;
  const p = world.join('a', 'Искатель', 'ranger', classId); return { world, p };
}
function near(p, npcId) { const npc = NPCS.find(n => n.id === npcId); p.x = npc.x + 35; p.y = npc.y + 25; }

test('three classes have distinct stats and correct starter weapons', () => {
  for (const [id, cls] of Object.entries(CLASSES)) {
    const { p } = setup(id);
    assert.equal(p.classId, id); assert.equal(p.maxHp, cls.hp); assert.equal(p.maxMana, cls.mana);
    assert.equal(p.inventory.find(i => i.id === p.equipment.weapon).baseId, cls.weapon);
    assert.equal(p.inventory.filter(i => i.baseId === 'health')[0].quantity, 3);
  }
});

test('stage 1 saves migrate once, preserve progress, and permit one class choice', () => {
  const { world, p } = setup(); p.level = 4; p.xp = 42; p.gold = 90; p.kills = 7;
  const legacy = world.serialize(); legacy.version = 1;
  for (const key of ['inventory', 'equipment', 'classId', 'classChosen', 'attributes', 'abilityRanks', 'cooldowns']) delete legacy.players[0][key];
  const migrated = new GameWorld(legacy); const hero = migrated.join('a', 'Не менять', 'sage');
  assert.equal(hero.level, 4); assert.equal(hero.xp, 42); assert.equal(hero.gold, 90); assert.equal(hero.kills, 7);
  assert.equal(hero.statPoints, 9); assert.equal(hero.skillPoints, 3); assert.equal(hero.classChosen, false);
  assert.throws(() => rpgAction(migrated, hero, { type: 'class', classId: 'constructor' }));
  rpgAction(migrated, hero, { type: 'class', classId: 'mage' });
  assert.equal(hero.classId, 'mage'); assert.equal(hero.maxHp, 121); assert.equal(hero.inventory.length, 3);
  assert.throws(() => rpgAction(migrated, hero, { type: 'class', classId: 'archer' }));
  const restored = new GameWorld(migrated.serialize()); const again = restored.join('a', 'A', 'ranger');
  assert.equal(again.inventory.length, 3); assert.equal(again.classId, 'mage'); assert.equal(again.xp, 42);
});

test('levels grant spendable attributes and ability ranks; forged points rejected', () => {
  const { world, p } = setup(); grantExperience(world, p, 80);
  assert.equal(p.level, 2); assert.equal(p.statPoints, 3); assert.equal(p.skillPoints, 1);
  const hp = p.maxHp;
  rpgAction(world, p, { type: 'attribute', attribute: 'vitality' }); assert.equal(p.maxHp, hp + 8);
  rpgAction(world, p, { type: 'skill', key: 'q' }); assert.equal(p.abilityRanks.q, 2);
  assert.throws(() => rpgAction(world, p, { type: 'skill', key: 'q' }));
  assert.throws(() => rpgAction(world, p, { type: 'attribute', attribute: '__proto__' }));
});

test('equipment affects damage and armor; potions are consumed once with cooldown', () => {
  const { world, p } = setup();
  const weapon = makeItem('sword', 'rare'); addItem(p, weapon);
  rpgAction(world, p, { type: 'equip', itemId: weapon.id }); assert.equal(effectiveStats(p).damage, 36);
  const wrong = makeItem('staff'); addItem(p, wrong);
  assert.throws(() => rpgAction(world, p, { type: 'equip', itemId: wrong.id }));
  const armor = makeItem('armor'); addItem(p, armor); rpgAction(world, p, { type: 'equip', itemId: armor.id });
  assert.equal(effectiveStats(p).armor, 6);
  const before = p.hp; hurtPlayer(world, world.monsters[0], p); assert.equal(p.hp, before - Math.round(MONSTERS.wolf.damage - effectiveStats(p).armor));
  p.hp = 20; const potion = p.inventory.find(i => i.baseId === 'health');
  rpgAction(world, p, { type: 'use', itemId: potion.id }); assert.equal(p.hp, 85); assert.equal(potion.quantity, 2);
  assert.throws(() => rpgAction(world, p, { type: 'use', itemId: potion.id }));
  assert.equal(potion.quantity, 2);
});

test('shop validates NPC distance and funds, upgrades and selling affect one item only', () => {
  const { world, p } = setup(); p.gold = 100;
  assert.throws(() => rpgAction(world, p, { type: 'buy', npcId: 'merchant', baseId: 'health' }));
  near(p, 'merchant');
  rpgAction(world, p, { type: 'buy', npcId: 'merchant', baseId: 'health' }); assert.equal(p.gold, 90);
  assert.equal(p.inventory.find(i => i.baseId === 'health').quantity, 4);
  const potion = p.inventory.find(i => i.baseId === 'health');
  rpgAction(world, p, { type: 'sell', npcId: 'merchant', itemId: potion.id }); assert.equal(p.gold, 94); assert.equal(potion.quantity, 3);
  assert.throws(() => rpgAction(world, p, { type: 'sell', npcId: 'merchant', itemId: p.equipment.weapon }));
  near(p, 'smith'); rpgAction(world, p, { type: 'upgrade', npcId: 'smith' });
  assert.equal(p.gold, 74); assert.equal(effectiveStats(p).damage, 28);
  p.gold = 0; assert.throws(() => rpgAction(world, p, { type: 'buy', npcId: 'smith', baseId: 'sword' }));
});

test('shared loot can only be picked once and never disappears when inventory is full', () => {
  const { world, p } = setup(); const b = world.join('b', 'Друг', 'sage');
  const m = world.monsters[0]; m.x = p.x + 40; m.y = p.y;
  damageMonster(world, p, m, 999); assert.equal(world.loot.length, 1);
  const loot = world.loot[0]; b.x = loot.x; b.y = loot.y;
  while (p.inventory.length < 24) addItem(p, makeItem('sword'));
  // Force a nonstackable drop to exercise a genuinely full inventory.
  loot.item = makeItem('armor', 'rare');
  assert.throws(() => rpgAction(world, p, { type: 'pickup', lootId: loot.id })); assert.equal(world.loot.length, 1);
  rpgAction(world, b, { type: 'pickup', lootId: loot.id }); assert.equal(world.loot.length, 0);
  assert.throws(() => rpgAction(world, p, { type: 'pickup', lootId: loot.id }));
});

test('personal chest claims survive reload and are available to both heroes', () => {
  const { world, p } = setup(); const b = world.join('b', 'Друг', 'sage');
  const chest = world.chests[0]; p.x = b.x = chest.x; p.y = b.y = chest.y;
  rpgAction(world, p, { type: 'chest', chestId: chest.id }); assert.equal(p.supplies.length, 1);
  assert.throws(() => rpgAction(world, p, { type: 'chest', chestId: chest.id }));
  rpgAction(world, b, { type: 'chest', chestId: chest.id }); assert.equal(b.supplies.length, 1);
  const restored = new GameWorld(world.serialize()); const hero = restored.join('a', 'A', 'ranger');
  assert.throws(() => rpgAction(restored, hero, { type: 'chest', chestId: chest.id }));
});

test('quests track cooperative kills, reward once and persist both rewards and completion', () => {
  const { world, p } = setup(), b = world.join('b', 'Друг', 'sage');
  near(p, 'hunter'); near(b, 'hunter');
  for (const hero of [p, b]) rpgAction(world, hero, { type: 'quest:accept', npcId: 'hunter', questId: 'wolves' });
  const monster = world.monsters[0];
  for (let i = 0; i < 5; i++) { monster.hp = 64; monster.x = p.x + 20; monster.y = p.y; damageMonster(world, p, monster, 999); }
  assert.equal(p.quests.wolves.progress, 5); assert.equal(b.quests.wolves.progress, 5);
  const readyCount = world.events.filter(e => e.type === 'quest-ready').length;
  monster.hp = 64; damageMonster(world, p, monster, 999);
  assert.equal(world.events.filter(e => e.type === 'quest-ready').length, readyCount);
  const gold = p.gold;
  rpgAction(world, p, { type: 'quest:claim', npcId: 'hunter', questId: 'wolves' });
  assert.equal(p.gold, gold + QUESTS.wolves.gold); assert.equal(p.quests.wolves.status, 'completed');
  assert.throws(() => rpgAction(world, p, { type: 'quest:claim', npcId: 'hunter', questId: 'wolves' }));
  const store = new SaveStore(':memory:'); store.save(world.serialize());
  const restored = new GameWorld(store.load(world.code)); const hero = restored.join('a', 'A', 'ranger');
  assert.equal(hero.gold, p.gold); assert.equal(hero.quests.wolves.status, 'completed');
  assert.ok(hero.inventory.some(i => i.baseId === 'armor' && i.rarity === 'uncommon')); store.close();
});

test('ability costs, cooldowns, invalid keys, and warrior area attack are authoritative', () => {
  const { world, p } = setup(); const m = world.monsters[0]; m.x = p.x + 50; m.y = p.y; m.hp = 200;
  castAbility(world, p, { key: 'q', x: m.x, y: m.y });
  assert.equal(p.mana, 80); assert.ok(m.hp < 150);
  const mana = p.mana; assert.throws(() => castAbility(world, p, { key: 'q', x: m.x, y: m.y })); assert.equal(p.mana, mana);
  assert.throws(() => castAbility(world, p, { key: 'constructor', x: 0, y: 0 }));
  p.mana = 0; assert.throws(() => castAbility(world, p, { key: 'r', x: 0, y: 0 }));
  p.mana = 100; castAbility(world, p, { key: 'r', x: p.x + 10, y: p.y }); assert.ok(p.guardUntil > world.elapsed);
});

test('ranged attacks hit server targets; ice zones slow and expire', () => {
  const { world, p } = setup('mage');
  const m = world.monsters[0]; m.x = p.x + 150; m.y = p.y; m.hp = 200; p.angle = 0;
  attack(world, p); assert.equal(world.projectiles.length, 1); assert.equal(m.hp, 200);
  for (let i = 0; i < 10; i++) updateProjectiles(world, .05);
  assert.ok(m.hp < 200); assert.ok(world.projectilePool.length > 0);
  castAbility(world, p, { key: 'e', x: m.x, y: m.y });
  world.elapsed = 250; updateZones(world); assert.ok(m.slowUntil > world.elapsed);
  world.elapsed = 5000; updateZones(world); assert.equal(world.zones.length, 0);
});

test('all nine abilities create their class-specific effects and enforce cooldowns', () => {
  for (const classId of ['warrior', 'mage', 'archer']) for (const key of ['q', 'e', 'r']) {
    const { world, p } = setup(classId);
    const m = world.monsters[0]; m.x = p.x + 45; m.y = p.y; m.hp = 500;
    castAbility(world, p, { key, x: m.x, y: m.y });
    assert.ok(p.cooldowns[key] > 0, `${classId}/${key}`);
    assert.ok(p.mana < p.maxMana);
    if (classId === 'warrior' && key !== 'r') assert.ok(m.hp < 500);
    if (classId === 'warrior' && key === 'r') assert.ok(p.guardUntil > 0);
    if (classId === 'mage' && key === 'q') assert.equal(world.projectiles[0].blast, 70);
    if (classId === 'archer' && key === 'q') assert.equal(world.projectiles[0].pierce, 3);
    if (classId === 'archer' && key === 'e') assert.equal(world.projectiles.length, 5);
    if ((classId === 'mage' && key !== 'q') || (classId === 'archer' && key === 'r')) {
      assert.equal(world.zones.length, 1); world.elapsed = 700; updateZones(world); assert.ok(m.hp < 500);
    }
  }
});

test('full inventory prevents quest reward without consuming completion or gold', () => {
  const { world, p } = setup(); near(p, 'hunter');
  p.quests.wolves = { status: 'active', progress: 5 };
  while (p.inventory.length < 24) addItem(p, makeItem('sword'));
  const xp = p.xp, gold = p.gold;
  assert.throws(() => rpgAction(world, p, { type: 'quest:claim', npcId: 'hunter', questId: 'wolves' }));
  assert.equal(p.xp, xp); assert.equal(p.gold, gold); assert.equal(p.quests.wolves.status, 'active');
});

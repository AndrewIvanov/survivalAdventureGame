import test from 'node:test';
import assert from 'node:assert/strict';
import { GameWorld } from '../server/world.js';
import { rpgAction } from '../server/rpg.js';
import { addItem, makeItem } from '../server/inventory.js';
import { updateResources } from '../server/resources.js';
import { damageFence } from '../server/building.js';
import { updateMonsters } from '../server/ai.js';
import { spawnMonster } from '../server/spawns.js';
import { SaveStore } from '../server/persistence.js';
import { NPCS, effectiveStats } from '../shared/rpg.js';
import { canStand } from '../shared/map.js';
import { GATHERING, materialCount } from '../shared/crafting.js';
import { MONSTERS } from '../shared/config.js';

const setup = () => { const world = new GameWorld(), hero = world.join('a', 'Мастер', 'ranger'); return { world, hero }; };
const give = (hero, id, count) => { const item = makeItem(id); item.quantity = count; return addItem(hero, item); };
const near = (hero, id) => { const npc = NPCS.find(n => n.id === id); hero.x = npc.x + 30; hero.y = npc.y + 30; };

test('a zero-gold beginner can earn a pickaxe by chopping and selling wood, then mine ore', () => {
  const { world, hero } = setup(); assert.equal(hero.gold, 0); assert.equal(hero.inventory[0].baseId, 'axe');
  const tree = world.resourceNodes.find(n => n.kind === 'tree'); hero.x = tree.x + 60; hero.y = tree.y;
  for (let i = 0; i < 2; i++) { rpgAction(world, hero, { type: 'resource:harvest', nodeId: tree.id }); world.elapsed += GATHERING.cooldownMs; }
  assert.equal(materialCount(hero, 'wood'), 12);
  near(hero, 'merchant');
  give(hero, 'wood', 989);
  for (let i = 0; i < 10; i++) rpgAction(world, hero, { type: 'sell', npcId: 'merchant', itemId: hero.inventory.find(i => i.baseId === 'wood').id });
  assert.equal(hero.gold, 10); rpgAction(world, hero, { type: 'buy', npcId: 'merchant', baseId: 'pickaxe' }); assert.equal(hero.gold, 0);
  assert.equal(materialCount(hero, 'wood'), 1);
  const vein = world.resourceNodes.find(n => n.kind === 'ore'); hero.x = vein.x; hero.y = vein.y + 50;
  rpgAction(world, hero, { type: 'resource:harvest', nodeId: vein.id }); assert.equal(materialCount(hero, 'ore'), 3);
});

test('harvesting enforces tools, range, cooldown, remaining stock and full inventory without losing resources', () => {
  const { world, hero } = setup(), tree = world.resourceNodes[0], vein = world.resourceNodes.find(n => n.kind === 'ore');
  assert.throws(() => rpgAction(world, hero, { type: 'resource:harvest', nodeId: tree.id }));
  hero.x = vein.x; hero.y = vein.y; assert.throws(() => rpgAction(world, hero, { type: 'resource:harvest', nodeId: vein.id }), /кирка/);
  hero.x = tree.x + 50; hero.y = tree.y;
  rpgAction(world, hero, { type: 'resource:harvest', nodeId: tree.id });
  assert.throws(() => rpgAction(world, hero, { type: 'resource:harvest', nodeId: tree.id }), /готов/);
  for (let i = 0; i < 2; i++) { world.elapsed += GATHERING.cooldownMs; rpgAction(world, hero, { type: 'resource:harvest', nodeId: tree.id }); }
  assert.equal(world.resourceState[tree.id].remaining, 0); assert.ok(canStand(tree.x, tree.y, world.grid));
  world.elapsed += GATHERING.cooldownMs; assert.throws(() => rpgAction(world, hero, { type: 'resource:harvest', nodeId: tree.id }), /исчерпан/);
  const next = world.resourceNodes.find(n => n.kind === 'tree' && n.id !== tree.id);
  hero.x = next.x + 50; hero.y = next.y;
  hero.inventory = hero.inventory.filter(i => i.baseId !== 'wood'); while (hero.inventory.length < 24) addItem(hero, makeItem('sword'));
  assert.throws(() => rpgAction(world, hero, { type: 'resource:harvest', nodeId: next.id }), /заполнен/);
  assert.equal(world.resourceState[next.id], undefined);
});

test('crafting, steel weapons and upgrades charge materials atomically at the correct workshop', () => {
  const { world, hero } = setup(); give(hero, 'wood', 60); give(hero, 'ore', 30); hero.gold = 100;
  const original = structuredClone(hero.inventory);
  assert.throws(() => rpgAction(world, hero, { type: 'craft', npcId: 'lumberjack', recipeId: 'sword' })); assert.deepEqual(hero.inventory, original);
  near(hero, 'lumberjack'); rpgAction(world, hero, { type: 'craft', npcId: 'lumberjack', recipeId: 'sword' });
  assert.equal(materialCount(hero, 'wood'), 48); assert.equal(effectiveStats(hero).damage, 24);
  rpgAction(world, hero, { type: 'craft', npcId: 'lumberjack', recipeId: 'shield' }); assert.ok(hero.equipment.shield);
  assert.throws(() => rpgAction(world, hero, { type: 'craft', npcId: 'lumberjack', recipeId: 'steelSword' }));
  near(hero, 'smith'); rpgAction(world, hero, { type: 'craft', npcId: 'smith', recipeId: 'steelSword' });
  const steel = hero.inventory.find(i => i.baseId === 'steelSword'); rpgAction(world, hero, { type: 'equip', itemId: steel.id });
  assert.equal(effectiveStats(hero).damage, 32); assert.equal(hero.gold, 80); assert.equal(materialCount(hero, 'ore'), 18);
  rpgAction(world, hero, { type: 'upgrade', npcId: 'smith', itemId: steel.id });
  assert.equal(steel.upgrade, 1); assert.equal(effectiveStats(hero).damage, 36); assert.equal(hero.gold, 60); assert.equal(materialCount(hero, 'ore'), 16); assert.equal(materialCount(hero, 'wood'), 26);
  const before = structuredClone(hero.inventory); hero.gold = 0;
  assert.throws(() => rpgAction(world, hero, { type: 'upgrade', npcId: 'smith', itemId: steel.id })); assert.deepEqual(hero.inventory, before);
});

test('full bags reject crafting without consuming materials, and stack overflow is all-or-nothing', () => {
  const { world, hero } = setup(); near(hero, 'lumberjack'); give(hero, 'wood', 50);
  while (hero.inventory.length < 24) addItem(hero, makeItem('sword'));
  const before = structuredClone(hero.inventory);
  assert.throws(() => rpgAction(world, hero, { type: 'craft', npcId: 'lumberjack', recipeId: 'shield' }), /заполнен/); assert.deepEqual(hero.inventory, before);
  const wood = hero.inventory.find(i => i.baseId === 'wood'); wood.quantity = 98;
  assert.throws(() => give(hero, 'wood', 6), /заполнен/); assert.equal(wood.quantity, 98);
  hero.inventory.pop(); give(hero, 'wood', 6); assert.equal(materialCount(hero, 'wood'), 104);
  assert.deepEqual(hero.inventory.filter(i => i.baseId === 'wood').map(i => i.quantity), [99, 5]);
});

test('only equipped gear is excluded from selling; unequipped starter tools can be sold', () => {
  const { world, hero } = setup(); near(hero, 'merchant'); const axe = hero.inventory[0];
  assert.throws(() => rpgAction(world, hero, { type: 'sell', npcId: 'merchant', itemId: axe.id }));
  rpgAction(world, hero, { type: 'unequip', itemId: axe.id }); rpgAction(world, hero, { type: 'sell', npcId: 'merchant', itemId: axe.id });
  assert.equal(hero.gold, 4); assert.ok(!hero.inventory.some(i => i.id === axe.id));
});

test('wood trades consume exactly 100 across stacks for one gold and reject insufficient stock atomically', () => {
  const { world, hero } = setup(); near(hero, 'merchant'); give(hero, 'wood', 99);
  const woodId = hero.inventory.find(i => i.baseId === 'wood').id, before = structuredClone(hero.inventory);
  assert.throws(() => rpgAction(world, hero, { type: 'sell', npcId: 'merchant', itemId: woodId })); assert.equal(hero.gold, 0); assert.deepEqual(hero.inventory, before);
  give(hero, 'wood', 106); rpgAction(world, hero, { type: 'sell', npcId: 'merchant', itemId: woodId });
  assert.equal(materialCount(hero, 'wood'), 105); assert.equal(hero.gold, 1);
  rpgAction(world, hero, { type: 'sell', npcId: 'merchant', itemId: hero.inventory.find(i => i.baseId === 'wood').id });
  assert.equal(materialCount(hero, 'wood'), 5); assert.equal(hero.gold, 2);
});

test('adjacent fence boxes block movement, upgrade to 10, take enemy attacks and reopen terrain on destruction', () => {
  const { world, hero } = setup(); hero.x = 1600; hero.y = 1450; give(hero, 'fenceKit', 3); give(hero, 'wood', 200); give(hero, 'ore', 100); hero.gold = 1000;
  rpgAction(world, hero, { type: 'build:place', x: 1632, y: 1472 });
  rpgAction(world, hero, { type: 'build:place', x: 1664, y: 1472 });
  assert.equal(world.structures.length, 2); assert.equal(materialCount(hero, 'fenceKit'), 1); assert.ok(!canStand(1632, 1472, world.grid));
  assert.throws(() => rpgAction(world, hero, { type: 'build:place', x: 1632, y: 1472 })); assert.equal(materialCount(hero, 'fenceKit'), 1);
  const fence = world.structures[0];
  for (let i = 0; i < 9; i++) rpgAction(world, hero, { type: 'build:upgrade', structureId: fence.id });
  assert.equal(fence.level, 10); assert.equal(fence.maxHp, 790); assert.throws(() => rpgAction(world, hero, { type: 'build:upgrade', structureId: fence.id }));
  const monster = spawnMonster(world, 'wolf', 1632, 1530); hero.x = 1632; hero.y = 1400;
  const hp = fence.hp; world.elapsed = 2000; updateMonsters(world, .1); world.elapsed += 1500; updateMonsters(world, .1);
  assert.ok(fence.hp < hp); assert.equal(hero.hp, hero.maxHp);
  damageFence(world, monster, fence, 99999); assert.ok(!world.structures.some(s => s.id === fence.id)); assert.ok(canStand(1632, 1472, world.grid));
});

test('resource depletion and damaged upgraded fences survive a verified save; regrowth waits for occupied ground', () => {
  const { world, hero } = setup(), node = world.resourceNodes[0]; hero.x = node.x + 50; hero.y = node.y;
  for (let i = 0; i < 3; i++) { rpgAction(world, hero, { type: 'resource:harvest', nodeId: node.id }); world.elapsed += 900; }
  hero.x = 1600; hero.y = 1450; give(hero, 'fenceKit', 1); give(hero, 'wood', 10); give(hero, 'ore', 3); hero.gold = 20;
  rpgAction(world, hero, { type: 'build:place', x: 1632, y: 1472 }); const fence = world.structures[0];
  rpgAction(world, hero, { type: 'build:upgrade', structureId: fence.id }); fence.hp -= 35;
  const store = new SaveStore(':memory:'); store.save(world.serialize()); const restored = new GameWorld(store.load(world.code)); store.close();
  assert.deepEqual(restored.structures, world.structures); assert.deepEqual(restored.resourceState, world.resourceState); assert.ok(!canStand(fence.x, fence.y, restored.grid));
  const player = restored.players.get(hero.id); player.x = node.x; player.y = node.y;
  restored.elapsed = restored.resourceState[node.id].respawnAt + 1; updateResources(restored); assert.equal(restored.resourceState[node.id].remaining, 0);
  player.x += 100; restored.elapsed += 1001; updateResources(restored); assert.equal(restored.resourceState[node.id], undefined); assert.ok(canStand(node.x, node.y, restored.grid));
});

test('mana regeneration is one fifth of the old rate and monster HP/damage stay unchanged while movement slows 5%', () => {
  const { world, hero } = setup(); hero.mana = 0; world.tick(1); assert.equal(hero.mana, 2.4);
  hero.x = 2300; hero.y = 1152; world.tick(1); assert.equal(hero.mana, 3.4);
  for (const [id, hp, damage, speed] of [['wolf', 128, 18, 98], ['goblin', 192, 28, 72], ['nightstalker', 164, 24, 120], ['guardian', 2200, 44, 64]]) {
    assert.equal(MONSTERS[id].hp, hp); assert.equal(MONSTERS[id].damage, damage); assert.ok(Math.abs(MONSTERS[id].speed - speed * .95) < .0001);
  }
});

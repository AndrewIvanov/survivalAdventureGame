import { randomUUID } from 'node:crypto';
import { ITEMS, RARITIES, INVENTORY_SIZE, effectiveStats, CLASSES, EQUIPMENT_SLOTS } from '../shared/rpg.js';
import { MAX_SKILL_RANK } from '../shared/professions.js';
import { canAfford } from '../shared/crafting.js';

export function makeItem(baseId, rarity = 'common') {
  if (!ITEMS[baseId] || !RARITIES[rarity]) throw new Error('Неизвестный предмет.');
  return { id: randomUUID(), baseId, rarity, quantity: 1, upgrade: 0 };
}
export function addItem(player, item) {
  const base = ITEMS[item.baseId];
  const stackable = ['potion', 'material', 'building'].includes(base.type);
  let remaining = Math.max(1, Math.floor(item.quantity || 1));
  const stacks = stackable ? player.inventory.filter(i => i.baseId === item.baseId && i.rarity === item.rarity && i.quantity < 99) : [];
  const room = stacks.reduce((n, i) => n + 99 - i.quantity, 0);
  const slots = Math.ceil(Math.max(0, remaining - room) / (stackable ? 99 : 1));
  if (player.inventory.length + slots > INVENTORY_SIZE) throw new Error('Рюкзак заполнен. Освободите ячейку.');
  let result;
  for (const stack of stacks) {
    const count = Math.min(remaining, 99 - stack.quantity); stack.quantity += count; remaining -= count;
    result ||= stack; if (!remaining) return result;
  }
  while (remaining) {
    const count = Math.min(remaining, stackable ? 99 : 1);
    const added = result ? { ...item, id: randomUUID(), quantity: count } : Object.assign(item, { quantity: count });
    player.inventory.push(added); result ||= added; remaining -= count;
  }
  return result;
}
export function payCost(player, cost) {
  if (!canAfford(player, cost)) throw new Error('Не хватает дерева, руды или золота.');
  for (const [id, count] of Object.entries(cost)) {
    if (id === 'gold') { player.gold -= count; continue; }
    let left = count;
    for (const item of player.inventory.filter(i => i.baseId === id)) { const take = Math.min(left, item.quantity); item.quantity -= take; left -= take; if (!left) break; }
  }
  player.inventory = player.inventory.filter(i => i.quantity > 0);
}
export function craftItem(player, baseId, cost) {
  const copy = { ...player, inventory: structuredClone(player.inventory) };
  payCost(copy, cost); const item = makeItem(baseId); addItem(copy, item);
  player.inventory = copy.inventory; player.gold = copy.gold; return item;
}
export function consumeItem(player, item) {
  if (--item.quantity <= 0) player.inventory = player.inventory.filter(i => i.id !== item.id);
}
export function refreshStats(player, heal = false) {
  const stats = effectiveStats(player);
  player.stats = stats; player.maxHp = stats.maxHp; player.maxMana = stats.maxMana;
  player.hp = heal ? player.maxHp : Math.min(player.hp, player.maxHp);
  player.mana = heal ? player.maxMana : Math.min(player.mana ?? player.maxMana, player.maxMana);
}
export function initializeRpg(player, classId = 'warrior', legacy = false) {
  if (player.inventory) {
    if (!player.progressionVersion) {
      player.skillPoints = (player.skillPoints || 0) + Math.max(0, player.level - 1) * 2;
      for (const key of ['q', 'e', 'r']) player.abilityRanks[key] = Math.min(MAX_SKILL_RANK, 1 + Math.max(0, player.abilityRanks[key] - 1) * (player.classId === 'warrior' && key === 'r' ? 40 : 20));
      if (!player.inventory.some(i => i.baseId === 'axe') && player.inventory.length < INVENTORY_SIZE) addItem(player, makeItem('axe'));
      player.progressionVersion = 1;
    }
    player.professionRank ||= 1;
    refreshStats(player); return;
  }
  player.classId = typeof classId === 'string' && Object.hasOwn(CLASSES, classId) ? classId : 'warrior';
  player.classChosen = !legacy;
  player.attributes = { strength: 5, dexterity: 5, intelligence: 5, vitality: 5 };
  player.statPoints = (player.level - 1) * 3; player.skillPoints = (player.level - 1) * 3; player.progressionVersion = 1;
  player.profession = null; player.professionRank = 1;
  player.abilityRanks = { q: 1, e: 1, r: 1 }; player.cooldowns = {};
  player.inventory = []; player.equipment = {}; player.quests = {}; player.supplies = [];
  const weapon = makeItem('axe'); weapon.starter = true;
  addItem(player, weapon); player.equipment.weapon = weapon.id;
  const health = makeItem('health'); health.quantity = 3; addItem(player, health);
  const mana = makeItem('mana'); mana.quantity = 2; addItem(player, mana);
  refreshStats(player); player.mana = player.maxMana;
}
export function inventoryAction(world, player, action) {
  const item = player.inventory.find(i => i.id === action.itemId);
  if (!item) throw new Error('Предмет не найден.');
  const base = ITEMS[item.baseId];
  if (action.type === 'equip') {
    if (!Object.hasOwn(EQUIPMENT_SLOTS, base.type)) throw new Error('Этот предмет нельзя надеть.');
    if (base.classId && base.classId !== player.classId) throw new Error('Это оружие другого класса.');
    player.equipment[base.type] = item.id; refreshStats(player);
  } else if (action.type === 'unequip') {
    if (player.equipment[base.type] === item.id) delete player.equipment[base.type];
    refreshStats(player);
  } else if (action.type === 'use') {
    if (base.type !== 'potion') throw new Error('Этот предмет нельзя использовать.');
    if (world.elapsed < (player.potionUntil || 0)) throw new Error('Зелья перезаряжаются 1 секунду.');
    if ((base.heal && player.hp >= player.maxHp) || (base.mana && player.mana >= player.maxMana)) throw new Error('Запас уже полный.');
    if (base.heal) player.hp = Math.min(player.maxHp, player.hp + base.heal);
    if (base.mana) player.mana = Math.min(player.maxMana, player.mana + base.mana);
    player.potionUntil = world.elapsed + 1000; consumeItem(player, item);
    world.events.push({ type: 'heal', id: player.id, x: player.x, y: player.y, resource: base.heal ? 'hp' : 'mana' });
  } else throw new Error('Неизвестное действие с предметом.');
  world.criticalSave = true;
}

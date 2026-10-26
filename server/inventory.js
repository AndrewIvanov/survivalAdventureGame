import { randomUUID } from 'node:crypto';
import { ITEMS, RARITIES, INVENTORY_SIZE, effectiveStats, CLASSES, EQUIPMENT_SLOTS } from '../shared/rpg.js';

export function makeItem(baseId, rarity = 'common') {
  if (!ITEMS[baseId] || !RARITIES[rarity]) throw new Error('Неизвестный предмет.');
  return { id: randomUUID(), baseId, rarity, quantity: 1, upgrade: 0 };
}
export function addItem(player, item) {
  const base = ITEMS[item.baseId];
  const stack = ['potion', 'material'].includes(base.type) && player.inventory.find(i => i.baseId === item.baseId && i.rarity === item.rarity && i.quantity < 99);
  if (stack) { stack.quantity++; return stack; }
  if (player.inventory.length >= INVENTORY_SIZE) throw new Error('Рюкзак заполнен. Освободите ячейку.');
  player.inventory.push(item); return item;
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
  if (player.inventory) { refreshStats(player); return; }
  player.classId = typeof classId === 'string' && Object.hasOwn(CLASSES, classId) ? classId : 'warrior';
  player.classChosen = !legacy;
  player.attributes = { strength: 5, dexterity: 5, intelligence: 5, vitality: 5 };
  player.statPoints = (player.level - 1) * 3; player.skillPoints = player.level - 1;
  player.abilityRanks = { q: 1, e: 1, r: 1 }; player.cooldowns = {};
  player.inventory = []; player.equipment = {}; player.quests = {}; player.supplies = [];
  const weapon = makeItem(CLASSES[player.classId].weapon); weapon.starter = true;
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

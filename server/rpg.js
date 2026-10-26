import { ATTRIBUTES, CLASSES, ITEMS, NPCS, CHESTS, ABILITIES, effectiveStats, EQUIPMENT_SLOTS, MAX_UPGRADE, upgradePrice, shopStock } from '../shared/rpg.js';
import { clockInfo } from '../shared/survival.js';
import { distance, inVillage } from '../shared/config.js';
import { addItem, makeItem, inventoryAction, consumeItem, refreshStats } from './inventory.js';
import { questAction, progressQuests } from './quests.js';
import { summonGuardian } from './boss.js';

export function nearbyNpc(world, player, npcId) {
  if (clockInfo(world.survival.clockMs).phase === 'night') throw new Error('Жители укрылись до рассвета. Приходите днём.');
  const npc = NPCS.find(n => n.id === npcId);
  if (!npc || distance(player, npc) > 105) throw new Error('Подойдите ближе к жителю деревни.');
  return npc;
}
export function rpgAction(world, player, action) {
  if (!player?.online || player.hp <= 0) throw new Error('Герой сейчас не может действовать.');
  if (!action || typeof action.type !== 'string') throw new Error('Неверное действие.');
  if (['equip', 'unequip', 'use'].includes(action.type)) return inventoryAction(world, player, action);
  if (action.type === 'class') {
    if (typeof action.classId !== 'string' || !Object.hasOwn(CLASSES, action.classId)) throw new Error('Неизвестный класс.');
    if (player.classChosen) throw new Error('Призвание уже выбрано для этого героя.');
    if (!inVillage(player)) throw new Error('Выбрать призвание можно только в деревне.');
    const starter = player.inventory.find(i => i.starter);
    if (!starter && player.inventory.length >= 24) throw new Error('Освободите ячейку для оружия нового класса.');
    player.inventory = player.inventory.filter(i => !i.starter);
    const weapon = makeItem(CLASSES[action.classId].weapon); weapon.starter = true;
    addItem(player, weapon); player.equipment.weapon = weapon.id;
    player.classId = action.classId; player.classChosen = true; refreshStats(player, true);
  } else if (action.type === 'attribute') {
    if (!Object.hasOwn(ATTRIBUTES, action.attribute) || player.statPoints <= 0) throw new Error('Нет очков характеристики.');
    player.attributes[action.attribute]++; player.statPoints--; refreshStats(player);
  } else if (action.type === 'skill') {
    if (!Object.hasOwn(ABILITIES[player.classId], action.key) || player.skillPoints <= 0 || player.abilityRanks[action.key] >= 3) throw new Error('Улучшение недоступно.');
    player.abilityRanks[action.key]++; player.skillPoints--;
  } else if (action.type === 'pickup') {
    const loot = world.loot.find(l => l.id === action.lootId);
    if (!loot || distance(player, loot) > 85) throw new Error('Добыча слишком далеко или уже подобрана.');
    if (loot.ownerId && loot.ownerId !== player.id) throw new Error('Эта награда предназначена напарнику.');
    addItem(player, loot.item); world.loot = world.loot.filter(l => l.id !== loot.id);
  } else if (action.type === 'boss:summon') {
    summonGuardian(world, player);
  } else if (action.type === 'chest') {
    const chest = world.chests.find(c => c.id === action.chestId);
    if (!chest || distance(player, chest) > 85) throw new Error('Подойдите ближе к сундуку.');
    if (chest.claimedBy.includes(player.id)) throw new Error('Вы уже обыскали этот сундук.');
    const item = makeItem(chest.supply ? 'health' : CLASSES[player.classId].weapon, chest.supply ? 'common' : 'rare');
    addItem(player, item); chest.claimedBy.push(player.id); player.gold += chest.supply ? 8 : 18;
    if (chest.supply) { player.supplies.push(chest.id); progressQuests(world, player, 'supplies'); }
  } else {
    const npc = nearbyNpc(world, player, action.npcId);
    if (action.type === 'village:repair') {
      if (npc.id !== 'elder') throw new Error('Восстановление организует староста.');
      if (world.survival.wave?.status === 'active') throw new Error('Сначала отбейте нападение.');
      if (world.village.hp >= world.village.maxHp) throw new Error('Защита деревни уже восстановлена.');
      if (player.gold < 15) throw new Error('На ремонт нужно 15 золота.');
      player.gold -= 15; world.village.hp = Math.min(world.village.maxHp, world.village.hp + 150);
    }
    else if (['quest:accept', 'quest:claim'].includes(action.type)) questAction(world, player, action, npc);
    else if (action.type === 'buy') {
      const stock = shopStock(npc.id, player.classId);
      if (!stock.includes(action.baseId)) throw new Error('Житель не продаёт этот предмет.');
      const base = ITEMS[action.baseId];
      if (player.gold < base.price) throw new Error('Не хватает золота.');
      addItem(player, makeItem(action.baseId)); player.gold -= base.price;
    } else if (action.type === 'sell') {
      if (npc.id !== 'merchant') throw new Error('Продать вещи можно торговке Мире.');
      const item = player.inventory.find(i => i.id === action.itemId);
      if (!item || item.starter || Object.values(player.equipment).includes(item.id)) throw new Error('Этот предмет нельзя продать. Сначала снимите экипировку.');
      player.gold += Math.max(1, Math.floor(ITEMS[item.baseId].price * .4)); consumeItem(player, item);
    } else if (action.type === 'upgrade') {
      if (npc.id !== 'smith') throw new Error('Снаряжение улучшает кузнец.');
      const item = player.inventory.find(i => i.id === (action.itemId || player.equipment.weapon));
      if (!item || !Object.hasOwn(EQUIPMENT_SLOTS, ITEMS[item.baseId].type)) throw new Error('Выберите снаряжение из своего рюкзака.');
      if (item.upgrade >= MAX_UPGRADE) throw new Error('Максимальный уровень улучшения — +10.');
      const price = upgradePrice(item);
      if (player.gold < price) throw new Error('Не хватает золота.');
      player.gold -= price; item.upgrade = (item.upgrade || 0) + 1; refreshStats(player);
    } else throw new Error('Неизвестное действие.');
  }
  world.criticalSave = true;
}

export function initializeChests(saved) {
  return CHESTS.map(chest => ({ ...chest, claimedBy: saved?.find(c => c.id === chest.id)?.claimedBy || [] }));
}

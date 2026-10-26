import { randomUUID } from 'node:crypto';
import { distance, WORLD } from '../shared/config.js';
import { canStand } from '../shared/map.js';
import { FENCES, fenceHp, fenceUpgradeCost } from '../shared/crafting.js';
import { NPCS } from '../shared/rpg.js';
import { REVIVAL } from '../shared/revival.js';
import { SURVIVAL } from '../shared/survival.js';
import { consumeItem, payCost } from './inventory.js';
import { rebuildEnvironment } from './environment.js';

export function buildFence(world, player, data) {
  if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) throw new Error('Выберите место для забора.');
  const point = { x: Math.round(data.x / 32) * 32, y: Math.round(data.y / 32) * 32 };
  const kit = player.inventory.find(i => i.baseId === 'fenceKit');
  if (!kit) throw new Error('Нужен ящик для забора с лесопилки.');
  if (world.structures.length >= FENCES.maxCount) throw new Error('В мире уже построено 80 секций забора.');
  if (distance(player, point) > FENCES.reach || !canStand(point.x, point.y, world.grid, FENCES.size / 2 + 1)) throw new Error('Здесь нельзя строить. Выберите свободное место рядом.');
  const protectedPoints = [WORLD.spawn, REVIVAL.altar, SURVIVAL.shrine, ...NPCS];
  if (protectedPoints.some(p => distance(p, point) < 76) || [...world.players.values()].some(p => distance(p, point) < 35) || world.resourceNodes.some(n => distance(n, point) < 36) || world.gravestones.some(g => distance(g, point) < 40)) throw new Error('Оставьте свободными героев, ресурсы, надгробия и входы к жителям.');
  consumeItem(player, kit);
  world.structures.push({ id: randomUUID(), ownerId: player.id, x: point.x, y: point.y, level: 1, hp: fenceHp(1), maxHp: fenceHp(1) });
  rebuildEnvironment(world); world.criticalSave = true;
}
export function fenceAction(world, player, action) {
  const fence = world.structures.find(s => s.id === action.structureId && s.hp > 0);
  if (!fence || distance(player, fence) > 95) throw new Error('Подойдите ближе к секции забора.');
  if (action.type === 'build:upgrade') {
    if (fence.level >= FENCES.maxLevel) throw new Error('Максимальный уровень забора — 10.');
    payCost(player, fenceUpgradeCost(fence.level + 1));
    const gained = fenceHp(fence.level + 1) - fence.maxHp;
    fence.level++; fence.maxHp = fenceHp(fence.level); fence.hp += gained;
  } else if (action.type === 'build:repair') {
    if (fence.hp >= fence.maxHp) throw new Error('Забор уже цел.');
    payCost(player, { wood: Math.max(1, Math.ceil((fence.maxHp - fence.hp) / 50)), ore: 1, gold: fence.level * 2 });
    fence.hp = fence.maxHp;
  } else if (action.type === 'build:remove') {
    world.structures = world.structures.filter(s => s.id !== fence.id); rebuildEnvironment(world);
  } else throw new Error('Неизвестное действие с забором.');
  world.criticalSave = true;
}
export function damageFence(world, monster, fence, amount = monster.damage) {
  if (fence.hp <= 0 || world.gameOver) return;
  const damage = Math.max(1, Math.round(amount)); fence.hp = Math.max(0, fence.hp - damage);
  world.events.push({ type: 'fence-hit', id: fence.id, x: fence.x, y: fence.y, damage });
  if (!fence.hp) { world.structures = world.structures.filter(s => s.id !== fence.id); rebuildEnvironment(world); }
  world.criticalSave = true;
}
export function blockingFence(world, monster, target) {
  if (!target) return null;
  return world.structures.filter(f => f.hp > 0 && distance(monster, f) < 110 && distance(f, target) < distance(monster, target)).sort((a, b) => distance(a, monster) - distance(b, monster))[0] || null;
}

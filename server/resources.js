import { distance } from '../shared/config.js';
import { GATHERING, ORE_NODES } from '../shared/crafting.js';
import { addItem, makeItem } from './inventory.js';

export function initializeResources(world) {
  world.resourceNodes = [...world.map.trees.map(t => ({ id: t.id, kind: 'tree', name: 'Дерево', x: t.x, y: t.y })), ...ORE_NODES];
  const ids = new Set(world.resourceNodes.map(n => n.id));
  for (const id of Object.keys(world.resourceState)) if (!ids.has(id)) delete world.resourceState[id];
}
export function harvest(world, player, id) {
  const node = world.resourceNodes.find(n => n.id === id);
  if (!node || distance(player, node) > GATHERING.range) throw new Error('Подойдите ближе к дереву или рудной жиле.');
  if (!player.inventory.some(i => i.baseId === (node.kind === 'tree' ? 'axe' : 'pickaxe'))) throw new Error(node.kind === 'tree' ? 'Нужен топорик. Его продаёт Мира.' : 'Нужна кирка. У Миры она стоит 10 монет.');
  if ((player.nextHarvestAt || 0) > world.elapsed) throw new Error('Инструмент ещё не готов.');
  const state = world.resourceState[id] || { remaining: node.kind === 'tree' ? GATHERING.treeCharges : GATHERING.oreCharges, respawnAt: 0 };
  if (!state.remaining) throw new Error('Ресурс исчерпан. Дайте ему восстановиться.');
  const item = makeItem(node.kind === 'tree' ? 'wood' : 'ore'); item.quantity = node.kind === 'tree' ? GATHERING.woodYield : GATHERING.oreYield;
  addItem(player, item);
  state.remaining--; state.respawnAt = state.remaining ? 0 : world.elapsed + GATHERING.respawnMs;
  world.resourceState[id] = state; player.nextHarvestAt = world.elapsed + GATHERING.cooldownMs; player.stealthUntil = 0; player.angle = Math.atan2(node.y - player.y, node.x - player.x);
  world.events.push({ type: 'harvest', id: player.id, x: node.x, y: node.y, resource: item.baseId, amount: item.quantity });
  world.criticalSave = true;
}
export function updateResources(world) {
  for (const [id, state] of Object.entries(world.resourceState)) {
    if (state.remaining || state.respawnAt > world.elapsed) continue;
    const node = world.resourceNodes.find(n => n.id === id); if (!node) { delete world.resourceState[id]; continue; }
    if ([...world.players.values(), ...world.monsters.filter(m => m.hp > 0)].some(p => distance(p, node) < 36)) { state.respawnAt = world.elapsed + 1000; continue; }
    delete world.resourceState[id];
    world.criticalSave = true;
  }
}
export function resourcesSnapshot(world, player) {
  return world.resourceNodes.filter(n => !player || distance(n, player) < 850).map(n => ({ ...n, remaining: world.resourceState[n.id]?.remaining ?? (n.kind === 'tree' ? GATHERING.treeCharges : GATHERING.oreCharges) }));
}

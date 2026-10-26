import { randomUUID } from 'node:crypto';
import { distance } from '../shared/config.js';
import { REVIVAL } from '../shared/revival.js';

const newGrave = (world, player) => ({ id: randomUUID(), playerId: player.id, name: player.name, x: player.x, y: player.y, carrierId: null, createdAt: world.elapsed });

export function initializeGravestones(world, saved = []) {
  const owners = new Set();
  const graves = structuredClone(saved).filter(grave => {
    const owner = world.players.get(grave.playerId);
    if (!owner || owner.hp > 0 || owners.has(owner.id)) return false;
    owners.add(owner.id);
    const carrier = world.players.get(grave.carrierId);
    if (carrier) { grave.x = carrier.x; grave.y = carrier.y; }
    // Everybody is offline on load; leave carried stones at the carrier's last position.
    grave.carrierId = null;
    return true;
  });
  for (const player of world.players.values()) {
    delete player.respawnAt;
    if (player.hp <= 0 && !owners.has(player.id)) graves.push(newGrave(world, player));
  }
  return graves;
}

export function dropCarriedGravestones(world, player) {
  for (const grave of world.gravestones) if (grave.carrierId === player.id) {
    grave.carrierId = null; grave.x = player.x; grave.y = player.y;
    world.events.push({ type: 'grave-dropped', playerId: grave.playerId, name: grave.name });
    world.criticalSave = true;
  }
}

export function leaveGravestone(world, player) {
  player.input = {}; player.dashUntil = 0; player.guardUntil = 0; player.reflectUntil = 0; player.orbitUntil = 0; player.stealthUntil = 0; player.ambushUntil = 0;
  dropCarriedGravestones(world, player);
  if (!world.gravestones.some(grave => grave.playerId === player.id)) world.gravestones.push(newGrave(world, player));
  world.criticalSave = true;
}

export function carryGravestone(world, player, graveId) {
  if (world.gameOver) throw new Error('Игра завершена. Начните новое приключение.');
  if (!player?.online || player.hp <= 0 || world.players.get(player.id) !== player) throw new Error('Герой сейчас не может действовать.');
  const grave = world.gravestones.find(g => g.id === graveId);
  if (!grave || world.players.get(grave.playerId)?.hp > 0) throw new Error('Надгробие не найдено.');
  if (grave.carrierId) throw new Error('Это надгробие уже несёт другой герой.');
  if (world.gravestones.some(g => g.carrierId === player.id)) throw new Error('Вы уже несёте надгробие к алтарю.');
  if (distance(player, grave) > REVIVAL.pickupRange) throw new Error('Подойдите ближе к надгробию.');
  grave.carrierId = player.id; grave.x = player.x; grave.y = player.y;
  world.events.push({ type: 'grave-carried', id: player.id, playerId: grave.playerId, name: grave.name });
  world.criticalSave = true;
}

export function updateGravestones(world) {
  if (world.gameOver) return;
  for (const grave of [...world.gravestones]) {
    if (!grave.carrierId) continue;
    const carrier = world.players.get(grave.carrierId);
    if (!carrier?.online || carrier.hp <= 0) {
      if (carrier) dropCarriedGravestones(world, carrier); else grave.carrierId = null;
      continue;
    }
    grave.x = carrier.x; grave.y = carrier.y;
    if (distance(carrier, REVIVAL.altar) > REVIVAL.altarRange) continue;
    const player = world.players.get(grave.playerId);
    if (!player || player.hp > 0) continue;
    player.x = REVIVAL.altar.x; player.y = REVIVAL.altar.y;
    player.hp = player.maxHp; player.mana = player.maxMana;
    player.input = {}; player.inputAt = 0; player.dashUntil = 0; player.guardUntil = 0;
    player.invulnerableUntil = world.elapsed + REVIVAL.invulnerabilityMs;
    player.lastHurt = world.elapsed;
    world.gravestones = world.gravestones.filter(g => g.id !== grave.id);
    world.events.push({ type: 'respawn', id: player.id, name: player.name, rescuedBy: carrier.id, x: player.x, y: player.y });
    world.criticalSave = true;
  }
}

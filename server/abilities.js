import { randomUUID } from 'node:crypto';
import { ABILITIES, effectiveStats } from '../shared/rpg.js';
import { distance, WORLD, clamp } from '../shared/config.js';
import { melee, projectile, damageMonster } from './combat.js';
import { professionOf, skillRank, skillScale } from '../shared/professions.js';
import { castProfession } from './professions.js';

export function castAbility(world, player, data) {
  if (world.gameOver) throw new Error('Игра завершена. Начните новое приключение.');
  if (!player?.online || player.hp <= 0) throw new Error('Герой сейчас не может использовать способность.');
  const ability = data?.key === 't' ? professionOf(player) : typeof data?.key === 'string' && Object.hasOwn(ABILITIES[player.classId] || {}, data.key) ? ABILITIES[player.classId][data.key] : null;
  if (!ability || !Number.isFinite(data.x) || !Number.isFinite(data.y)) throw new Error('Неверная способность или цель.');
  if ((player.cooldowns[data.key] || 0) > world.elapsed) throw new Error('Способность ещё перезаряжается.');
  if (player.mana < ability.cost) throw new Error('Недостаточно энергии.');
  const multiplier = skillScale(skillRank(player, data.key));
  let target = { x: clamp(data.x, 12, WORLD.width - 12), y: clamp(data.y, 12, WORLD.height - 12) };
  const length = distance(player, target);
  if (length > 450) target = { x: player.x + (target.x - player.x) / length * 450, y: player.y + (target.y - player.y) / length * 450 };
  player.angle = Math.atan2(target.y - player.y, target.x - player.x);
  player.mana -= ability.cost; player.cooldowns[data.key] = world.elapsed + ability.cooldown;
  world.events.push({ type: 'ability-cast', id: player.id, classId: player.classId, profession: player.profession, key: data.key, x: player.x, y: player.y, targetX: target.x, targetY: target.y, angle: player.angle, rank: skillRank(player, data.key) });
  if (data.key === 't') { castProfession(world, player, target); world.criticalSave = true; return; }
  player.stealthUntil = 0;
  const damage = effectiveStats(player).damage * multiplier;
  if (player.classId === 'warrior') {
    if (data.key === 'q') melee(world, player, 2.6 * multiplier, 105);
    if (data.key === 'e') melee(world, player, 1.7 * multiplier, 125, true);
    if (data.key === 'r') player.guardUntil = world.elapsed + 7000;
    world.events.push({ type: 'spell', kind: data.key === 'r' ? 'guard' : 'slash', x: player.x, y: player.y, radius: data.key === 'e' ? 125 : 70, id: player.id });
  } else if (player.classId === 'mage') {
    if (data.key === 'q') projectile(world, player, { damage: damage * 2, kind: 'fire', blast: 70, speed: 410 });
    if (data.key === 'e') world.zones.push({ id: randomUUID(), ownerId: player.id, ...target, radius: 135, kind: 'ice', damage: damage * .45, expiresAt: world.elapsed + 4000, nextAt: world.elapsed + 200, interval: 800 });
    if (data.key === 'r') world.zones.push({ id: randomUUID(), ownerId: player.id, ...target, radius: 130, kind: 'meteor', damage: damage * 1.25, expiresAt: world.elapsed + 2600, nextAt: world.elapsed + 650, interval: 750 });
  } else {
    if (data.key === 'q') projectile(world, player, { damage: damage * 2.5, pierce: 3, kind: 'power', speed: 650 });
    if (data.key === 'e') for (let i = -2; i <= 2; i++) projectile(world, player, { damage: damage * .85, angle: player.angle + i * .16 });
    if (data.key === 'r') world.zones.push({ id: randomUUID(), ownerId: player.id, ...target, radius: 150, kind: 'arrows', damage: damage * .95, expiresAt: world.elapsed + 2600, nextAt: world.elapsed + 400, interval: 850 });
  }
  world.criticalSave = true;
}

export function updateZones(world) {
  for (const zone of world.zones) {
    if (world.elapsed < zone.nextAt || world.elapsed > zone.expiresAt) continue;
    zone.nextAt += zone.interval;
    const owner = world.players.get(zone.ownerId); if (!owner) continue;
    for (const monster of world.monsters) {
      if (monster.hp <= 0 || distance(zone, monster) > zone.radius) continue;
      damageMonster(world, owner, monster, zone.damage);
      if (zone.kind === 'ice') monster.slowUntil = world.elapsed + 1100;
    }
    world.events.push({ type: 'spell', kind: zone.kind, x: zone.x, y: zone.y, radius: zone.radius });
  }
  world.zones = world.zones.filter(z => z.expiresAt > world.elapsed);
}

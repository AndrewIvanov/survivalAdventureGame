import { randomUUID } from 'node:crypto';
import { distance } from '../shared/config.js';
import { effectiveStats } from '../shared/rpg.js';
import { professionOf, skillScale, bladeCount } from '../shared/professions.js';
import { damageMonster, projectile } from './combat.js';
import { chaseWaypoint } from './navigation.js';

export function chooseCritical(world, player) {
  if ((player.ambushUntil || 0) > world.elapsed) { player.ambushUntil = 0; player.stealthUntil = 0; return true; }
  return world.random() < effectiveStats(player).critical;
}
export function professionHit(world, player, monster) {
  if (monster.hp <= 0) return;
  const rank = player.professionRank || 1;
  if (player.profession === 'fire') monster.burn = { ownerId: player.id, damage: effectiveStats(player).damage * .12 * skillScale(rank), ticks: 6, nextAt: world.elapsed + 500, expiresAt: world.elapsed + 3000 };
  if (player.profession === 'ice' && (monster.nextFreezeAt || 0) <= world.elapsed && world.random() < .1 + rank * .001) freeze(world, monster, 1000 + rank * 5);
}
function freeze(world, monster, duration) {
  monster.frozenUntil = world.elapsed + duration * (monster.kind === 'guardian' ? .25 : 1);
  monster.nextFreezeAt = world.elapsed + (monster.kind === 'guardian' ? 3000 : 1500);
}
export function summonSkeletons(world, player, fill = false) {
  const count = world.allies.filter(a => a.ownerId === player.id && a.hp > 0).length;
  const cap = bladeCount(player.abilityRanks.q), wanted = fill ? cap - count : Math.min(1, cap - count);
  for (let i = 0; i < wanted; i++) {
    const angle = (count + i) * 1.7, hp = 40 + (player.professionRank || 1) * .6;
    const ally = { id: randomUUID(), kind: 'skeleton', name: 'Скелет', ownerId: player.id, x: player.x, y: player.y, hp, maxHp: hp, angle, lastAttack: -1000, expiresAt: world.elapsed + 25000 };
    world.move(ally, Math.cos(angle) * 35, Math.sin(angle) * 35, 9); world.allies.push(ally);
    world.events.push({ type: 'ally-spawn', id: ally.id, x: ally.x, y: ally.y });
  }
}
export function professionKill(world, player) { if (player.profession === 'dark' && player.hp > 0 && player.online) summonSkeletons(world, player); }

export function castProfession(world, player, target) {
  const rank = player.professionRank || 1, scale = skillScale(rank), damage = effectiveStats(player).damage;
  switch (player.profession) {
    case 'healer':
      for (const hero of world.players.values()) if (hero.online && hero.hp > 0 && distance(hero, player) <= 350) {
        hero.hp = Math.min(hero.maxHp, hero.hp + Math.round((30 + damage * 1.2) * scale));
        world.events.push({ type: 'heal', id: hero.id, x: hero.x, y: hero.y, resource: 'hp' });
      }
      break;
    case 'fire': projectile(world, player, { damage: damage * 2 * scale, kind: 'fire', blast: 110, speed: 450 }); break;
    case 'ice':
      for (const monster of world.monsters) if (monster.hp > 0 && distance(monster, target) < 160) {
        damageMonster(world, player, monster, damage * .8 * scale); if (monster.hp > 0) freeze(world, monster, 1200 + rank * 5);
      }
      world.events.push({ type: 'spell', kind: 'ice', ...target, radius: 160 }); break;
    case 'dark': summonSkeletons(world, player, true); break;
    case 'assassin': player.stealthUntil = world.elapsed + 4000 + rank * 30; player.ambushUntil = player.stealthUntil + 5000; break;
    case 'sniper': projectile(world, player, { damage: damage * 4 * scale, kind: 'sniper', speed: 850, radius: 26, remaining: 1400, pierce: 4 }); break;
    case 'aggressor': player.reflectUntil = world.elapsed + 6000; break;
    case 'squire': player.orbitUntil = world.elapsed + 8000; player.nextOrbitAt = world.elapsed; break;
    case 'braveheart': player.hp = Math.min(player.maxHp, player.hp + player.maxHp * (.1 + rank * .0005)); world.events.push({ type: 'heal', id: player.id, x: player.x, y: player.y, resource: 'hp' }); break;
    default: throw new Error('Сначала выберите профессию с 10-го уровня.');
  }
  const profession = professionOf(player);
  world.events.push({ type: 'spell', kind: player.profession === 'aggressor' ? 'guard' : 'profession', x: player.x, y: player.y, radius: 70, name: profession?.skill });
}

export function updateProfessions(world, dt) {
  for (const monster of world.monsters) {
    const burn = monster.burn, owner = world.players.get(burn?.ownerId);
    if (!burn || !owner || monster.hp <= 0) continue;
    while (burn.ticks > 0 && burn.nextAt <= world.elapsed && monster.hp > 0) {
      damageMonster(world, owner, monster, burn.damage, { proc: false }); burn.ticks--; burn.nextAt += 500;
    }
    if (!burn.ticks || monster.hp <= 0) monster.burn = null;
  }
  for (const player of world.players.values()) {
    if (!player.online || player.hp <= 0) continue;
    if (player.profession === 'braveheart') player.hp = Math.min(player.maxHp, player.hp + (.5 + (player.professionRank || 1) * .03) * dt);
    if ((player.orbitUntil || 0) > world.elapsed && world.elapsed >= (player.nextOrbitAt || 0)) {
      player.nextOrbitAt = world.elapsed + 700;
      const damage = effectiveStats(player).damage * .15 * bladeCount(player.professionRank) * skillScale(player.professionRank);
      for (const monster of world.monsters) if (monster.hp > 0 && distance(player, monster) < 100) damageMonster(world, player, monster, damage, { proc: false });
    }
  }
  for (const ally of world.allies) {
    const owner = world.players.get(ally.ownerId);
    if (!owner?.online || owner.hp <= 0 || ally.hp <= 0 || ally.expiresAt <= world.elapsed) { ally.hp = 0; continue; }
    const target = world.monsters.filter(m => m.hp > 0 && distance(m, owner) < 700).sort((a, b) => distance(a, ally) - distance(b, ally))[0];
    const destination = target || owner;
    if (target && distance(ally, target) < 40) {
      if (world.elapsed - ally.lastAttack >= 900) { ally.lastAttack = world.elapsed; damageMonster(world, owner, target, effectiveStats(owner).damage * .3 * skillScale(owner.professionRank), { proc: false }); }
    } else if (distance(ally, destination) > 38) {
      const point = chaseWaypoint(world, ally, destination, 9); ally.angle = Math.atan2(point.y - ally.y, point.x - ally.x);
      world.move(ally, Math.cos(ally.angle) * 155 * dt, Math.sin(ally.angle) * 155 * dt, 9);
    }
  }
  world.allies = world.allies.filter(a => a.hp > 0);
}

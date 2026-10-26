import { randomUUID } from 'node:crypto';
import { PLAYER, MONSTERS, distance } from '../shared/config.js';
import { effectiveStats, CLASSES } from '../shared/rpg.js';
import { canStand } from '../shared/map.js';
import { checkPartyDefeat } from './game-over.js';
import { rewardKill } from './rewards.js';

export function damageMonster(world, player, monster, amount, { critical = false, knockback = 0 } = {}) {
  if (world.gameOver || monster.hp <= 0) return;
  const damage = Math.max(1, Math.round(amount));
  monster.hp = Math.max(0, monster.hp - damage);
  monster.hurtUntil = world.elapsed + 250; monster.targetId = player.id;
  if (knockback && monster.kind !== 'guardian') {
    const angle = Math.atan2(monster.y - player.y, monster.x - player.x);
    world.move(monster, Math.cos(angle) * knockback, Math.sin(angle) * knockback);
  }
  world.events.push({ type: 'hit', id: monster.id, x: monster.x, y: monster.y - 25, damage, critical });
  if (monster.hp > 0) return;
  monster.respawnAt = world.elapsed + 45000; monster.state = 'dead'; world.kills++;
  rewardKill(world, player, monster);
}

export function lineClear(world, from, to) {
  const steps = Math.max(1, Math.ceil(distance(from, to) / 10));
  for (let i = 1; i < steps; i++) if (!canStand(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps, world.grid, 2)) return false;
  return true;
}

export function melee(world, player, multiplier = 1, radius = PLAYER.reach, fullCircle = false) {
  const stats = effectiveStats(player);
  for (const monster of world.monsters) {
    if (monster.hp <= 0 || distance(player, monster) > radius + (monster.kind === 'guardian' ? 20 : 0) || !lineClear(world, player, monster)) continue;
    const angle = Math.atan2(monster.y - player.y, monster.x - player.x);
    if (!fullCircle && Math.cos(angle - player.angle) < .18) continue;
    const critical = world.random() < stats.critical;
    damageMonster(world, player, monster, stats.damage * multiplier * (critical ? 1.75 : 1), { critical, knockback: 13 });
  }
}

export function projectile(world, player, options = {}) {
  if (world.projectiles.length >= 128) return;
  const angle = options.angle ?? player.angle;
  const p = world.projectilePool.pop() || {};
  Object.assign(p, { id: randomUUID(), ownerId: player.id, x: player.x + Math.cos(angle) * 18, y: player.y + Math.sin(angle) * 18, angle, speed: 510, damage: effectiveStats(player).damage, radius: 13, remaining: 650, kind: player.classId === 'mage' ? 'magic' : 'arrow', pierce: 1, hit: [], blast: 0, ...options });
  world.projectiles.push(p);
}

export function attack(world, player) {
  const stats = effectiveStats(player);
  if (world.gameOver || player.hp <= 0 || world.elapsed - player.lastAttack < stats.cooldown) return;
  player.lastAttack = world.elapsed;
  if (player.classId === 'mage' || player.classId === 'archer') projectile(world, player);
  else {
    world.events.push({ type: 'attack', id: player.id, x: player.x, y: player.y, angle: player.angle });
    melee(world, player);
  }
}

export function updateProjectiles(world, dt) {
  const remaining = [];
  for (const p of world.projectiles) {
    const owner = world.players.get(p.ownerId);
    let active = !!owner && p.remaining > 0;
    const length = p.speed * dt, steps = Math.ceil(length / 8);
    for (let i = 0; active && i < steps; i++) {
      p.x += Math.cos(p.angle) * length / steps; p.y += Math.sin(p.angle) * length / steps; p.remaining -= length / steps;
      if (!canStand(p.x, p.y, world.grid, 3)) { active = false; break; }
      for (const m of world.monsters) {
        if (m.hp <= 0 || p.hit.includes(m.id) || distance(p, m) > p.radius + (m.kind === 'guardian' ? 30 : 9)) continue;
        p.hit.push(m.id);
        const critical = world.random() < effectiveStats(owner).critical;
        damageMonster(world, owner, m, p.damage * (critical ? 1.75 : 1), { critical, knockback: 6 });
        if (p.blast) for (const neighbor of world.monsters) if (neighbor.id !== m.id && neighbor.hp > 0 && distance(neighbor, p) < p.blast) damageMonster(world, owner, neighbor, p.damage * .7);
        if (p.blast) world.events.push({ type: 'spell', kind: 'fire', x: p.x, y: p.y, radius: p.blast });
        if (--p.pierce <= 0) { active = false; break; }
      }
    }
    if (active && p.remaining > 0) remaining.push(p); else world.projectilePool.push(p);
  }
  world.projectiles = remaining;
}

export function hurtPlayer(world, monster, player) {
  damagePlayer(world, monster, player, monster.damage || MONSTERS[monster.kind].damage);
}

export function damagePlayer(world, monster, player, amount) {
  if (world.gameOver || player.hp <= 0 || world.elapsed < player.invulnerableUntil) return;
  const armor = effectiveStats(player).armor + (player.guardUntil > world.elapsed ? 10 + (player.abilityRanks.r - 1) * 4 : 0);
  const damage = Math.max(1, Math.round(amount - armor));
  player.hp = Math.max(0, player.hp - damage); player.lastHurt = world.elapsed;
  world.events.push({ type: 'hurt', id: player.id, x: player.x, y: player.y - 26, damage });
  if (player.hp === 0) {
    player.respawnAt = world.elapsed + PLAYER.respawnDelay; player.input = {};
    world.events.push({ type: 'death', id: player.id }); world.criticalSave = true;
    checkPartyDefeat(world);
  }
}

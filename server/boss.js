import { randomUUID } from 'node:crypto';
import { MONSTERS, distance, inVillage } from '../shared/config.js';
import { SURVIVAL } from '../shared/survival.js';
import { canStand } from '../shared/map.js';
import { spawnMonster } from './spawns.js';
import { damagePlayer } from './combat.js';

export function spawnGuardian(world, raid = null) {
  const party = [...world.players.values()];
  const averageLevel = party.reduce((sum, p) => sum + p.level, 0) / Math.max(1, party.length);
  const hp = Math.round((1100 + (averageLevel - 1) * 90) * (party.length > 1 ? 1.45 : 1) * (raid ? 1 + raid.night * .04 : 1));
  return spawnMonster(world, 'guardian', raid ? 2000 : 2240, 1152, {
    hp, maxHp: hp, damage: Math.round(20 + averageLevel * 1.1 + (raid?.night || 0)),
    bossPhase: 1, nextSpecialAt: world.elapsed + 2200, nextSummonAt: world.elapsed + 10000,
    raidId: raid?.id || null, raidNight: raid?.night || 0, objective: raid ? 'village' : 'guardian',
  });
}

export function summonGuardian(world, player) {
  if (distance(player, SURVIVAL.shrine) > 100) throw new Error('Подойдите к алтарю на восточной лесной поляне.');
  if (world.survival.guardianDefeated) throw new Error('Лесной страж уже повержен в этом мире.');
  if (world.monsters.some(m => m.kind === 'guardian' && m.hp > 0)) throw new Error('Страж уже пробуждён.');
  const boss = spawnGuardian(world);
  world.events.push({ type: 'boss-awakened', name: MONSTERS.guardian.name, x: boss.x, y: boss.y });
  world.criticalSave = true;
}

export function updateBosses(world, dt) {
  for (const boss of world.monsters.filter(m => m.kind === 'guardian' && m.hp > 0)) {
    const players = [...world.players.values()].filter(p => p.online && p.hp > 0 && (boss.raidId || !inVillage(p)));
    const phase = boss.hp / boss.maxHp <= .3 ? 3 : boss.hp / boss.maxHp <= .65 ? 2 : 1;
    if (phase > boss.bossPhase) {
      boss.bossPhase = phase; boss.nextSummonAt = world.elapsed;
      world.events.push({ type: 'boss-phase', phase, name: MONSTERS.guardian.name }); world.criticalSave = true;
    }
    else boss.bossPhase = phase;
    const target = players.filter(p => distance(p, boss) < 650).sort((a, b) => distance(a, boss) - distance(b, boss))[0];
    if (boss.telegraph) {
      if (world.elapsed >= boss.telegraph.resolveAt) {
        const attack = boss.telegraph;
        const hit = new Set();
        for (const circle of attack.circles) for (const player of players) if (!hit.has(player.id) && distance(player, circle) <= circle.radius + 8) {
          hit.add(player.id);
          damagePlayer(world, boss, player, boss.damage * (attack.kind === 'roots' ? 1.15 : 1.6));
          if (player.hp > 0) { const angle = Math.atan2(player.y - circle.y, player.x - circle.x); world.move(player, Math.cos(angle) * 25, Math.sin(angle) * 25); }
        }
        if (boss.raidId && attack.circles.some(c => distance(c, SURVIVAL.core) < c.radius + 30)) world.village.hp = Math.max(0, world.village.hp - 22);
        world.events.push({ type: 'boss-impact', kind: attack.kind, circles: attack.circles });
        boss.telegraph = null; boss.nextSpecialAt = world.elapsed + (phase === 3 ? 2200 : 3600);
      }
      continue;
    }
    if ((target || boss.raidId) && world.elapsed >= boss.nextSpecialAt) {
      const roots = phase >= 2 && Math.floor(world.elapsed / 1000) % 2 === 0;
      const circles = roots && players.length ? players.filter(p => distance(p, boss) < 650).map(p => ({ x: p.x, y: p.y, radius: phase === 3 ? 90 : 75 })) : [{ x: target?.x ?? SURVIVAL.core.x, y: target?.y ?? SURVIVAL.core.y, radius: 105 }];
      boss.telegraph = { id: randomUUID(), kind: roots ? 'roots' : 'slam', startedAt: world.elapsed, resolveAt: world.elapsed + (phase === 3 ? 850 : 1200), circles };
      world.criticalSave = true; continue;
    }
    if (phase >= 2 && target && world.elapsed >= boss.nextSummonAt) {
      const adds = world.monsters.filter(m => m.hp > 0 && m.summonOwner === boss.id).length;
      for (let i = 0; i < Math.min(phase === 3 ? 3 : 2, 5 - adds); i++) {
        if (world.monsters.filter(m => m.hp > 0 && (m.raidId || m.summonOwner)).length >= SURVIVAL.maxRaiders) break;
        spawnMonster(world, 'nightstalker', boss.x + Math.cos(i * 2.1) * 85, boss.y + Math.sin(i * 2.1) * 85, { summonOwner: boss.id, raidId: boss.raidId, objective: 'hunt', damage: Math.round(boss.damage * .45) });
      }
      boss.nextSummonAt = world.elapsed + (phase === 3 ? 9000 : 14000); world.criticalSave = true;
    }
    let destination = target || (boss.raidId ? SURVIVAL.core : { x: boss.homeX, y: boss.homeY });
    if (!target && !boss.raidId) {
      if (distance(boss, destination) < 40) boss.hp = Math.min(boss.maxHp, boss.hp + dt * boss.maxHp * .015);
      boss.state = 'return';
    } else boss.state = 'chase';
    if (target && distance(target, boss) < 58 && world.elapsed - boss.lastAttack > 1600) { boss.lastAttack = world.elapsed; damagePlayer(world, boss, target, boss.damage); }
    if (distance(boss, destination) < 45) continue;
    boss.angle = Math.atan2(destination.y - boss.y, destination.x - boss.x);
    const speed = (phase === 3 ? 82 : 64) * (boss.slowUntil > world.elapsed ? .75 : 1);
    for (const offset of [0, .6, -.6, 1.2, -1.2, 1.7, -1.7]) {
      const dx = Math.cos(boss.angle + offset) * speed * dt, dy = Math.sin(boss.angle + offset) * speed * dt;
      if (!canStand(boss.x + dx * 3, boss.y + dy * 3, world.grid, 25)) continue;
      if (!boss.raidId && inVillage({ x: boss.x + dx, y: boss.y + dy })) continue;
      world.move(boss, dx, dy, 25); break;
    }
  }
}

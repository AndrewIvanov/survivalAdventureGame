import { randomUUID } from 'node:crypto';
import { MONSTERS, distance } from '../shared/config.js';
import { SURVIVAL, clockInfo, nightStrength, BOSS_FORMS } from '../shared/survival.js';
import { pursue } from './ai.js';
import { spawnMonster } from './spawns.js';
import { damagePlayer } from './combat.js';
import { blockingFence, damageFence } from './building.js';

export function spawnGuardian(world, raid = null) {
  const party = [...world.players.values()];
  const averageLevel = party.reduce((sum, p) => sum + p.level, 0) / Math.max(1, party.length);
  const day = clockInfo(world.survival.clockMs).day, night = raid?.night || day;
  const strength = nightStrength(night);
  const form = BOSS_FORMS[(raid ? Math.max(0, Math.floor(raid.night / 3) - 1) : day - 1) % BOSS_FORMS.length];
  const hp = Math.round((MONSTERS.guardian.hp + (averageLevel - 1) * 180) * (party.length > 1 ? 1.45 : 1) * strength.hp);
  return spawnMonster(world, 'guardian', raid ? 2000 : 2240, 1152, {
    hp, maxHp: hp, damage: Math.round(MONSTERS.guardian.damage * (1 + (averageLevel - 1) * .05) * strength.damage),
    variant: form.id, name: form.name, obelisk: !raid,
    bossPhase: 1, nextSpecialAt: world.elapsed + 2200, nextSummonAt: world.elapsed + 10000,
    raidId: raid?.id || null, raidNight: raid?.night || 0, objective: 'hunt',
  });
}

export function summonGuardian(world, player) {
  if (distance(player, SURVIVAL.shrine) > 100) throw new Error('Подойдите к алтарю на восточной лесной поляне.');
  const info = clockInfo(world.survival.clockMs);
  if (info.phase !== 'day') throw new Error('Призыв у обелиска доступен днём.');
  if (world.survival.lastSummonDay === info.day) throw new Error('Сегодня призыв уже использован. Возвращайтесь после рассвета.');
  if (world.monsters.some(m => m.kind === 'guardian' && m.hp > 0)) throw new Error('Страж уже пробуждён.');
  const boss = spawnGuardian(world);
  world.survival.lastSummonDay = info.day;
  world.events.push({ type: 'boss-awakened', name: boss.name || MONSTERS.guardian.name, x: boss.x, y: boss.y });
  world.criticalSave = true;
}

export function updateBosses(world, dt) {
  for (const boss of world.monsters.filter(m => m.kind === 'guardian' && m.hp > 0)) {
    if (boss.frozenUntil > world.elapsed) { if (boss.telegraph) { boss.telegraph.resolveAt += dt * 1000; boss.telegraph.startedAt += dt * 1000; } continue; }
    const players = [...world.players.values()].filter(p => p.online && p.hp > 0 && !(p.stealthUntil > world.elapsed));
    const phase = boss.hp / boss.maxHp <= .3 ? 3 : boss.hp / boss.maxHp <= .65 ? 2 : 1;
    if (phase > boss.bossPhase) {
      boss.bossPhase = phase; boss.nextSummonAt = world.elapsed;
      world.events.push({ type: 'boss-phase', phase, name: boss.name || MONSTERS.guardian.name }); world.criticalSave = true;
    }
    else boss.bossPhase = phase;
    const target = players.slice().sort((a, b) => distance(a, boss) - distance(b, boss))[0];
    if (boss.telegraph) {
      if (world.elapsed >= boss.telegraph.resolveAt) {
        const attack = boss.telegraph;
        const hit = new Set();
        for (const circle of attack.circles) for (const player of players) if (!hit.has(player.id) && distance(player, circle) <= circle.radius + 8) {
          hit.add(player.id);
          damagePlayer(world, boss, player, boss.damage * (attack.kind === 'roots' ? 1.15 : 1.6));
          if (player.hp > 0) { const angle = Math.atan2(player.y - circle.y, player.x - circle.x); world.move(player, Math.cos(angle) * 25, Math.sin(angle) * 25); }
        }
        const walls = new Set();
        for (const circle of attack.circles) for (const fence of [...world.structures]) if (!walls.has(fence.id) && distance(fence, circle) <= circle.radius + 15) { walls.add(fence.id); damageFence(world, boss, fence, boss.damage * 1.6); }
        world.events.push({ type: 'boss-impact', kind: attack.kind, circles: attack.circles });
        boss.telegraph = null; boss.nextSpecialAt = world.elapsed + (phase === 3 ? 2200 : 3600);
      }
      continue;
    }
    if (target && distance(target, boss) < 650 && world.elapsed >= boss.nextSpecialAt) {
      const roots = phase >= 2 && Math.floor(world.elapsed / 1000) % 2 === 0;
      const circles = roots && players.length ? players.filter(p => distance(p, boss) < 650).map(p => ({ x: p.x, y: p.y, radius: phase === 3 ? 90 : 75 })) : [{ x: target?.x ?? SURVIVAL.core.x, y: target?.y ?? SURVIVAL.core.y, radius: 105 }];
      boss.telegraph = { id: randomUUID(), kind: roots ? 'roots' : 'slam', startedAt: world.elapsed, resolveAt: world.elapsed + (phase === 3 ? 850 : 1200), circles };
      world.criticalSave = true; continue;
    }
    const destination = target || { x: boss.x + Math.cos(world.elapsed / 14000 + boss.phase) * 150, y: boss.y + Math.sin(world.elapsed / 14000 + boss.phase) * 150 };
    const fence = blockingFence(world, boss, target);
    if (fence) {
      boss.state = 'siege';
      if (distance(boss, fence) < 78) {
        if (world.elapsed - boss.lastAttack > 1600) { boss.lastAttack = world.elapsed; damageFence(world, boss, fence); }
      } else pursue(world, boss, fence, MONSTERS.guardian.speed, dt, 25);
      continue;
    }
    boss.state = target ? 'chase' : 'roam';
    if (target && distance(target, boss) < 58 && world.elapsed - boss.lastAttack > 1600) { boss.lastAttack = world.elapsed; damagePlayer(world, boss, target, boss.damage); }
    if (distance(boss, destination) < 45) continue;
    const speed = MONSTERS.guardian.speed * (phase === 3 ? 82 / 64 : 1) * (boss.slowUntil > world.elapsed ? .75 : 1);
    pursue(world, boss, destination, speed, dt, 25);
  }
}

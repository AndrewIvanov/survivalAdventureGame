import { randomUUID } from 'node:crypto';
import { MONSTERS, distance } from '../shared/config.js';
import { SURVIVAL, clockInfo, nightStrength, BOSS_FORMS } from '../shared/survival.js';
import { pursue } from './ai.js';
import { spawnMonster } from './spawns.js';
import { damagePlayer } from './combat.js';

export function spawnGuardian(world, raid = null) {
  const party = [...world.players.values()];
  const averageLevel = party.reduce((sum, p) => sum + p.level, 0) / Math.max(1, party.length);
  const day = clockInfo(world.survival.clockMs).day, night = raid?.night || day;
  const strength = nightStrength(night);
  const form = BOSS_FORMS[(raid ? Math.floor(raid.night / 2) - 1 : day - 1) % BOSS_FORMS.length];
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
    const players = [...world.players.values()].filter(p => p.online && p.hp > 0);
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
    if (clockInfo(world.survival.clockMs).phase === 'night' && phase >= 2 && target && world.elapsed >= boss.nextSummonAt) {
      const adds = world.monsters.filter(m => m.hp > 0 && m.summonOwner === boss.id).length;
      for (let i = 0; i < Math.min(phase === 3 ? 3 : 2, 5 - adds); i++) {
        if (world.monsters.filter(m => m.hp > 0 && (m.raidId || m.summonOwner)).length >= SURVIVAL.maxRaiders) break;
        spawnMonster(world, 'nightstalker', boss.x + Math.cos(i * 2.1) * 85, boss.y + Math.sin(i * 2.1) * 85, { summonOwner: boss.id, raidId: boss.raidId, raidNight: boss.raidNight || clockInfo(world.survival.clockMs).day, objective: 'hunt', hp: Math.round(MONSTERS.nightstalker.hp * nightStrength(clockInfo(world.survival.clockMs).day).hp), maxHp: Math.round(MONSTERS.nightstalker.hp * nightStrength(clockInfo(world.survival.clockMs).day).hp), damage: Math.round(boss.damage * .6) });
      }
      boss.nextSummonAt = world.elapsed + (phase === 3 ? 9000 : 14000); world.criticalSave = true;
    }
    const destination = target || { x: boss.x + Math.cos(world.elapsed / 14000 + boss.phase) * 150, y: boss.y + Math.sin(world.elapsed / 14000 + boss.phase) * 150 };
    boss.state = target ? 'chase' : 'roam';
    if (target && distance(target, boss) < 58 && world.elapsed - boss.lastAttack > 1600) { boss.lastAttack = world.elapsed; damagePlayer(world, boss, target, boss.damage); }
    if (distance(boss, destination) < 45) continue;
    const speed = (phase === 3 ? 82 : 64) * (boss.slowUntil > world.elapsed ? .75 : 1);
    pursue(world, boss, destination, speed, dt, 25);
  }
}

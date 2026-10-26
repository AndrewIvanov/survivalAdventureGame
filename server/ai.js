import { MONSTERS, distance, inVillage } from '../shared/config.js';
import { SURVIVAL, clockInfo } from '../shared/survival.js';
import { canStand } from '../shared/map.js';
import { damagePlayer } from './combat.js';

export function updateMonsters(world, dt) {
  const alive = [...world.players.values()].filter(p => p.online && p.hp > 0);
  const night = clockInfo(world.survival.clockMs).phase === 'night';
  for (const monster of world.monsters) {
    if (monster.kind === 'guardian') continue;
    const config = MONSTERS[monster.kind], raider = !!(monster.raidId || monster.summonOwner);
    if (monster.hp <= 0) {
      if (!raider && world.elapsed >= monster.respawnAt) {
        monster.hp = config.hp; monster.x = monster.homeX; monster.y = monster.homeY; monster.state = 'patrol';
      }
      continue;
    }
    const players = alive.filter(p => raider || !inVillage(p));
    let target = null, nearest = config.aggro * (night ? 1.25 : 1);
    if (raider) nearest = monster.objective === 'hunt' ? 700 : 155;
    for (const p of players) {
      const d = distance(monster, p), limit = nearest + (monster.targetId === p.id ? 90 : 0);
      if (d < limit) { target = p; nearest = d; }
    }
    if (!raider && distance({ x: monster.homeX, y: monster.homeY }, monster) > 430) target = null;
    let tx, ty, speed = config.speed * (night ? 1.1 : 1);
    if (monster.slowUntil > world.elapsed) speed *= .4;
    if (target) {
      monster.targetId = target.id;
      monster.state = distance(monster, target) <= config.range ? 'attack' : 'chase';
      tx = target.x; ty = target.y;
      if (monster.state === 'attack') {
        if (world.elapsed - monster.lastAttack >= config.cooldown) {
          monster.lastAttack = world.elapsed;
          damagePlayer(world, monster, target, (monster.damage || config.damage) * (!raider && night ? 1.15 : 1));
        }
        continue;
      }
    } else if (raider) {
      monster.targetId = null; monster.state = 'raid';
      tx = SURVIVAL.core.x; ty = SURVIVAL.core.y;
      if (distance(monster, SURVIVAL.core) < 80 && world.village.hp > 0) {
        if (world.elapsed - monster.lastAttack >= config.cooldown) {
          monster.lastAttack = world.elapsed;
          world.village.hp = Math.max(0, world.village.hp - (monster.villageDamage || 3));
          world.events.push({ type: 'village-hit', x: SURVIVAL.core.x, y: SURVIVAL.core.y, damage: monster.villageDamage || 3 });
        }
        continue;
      }
    } else {
      monster.targetId = null;
      const home = distance(monster, { x: monster.homeX, y: monster.homeY });
      monster.state = home > 110 ? 'return' : 'patrol';
      const phase = world.elapsed / 4300 + monster.phase;
      tx = monster.homeX + (monster.state === 'return' ? 0 : Math.cos(phase) * 48);
      ty = monster.homeY + (monster.state === 'return' ? 0 : Math.sin(phase * .8) * 36);
      speed *= .42;
      if (home > 120) monster.hp = Math.min(config.hp, monster.hp + dt * 4);
    }
    monster.angle = Math.atan2(ty - monster.y, tx - monster.x);
    if (Math.hypot(tx - monster.x, ty - monster.y) < 8) continue;
    for (const offset of [0, .55, -.55, 1.05, -1.05, 1.6, -1.6, 2.3, -2.3]) {
      const dx = Math.cos(monster.angle + offset) * speed * dt, dy = Math.sin(monster.angle + offset) * speed * dt;
      if (!canStand(monster.x + dx * 3, monster.y + dy * 3, world.grid, 12)) continue;
      if (!raider && inVillage({ x: monster.x + dx, y: monster.y + dy })) continue;
      world.move(monster, dx, dy, 12); break;
    }
  }
}

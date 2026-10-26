import { MONSTERS, distance, inVillage } from '../shared/config.js';
import { canStand } from '../shared/map.js';
import { hurtPlayer } from './combat.js';

export function updateMonsters(world, dt) {
  const players = [...world.players.values()].filter(p => p.online && p.hp > 0 && !inVillage(p));
  for (const monster of world.monsters) {
    const config = MONSTERS[monster.kind];
    if (monster.hp <= 0) {
      if (world.elapsed >= monster.respawnAt) {
        monster.hp = config.hp; monster.x = monster.homeX; monster.y = monster.homeY; monster.state = 'patrol';
      }
      continue;
    }
    let target = null, nearest = config.aggro;
    for (const p of players) {
      const d = distance(monster, p);
      const limit = monster.targetId === p.id ? config.aggro * 1.5 : config.aggro;
      if (d < limit && d < nearest + (monster.targetId === p.id ? 100 : 0)) { target = p; nearest = d; }
    }
    if (distance({ x: monster.homeX, y: monster.homeY }, monster) > 430) target = null;
    let tx, ty, speed = config.speed;
    if (monster.slowUntil > world.elapsed) speed *= .4;
    if (target) {
      monster.targetId = target.id;
      monster.state = nearest <= config.range ? 'attack' : 'chase';
      tx = target.x; ty = target.y;
      if (nearest <= config.range) {
        if (world.elapsed - monster.lastAttack >= config.cooldown) {
          monster.lastAttack = world.elapsed;
          hurtPlayer(world, monster, target);
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
    const angle = Math.atan2(ty - monster.y, tx - monster.x);
    monster.angle = angle;
    if (Math.hypot(tx - monster.x, ty - monster.y) < 8) continue;
    // Steer around static geometry instead of pushing directly into obstacles.
    for (const offset of [0, .55, -.55, 1.05, -1.05, 1.6, -1.6, 2.3, -2.3]) {
      const dx = Math.cos(angle + offset) * speed * dt, dy = Math.sin(angle + offset) * speed * dt;
      if (!canStand(monster.x + dx * 3, monster.y + dy * 3, world.grid, 12)) continue;
      if (inVillage({ x: monster.x + dx, y: monster.y + dy })) continue;
      world.move(monster, dx, dy, 12);
      break;
    }
  }
}

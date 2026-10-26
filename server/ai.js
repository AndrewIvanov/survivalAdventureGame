import { MONSTERS, distance, WORLD } from '../shared/config.js';
import { canStand } from '../shared/map.js';
import { chaseWaypoint } from './navigation.js';
import { damagePlayer } from './combat.js';

// No home leash or village exclusion: every living hero can be hunted anywhere.
export function pursue(world, monster, target, speed, dt, radius = 12) {
  target = chaseWaypoint(world, monster, target, radius);
  monster.angle = Math.atan2(target.y - monster.y, target.x - monster.x);
  if (distance(monster, target) < 8) return;
  for (const offset of [0, .55, -.55, 1.05, -1.05, 1.6, -1.6, 2.3, -2.3]) {
    const dx = Math.cos(monster.angle + offset) * speed * dt, dy = Math.sin(monster.angle + offset) * speed * dt;
    if (!canStand(monster.x + dx * 3, monster.y + dy * 3, world.grid, radius)) continue;
    world.move(monster, dx, dy, radius); break;
  }
}

export function updateMonsters(world, dt) {
  const alive = [...world.players.values()].filter(p => p.online && p.hp > 0);
  for (const monster of world.monsters) {
    if (monster.kind === 'guardian' || monster.hp <= 0) continue;
    const config = MONSTERS[monster.kind];
    const target = alive.reduce((nearest, p) => !nearest || distance(monster, p) < distance(monster, nearest) ? p : nearest, null);
    monster.targetId = target?.id || null;
    monster.state = target ? distance(monster, target) <= config.range ? 'attack' : 'chase' : 'roam';
    if (monster.state === 'attack') {
      if (world.elapsed - monster.lastAttack >= config.cooldown) {
        monster.lastAttack = world.elapsed;
        damagePlayer(world, monster, target, monster.damage || config.damage);
      }
      continue;
    }
    // With no living target, wander over the map instead of returning to a nest.
    const phase = Math.floor(world.elapsed / 14000) + monster.phase;
    const destination = target || { x: WORLD.width / 2 + Math.cos(phase) * 1250, y: WORLD.height / 2 + Math.sin(phase * 1.7) * 900 };
    pursue(world, monster, destination, config.speed * 1.1 * (monster.slowUntil > world.elapsed ? .4 : 1), dt);
  }
}

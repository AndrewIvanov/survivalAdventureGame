import { randomUUID } from 'node:crypto';
import { MONSTERS, WORLD, clamp } from '../shared/config.js';
import { canStand } from '../shared/map.js';

export function freePoint(world, x, y, radius = 12) {
  if (canStand(x, y, world.grid, radius)) return { x, y };
  for (let ring = 16; ring <= 256; ring += 16) for (let i = 0; i < 16; i++) {
    const px = clamp(x + Math.cos(i * Math.PI / 8) * ring, radius + 1, WORLD.width - radius - 1);
    const py = clamp(y + Math.sin(i * Math.PI / 8) * ring, radius + 1, WORLD.height - radius - 1);
    if (canStand(px, py, world.grid, radius)) return { x: px, y: py };
  }
  return { ...WORLD.spawn };
}

export function spawnMonster(world, kind, x, y, extra = {}) {
  const config = MONSTERS[kind], point = freePoint(world, x, y, kind === 'guardian' ? 25 : 12);
  const monster = world.monsterPool.pop() || {};
  for (const key of Object.keys(monster)) delete monster[key];
  Object.assign(monster, { id: randomUUID(), kind, ...point, homeX: point.x, homeY: point.y, hp: Math.round(config.hp), maxHp: Math.round(config.hp), damage: config.damage, phase: world.random() * 6.28, angle: 0, state: 'patrol', lastAttack: -2000, hurtUntil: 0, respawnAt: 0, spawnedAt: world.elapsed, ...extra });
  world.monsters.push(monster); return monster;
}

import { createCollisionGrid } from '../shared/map.js';
import { FENCES } from '../shared/crafting.js';

export function rebuildEnvironment(world) {
  const obstacles = world.map.obstacles.filter(o => !o.resourceId || world.resourceState[o.resourceId]?.remaining !== 0);
  for (const wall of world.structures) if (wall.hp > 0) obstacles.push({ x: wall.x - FENCES.size / 2, y: wall.y - FENCES.size / 2, w: FENCES.size, h: FENCES.size, type: 'fence' });
  world.grid = createCollisionGrid(obstacles); world.navigation = null;
}

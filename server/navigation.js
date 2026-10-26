import { WORLD, distance } from '../shared/config.js';
import { canStand } from '../shared/map.js';

const TILE = 32, COLS = WORLD.width / TILE, ROWS = WORLD.height / TILE;
const indexAt = point => Math.max(0, Math.min(ROWS - 1, Math.floor(point.y / TILE))) * COLS + Math.max(0, Math.min(COLS - 1, Math.floor(point.x / TILE)));
const center = index => ({ x: (index % COLS + .5) * TILE, y: (Math.floor(index / COLS) + .5) * TILE });
function neighbors(index) {
  const x = index % COLS, y = Math.floor(index / COLS);
  return [x > 0 ? index - 1 : -1, x < COLS - 1 ? index + 1 : -1, y > 0 ? index - COLS : -1, y < ROWS - 1 ? index + COLS : -1].filter(i => i >= 0);
}

// One shared distance field per hero and creature size. Hundreds of hunters reuse
// the same route around houses and trees instead of calculating hundreds of paths.
export function chaseWaypoint(world, monster, target, radius) {
  if (!target.id || distance(monster, target) < 60) return target;
  world.navigation ||= { terrain: new Map(), fields: new Map() };
  const navigation = world.navigation;
  let passable = navigation.terrain.get(radius);
  if (!passable) {
    passable = Uint8Array.from({ length: COLS * ROWS }, (_, index) => { const p = center(index); return +canStand(p.x, p.y, world.grid, radius); });
    navigation.terrain.set(radius, passable);
  }
  const goal = indexAt(target), key = `${target.id}:${radius}`;
  let field = navigation.fields.get(key);
  if (!field || field.goal !== goal) {
    let start = goal;
    if (!passable[start]) {
      let best = Infinity;
      for (let i = 0; i < passable.length; i++) if (passable[i]) {
        const d = distance(center(i), target);
        if (d < best) { start = i; best = d; }
      }
    }
    const distances = new Int16Array(passable.length).fill(-1), queue = new Int32Array(passable.length);
    distances[start] = 0; queue[0] = start;
    for (let head = 0, tail = 1; head < tail; head++) for (const next of neighbors(queue[head])) {
      if (!passable[next] || distances[next] >= 0) continue;
      distances[next] = distances[queue[head]] + 1; queue[tail++] = next;
    }
    field = { goal, distances }; navigation.fields.set(key, field);
  }
  const here = indexAt(monster), options = neighbors(here).filter(i => field.distances[i] >= 0 && canStand(center(i).x, center(i).y, world.grid, radius));
  options.sort((a, b) => field.distances[a] - field.distances[b] || distance(center(a), target) - distance(center(b), target));
  if (!options.length || (field.distances[here] >= 0 && field.distances[options[0]] >= field.distances[here])) return target;
  return center(options[0]);
}

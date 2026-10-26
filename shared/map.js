import { WORLD, clamp } from './config.js';

export function seeded(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function createMap(seed = WORLD.seed) {
  const random = seeded(seed);
  const buildings = [
    { id: 'tavern', name: 'Таверна «Тихая сосна»', x: 1290, y: 1004, w: 144, h: 110, style: 'tavern' },
    { id: 'hall', name: 'Дом старосты', x: 1760, y: 1000, w: 128, h: 112, style: 'hall' },
    { id: 'forge', name: 'Кузница', x: 1262, y: 1290, w: 118, h: 100, style: 'forge' },
    { id: 'shop', name: 'Торговая лавка', x: 1778, y: 1280, w: 116, h: 100, style: 'shop' },
    { id: 'cottage', name: 'Дом лесника', x: 1420, y: 820, w: 104, h: 94, style: 'cottage' },
  ];
  const obstacles = buildings.map(b => ({ x: b.x - b.w * .43, y: b.y - 24, w: b.w * .86, h: 56, type: 'building' }));
  obstacles.push({ x: 1504, y: 1120, w: 64, h: 59, type: 'fountain' });
  const trees = [];
  for (let i = 0; i < 1100; i++) {
    const x = 48 + random() * (WORLD.width - 96), y = 70 + random() * (WORLD.height - 140);
    const fromVillage = Math.hypot(x - 1536, y - 1152);
    const road = Math.abs(y - 1152) < 60 || Math.abs(x - 1536) < 53;
    const clearing = Math.hypot(x - 2180, y - 1170) < 125 || Math.hypot(x - 830, y - 1000) < 120;
    const pond = Math.hypot((x - 2110) / 1.5, y - 690) < 140;
    if (fromVillage < 390 || road || clearing || pond || trees.some(t => Math.hypot(t.x - x, t.y - y) < 50)) continue;
    const tree = { x: Math.round(x), y: Math.round(y), variant: Math.floor(random() * 3), scale: .85 + random() * .4 };
    trees.push(tree);
    obstacles.push({ x: tree.x - 10, y: tree.y - 8, w: 20, h: 18, type: 'tree' });
  }
  obstacles.push({ x: 1950, y: 590, w: 285, h: 198, type: 'water' });
  const rocks = [];
  for (let i = 0; i < 65; i++) {
    const x = 60 + random() * 2950, y = 60 + random() * 2180;
    if (Math.hypot(x - 1536, y - 1152) < 410 || Math.abs(y - 1152) < 70 || Math.abs(x - 1536) < 65) continue;
    rocks.push({ x, y, variant: i % 3 });
    obstacles.push({ x: x - 13, y: y - 8, w: 26, h: 18, type: 'rock' });
  }
  return { seed, buildings, trees, rocks, obstacles };
}

// Static spatial buckets keep collision queries bounded as the map grows.
export function createCollisionGrid(obstacles, cellSize = 128) {
  const cells = new Map();
  for (const o of obstacles) {
    for (let x = Math.floor(o.x / cellSize); x <= Math.floor((o.x + o.w) / cellSize); x++) {
      for (let y = Math.floor(o.y / cellSize); y <= Math.floor((o.y + o.h) / cellSize); y++) {
        const key = `${x},${y}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(o);
      }
    }
  }
  return { cells, cellSize };
}

export function canStand(x, y, grid, radius = 11) {
  if (x < radius || y < radius || x > WORLD.width - radius || y > WORLD.height - radius) return false;
  const { cells, cellSize } = grid;
  for (let cx = Math.floor((x - radius) / cellSize); cx <= Math.floor((x + radius) / cellSize); cx++) {
    for (let cy = Math.floor((y - radius) / cellSize); cy <= Math.floor((y + radius) / cellSize); cy++) {
      for (const o of cells.get(`${cx},${cy}`) || []) {
        const nearX = clamp(x, o.x, o.x + o.w), nearY = clamp(y, o.y, o.y + o.h);
        if ((x - nearX) ** 2 + (y - nearY) ** 2 < radius ** 2) return false;
      }
    }
  }
  return true;
}

export function moveEntity(entity, dx, dy, grid, radius = 11) {
  // Small steps prevent dashing through walls.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 7));
  for (let i = 0; i < steps; i++) {
    if (canStand(entity.x + dx / steps, entity.y, grid, radius)) entity.x += dx / steps;
    if (canStand(entity.x, entity.y + dy / steps, grid, radius)) entity.y += dy / steps;
  }
}

export const monsterSpawns = [
  [1930, 1134, 'wolf'], [2080, 1220, 'wolf'], [2220, 1090, 'goblin'], [2320, 1260, 'goblin'],
  [1080, 1130, 'wolf'], [930, 1230, 'wolf'], [800, 1020, 'goblin'], [720, 1180, 'goblin'],
  [1510, 1620, 'wolf'], [1615, 1810, 'goblin'], [1450, 1910, 'wolf'],
  [1530, 610, 'wolf'], [1620, 420, 'goblin'], [1410, 330, 'wolf'],
];

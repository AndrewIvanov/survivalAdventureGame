export const WORLD = { width: 3072, height: 2304, tile: 32, seed: 7319, spawn: { x: 1536, y: 1298 }, village: { x: 1536, y: 1152, radius: 330 } };
export const TICK_RATE = 20;
export const SNAPSHOT_RATE = 10;
export const PLAYER = { radius: 11, speed: 175, maxHp: 120, startingGold: 50, damage: 24, reach: 78, attackCooldown: 480, dashCooldown: 2400 };
export const MONSTERS = {
  wolf: { name: 'Серый волк', hp: 128, speed: 98, damage: 18, xp: 24, gold: 4, aggro: 265, range: 30, cooldown: 1150 },
  goblin: { name: 'Лесной гоблин', hp: 192, speed: 72, damage: 28, xp: 38, gold: 7, aggro: 230, range: 36, cooldown: 1450 },
  nightstalker: { name: 'Сумеречный хищник', hp: 164, speed: 120, damage: 24, xp: 32, gold: 6, aggro: 370, range: 32, cooldown: 1100 },
  guardian: { name: 'Древний лесной страж', hp: 2200, speed: 64, damage: 44, xp: 240, gold: 70, aggro: 650, range: 58, cooldown: 1600 },
};
export const levelXp = level => 80 + (level - 1) * 50;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const inVillage = p => distance(p, WORLD.village) < WORLD.village.radius;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

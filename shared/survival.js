import { WORLD, inVillage } from './config.js';

export const SURVIVAL = {
  dayMs: 420000, nightMs: 180000, warningMs: 30000, villageHp: 900,
  maxRaiders: 32, spawnInterval: 18000, batchSize: 4,
  core: { x: WORLD.village.x, y: WORLD.village.y + 78, radius: 32 },
  shrine: { id: 'guardian-shrine', name: 'Алтарь Лесного стража', x: 2180, y: 1108 },
};
export const CYCLE_MS = SURVIVAL.dayMs + SURVIVAL.nightMs;

export function clockInfo(clockMs) {
  const day = Math.floor(clockMs / CYCLE_MS) + 1, offset = clockMs % CYCLE_MS;
  const night = offset >= SURVIVAL.dayMs;
  return { day, phase: night ? 'night' : 'day', nightNumber: night ? day : Math.max(0, day - 1), remaining: (night ? CYCLE_MS : SURVIVAL.dayMs) - offset, warning: !night && offset >= SURVIVAL.dayMs - SURVIVAL.warningMs, progress: offset / CYCLE_MS };
}
export const assaultActive = survival => survival?.wave?.status === 'active';
export const sheltered = (world, player) => inVillage(player) && !assaultActive(world.survival) && (world.village?.hp ?? 1) > 0;

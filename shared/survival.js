import { WORLD, inVillage } from './config.js';

export const SURVIVAL = {
  dayMs: 300000, nightMs: 120000, warningMs: 30000, villageHp: 900,
  maxRaiders: 400, batchSize: 5,
  core: { x: WORLD.village.x, y: WORLD.village.y + 78, radius: 32 },
  shrine: { id: 'guardian-shrine', name: 'Обелиск призыва', x: 2180, y: 1108 },
};
export const CYCLE_MS = SURVIVAL.dayMs + SURVIVAL.nightMs;

export function clockInfo(clockMs) {
  const day = Math.floor(clockMs / CYCLE_MS) + 1, offset = clockMs % CYCLE_MS;
  const night = offset >= SURVIVAL.dayMs;
  return { day, phase: night ? 'night' : 'day', nightNumber: night ? day : Math.max(0, day - 1), remaining: (night ? CYCLE_MS : SURVIVAL.dayMs) - offset, warning: !night && offset >= SURVIVAL.dayMs - SURVIVAL.warningMs, progress: offset / CYCLE_MS };
}
export const waveSize = night => 40 + Math.max(0, Math.floor((night - 1) / 2)) * 20;
export const nightStrength = night => ({ hp: 1 + Math.max(0, night - 1) * .2, damage: 1 + Math.max(0, night - 1) * .15 });
export const BOSS_FORMS = [
  { id: 'forest', name: 'Древний лесной страж' },
  { id: 'frost', name: 'Ледяной исполин' },
  { id: 'ember', name: 'Пепельный разрушитель' },
  { id: 'storm', name: 'Грозовой титан' },
];
export const assaultActive = survival => survival?.wave?.status === 'active';
export const sheltered = (world, player) => inVillage(player) && (world.survival?.phase || clockInfo(world.survival?.clockMs || 0).phase) === 'day' && !assaultActive(world.survival) && (world.village?.hp ?? 1) > 0;

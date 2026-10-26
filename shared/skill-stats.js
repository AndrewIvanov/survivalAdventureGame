import { ABILITIES, effectiveStats } from './rpg.js';
import { MAX_SKILL_RANK, skillRank, skillScale, bladeCount, professionOf } from './professions.js';

export function skillStats(player, key, rank = skillRank(player, key)) {
  const stats = effectiveStats(player), damage = stats.damage, scale = skillScale(rank), rows = [], notes = [];
  const add = (label, value, unit = '') => rows.push({ label, value, unit });
  const hit = (label, multiplier) => add(label, Math.round(damage * multiplier * scale));
  if (key !== 't') {
    const ability = ABILITIES[player.classId]?.[key]; if (!ability) return null;
    if (player.classId === 'warrior') {
      if (key === 'q') hit('Урон без крита', 2.6);
      if (key === 'e') hit('Урон каждой цели', 1.7);
      if (key === 'r') { add('Дополнительная броня', 10 + (rank - 1) * .1); add('Длительность', 7, 'с'); }
    } else if (player.classId === 'mage') {
      if (key === 'q') { hit('Урон попадания', 2); hit('Урон взрыва рядом', 1.4); }
      if (key === 'e') { hit('Урон за такт', .45); add('Длительность', 4, 'с'); }
      if (key === 'r') { hit('Урон одного метеора', 1.25); add('Число ударов', 3); }
    } else {
      if (key === 'q') { hit('Урон без крита', 2.5); add('Пробитых целей', 3); }
      if (key === 'e') { hit('Урон одной стрелы', .85); add('Число стрел', 5); }
      if (key === 'r') { hit('Урон одной волны', .95); add('Число волн', 3); }
      if (player.profession === 'dark' && key === 'q') { add('Максимум скелетов', bladeCount(rank)); notes.push('Новый скелет на рангах стрелы 26, 51 и 76.'); }
    }
    notes.push(`Расход: ${ability.cost} энергии · перезарядка ${ability.cooldown / 1000} с.`);
    if (!(player.classId === 'warrior' && key === 'r')) notes.push('Каждый ранг: +1% базового эффекта. Итоговый урон округляется, крит рассчитывается отдельно.');
    return { name: ability.name, rank, rows, notes };
  }
  const profession = professionOf(player); if (!profession) return null;
  if (player.profession === 'healer') { add('Лечение каждому герою', Math.round((30 + damage * 1.2) * scale)); add('Радиус', 350); }
  if (player.profession === 'fire') { hit('Урон попадания', 2); add('Горение за 0,5 с', Math.round(damage * .12 * scale)); add('Длительность горения', 3, 'с'); }
  if (player.profession === 'ice') { hit('Урон оков', .8); add('Заморозка оковами', (1200 + rank * 5) / 1000, 'с'); add('Шанс заморозки при попадании', 10 + rank * .1, '%'); notes.push('Заморозка босса длится в 4 раза меньше.'); }
  if (player.profession === 'dark') { add('Максимум скелетов', bladeCount(player.abilityRanks.q)); add('Здоровье скелета', 40 + rank * .6); hit('Урон скелета', .3); add('Время жизни', 25, 'с'); notes.push('Число скелетов зависит от ранга первой стрелы, её пороги: 26, 51, 76.'); }
  if (player.profession === 'assassin') { add('Невидимость', (4000 + rank * 30) / 1000, 'с'); add('Крит первой атаки', 175, '% урона'); }
  if (player.profession === 'sniper') { hit('Урон без крита', 4); add('Дальность', 1400); add('Пробитых целей', 4); }
  if (player.profession === 'aggressor') { add('Отражение полученного урона', Math.min(.7, .35 * scale) * 100, '%'); add('Длительность', 6, 'с'); }
  if (player.profession === 'squire') { add('Вращающихся мечей', bladeCount(rank)); hit('Урон за такт круга', .15 * bladeCount(rank)); add('Длительность', 8, 'с'); notes.push('Ещё один меч на рангах 26, 51 и 76. Урон наносится каждые 0,7 с.'); }
  if (player.profession === 'braveheart') { add('Максимум здоровья героя', effectiveStats({ ...player, professionRank: rank }).maxHp); add('Восстановление здоровья', .5 + rank * .03, '/с'); add('Лечение при активации', (10 + rank * .05), '% макс. HP'); }
  notes.push(`Расход: ${profession.cost} энергии · перезарядка ${profession.cooldown / 1000} с.`);
  return { name: profession.skill, rank, rows, notes };
}
export function skillComparison(player, key, steps = 1) {
  const rank = skillRank(player, key), current = skillStats(player, key, rank); if (!current) return null;
  const nextRank = Math.min(MAX_SKILL_RANK, rank + steps), next = skillStats(player, key, nextRank);
  return { ...current, nextRank, rows: current.rows.map((row, i) => ({ ...row, next: next.rows[i].value, delta: next.rows[i].value - row.value })) };
}
export const formatSkillValue = value => Number(value.toFixed(3)).toLocaleString('ru-RU', { maximumFractionDigits: 3 });

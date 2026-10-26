import { skillComparison, formatSkillValue as number } from '../shared/skill-stats.js';

export function skillDetails(player, key, showRank = false) {
  const detail = skillComparison(player, key); if (!detail) return '';
  return `<div class="skill-stat-list">${showRank ? `<small>Ранг ${detail.rank}/100${detail.rank < 100 ? ` → ${detail.nextRank}/100` : ' · Максимум'}</small>` : ''}${detail.rows.map(row => `<div><span>${row.label}</span><b>${number(row.value)}${row.unit ? ` ${row.unit}` : ''}${detail.rank < 100 ? ` → ${number(row.next)}${row.unit ? ` ${row.unit}` : ''} <em>(+${number(row.delta)}${row.unit ? row.unit.startsWith('%') ? ' п.п.' : ` ${row.unit}` : ''})</em>` : ''}</b></div>`).join('')}</div>`;
}
export function skillSummary(player, key) {
  const detail = skillComparison(player, key); if (!detail) return '';
  return `${detail.name} · ${detail.rank}/100${detail.rank < 100 ? ` → ${detail.nextRank}/100` : ' · Максимум'}\n${detail.rows.map(r => `${r.label}: ${number(r.value)}${r.unit ? ` ${r.unit}` : ''}${detail.rank < 100 ? ` → ${number(r.next)} (+${number(r.delta)})` : ''}`).join('\n')}`;
}

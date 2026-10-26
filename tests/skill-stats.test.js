import test from 'node:test';
import assert from 'node:assert/strict';
import { GameWorld } from '../server/world.js';
import { skillComparison } from '../shared/skill-stats.js';
import { PROFESSIONS } from '../shared/professions.js';
import { castAbility } from '../server/abilities.js';
import { spawnMonster } from '../server/spawns.js';

const hero = classId => { const world = new GameWorld(); world.random = () => .99; const player = world.join('a', 'Герой', 'ranger', classId); player.x = 1700; player.y = 1152; return { world, player }; };
test('damage shown in an upgrade matches an actual warrior strike and accumulates small rank increments', () => {
  const { world, player } = hero('warrior'); player.abilityRanks.q = 20;
  const detail = skillComparison(player, 'q');
  const target = spawnMonster(world, 'wolf', 1760, 1152); const hp = target.hp;
  castAbility(world, player, { key: 'q', x: 1760, y: 1152 }); assert.equal(hp - target.hp, detail.rows[0].value);
  player.abilityRanks.q++; const next = skillComparison(player, 'q'); assert.equal(next.rows[0].value, detail.rows[0].next);
  assert.equal(detail.rows[0].delta, detail.rows[0].next - detail.rows[0].value);
});
test('profession previews show special increments, sword thresholds, and no next upgrade after rank 100', () => {
  const { player } = hero('warrior');
  for (const [id, profession] of Object.entries(PROFESSIONS)) {
    player.classId = profession.classId; player.profession = id; player.professionRank = 25;
    const detail = skillComparison(player, 't'); assert.ok(detail.rows.length); assert.ok(detail.rows.every(r => Number.isFinite(r.value) && Number.isFinite(r.next) && r.delta >= 0));
  }
  player.profession = 'squire'; player.classId = 'warrior'; player.professionRank = 25;
  const swords = skillComparison(player, 't').rows[0]; assert.equal(swords.value, 1); assert.equal(swords.next, 2);
  player.profession = 'braveheart'; const regen = skillComparison(player, 't').rows.find(r => r.label === 'Восстановление здоровья'); assert.ok(Math.abs(regen.delta - .03) < 1e-9);
  player.professionRank = 100; const max = skillComparison(player, 't'); assert.equal(max.nextRank, 100); assert.ok(max.rows.every(r => r.delta === 0));
});

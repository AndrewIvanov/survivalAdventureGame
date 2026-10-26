import { clockInfo } from '../shared/survival.js';

export function checkPartyDefeat(world) {
  if (world.gameOver) return true;
  const online = [...world.players.values()].filter(p => p.online);
  if (!online.length || online.some(p => p.hp > 0)) return false;
  const { day, phase } = clockInfo(world.survival.clockMs);
  world.gameOver = { reason: 'party-defeated', day, phase, at: world.elapsed, kills: world.kills };
  world.daySkipVotes.clear();
  for (const player of world.players.values()) player.input = {};
  world.events.push({ type: 'game-over', ...world.gameOver }); world.criticalSave = true;
  return true;
}

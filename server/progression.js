import { levelXp } from '../shared/config.js';
import { refreshStats } from './inventory.js';

export function grantExperience(world, player, amount) {
  player.xp += amount;
  while (player.xp >= levelXp(player.level)) {
    player.xp -= levelXp(player.level);
    player.level++;
    player.statPoints += 3; player.skillPoints += 3;
    refreshStats(player, player.hp > 0);
    world.events.push({ type: 'level', id: player.id, level: player.level, x: player.x, y: player.y });
  }
}

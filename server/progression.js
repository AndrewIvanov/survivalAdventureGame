import { levelXp } from '../shared/config.js';

export function grantExperience(world, player, amount) {
  player.xp += amount;
  while (player.xp >= levelXp(player.level)) {
    player.xp -= levelXp(player.level);
    player.level++;
    player.maxHp += 12;
    player.hp = player.maxHp;
    world.events.push({ type: 'level', id: player.id, level: player.level, x: player.x, y: player.y });
  }
}

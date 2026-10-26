import { PLAYER, MONSTERS, distance } from '../shared/config.js';
import { grantExperience } from './progression.js';

export function attack(world, player) {
  if (player.hp <= 0 || world.elapsed - player.lastAttack < PLAYER.attackCooldown) return;
  player.lastAttack = world.elapsed;
  world.events.push({ type: 'attack', id: player.id, x: player.x, y: player.y, angle: player.angle });
  for (const monster of world.monsters) {
    if (monster.hp <= 0 || distance(player, monster) > PLAYER.reach) continue;
    const angle = Math.atan2(monster.y - player.y, monster.x - player.x);
    if (Math.cos(angle - player.angle) < .18) continue;
    const critical = world.random() < .12;
    const damage = Math.round((PLAYER.damage + (player.level - 1) * 4) * (critical ? 1.75 : 1));
    monster.hp = Math.max(0, monster.hp - damage);
    monster.hurtUntil = world.elapsed + 250;
    monster.targetId = player.id;
    world.move(monster, Math.cos(angle) * 13, Math.sin(angle) * 13);
    world.events.push({ type: 'hit', id: monster.id, x: monster.x, y: monster.y - 25, damage, critical });
    if (monster.hp === 0) {
      monster.respawnAt = world.elapsed + 45000;
      monster.state = 'dead';
      world.kills++;
      const config = MONSTERS[monster.kind];
      for (const ally of world.players.values()) {
        if (!ally.online || ally.hp <= 0 || distance(ally, monster) > 600) continue;
        grantExperience(world, ally, config.xp);
        ally.gold += config.gold;
        ally.kills++;
      }
      world.events.push({ type: 'kill', id: monster.id, x: monster.x, y: monster.y, xp: config.xp, gold: config.gold });
      world.criticalSave = true;
    }
  }
}

export function hurtPlayer(world, monster, player) {
  if (player.hp <= 0 || world.elapsed < player.invulnerableUntil) return;
  const damage = MONSTERS[monster.kind].damage;
  player.hp = Math.max(0, player.hp - damage);
  player.lastHurt = world.elapsed;
  world.events.push({ type: 'hurt', id: player.id, x: player.x, y: player.y - 26, damage });
  if (player.hp === 0) {
    player.respawnAt = world.elapsed + PLAYER.respawnDelay;
    player.input = {};
    world.events.push({ type: 'death', id: player.id });
    world.criticalSave = true;
  }
}

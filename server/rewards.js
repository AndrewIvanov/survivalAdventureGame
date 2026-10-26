import { randomUUID } from 'node:crypto';
import { MONSTERS, distance } from '../shared/config.js';
import { CLASSES } from '../shared/rpg.js';
import { grantExperience } from './progression.js';
import { makeItem } from './inventory.js';
import { progressQuests } from './quests.js';

export function rewardKill(world, player, monster) {
  const config = MONSTERS[monster.kind], elite = monster.elite ? 1.5 : 1;
  const allies = [...world.players.values()].filter(p => p.online && p.hp > 0 && distance(p, monster) <= (monster.kind === 'guardian' ? 1000 : 600));
  for (const ally of allies) {
    grantExperience(world, ally, Math.round(config.xp * elite)); ally.gold += Math.round(config.gold * elite); ally.kills++;
    progressQuests(world, ally, monster.kind);
  }
  if (monster.kind === 'guardian') {
    world.survival.defeatedBosses.push({ id: monster.id, night: monster.raidNight || 0, at: world.elapsed });
    if (!monster.raidId) world.survival.guardianDefeated = true;
    if (monster.raidId === world.survival.wave?.id) world.survival.wave.bossDefeated = true;
    for (const ally of allies) {
      world.loot.push({ id: randomUUID(), ownerId: ally.id, x: monster.x + (allies.indexOf(ally) ? 20 : -20), y: monster.y + 15, item: makeItem(CLASSES[ally.classId].weapon, 'epic'), permanent: true });
    }
    world.events.push({ type: 'boss-defeated', id: monster.id, name: monster.name || config.name });
    for (const add of world.monsters) if (add.summonOwner === monster.id && add.hp > 0) { add.hp = 0; add.state = 'retreat'; add.despawnAt = world.elapsed + 1500; }
  } else if (world.loot.length < 128 && !monster.summonOwner) {
    const roll = world.random();
    const rarity = roll < .015 ? 'legendary' : roll < .06 ? 'epic' : roll < .2 + (monster.elite ? .15 : 0) ? 'rare' : roll < .5 ? 'uncommon' : 'common';
    const gear = [CLASSES[player.classId || 'warrior'].weapon, 'armor', 'boots', 'shield', 'helmet', 'ring'];
    const baseId = world.random() < .3 ? gear[Math.min(gear.length - 1, Math.floor(world.random() * gear.length))] : world.random() < .35 ? 'health' : monster.kind === 'wolf' ? 'hide' : 'ore';
    world.loot.push({ id: randomUUID(), x: monster.x, y: monster.y, item: makeItem(baseId, rarity), expiresAt: world.elapsed + 600000 });
  }
  world.events.push({ type: 'kill', id: monster.id, x: monster.x, y: monster.y, xp: Math.round(config.xp * elite), gold: Math.round(config.gold * elite) });
  world.criticalSave = true;
}

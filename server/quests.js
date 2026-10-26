import { QUESTS } from '../shared/rpg.js';
import { addItem, makeItem } from './inventory.js';
import { grantExperience } from './progression.js';

export function progressQuests(world, player, kind) {
  for (const [id, state] of Object.entries(player.quests)) {
    const quest = QUESTS[id];
    if (state.status !== 'active' || quest.kind !== kind || state.progress >= quest.target) continue;
    state.progress = Math.min(quest.target, kind === 'supplies' ? player.supplies.length : kind === 'explore' ? 1 : state.progress + 1);
    if (state.progress >= quest.target) world.events.push({ type: 'quest-ready', id: player.id, name: quest.name });
    world.criticalSave = true;
  }
}
export function questAction(world, player, action, npc) {
  const quest = QUESTS[action.questId];
  if (!quest || quest.npc !== npc.id) throw new Error('Этот житель не выдаёт такое задание.');
  const state = player.quests[action.questId];
  if (action.type === 'quest:accept') {
    if (state) throw new Error('Задание уже принято.');
    player.quests[action.questId] = { status: 'active', progress: quest.kind === 'explore' && player.explored.includes('forest') ? 1 : quest.kind === 'supplies' ? player.supplies.length : 0 };
  } else {
    if (state?.status !== 'active' || state.progress < quest.target) throw new Error('Задание ещё не выполнено или награда уже получена.');
    // Check inventory capacity before gold/XP/status change: rewards are all-or-nothing.
    addItem(player, makeItem(quest.reward, ['armor', 'ring'].includes(quest.reward) ? 'uncommon' : 'common'));
    state.status = 'completed'; player.gold += quest.gold; grantExperience(world, player, quest.xp);
    world.events.push({ type: 'quest-complete', id: player.id, name: quest.name });
  }
  world.criticalSave = true;
}

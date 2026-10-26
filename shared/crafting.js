export const GATHERING = { range: 85, cooldownMs: 850, treeCharges: 3, oreCharges: 4, woodYield: 6, oreYield: 3, respawnMs: 120000 };
export const WOOD_TRADE = { wood: 100, gold: 1 };
export const MINE = { id: 'mine', name: 'Северная шахта', x: 770, y: 540 };
export const ORE_NODES = [[705, 610], [775, 630], [845, 610], [730, 690], [810, 700]].map(([x, y], i) => ({ id: `ore-${i}`, kind: 'ore', name: 'Рудная жила', x, y }));
export const RECIPES = {
  sword: { station: 'lumberjack', item: 'sword', cost: { wood: 12 } },
  shield: { station: 'lumberjack', item: 'shield', cost: { wood: 10 } },
  bow: { station: 'lumberjack', item: 'bow', cost: { wood: 12 } },
  staff: { station: 'lumberjack', item: 'staff', cost: { wood: 12 } },
  fenceKit: { station: 'lumberjack', item: 'fenceKit', cost: { wood: 5 } },
  steelSword: { station: 'smith', item: 'steelSword', cost: { wood: 8, ore: 12, gold: 20 } },
  steelBow: { station: 'smith', item: 'steelBow', cost: { wood: 8, ore: 12, gold: 20 } },
  steelStaff: { station: 'smith', item: 'steelStaff', cost: { wood: 8, ore: 12, gold: 20 } },
};
export const FENCES = { maxCount: 80, maxLevel: 10, size: 30, reach: 140, baseHp: 160 };
export const fenceHp = level => FENCES.baseHp + (level - 1) * 70;
export const fenceUpgradeCost = level => ({ wood: level * 3, ore: Math.max(1, Math.floor(level / 2)), gold: level * 8 });
export const upgradeCost = item => { const rank = (item.upgrade || 0) + 1; return { wood: 2 + rank * 2, ore: rank * 2, gold: rank * 20 }; };
export const materialCount = (player, baseId) => (player.inventory || []).filter(i => i.baseId === baseId).reduce((n, i) => n + i.quantity, 0);
export const canAfford = (player, cost) => Object.entries(cost).every(([id, amount]) => (id === 'gold' ? player.gold : materialCount(player, id)) >= amount);
export const costText = cost => Object.entries(cost).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${{ wood: 'дерева', ore: 'руды', gold: 'золота' }[id]}`).join(' · ');

// Manual browser QA only: disposable world, isolated from all real databases.
import { createInterface } from 'node:readline';
import { createGameServer } from '../../server/index.js';
import { GameWorld } from '../../server/world.js';
import { SURVIVAL, CYCLE_MS } from '../../shared/survival.js';
import { NPCS } from '../../shared/rpg.js';
import { makeItem, addItem, refreshStats } from '../../server/inventory.js';
import { damagePlayer } from '../../server/combat.js';
import { beginNight, updateSurvival } from '../../server/survival.js';
import { REVIVAL } from '../../shared/revival.js';
import { PROFESSIONS } from '../../shared/professions.js';
import { ORE_NODES } from '../../shared/crafting.js';
import { canStand } from '../../shared/map.js';
import { spawnMonster } from '../../server/spawns.js';

const server = await createGameServer({ database: ':memory:', dev: true });
const world = new GameWorld(); world.code = 'NIGHT2'; world.name = 'Проверка ночной охоты';
const join = world.join.bind(world);
world.join = (...args) => {
  const player = join(...args);
  if (!player.previewReady) {
    player.previewReady = true; player.gold = 10000;
    for (const baseId of ['armor', 'boots', 'shield', 'helmet', 'ring']) {
      const item = addItem(player, makeItem(baseId, 'rare')); item.upgrade = 3; player.equipment[baseId] = item.id;
    }
    player.x = 1355; player.y = 1395; refreshStats(player, true);
  }
  return player;
};
server.worlds.set(world.id, world); await server.store.save(world.serialize());
await server.listen(3001, '127.0.0.1');
console.log('Disposable preview: http://127.0.0.1:3001 · join NIGHT2. Console: tree, mine, mill, merchant, materials, level, profession <id>, targets, day, night 3/6/9, smith, shrine, grave, dawn, defeat.');
const previewWorld = world;
const input = createInterface({ input: process.stdin });
input.on('line', line => {
  const world = [...server.worlds.values()].find(w => [...w.players.values()].some(p => p.online)) || previewWorld;
  const [command, number] = line.trim().split(' ');
  const heroes = [...world.players.values()].filter(p => p.online && p.hp > 0);
  if (command === 'materials') for (const p of heroes) { for (const id of ['wood', 'ore', 'fenceKit', 'pickaxe']) { const item = makeItem(id); item.quantity = id === 'wood' || id === 'ore' ? 99 : id === 'fenceKit' ? 10 : 1; addItem(p, item); } p.gold = 1000; }
  if (command === 'level') for (const p of heroes) { p.level = 10; p.skillPoints = 150; refreshStats(p, true); }
  if (command === 'wound') for (const p of heroes) { p.x = 2180; p.y = 1152; p.hp = Math.max(1, p.maxHp - 70); p.lastHurt = world.elapsed; p.invulnerableUntil = world.elapsed + 360000; }
  if (command === 'tree-cross') for (const p of heroes) {
    const tree = world.map.trees.find(t => Array.from({ length: 31 }, (_, i) => t.x - 70 + i * 7).every(x => canStand(x, t.y, world.grid)));
    p.x = tree.x - 65; p.y = tree.y; p.invulnerableUntil = world.elapsed + 360000; console.log(`tree=${tree.id}, trunk=${tree.x}, start=${p.x}, y=${p.y}`);
  }
  if (command === 'profession' && PROFESSIONS[number]) for (const p of heroes) {
    p.classId = PROFESSIONS[number].classId; p.profession = number; p.professionRank = number === 'squire' ? 76 : 1;
    p.level = 10; p.skillPoints = 150; p.cooldowns = {}; p.x = 1700; p.y = 1152;
    const baseId = { warrior: 'sword', mage: 'staff', archer: 'bow' }[p.classId];
    const item = p.inventory.find(i => i.baseId === baseId) || addItem(p, makeItem(baseId)); p.equipment.weapon = item.id;
    refreshStats(p, true); p.invulnerableUntil = world.elapsed + 360000;
  }
  if (command === 'targets') {
    world.monsters = [];
    for (const p of heroes) {
      p.invulnerableUntil = world.elapsed + 360000;
      for (let i = 0; i < 4; i++) spawnMonster(world, 'wolf', p.x + 110 + i * 65, p.y + (i % 2 ? 25 : -25), { hp: 99999, maxHp: 99999 });
    }
  }
  if (command === 'tree') for (const p of heroes) {
    const trees = world.resourceNodes.filter(n => n.kind === 'tree' && world.resourceState[n.id]?.remaining !== 0).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    for (const tree of trees) {
      const point = Array.from({ length: 16 }, (_, i) => ({ x: tree.x + Math.cos(i / 8 * Math.PI) * 55, y: tree.y + Math.sin(i / 8 * Math.PI) * 55 })).find(q => canStand(q.x, q.y, world.grid) && NPCS.every(n => Math.hypot(n.x - q.x, n.y - q.y) > 115));
      if (point) { p.x = point.x; p.y = point.y; break; }
    }
  }
  if (command === 'mine') for (const p of heroes) { p.x = ORE_NODES[1].x + 30; p.y = ORE_NODES[1].y + 30; }
  if (command === 'mill' || command === 'merchant') for (const p of heroes) { const npc = NPCS.find(n => n.id === (command === 'mill' ? 'lumberjack' : 'merchant')); p.x = npc.x + 25; p.y = npc.y + 35; }
  if (command === 'grave') {
    const hero = [...world.players.values()].find(p => p.online && p.hp > 0);
    if (hero && !world.gameOver) {
      const ally = [...world.players.values()].find(p => p.id !== hero.id) || world.join('preview-companion', 'Напарник', 'sage', 'mage');
      hero.x = REVIVAL.altar.x; hero.y = REVIVAL.altar.y + 115;
      world.leave(ally.id, { checkDefeat: false }); ally.x = hero.x + 40; ally.y = hero.y; ally.invulnerableUntil = 0;
      damagePlayer(world, { kind: 'wolf' }, ally, 999999);
    }
  }
  if (command === 'defeat') for (const player of world.players.values()) if (player.online) { player.invulnerableUntil = 0; damagePlayer(world, { kind: 'guardian' }, player, 999999); }
  if (command === 'night') {
    const n = Number(number) || 2;
    world.monsters = []; world.survival.lastNight = n - 1;
    world.survival.clockMs = (n - 1) * CYCLE_MS + SURVIVAL.dayMs;
    beginNight(world, n); updateSurvival(world, 0);
    for (const p of world.players.values()) p.invulnerableUntil = world.elapsed + 120000;
  }
  if (command === 'day' || command === 'dawn') {
    world.survival.clockMs = Math.ceil(world.survival.clockMs / CYCLE_MS) * CYCLE_MS - 50;
    updateSurvival(world, .05);
  }
  if (command === 'smith' || command === 'shrine') for (const p of world.players.values()) {
    const point = command === 'smith' ? NPCS.find(n => n.id === 'smith') : SURVIVAL.shrine;
    p.x = point.x + 25; p.y = point.y + 35;
  }
  console.log(`${command}: phase=${world.snapshot().survival.phase}, monsters=${world.monsters.length}`);
});
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { if (closing) return; closing = true; input.close(); await server.close(); process.exit(0); });

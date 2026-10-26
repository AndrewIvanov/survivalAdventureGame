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
console.log('Disposable preview: http://127.0.0.1:3001 · join NIGHT2. Console: day, night 2/4/6/8, smith, shrine, grave, dawn, defeat.');
const previewWorld = world;
const input = createInterface({ input: process.stdin });
input.on('line', line => {
  const world = [...server.worlds.values()].find(w => [...w.players.values()].some(p => p.online)) || previewWorld;
  const [command, number] = line.trim().split(' ');
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

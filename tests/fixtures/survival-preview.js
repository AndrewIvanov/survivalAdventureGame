// Manual browser QA only: disposable world, isolated from data/village.sqlite.
import { createGameServer } from '../../server/index.js';
import { GameWorld } from '../../server/world.js';
import { SURVIVAL, CYCLE_MS } from '../../shared/survival.js';

const server = await createGameServer({ database: ':memory:', dev: true });
const world = new GameWorld(); world.code = 'NIGHT5'; world.name = 'Проверка пятой ночи';
world.survival.clockMs = 4 * CYCLE_MS + SURVIVAL.dayMs - 1000;
world.survival.lastNight = 4;
server.store.save(world.serialize());
await server.listen(3001, '127.0.0.1');
console.log('Disposable survival preview: http://127.0.0.1:3001 · join NIGHT5');
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { if (closing) return; closing = true; await server.close(); process.exit(0); });

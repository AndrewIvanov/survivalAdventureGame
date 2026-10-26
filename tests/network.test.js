import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createGameServer } from '../server/index.js';
import { SURVIVAL, CYCLE_MS } from '../shared/survival.js';
import { spawnMonster } from '../server/spawns.js';
import { damageMonster, damagePlayer } from '../server/combat.js';
import { REVIVAL } from '../shared/revival.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = (socket, event, data) => new Promise((resolve, reject) => {
  const callback = (error, result) => error ? reject(error) : resolve(result);
  if (data === undefined) socket.timeout(3000).emit(event, callback);
  else socket.timeout(3000).emit(event, data, callback);
});

test('world survives an abrupt server process termination', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'village-crash-'));
  const database = path.join(directory, 'world.sqlite');
  let child, socket;
  const launch = async () => {
    child = fork(new URL('./fixtures/server.js', import.meta.url), [], { env: { ...process.env, TEST_DB: database }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const [{ port }] = await once(child, 'message'); return port;
  };
  try {
    let port = await launch(); socket = await connect(port, 'x');
    const created = await request(socket, 'world:enter', { mode: 'create', name: 'После перезапуска', appearance: 'sage' });
    assert.equal(created.ok, true);
    const x = created.state.players[0].x;
    const movement = setInterval(() => socket.emit('input', { x: 1, y: 0, angle: 0 }), 35);
    await delay(400); clearInterval(movement);
    const saved = await request(socket, 'world:save'); assert.equal(saved.ok, true);
    const died = once(child, 'exit'); child.kill('SIGKILL'); await died; socket.disconnect();
    port = await launch(); socket = await connect(port, 'x');
    const restored = await request(socket, 'world:enter', { mode: 'join', code: created.state.code, name: 'После перезапуска' });
    assert.equal(restored.ok, true); assert.equal(restored.state.id, created.state.id);
    assert.equal(restored.playerId, created.playerId); assert.ok(restored.state.players[0].x > x + 20);
    assert.equal(restored.state.players[0].appearance, 'sage');
  } finally {
    socket?.disconnect();
    if (child?.connected) { const stopped = once(child, 'exit'); child.send('stop'); await stopped; }
    await rm(directory, { recursive: true, force: true });
  }
});

test('development server closes with an active Vite HMR WebSocket', { timeout: 10000 }, async () => {
  const child = fork(new URL('./fixtures/server.js', import.meta.url), [], { env: { ...process.env, TEST_DB: ':memory:', TEST_DEV: '1' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  let hmr;
  try {
    const [{ port }] = await once(child, 'message');
    const clientSource = await (await fetch(`http://127.0.0.1:${port}/@vite/client`)).text();
    const token = clientSource.match(/const wsToken = "([^"]+)"/)[1];
    hmr = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`, 'vite-hmr');
    await new Promise((resolve, reject) => { hmr.addEventListener('open', resolve, { once: true }); hmr.addEventListener('error', reject, { once: true }); });
    const exit = once(child, 'exit'); child.send('stop');
    let timeout;
    try {
      const [code] = await Promise.race([exit, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('HMR blocked graceful shutdown')), 3000); })]);
      assert.equal(code, 0);
    } finally { clearTimeout(timeout); }
  } finally {
    hmr?.close();
    if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill('SIGKILL'); await stopped; }
  }
});
async function connect(port, token) {
  const socket = io(`http://127.0.0.1:${port}`, { auth: { token: token.repeat(64) }, transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}
async function waitUntil(check, timeout = 3000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (check()) return; await delay(30); }
  assert.fail('Timed out waiting for synchronized state');
}

test('two sockets rescue a fallen hero through a saved gravestone after a server restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'village-revive-'));
  const database = path.join(directory, 'world.sqlite');
  let server, a, b;
  try {
    server = await createGameServer({ database }); let { port } = await server.listen(0, '127.0.0.1');
    a = await connect(port, 'd'); b = await connect(port, 'e');
    const created = await request(a, 'world:enter', { mode: 'create', name: 'Павший' });
    const joined = await request(b, 'world:enter', { mode: 'join', code: created.state.code, name: 'Спасатель' });
    const world = server.worlds.get(created.state.id), pa = world.players.get(created.playerId);
    let stateA, stateB; a.on('state', s => { stateA = s; }); b.on('state', s => { stateB = s; });
    damagePlayer(world, { kind: 'wolf' }, pa, 99999);
    await waitUntil(() => stateA?.gravestones?.length === 1 && stateB?.gravestones?.length === 1);
    const graveId = stateA.gravestones[0].id;
    assert.equal((await request(a, 'rpg:action', { type: 'grave:carry', graveId })).ok, false);
    assert.equal((await request(b, 'rpg:action', { type: 'grave:carry', graveId })).ok, true);
    assert.equal((await request(b, 'world:save')).ok, true);
    a.disconnect(); b.disconnect(); await server.close();
    server = await createGameServer({ database }); ({ port } = await server.listen(0, '127.0.0.1'));
    a = await connect(port, 'd'); b = await connect(port, 'e');
    const dead = await request(a, 'world:enter', { mode: 'join', code: world.code, name: 'Павший' });
    assert.equal(dead.state.players.find(p => p.id === created.playerId).hp, 0);
    assert.equal(dead.state.gravestones[0].id, graveId); assert.equal(dead.state.gameOver, null);
    await delay(120);
    const rescuer = await request(b, 'world:enter', { mode: 'join', code: world.code, name: 'Спасатель' });
    assert.equal(rescuer.state.gameOver, null);
    stateA = stateB = null; a.on('state', s => { stateA = s; }); b.on('state', s => { stateB = s; });
    assert.equal((await request(b, 'rpg:action', { type: 'grave:carry', graveId })).ok, true);
    const carrier = server.worlds.get(world.id).players.get(joined.playerId);
    carrier.x = REVIVAL.altar.x; carrier.y = REVIVAL.altar.y;
    await waitUntil(() => stateA?.players.find(p => p.id === created.playerId).hp > 0 && stateB?.gravestones?.length === 0);
    assert.equal(stateA.gravestones.length, 0);
    assert.equal(stateA.players.find(p => p.id === created.playerId).x, REVIVAL.altar.x);
    assert.equal((await request(b, 'world:save')).ok, true);
    assert.equal((await server.store.load(world.code)).gravestones.length, 0);
  } finally { a?.disconnect(); b?.disconnect(); await server?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('chat reaches both heroes only in their room, rejects spam and replays history on reconnect', { timeout: 15000 }, async () => {
  const server = await createGameServer({ database: ':memory:' });
  const { port } = await server.listen(0, '127.0.0.1');
  let a, b, outsider;
  try {
    a = await connect(port, 't'); b = await connect(port, 'h'); outsider = await connect(port, 'o');
    assert.equal((await request(outsider, 'chat:send', { text: 'Без мира' })).ok, false);
    const created = await request(a, 'world:enter', { mode: 'create', name: 'Альфа' });
    const joined = await request(b, 'world:enter', { mode: 'join', code: created.state.code, name: 'Бета' });
    await request(outsider, 'world:enter', { mode: 'create', name: 'Другой мир' });
    const receivedA = [], receivedB = [], receivedOther = [];
    a.on('chat:message', m => receivedA.push(m)); b.on('chat:message', m => receivedB.push(m)); outsider.on('chat:message', m => receivedOther.push(m));
    const sent = await request(a, 'chat:send', { text: '<img src=x onerror=alert(1)> Привет!', playerId: joined.playerId, name: 'Подмена', worldId: 'other' });
    assert.equal(sent.ok, true); await waitUntil(() => receivedA.length === 1 && receivedB.length === 1);
    assert.deepEqual(receivedA[0], receivedB[0]); assert.equal(sent.message.playerId, created.playerId);
    assert.equal(sent.message.name, 'Альфа'); assert.equal(sent.message.text, '<img src=x onerror=alert(1)> Привет!');
    assert.equal((await request(a, 'chat:send', { text: 'Спам' })).ok, false);
    assert.equal((await request(b, 'chat:send', { text: '  ' })).ok, false);
    assert.equal((await request(b, 'chat:send', { text: 'Ответ' })).ok, true);
    await waitUntil(() => receivedA.length === 2 && receivedB.length === 2);
    assert.equal(receivedOther.length, 0);
    a.disconnect(); a = await connect(port, 't');
    const restored = await request(a, 'world:enter', { mode: 'join', code: created.state.code, name: 'Альфа' });
    assert.equal(restored.chat.length, 2); assert.equal(restored.chat[0].id, sent.message.id);
    assert.equal((await request(a, 'world:leave')).ok, true);
    assert.equal((await request(a, 'chat:send', { text: 'Уже вышел' })).ok, false);
  } finally { a?.disconnect(); b?.disconnect(); outsider?.disconnect(); await server.close(); }
});

test('removing a journey persists, protects membership and the partner, and code rejoin restores the entry', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'village-forget-'));
  const database = path.join(directory, 'world.sqlite');
  let server, a, b, outsider;
  try {
    server = await createGameServer({ database }); let { port } = await server.listen(0, '127.0.0.1');
    a = await connect(port, 'f'); b = await connect(port, 'g'); outsider = await connect(port, 'z');
    const created = await request(a, 'world:enter', { mode: 'create', name: 'Первый' });
    const code = created.state.code, world = server.worlds.get(created.state.id);
    const joined = await request(b, 'world:enter', { mode: 'join', code, name: 'Друг' });
    assert.equal((await request(a, 'world:forget', { code })).ok, false, 'leave the world before removing its menu entry');
    assert.equal((await request(outsider, 'world:forget', { code })).ok, false);
    assert.equal((await request(outsider, 'world:forget', {})).ok, false);
    world.players.get(created.playerId).gold = 123; world.players.get(joined.playerId).gold = 321;
    assert.equal((await request(a, 'world:leave')).ok, true);
    assert.equal((await request(a, 'world:forget', { code })).ok, true);
    assert.deepEqual((await request(a, 'worlds:list')).worlds, []);
    assert.equal((await request(b, 'worlds:list')).worlds[0].code, code);
    assert.equal(world.players.get(joined.playerId).online, true);
    const saved = await server.store.load(code);
    assert.equal(saved.players.length, 2); assert.equal(saved.players.find(p => p.id === created.playerId).gold, 123);
    a.disconnect(); b.disconnect(); outsider.disconnect(); await server.close();
    server = await createGameServer({ database }); ({ port } = await server.listen(0, '127.0.0.1'));
    a = await connect(port, 'f'); b = await connect(port, 'g');
    assert.deepEqual((await request(a, 'worlds:list')).worlds, []);
    assert.equal((await request(b, 'worlds:list')).worlds[0].code, code);
    // Remove an unloaded world as well; this must use the stored snapshot.
    assert.equal((await request(b, 'world:forget', { code })).ok, true);
    assert.deepEqual((await request(b, 'worlds:list')).worlds, []);
    const restored = await request(a, 'world:enter', { mode: 'join', code, name: 'Первый' });
    assert.equal(restored.ok, true); assert.equal(restored.state.players.find(p => p.id === created.playerId).gold, 123);
    assert.equal(restored.state.players.find(p => p.id === joined.playerId).gold, 321);
    assert.equal((await request(a, 'worlds:list')).worlds[0].code, code);
    assert.deepEqual((await request(b, 'worlds:list')).worlds, []);
  } finally {
    a?.disconnect(); b?.disconnect(); outsider?.disconnect(); await server?.close(); await rm(directory, { recursive: true, force: true });
  }
});

test('two real sockets: world creation, movement, team combat, disconnect, rejoin, restart and persistent membership', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'village-test-'));
  const database = path.join(directory, 'world.sqlite');
  let server, a, b, c;
  try {
    server = await createGameServer({ database });
    let { port } = await server.listen(0, '127.0.0.1');
    a = await connect(port, 'a'); b = await connect(port, 'b'); c = await connect(port, 'c');
    const created = await request(a, 'world:enter', { mode: 'create', name: 'Альфа', appearance: 'ranger' });
    assert.equal(created.ok, true); const code = created.state.code, worldId = created.state.id;
    const joined = await request(b, 'world:enter', { mode: 'join', code, name: 'Бета', appearance: 'sage' });
    assert.equal(joined.ok, true); assert.equal(joined.state.id, worldId);
    assert.equal(joined.state.players.length, 2);
    const third = await request(c, 'world:enter', { mode: 'join', code, name: 'Третий' }); assert.equal(third.ok, false);
    let lastA, lastB; a.on('state', s => { lastA = s; }); b.on('state', s => { lastB = s; });
    const x = created.state.players[0].x;
    const move = setInterval(() => a.emit('input', { x: 1, y: 0, angle: 0 }), 35);
    await waitUntil(() => lastB?.players.find(p => p.id === created.playerId).x > x + 40);
    clearInterval(move); a.emit('input', { x: 0, y: 0, angle: 0 });
    assert.ok(lastA); assert.ok(lastB);
    // Place an enemy in reach inside the running authoritative server, then attack through the real socket protocol.
    const world = server.worlds.get(worldId), pa = world.players.get(created.playerId), pb = world.players.get(joined.playerId);
    pa.x = 1930; pa.y = 1152; pb.x = 1925; pb.y = 1180;
    const monster = spawnMonster(world, 'wolf', 1970, 1152); monster.x = 1970; monster.y = 1152; monster.hp = 24;
    const attacks = setInterval(() => a.emit('input', { x: 0, y: 0, angle: 0, attack: true }), 35);
    await waitUntil(() => lastB?.kills === 1);
    clearInterval(attacks); a.emit('input', { x: 0, y: 0, angle: 0 });
    assert.ok(lastB.players.find(p => p.id === created.playerId).xp >= 24);
    assert.ok(lastB.players.find(p => p.id === joined.playerId).xp >= 24);
    const xp = pa.xp, gold = pa.gold;
    a.disconnect(); await waitUntil(() => lastB?.players.find(p => p.id === created.playerId).online === false);
    const elapsed = world.elapsed; await delay(160); assert.ok(world.elapsed > elapsed);
    a = await connect(port, 'a');
    const rejoined = await request(a, 'world:enter', { mode: 'join', code, name: 'Не заменять имя' });
    assert.equal(rejoined.ok, true); assert.equal(rejoined.playerId, created.playerId);
    assert.equal(rejoined.state.players.find(p => p.id === created.playerId).xp, xp);
    assert.equal(rejoined.state.players.find(p => p.id === created.playerId).name, 'Альфа');
    const listed = await request(a, 'worlds:list'); assert.equal(listed.worlds[0].code, code);
    a.disconnect(); b.disconnect(); c.disconnect(); await delay(120);
    const pausedAt = world.elapsed; await delay(150); assert.equal(world.elapsed, pausedAt);
    await server.close();
    server = await createGameServer({ database }); ({ port } = await server.listen(0, '127.0.0.1'));
    a = await connect(port, 'a');
    const restored = await request(a, 'world:enter', { mode: 'join', code, name: 'Альфа' });
    assert.equal(restored.state.id, worldId);
    const restoredHero = restored.state.players.find(p => p.id === created.playerId);
    assert.equal(restoredHero.xp, xp); assert.equal(restoredHero.gold, gold);
    assert.equal(restored.state.kills, 1); assert.equal(restored.state.elapsed, pausedAt);
    assert.ok(!server.worlds.get(worldId).monsters.some(m => m.hp > 0));
    assert.equal(restored.state.players.length, 2);
  } finally {
    a?.disconnect(); b?.disconnect(); c?.disconnect(); await server?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('RPG protocol: mixed classes, projectile damage, cooperative quest progress, competing pickup and restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'village-rpg-'));
  const database = path.join(directory, 'rpg.sqlite');
  let server, a, b;
  try {
    server = await createGameServer({ database }); let { port } = await server.listen(0, '127.0.0.1');
    a = await connect(port, 'm'); b = await connect(port, 'r');
    const created = await request(a, 'world:enter', { mode: 'create', name: 'Маг', classId: 'mage' });
    const joined = await request(b, 'world:enter', { mode: 'join', name: 'Лучник', classId: 'archer', code: created.state.code });
    const world = server.worlds.get(created.state.id), pa = world.players.get(created.playerId), pb = world.players.get(joined.playerId);
    assert.equal(pa.classId, 'mage'); assert.equal(pb.classId, 'archer');
    pa.x = pb.x = 1840; pa.y = pb.y = 1140;
    for (const socket of [a, b]) assert.equal((await request(socket, 'rpg:action', { type: 'quest:accept', npcId: 'hunter', questId: 'wolves' })).ok, true);
    await delay(90);
    pa.x = 1930; pa.y = 1152; pb.x = 1940; pb.y = 1172;
    const m = spawnMonster(world, 'wolf', 2010, 1152); m.x = 2010; m.y = 1152; m.hp = 20;
    let stateB; b.on('state', state => { stateB = state; });
    const cast = await request(a, 'ability', { key: 'q', x: 2010, y: 1152 }); assert.equal(cast.ok, true);
    await waitUntil(() => stateB?.kills === 1);
    assert.equal(stateB.players.find(p => p.id === pa.id).quests.wolves.progress, 1);
    assert.equal(stateB.players.find(p => p.id === pb.id).quests.wolves.progress, 1);
    const loot = world.loot[0]; pa.x = pb.x = loot.x; pa.y = pb.y = loot.y;
    const pickups = await Promise.all([request(a, 'rpg:action', { type: 'pickup', lootId: loot.id }), request(b, 'rpg:action', { type: 'pickup', lootId: loot.id })]);
    assert.equal(pickups.filter(result => result.ok).length, 1); assert.equal(world.loot.length, 0);
    const inventoryIds = [...pa.inventory, ...pb.inventory].map(i => i.id);
    assert.equal(new Set(inventoryIds).size, inventoryIds.length);
    const savedA = JSON.stringify(pa.inventory), savedB = JSON.stringify(pb.inventory), code = world.code;
    a.disconnect(); b.disconnect(); await delay(100); await server.close();
    server = await createGameServer({ database }); ({ port } = await server.listen(0, '127.0.0.1'));
    a = await connect(port, 'm'); b = await connect(port, 'r');
    const restoredA = await request(a, 'world:enter', { mode: 'join', code, name: 'Маг', classId: 'warrior' });
    const restoredB = await request(b, 'world:enter', { mode: 'join', code, name: 'Лучник' });
    const heroA = restoredA.state.players.find(p => p.id === pa.id), heroB = restoredB.state.players.find(p => p.id === pb.id);
    assert.equal(heroA.classId, 'mage'); assert.equal(heroB.classId, 'archer');
    assert.equal(JSON.stringify(heroA.inventory), savedA); assert.equal(JSON.stringify(heroB.inventory), savedB);
    assert.equal(heroA.quests.wolves.progress, 1); assert.equal(heroB.quests.wolves.progress, 1);
    assert.equal(server.worlds.get(world.id).loot.length, 0);
  } finally {
    a?.disconnect(); b?.disconnect(); await server?.close(); await rm(directory, { recursive: true, force: true });
  }
});

test('survival protocol synchronizes second-night boss, clock, village damage, reconnect and restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'village-night-'));
  const database = path.join(directory, 'survival.sqlite');
  let server, a, b;
  try {
    server = await createGameServer({ database }); let { port } = await server.listen(0, '127.0.0.1');
    a = await connect(port, 'u'); b = await connect(port, 'v');
    const created = await request(a, 'world:enter', { mode: 'create', name: 'Защитник' });
    const joined = await request(b, 'world:enter', { mode: 'join', name: 'Друг', code: created.state.code });
    const world = server.worlds.get(created.state.id);
    let sa, sb; a.on('state', s => { sa = s; }); b.on('state', s => { sb = s; });
    world.survival.clockMs = CYCLE_MS + SURVIVAL.dayMs - 50;
    await waitUntil(() => sa?.survival.phase === 'night' && sb?.survival.wave.bossSpawned);
    assert.equal(sa.survival.nightNumber, 2); assert.equal(sa.survival.wave.id, sb.survival.wave.id);
    const boss = world.monsters.find(m => m.kind === 'guardian');
    assert.ok(sa.monsters.some(m => m.id === boss.id)); assert.ok(sb.monsters.some(m => m.id === boss.id));
    world.village.hp = 700;
    const pa = world.players.get(created.playerId), pb = world.players.get(joined.playerId);
    pa.x = boss.x - 40; pa.y = boss.y; pb.x = boss.x + 40; pb.y = boss.y;
    boss.nextSpecialAt = world.elapsed + 60000;
    damageMonster(world, pa, boss, 60);
    await waitUntil(() => sa?.village.hp === 700 && sb?.monsters.some(m => m.id === boss.id && m.hp < m.maxHp));
    const waveId = world.survival.wave.id;
    a.disconnect(); const before = world.survival.clockMs; await delay(150); assert.ok(world.survival.clockMs > before);
    a = await connect(port, 'u');
    const reconnect = await request(a, 'world:enter', { mode: 'join', code: world.code, name: 'Защитник' });
    assert.equal(reconnect.state.survival.wave.id, waveId); assert.equal(reconnect.state.village.hp, 700);
    a.disconnect(); b.disconnect(); await delay(100);
    const paused = world.survival.clockMs, spawned = world.survival.wave.spawned;
    await delay(100); assert.equal(world.survival.clockMs, paused);
    await server.close();
    server = await createGameServer({ database }); ({ port } = await server.listen(0, '127.0.0.1'));
    a = await connect(port, 'u');
    const restored = await request(a, 'world:enter', { mode: 'join', code: world.code, name: 'Защитник' });
    assert.equal(restored.state.survival.clockMs, paused); assert.equal(restored.state.survival.wave.id, waveId);
    assert.equal(restored.state.survival.wave.spawned, spawned); assert.equal(restored.state.village.hp, 700);
    assert.equal(server.worlds.get(world.id).monsters.filter(m => m.kind === 'guardian' && m.hp > 0).length, 1);
  } finally { a?.disconnect(); b?.disconnect(); await server?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('cooperative day skip, shared game over, durable defeat and a fresh 50-gold adventure', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'village-game-over-'));
  const database = path.join(directory, 'world.sqlite');
  let server, a, b;
  try {
    server = await createGameServer({ database }); let { port } = await server.listen(0, '127.0.0.1');
    a = await connect(port, 'j'); b = await connect(port, 'k');
    const created = await request(a, 'world:enter', { mode: 'create', name: 'Первый' });
    const joined = await request(b, 'world:enter', { mode: 'join', code: created.state.code, name: 'Второй' });
    assert.equal(created.state.players[0].gold, 50);
    assert.equal(joined.state.players.find(p => p.id === joined.playerId).gold, 50);
    const firstVote = await request(a, 'rpg:action', { type: 'day:skip', ready: true });
    assert.equal(firstVote.state.survival.phase, 'day'); assert.deepEqual(firstVote.state.survival.skipDayVotes, [created.playerId]);
    const agreed = await request(b, 'rpg:action', { type: 'day:skip', ready: true });
    assert.equal(agreed.ok, true); assert.equal(agreed.state.survival.phase, 'night'); assert.equal(agreed.state.survival.wave.total, 40);
    const world = server.worlds.get(created.state.id), pa = world.players.get(created.playerId), pb = world.players.get(joined.playerId);
    let stateA, stateB; a.on('state', state => { stateA = state; }); b.on('state', state => { stateB = state; });
    const monster = world.monsters[0]; damagePlayer(world, monster, pa, 99999);
    assert.equal(world.gameOver, null); damagePlayer(world, monster, pb, 99999);
    await waitUntil(() => stateA?.gameOver && stateB?.gameOver);
    assert.deepEqual(stateA.gameOver, stateB.gameOver); const clock = world.survival.clockMs;
    await delay(150); assert.equal(world.survival.clockMs, clock);
    assert.equal((await request(a, 'rpg:action', { type: 'day:skip', ready: true })).ok, false);
    assert.equal((await request(a, 'world:save')).ok, true);
    a.disconnect(); b.disconnect(); await server.close();
    server = await createGameServer({ database }); ({ port } = await server.listen(0, '127.0.0.1'));
    a = await connect(port, 'j');
    const restored = await request(a, 'world:enter', { mode: 'join', code: world.code, name: 'Первый' });
    assert.deepEqual(restored.state.gameOver, stateA.gameOver);
    assert.equal(restored.state.players.find(p => p.id === created.playerId).hp, 0);
    const fresh = await request(a, 'world:enter', { mode: 'create', name: 'Новый путь' });
    assert.equal(fresh.ok, true); assert.notEqual(fresh.state.id, world.id); assert.equal(fresh.state.gameOver, null);
    assert.equal(fresh.state.players[0].gold, 50); assert.equal(fresh.state.survival.day, 1);
    assert.ok((await server.store.load(world.code)).gameOver);
  } finally {
    a?.disconnect(); b?.disconnect(); await server?.close(); await rm(directory, { recursive: true, force: true });
  }
});

import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import { SaveStore } from './persistence.js';
import { GameWorld } from './world.js';
import { TICK_RATE, SNAPSHOT_RATE } from '../shared/config.js';
import { castAbility } from './abilities.js';
import { rpgAction } from './rpg.js';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function createGameServer({ database = path.join(root, 'data/village.sqlite'), dev = false } = {}) {
  const app = express(), http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: 8192, pingTimeout: 15000 });
  const store = new SaveStore(database), worlds = new Map(), sessions = new Map();
  let vite;
  app.get('/api/health', (_req, res) => res.json({ ok: true, version: '0.2.0', worlds: worlds.size }));
  if (dev) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({ root, server: { middlewareMode: true, hmr: { server: http } }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(root, 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
  }

  function save(world) {
    try {
      world.savedAt = store.save(world.serialize()); world.criticalSave = false;
      return true;
    } catch (error) {
      console.error('World save failed:', error.message);
      io.to(world.id).emit('notice', { type: 'error', message: 'Не удалось сохранить мир. Проверьте свободное место на сервере.' });
      return false;
    }
  }
  function exit(socket) {
    const { worldId, playerId } = socket.data;
    const world = worlds.get(worldId);
    if (!world) return;
    if (sessions.get(`${worldId}:${playerId}`) !== socket.id) return;
    sessions.delete(`${worldId}:${playerId}`);
    world.leave(playerId); save(world);
    socket.leave(worldId); socket.data.worldId = null;
    io.to(worldId).emit('notice', { message: 'Напарник покинул мир. Его прогресс сохранён.' });
  }
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !/^[\w-]{32,128}$/.test(token)) return next(new Error('Недействительный ключ игрока.'));
    socket.data.playerId = store.identity(token);
    socket.data.lastInput = 0;
    next();
  });
  io.on('connection', socket => {
    const acknowledge = (ack, data) => { if (typeof ack === 'function') ack(data); };
    socket.on('worlds:list', ack => acknowledge(ack, { ok: true, worlds: store.list(socket.data.playerId) }));
    socket.on('world:enter', (data, ack) => {
      try {
        if (!data || !['create', 'join'].includes(data.mode)) throw new Error('Неверный запрос.');
        const name = typeof data.name === 'string' ? data.name.trim().slice(0, 18) : '';
        if (!name) throw new Error('Укажите имя героя.');
        let world;
        if (data.mode === 'create') {
          // Bound accidental or malicious room creation from one connection.
          if (Date.now() - (socket.data.lastCreate || 0) < 5000) throw new Error('Подождите несколько секунд перед созданием нового мира.');
          socket.data.lastCreate = Date.now();
          world = new GameWorld();
          while (store.load(world.code)) world = new GameWorld();
        } else {
          const code = String(data.code || '').trim().toUpperCase();
          if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error('Код мира состоит из 6 букв и цифр.');
          world = [...worlds.values()].find(w => w.code === code);
          if (!world) {
            const saved = store.load(code);
            if (!saved) throw new Error('Мир с таким кодом не найден. Проверьте код друга.');
            world = new GameWorld(saved);
          }
        }
        if (!world.players.has(socket.data.playerId) && world.players.size >= 2) throw new Error('В этом мире уже есть два героя. Создайте новый мир.');
        // Finish an existing session before binding this socket to another world.
        exit(socket);
        const key = `${world.id}:${socket.data.playerId}`;
        const previous = sessions.get(key);
        if (previous && previous !== socket.id) {
          const old = io.sockets.sockets.get(previous);
          old?.emit('session:replaced'); old?.disconnect(true);
        }
        const player = world.join(socket.data.playerId, name, data.appearance === 'sage' ? 'sage' : 'ranger', data.classId);
        worlds.set(world.id, world);
        if (!save(world)) throw new Error('Создание мира остановлено: сохранение недоступно.');
        sessions.set(key, socket.id);
        socket.data.worldId = world.id;
        socket.join(world.id);
        acknowledge(ack, { ok: true, playerId: player.id, seed: world.seed, state: world.snapshot(player.id) });
        socket.to(world.id).emit('notice', { message: `${player.name} присоединился к приключению.` });
      } catch (error) { acknowledge(ack, { ok: false, error: error.message }); }
    });
    socket.on('input', data => {
      const now = Date.now();
      if (now - socket.data.lastInput < 16) return;
      socket.data.lastInput = now;
      worlds.get(socket.data.worldId)?.input(socket.data.playerId, data, now);
    });
    socket.on('dash', () => worlds.get(socket.data.worldId)?.dash(socket.data.playerId));
    for (const [event, handler] of [['rpg:action', rpgAction], ['ability', castAbility]]) socket.on(event, (data, ack) => {
      try {
        const world = worlds.get(socket.data.worldId);
        if (!world) throw new Error('Сначала войдите в мир.');
        const now = Date.now();
        if (now - (socket.data.lastRpg || 0) < 75) throw new Error('Слишком много действий.');
        socket.data.lastRpg = now;
        handler(world, world.players.get(socket.data.playerId), data);
        if (world.criticalSave && !save(world)) throw new Error('Не удалось сохранить действие.');
        acknowledge(ack, { ok: true, state: world.snapshot(socket.data.playerId) });
      } catch (error) { acknowledge(ack, { ok: false, error: error.message }); }
    });
    socket.on('world:save', ack => {
      const world = worlds.get(socket.data.worldId);
      if (!world) return acknowledge(ack, { ok: false, error: 'Сначала войдите в мир.' });
      acknowledge(ack, { ok: save(world), savedAt: world.savedAt });
    });
    socket.on('world:leave', ack => { exit(socket); acknowledge(ack, { ok: true }); });
    socket.on('ping:time', ack => acknowledge(ack, Date.now()));
    socket.on('disconnect', () => exit(socket));
  });

  let tickCount = 0;
  const timer = setInterval(() => {
    tickCount++;
    for (const world of worlds.values()) {
      if (![...world.players.values()].some(p => p.online)) continue;
      world.tick(1 / TICK_RATE);
      if (world.criticalSave || tickCount % (TICK_RATE * 5) === 0) save(world);
      if (world.events.length) { io.to(world.id).emit('effects', world.events); world.events = []; }
      if (tickCount % (TICK_RATE / SNAPSHOT_RATE) === 0) {
        for (const p of world.players.values()) {
          if (p.online) io.to(sessions.get(`${world.id}:${p.id}`)).emit('state', world.snapshot(p.id));
        }
      }
    }
  }, 1000 / TICK_RATE);
  timer.unref();

  return { app, http, io, worlds, store,
    listen: (port = 3000, host = '0.0.0.0') => new Promise((resolve, reject) => {
      http.once('error', reject);
      http.listen(port, host, () => { http.off('error', reject); resolve(http.address()); });
    }),
    close: async () => {
      clearInterval(timer);
      for (const world of worlds.values()) save(world);
      // Close Vite's HMR sockets before closing the shared HTTP server;
      // otherwise HTTP shutdown can wait forever for an open HMR connection.
      await vite?.close();
      await new Promise(resolve => io.close(resolve));
      store.close();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createGameServer({ dev: process.argv.includes('--dev'), database: process.env.DB_PATH || undefined });
  const address = await server.listen(Number(process.env.PORT) || 3000, process.env.HOST || '0.0.0.0');
  console.log(`\n  Village Survival · http://localhost:${address.port}\n  Network: http://<server-ip>:${address.port}\n`);
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    if (stopping) return;
    stopping = true; await server.close(); process.exit(0);
  });
}

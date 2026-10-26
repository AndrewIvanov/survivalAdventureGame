import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import { openStore } from './open-store.js';
import { SaveQueue } from './save-queue.js';
import { GameWorld } from './world.js';
import { TICK_RATE, SNAPSHOT_RATE } from '../shared/config.js';
import { castAbility } from './abilities.js';
import { rpgAction } from './rpg.js';
import { sendChat } from './chat.js';
import { GAME_VERSION } from '../shared/version.js';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function createGameServer({ database = path.join(root, 'data/village.sqlite'), databaseUrl, store: suppliedStore, requirePostgres = false, dev = false } = {}) {
  const store = suppliedStore || await openStore({ database, databaseUrl, requirePostgres });
  const app = express(), http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: 8192, pingTimeout: 15000 });
  const worlds = new Map(), sessions = new Map();
  let vite, closing = false, closePromise, commands = Promise.resolve();
  app.get('/api/health', (_req, res) => res.status(closing ? 503 : 200).json({ ok: !closing, version: GAME_VERSION, storage: databaseUrl ? 'postgresql' : 'sqlite', worlds: worlds.size }));
  if (dev) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({ root, server: { middlewareMode: true, hmr: { server: http } }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(root, 'dist'), { setHeaders: (res, filename) => { if (filename.endsWith('.html')) res.setHeader('Cache-Control', 'no-store'); } }));
    app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist/index.html'), { headers: { 'Cache-Control': 'no-store' } }));
  }

  const saves = new SaveQueue(store, (world, error) => {
    console.error('World save failed:', error.code || error.name);
    io.to(world.id).emit('notice', { type: 'error', message: 'Не удалось сохранить мир. Сервер повторит попытку. Не закрывайте игру.' });
  });
  const save = world => saves.save(world);
  async function exit(socket) {
    const { worldId, playerId } = socket.data;
    const world = worlds.get(worldId);
    if (!world) return true;
    if (sessions.get(`${worldId}:${playerId}`) !== socket.id) return true;
    sessions.delete(`${worldId}:${playerId}`);
    world.leave(playerId, { checkDefeat: !closing });
    socket.leave(worldId); socket.data.worldId = null;
    const ok = closing ? true : await save(world);
    io.to(worldId).emit('notice', { message: ok ? 'Напарник покинул мир. Его прогресс сохранён.' : 'Напарник покинул мир. Сервер повторяет сохранение прогресса.' });
    return ok;
  }
  io.use(async (socket, next) => {
    if (closing) return next(new Error('Сервер перезапускается. Подключитесь ещё раз.'));
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !/^[\w-]{32,128}$/.test(token)) return next(new Error('Недействительный ключ игрока.'));
    try {
      socket.data.playerId = await store.identity(token);
      socket.data.lastInput = 0;
      next();
    } catch { next(new Error('Хранилище временно недоступно. Повторите подключение.')); }
  });
  io.on('connection', socket => {
    const acknowledge = (ack, data) => { if (typeof ack === 'function') ack(data); };
    // Serialize room changes and durable actions across sockets. Ticks and movement keep running.
    // This prevents two simultaneous asynchronous loads from creating separate copies of one world.
    const command = (event, handler) => socket.on(event, (data, ack) => {
      if (typeof data === 'function') { ack = data; data = undefined; }
      if (closing || (socket.data.pendingCommands || 0) >= 8) return acknowledge(ack, { ok: false, error: 'Сервер занят. Повторите через несколько секунд.' });
      socket.data.pendingCommands = (socket.data.pendingCommands || 0) + 1;
      commands = commands.then(async () => {
        if (closing || !socket.connected) return;
        try { await handler(data, ack); }
        catch (error) { acknowledge(ack, { ok: false, error: error.message }); }
      }).catch(() => acknowledge(ack, { ok: false, error: 'Не удалось обработать запрос.' })).finally(() => { socket.data.pendingCommands--; });
    });
    command('worlds:list', async (_data, ack) => {
      try { acknowledge(ack, { ok: true, worlds: await store.list(socket.data.playerId) }); }
      catch { acknowledge(ack, { ok: false, error: 'Не удалось загрузить путешествия. Повторите позже.' }); }
    });
    command('world:forget', async (data, ack) => {
      const code = typeof data?.code === 'string' ? data.code.trim().toUpperCase() : '';
      if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error('Неверный код путешествия.');
      let world = [...worlds.values()].find(w => w.code === code);
      if (!world) {
        const saved = await store.load(code);
        if (!saved) throw new Error('Путешествие не найдено.');
        world = new GameWorld(saved);
      }
      const player = world.players.get(socket.data.playerId);
      if (!player) throw new Error('Это путешествие не принадлежит вашему герою.');
      if (socket.data.worldId === world.id) throw new Error('Сначала выйдите в главное меню.');
      player.hiddenJourney = true;
      worlds.set(world.id, world);
      if (!await save(world)) throw new Error('Не удалось сохранить удаление. Повторите позже.');
      acknowledge(ack, { ok: true });
    });
    command('world:enter', async (data, ack) => {
      if (!data || !['create', 'join'].includes(data.mode)) throw new Error('Неверный запрос.');
      const name = typeof data.name === 'string' ? data.name.trim().slice(0, 18) : '';
      if (!name) throw new Error('Укажите имя героя.');
      let world;
      if (data.mode === 'create') {
        // Bound accidental or malicious room creation from one connection.
        if (Date.now() - (socket.data.lastCreate || 0) < 5000) throw new Error('Подождите несколько секунд перед созданием нового мира.');
        socket.data.lastCreate = Date.now();
        world = new GameWorld();
        while (await store.load(world.code)) world = new GameWorld();
      } else {
        const code = String(data.code || '').trim().toUpperCase();
        if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error('Код мира состоит из 6 букв и цифр.');
        world = [...worlds.values()].find(w => w.code === code);
        if (!world) {
          let saved;
          try { saved = await store.load(code); }
          catch { throw new Error('Не удалось загрузить мир. Повторите позже.'); }
          if (!saved) throw new Error('Мир с таким кодом не найден. Проверьте код друга.');
          world = new GameWorld(saved);
        }
      }
      if (!world.players.has(socket.data.playerId) && world.players.size >= 2) throw new Error('В этом мире уже есть два героя. Создайте новый мир.');
      // Finish an existing session before binding this socket to another world.
      await exit(socket);
      if (!socket.connected) return;
      const key = `${world.id}:${socket.data.playerId}`;
      const previous = sessions.get(key);
      sessions.set(key, socket.id);
      if (previous && previous !== socket.id) {
        const old = io.sockets.sockets.get(previous);
        old?.emit('session:replaced'); old?.disconnect(true);
      }
      const player = world.join(socket.data.playerId, name, data.appearance === 'sage' ? 'sage' : 'ranger', data.classId);
      worlds.set(world.id, world);
      socket.data.worldId = world.id;
      if (!await save(world)) {
        await exit(socket);
        throw new Error('Вход в мир остановлен: сохранение недоступно. Повторите позже.');
      }
      if (!socket.connected) { await exit(socket); return; }
      await socket.join(world.id);
      acknowledge(ack, { ok: true, playerId: player.id, seed: world.seed, state: world.snapshot(player.id), chat: world.chatMessages });
      socket.to(world.id).emit('notice', { message: `${player.name} присоединился к приключению.` });
    });
    socket.on('input', data => {
      const now = Date.now();
      if (now - socket.data.lastInput < 16) return;
      socket.data.lastInput = now;
      worlds.get(socket.data.worldId)?.input(socket.data.playerId, data, now);
    });
    socket.on('dash', () => worlds.get(socket.data.worldId)?.dash(socket.data.playerId));
    command('chat:send', (data, ack) => {
      const world = worlds.get(socket.data.worldId);
      if (!world || sessions.get(`${world.id}:${socket.data.playerId}`) !== socket.id) throw new Error('Сначала войдите в мир.');
      const message = sendChat(world, world.players.get(socket.data.playerId), data);
      io.to(world.id).emit('chat:message', message);
      acknowledge(ack, { ok: true, message });
    });
    for (const [event, handler] of [['rpg:action', rpgAction], ['ability', castAbility]]) command(event, async (data, ack) => {
      const world = worlds.get(socket.data.worldId);
      if (!world) throw new Error('Сначала войдите в мир.');
      const now = Date.now();
      if (now - (socket.data.lastRpg || 0) < 75) throw new Error('Слишком много действий.');
      socket.data.lastRpg = now;
      handler(world, world.players.get(socket.data.playerId), data);
      if (world.criticalSave && !await save(world)) throw new Error('Не удалось сохранить действие.');
      acknowledge(ack, { ok: true, state: world.snapshot(socket.data.playerId) });
    });
    command('world:save', async (_data, ack) => {
      const world = worlds.get(socket.data.worldId);
      if (!world) return acknowledge(ack, { ok: false, error: 'Сначала войдите в мир.' });
      const ok = await save(world);
      acknowledge(ack, { ok, savedAt: world.savedAt, ...(ok ? {} : { error: 'Не удалось сохранить мир. Повторите позже.' }) });
    });
    command('world:leave', async (_data, ack) => { const ok = await exit(socket); acknowledge(ack, { ok, ...(ok ? {} : { error: 'Сохранение временно недоступно.' }) }); });
    socket.on('ping:time', ack => acknowledge(ack, Date.now()));
    socket.on('disconnect', () => { void exit(socket); });
  });

  let tickCount = 0;
  const timer = setInterval(() => {
    tickCount++;
    for (const world of worlds.values()) {
      const online = [...world.players.values()].some(p => p.online);
      if (online) world.tick(1 / TICK_RATE);
      // Retry a failed disconnect save even when everybody has left. Clean idle worlds make no queries.
      if ((world.criticalSave || (online && tickCount % (TICK_RATE * 5) === 0)) && saves.canAutosave(world)) void save(world);
      if (!online) continue;
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
    close: () => closePromise ||= (async () => {
      closing = true;
      clearInterval(timer);
      await commands;
      for (const world of worlds.values()) for (const player of world.players.values()) world.leave(player.id, { checkDefeat: false });
      const results = await Promise.all([...worlds.values()].map(save));
      await saves.flush();
      // Close Vite's HMR sockets before closing the shared HTTP server;
      // otherwise HTTP shutdown can wait forever for an open HMR connection.
      await vite?.close();
      await new Promise(resolve => io.close(resolve));
      await store.close();
      if (results.some(ok => !ok)) throw new Error('Final world snapshot could not be saved.');
    })(),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const server = await createGameServer({ dev: process.argv.includes('--dev'), database: process.env.DB_PATH || undefined, databaseUrl: process.env.DATABASE_URL, requirePostgres: process.env.RENDER === 'true' });
    const address = await server.listen(Number(process.env.PORT) || 3000, process.env.HOST || '0.0.0.0');
    console.log(`\n  Village Survival · http://localhost:${address.port}\n  Network: http://<server-ip>:${address.port}\n`);
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      try { await server.close(); process.exit(0); }
      catch { console.error('Server stopped before all saves were confirmed.'); process.exit(1); }
    });
  } catch (error) {
    console.error('Server startup failed. Check DATABASE_URL, database availability and PORT.', error.code || error.name);
    process.exitCode = 1;
  }
}

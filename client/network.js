import { io } from 'socket.io-client';

const tokenKey = 'village-survival:hero-key';
export function heroToken() {
  let token = localStorage.getItem(tokenKey);
  if (!token) {
    token = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(tokenKey, token);
  }
  return token;
}

export class Network extends EventTarget {
  constructor() {
    super();
    this.playerId = null; this.state = null; this.active = null; this.latency = 0;
    this.socket = io({ auth: { token: heroToken() }, reconnectionDelay: 800, reconnectionDelayMax: 3500 });
    this.socket.on('connect', async () => {
      this.emit('connection', { connected: true });
      if (this.active) {
        try { await this.enter({ ...this.active, mode: 'join' }); this.emit('notice', { message: 'Связь восстановлена. Добро пожаловать обратно.' }); }
        catch (error) { this.emit('notice', { message: error.message, type: 'error' }); }
      } else this.emit('ready');
    });
    this.socket.on('disconnect', () => this.emit('connection', { connected: false }));
    this.socket.on('connect_error', () => this.emit('connection', { connected: false }));
    this.socket.on('state', state => { this.state = state; this.emit('state', state); });
    this.socket.on('effects', effects => this.emit('effects', effects));
    this.socket.on('notice', notice => this.emit('notice', notice));
    this.socket.on('session:replaced', () => {
      this.active = null; this.emit('replaced');
    });
    this.pingTimer = setInterval(() => {
      if (!this.socket.connected) return;
      const start = performance.now();
      this.socket.timeout(3000).emit('ping:time', () => { this.latency = Math.round(performance.now() - start); });
    }, 4000);
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, callback) { this.addEventListener(type, event => callback(event.detail)); }
  request(event, data) {
    return new Promise((resolve, reject) => {
      if (!this.socket.connected) return reject(new Error('Нет связи с сервером. Повторите после подключения.'));
      const callback = (error, result) => {
        if (error) reject(new Error('Сервер не ответил. Проверьте соединение.'));
        else if (!result?.ok) reject(new Error(result?.error || 'Не удалось выполнить запрос.'));
        else resolve(result);
      };
      if (data === undefined) this.socket.timeout(7000).emit(event, callback);
      else this.socket.timeout(7000).emit(event, data, callback);
    });
  }
  async enter(data) {
    const result = await this.request('world:enter', data);
    this.playerId = result.playerId;
    this.state = result.state;
    this.active = { name: data.name, appearance: data.appearance, code: result.state.code };
    localStorage.setItem('village-survival:last-world', result.state.code);
    this.emit('entered', result);
    this.emit('state', result.state);
    return result;
  }
  async leave() {
    await this.request('world:leave');
    this.active = null; this.state = null;
    this.emit('left');
  }
  input(data) { if (this.active && this.socket.connected) this.socket.volatile.emit('input', data); }
  dash() { if (this.active && this.socket.connected) this.socket.emit('dash'); }
  save() { return this.request('world:save'); }
  list() { return this.request('worlds:list'); }
}

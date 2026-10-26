import { CHAT } from '../shared/chat.js';

export class ChatInterface {
  constructor(ui, { icon }) {
    this.ui = ui; this.messages = []; this.unread = 0; this.pending = false;
    const panel = document.createElement('section');
    panel.id = 'chat-panel'; panel.className = 'chat-panel panel'; panel.setAttribute('aria-label', 'Чат отряда');
    panel.innerHTML = `<button id="chat-toggle" class="chat-toggle" aria-expanded="false" aria-controls="chat-body">${icon('people')}<span>Чат отряда</span><b id="chat-unread" hidden></b><kbd>Enter</kbd></button><div id="chat-body" hidden><div id="chat-messages" class="chat-messages" role="log" aria-label="Сообщения отряда" aria-live="polite" aria-relevant="additions"></div><p id="chat-empty" class="chat-empty">Договоритесь о тактике с другом.</p><form id="chat-form" class="chat-form"><input id="chat-input" aria-label="Сообщение напарнику" maxlength="${CHAT.maxLength}" placeholder="Сообщение напарнику…" autocomplete="off"><button id="chat-send" type="submit" aria-label="Отправить сообщение">${icon('arrow')}</button></form><small>Enter — отправить · Esc — закрыть</small></div>`;
    ui.$('hud').append(panel);
    ui.$('chat-toggle').onclick = () => this.setOpen(ui.$('chat-body').hidden);
    ui.$('chat-form').onsubmit = event => { event.preventDefault(); void this.send(); };
    ui.$('chat-input').addEventListener('focus', () => {
      ui.scene.input?.keyboard?.resetKeys();
      ui.net.input({ x: 0, y: 0, angle: ui.state?.players.find(p => p.id === ui.net.playerId)?.angle || 0, attack: false });
    });
    ui.$('chat-input').addEventListener('blur', () => ui.scene.input?.keyboard?.resetKeys());
    document.addEventListener('keydown', event => {
      if (!ui.net.active || ui.panel || ui.state?.gameOver || event.repeat || event.isComposing) return;
      if (event.code === 'Enter' && !event.target.matches('input, textarea, button, [contenteditable="true"]')) {
        event.preventDefault(); this.setOpen(true);
      }
    });
    ui.net.on('entered', result => {
      const sameWorld = this.worldId === result.state.id; this.worldId = result.state.id;
      this.messages = []; this.unread = 0; ui.$('chat-messages').replaceChildren();
      if (!sameWorld) ui.$('chat-input').value = '';
      this.setOpen(sameWorld ? this.open !== false : true, false);
      for (const message of result.chat || []) this.receive(message, true);
      this.updateUnread(); this.updateConnection();
    });
    ui.net.on('chat', message => this.receive(message));
    ui.net.on('connection', () => this.updateConnection());
    for (const event of ['left', 'replaced']) ui.net.on(event, () => {
      this.setOpen(false); this.messages = []; this.unread = 0; this.worldId = null;
      ui.$('chat-messages').replaceChildren(); ui.$('chat-input').value = ''; this.updateUnread();
    });
  }

  setOpen(open, focus = true) {
    this.open = open;
    this.ui.$('chat-body').hidden = !open;
    this.ui.$('chat-toggle').setAttribute('aria-expanded', String(open));
    if (open) {
      this.unread = 0; this.updateUnread(); this.scrollToBottom();
      if (focus) this.ui.$('chat-input').focus();
    } else if (this.ui.$('chat-panel').contains(document.activeElement)) document.activeElement.blur();
  }

  updateConnection() {
    const connected = this.ui.net.socket.connected;
    this.ui.$('chat-input').disabled = !connected;
    this.ui.$('chat-input').placeholder = connected ? 'Сообщение напарнику…' : 'Восстанавливаем связь…';
    this.ui.$('chat-send').disabled = !connected || this.pending;
  }

  async send() {
    const input = this.ui.$('chat-input'), text = input.value.trim();
    if (!text || this.pending) return;
    const worldId = this.ui.state?.id;
    this.pending = true; this.updateConnection();
    try {
      const { message } = await this.ui.net.chat(text);
      if (worldId !== this.ui.state?.id || !this.ui.net.active) return;
      this.receive(message);
      if (input.value.trim() === text) input.value = '';
      if (document.activeElement === input || document.activeElement === this.ui.$('chat-send')) document.activeElement.blur();
    } catch (error) { this.ui.toast(error.message, 'error'); }
    finally { this.pending = false; this.updateConnection(); }
  }

  receive(message, history = false) {
    if (this.messages.some(m => m.id === message.id)) return;
    const log = this.ui.$('chat-messages');
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
    this.messages.push(message);
    const row = document.createElement('div'); row.className = 'chat-message';
    row.classList.toggle('own', message.playerId === this.ui.net.playerId);
    const name = document.createElement('strong'), text = document.createElement('span'), time = document.createElement('time');
    name.textContent = message.playerId === this.ui.net.playerId ? 'Вы' : message.name;
    text.textContent = message.text;
    time.dateTime = new Date(message.sentAt).toISOString();
    time.textContent = new Date(message.sentAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    row.append(name, time, text); log.append(row);
    if (this.messages.length > CHAT.historyLimit) { this.messages.shift(); log.firstElementChild.remove(); }
    this.ui.$('chat-empty').hidden = true;
    if (atBottom || history || message.playerId === this.ui.net.playerId) this.scrollToBottom();
    if (!history && this.ui.$('chat-body').hidden && message.playerId !== this.ui.net.playerId) this.unread++;
    this.updateUnread();
  }

  scrollToBottom() { const log = this.ui.$('chat-messages'); log.scrollTop = log.scrollHeight; }
  updateUnread() {
    this.ui.$('chat-unread').textContent = String(this.unread);
    this.ui.$('chat-unread').hidden = this.unread === 0;
    this.ui.$('chat-empty').hidden = this.messages.length > 0;
  }
}

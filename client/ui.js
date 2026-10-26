import { WORLD, PLAYER, inVillage, levelXp } from '../shared/config.js';
import { heroToken } from './network.js';
import { RpgInterface } from './rpg-ui.js';
import { SurvivalInterface } from './survival-ui.js';

const paths = {
  tree: '<path d="m12 2 6 7h-4l6 7h-6v6h-4v-6H4l6-7H6Z"/>',
  sword: '<path d="m15 3 6-1-1 6-10 10-4-4Z"/><path d="m3 12 9 9M2 22l5-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16m6-14v16"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 3 11 8 16 5-5 13-11 8-16Z"/>',
  shield: '<path d="m12 2 8 4v7c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="M12 7v9m-4-5h8"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8Z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14 8h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3m2-10v12"/>',
  save: '<path d="M4 3h13l4 4v14H3V3Z"/><path d="M7 3v6h9V3M7 21v-8h10v8"/>',
  settings: '<path d="m10 2-1 3-3 1-3-1-2 4 3 2v3l-2 2 2 4 3-1 3 1 1 3h4l1-3 3-1 3 1 2-4-3-2v-3l2-2-2-4-3 1-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  full: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 0-1 1-1 2m0 3v1"/>',
  door: '<path d="M9 21H3V3h12v5m-3 7h10m-4-4 4 4-4 4M9 3v18l6-3v-3"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  flag: '<path d="M5 22V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0"/>',
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.tree}</svg>`;
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class Interface {
  constructor(network, scene, game) {
    this.net = network; this.scene = scene; this.game = game; this.appearance = 'ranger'; this.mode = 'create'; this.panel = null;
    this.state = null; this.connected = false; this.lastLocation = null; this.modalReturnFocus = null;
    this.mount(); this.rpg = new RpgInterface(this, { icon, escape }); this.survival = new SurvivalInterface(this, { icon }); this.bind();
  }
  mount() {
    document.querySelector('#app').innerHTML = `
      <div class="screen-grain" aria-hidden="true"></div>
      <section id="main-menu" class="main-menu">
        <header class="menu-header"><a class="brand" href="/" aria-label="Village Survival — главное меню"><span class="brand-mark">${icon('tree')}</span><span>VILLAGE <b>SURVIVAL</b><small>THE FORGOTTEN LANDS</small></span></a><span class="version">ПЕРВЫЙ ЭТАП <span>v0.1</span></span></header>
        <div class="menu-layout">
          <div class="menu-story"><div class="eyebrow"><span></span> У КАЖДОГО МИРА ЕСТЬ СВОЯ ИСТОРИЯ</div><h1>Ваше приключение<br>начинается <em>здесь.</em></h1><p>За огнями тихой деревни простирается забытый лес.<br>Соберите отряд из двух героев. Найдите свою тропу.</p><div class="story-features"><span>${icon('people')} Два героя, один мир</span><span>${icon('save')} Прогресс сохраняется</span></div><div class="world-label"><span class="tiny-diamond"></span> ТИХАЯ СОСНА <span class="world-label-line"></span><small>ДЕРЕВНЯ У КРАЯ ЛЕСА</small></div></div>
          <div class="start-card"><div class="card-overline">НОВАЯ ГЛАВА</div><h2>Отправиться в путь</h2><p class="muted">Одному или вместе с другом.</p>
            <div class="mode-tabs" role="tablist" aria-label="Способ входа"><button class="active" data-mode="create" role="tab" aria-selected="true">Создать мир</button><button data-mode="join" role="tab" aria-selected="false">Присоединиться</button></div>
            <form id="start-form"><label class="field-label" for="hero-name">ИМЯ ВАШЕГО ГЕРОЯ</label><input id="hero-name" maxlength="18" autocomplete="nickname" placeholder="Как вас зовут?" required value="${escape(localStorage.getItem('village-survival:name') || 'Странник')}">
              <div id="code-field" hidden><label class="field-label" for="room-code">КОД МИРА</label><input id="room-code" maxlength="6" placeholder="ABC123" autocomplete="off" spellcheck="false" aria-label="Код мира друга"></div>
              <div id="appearance-field"><div class="field-label">ОБЛИК ГЕРОЯ</div><div class="appearance-options"><button type="button" class="appearance active" data-appearance="ranger" aria-pressed="true"><span class="portrait-art ranger"></span><span>Хранитель троп<small>Мшистый плащ</small></span><span class="selection-dot"></span></button><button type="button" class="appearance" data-appearance="sage" aria-pressed="false"><span class="portrait-art sage"></span><span>Искатель земель<small>Стальной плащ</small></span><span class="selection-dot"></span></button></div></div>
              <p id="form-error" class="form-error" role="alert" hidden></p><button type="submit" class="primary-button" id="start-button"><span>Создать приключение</span>${icon('arrow')}</button>
            </form><div class="save-note">${icon('shield')} Ваш мир останется с вами после выхода</div>
            <div id="saved-worlds" class="saved-worlds" hidden></div>
          </div>
        </div><footer class="menu-footer"><span><span id="menu-status" class="connection-dot"></span><span id="menu-status-text">Подключаемся к серверу…</span></span><button id="restore-key">Восстановить героя</button><span>ИССЛЕДУЙТЕ. СРАЖАЙТЕСЬ. ВОЗВРАЩАЙТЕСЬ.</span></footer>
      </section>

      <section id="hud" class="hud" hidden aria-label="Интерфейс игры">
        <div class="hero-block panel"><div id="hero-portrait" class="hero-portrait"><span class="portrait-art ranger"></span><b id="hero-level">1</b></div><div class="hero-summary"><div class="hero-title"><strong id="hero-label">Странник</strong><span>ИСКАТЕЛЬ</span></div><div class="health-track"><div id="hp-fill"></div><span id="hp-label">120 / 120</span></div><div class="hero-xp"><div id="xp-fill"></div></div><div class="xp-caption"><span id="xp-label">0 / 80 XP</span><span id="gold-label">0 золота</span></div></div><button id="hero-details" class="icon-button" aria-label="Характеристики героя" title="Рюкзак · I">${icon('shield')}</button></div>
        <div class="location-label"><div class="eyebrow" id="biome-tag">БЕЗОПАСНАЯ ТЕРРИТОРИЯ</div><h2 id="location-title">Тихая сосна</h2><div class="location-rule"><span></span>${icon('tree')}<span></span></div></div>
        <div class="minimap-panel panel"><div class="minimap-heading"><span>${icon('compass')} ОКРЕСТНОСТИ</span><button id="map-open" class="small-key" aria-label="Открыть карту">M</button></div><button id="minimap-button" class="minimap-button" aria-label="Открыть карту мира"><canvas id="minimap" width="222" height="157"></canvas><span class="map-north">N</span></button><div class="minimap-footer"><span>${icon('sun')} День · начало пути</span><span id="coords">48, 40</span></div></div>
        <div class="companion panel"><div class="companion-icon">${icon('people')}</div><div id="companion-content"><strong>Место для друга</strong><span>Вместе безопаснее</span></div><span id="party-count" class="party-count">1/2</span></div>
        <div class="field-notes"><div class="notes-heading">${icon('flag')} ПЕРВЫЕ ШАГИ</div><h3>За порогом деревни</h3><p>Каждое большое путешествие<br>начинается с маленького шага.</p><div id="objective-forest" class="objective"><span class="objective-dot"></span>Исследуйте Тёмный лес</div><div id="objective-kill" class="objective"><span class="objective-dot"></span>Победите лесного обитателя</div><div class="notes-divider"></div><div class="village-hint">${icon('heart')} Фонтан и покой деревни<br><span>восстанавливают здоровье</span></div></div>
        <button id="invite-button" class="room-code panel" title="Скопировать приглашение"><span class="connection-dot online"></span><span>КОД МИРА <b id="world-code">------</b></span>${icon('copy')}</button>
        <div class="movement-hint"><div class="wasd"><kbd>W</kbd><div><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div></div><span>Движение<br><small>Исследуйте мир</small></span></div>
        <div class="action-area"><div class="action-hint">ВАША ИСТОРИЯ ТОЛЬКО НАЧИНАЕТСЯ</div><div class="action-bar panel"><button id="attack-info" class="action-slot attack-slot" aria-label="Основная атака — левая кнопка мыши"><span class="action-key">ЛКМ</span>${icon('sword')}<small>Атака</small></button><div class="action-divider"></div><button id="dash-button" class="action-slot" aria-label="Рывок — пробел"><span class="action-key">SPACE</span>${icon('bolt')}<small>Рывок</small><span id="dash-cooldown" class="cooldown" hidden></span></button><div class="action-divider"></div><button id="character-button" class="action-slot" aria-label="Герой — I"><span class="action-key">I</span>${icon('shield')}<small>Герой</small></button><button id="bottom-map" class="action-slot" aria-label="Карта — M"><span class="action-key">M</span>${icon('map')}<small>Карта</small></button></div><span class="combat-hint">Направляйте удары курсором</span></div>
        <div class="bottom-right"><div class="utility-buttons"><button class="icon-button" id="help-button" aria-label="Управление" title="Управление">${icon('help')}</button><button class="icon-button" id="fullscreen-button" aria-label="Полный экран" title="Полный экран">${icon('full')}</button><button class="icon-button" id="settings-button" aria-label="Игровое меню" title="Меню · Esc">${icon('settings')}</button></div><span id="save-status">${icon('save')} Мир сохраняется автоматически</span><span class="connection-info"><span class="connection-dot online"></span><span id="ping-value">Сервер подключён</span><b>v0.1</b></span></div>
        <div id="reconnect-banner" class="reconnect-banner" hidden>Соединение потеряно. Возвращаемся в ваш мир…</div>
        <div id="death-overlay" class="death-overlay" hidden><div class="death-card">${icon('tree')}<div class="eyebrow">ЭТО НЕ КОНЕЦ ПУТИ</div><h2>Лес оказался сильнее</h2><p>Деревня ждёт вашего возвращения.</p><span id="respawn-counter">Возрождение через 5 с</span></div></div>
      </section>
      <div id="modal-backdrop" class="modal-backdrop" hidden><section id="modal" class="modal panel" role="dialog" aria-modal="true" aria-labelledby="modal-title"></section></div>
      <div id="toast-stack" class="toast-stack" aria-live="polite"></div>
      <div id="discovery" class="discovery" hidden><div class="eyebrow">ОТКРЫТА НОВАЯ ТЕРРИТОРИЯ</div><h2>Тёмный лес</h2><span>+15 опыта за исследование</span></div>`;
    this.$ = id => document.getElementById(id);
  }
  bind() {
    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => this.setMode(button.dataset.mode)));
    document.querySelectorAll('[data-appearance]').forEach(button => button.addEventListener('click', () => {
      this.appearance = button.dataset.appearance;
      document.querySelectorAll('[data-appearance]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    }));
    this.$('start-form').addEventListener('submit', event => { event.preventDefault(); this.enter(); });
    this.$('room-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''); });
    for (const id of ['map-open', 'minimap-button', 'bottom-map']) this.$(id).onclick = () => this.openPanel('map');
    for (const id of ['hero-details', 'character-button']) this.$(id).onclick = () => this.openPanel('hero');
    this.$('settings-button').onclick = () => this.openPanel('settings');
    this.$('help-button').onclick = () => this.openPanel('help');
    this.$('attack-info').onclick = () => this.toast('Удерживайте ЛКМ над миром. Воин бьёт мечом, маг и лучник стреляют в сторону курсора.');
    this.$('dash-button').onclick = () => this.net.dash();
    this.$('invite-button').onclick = () => this.copy(this.state?.code, 'Код мира скопирован. Отправьте его другу вместе с адресом игры.');
    this.$('fullscreen-button').onclick = async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
      catch { this.toast('Браузер не разрешил полноэкранный режим. Используйте кнопку полного экрана браузера.'); }
    };
    this.$('restore-key').onclick = () => this.openPanel('restore');
    this.$('modal-backdrop').addEventListener('click', event => { if (event.target === this.$('modal-backdrop')) this.closePanel(); });
    document.addEventListener('keydown', event => {
      if (event.code === 'Tab' && this.panel) {
        const focusable = [...this.$('modal').querySelectorAll('button, input, a')].filter(e => !e.disabled);
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
      }
      if (/INPUT|TEXTAREA/.test(event.target.tagName) && event.code !== 'Escape') return;
      if (this.net.active && !this.panel && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      if (event.code === 'Escape') { event.preventDefault(); this.panel ? this.closePanel() : this.net.active && this.openPanel('settings'); }
      if (!this.net.active || event.repeat) return;
      if (event.code === 'KeyM') { event.preventDefault(); this.panel === 'map' ? this.closePanel() : this.openPanel('map'); }
      if (event.code === 'KeyI') { event.preventDefault(); this.panel === 'inventory' ? this.closePanel() : this.openPanel('inventory'); }
    });
    this.net.on('connection', ({ connected }) => {
      this.connected = connected;
      this.$('menu-status').classList.toggle('online', connected);
      this.$('menu-status-text').textContent = connected ? 'Сервер подключён' : 'Подключаемся к серверу…';
      this.$('reconnect-banner').hidden = connected || !this.net.active;
    });
    this.net.on('ready', () => this.refreshWorlds());
    this.net.on('entered', () => {
      this.$('main-menu').hidden = true; this.$('hud').hidden = false; this.closePanel();
      document.activeElement?.blur();
    });
    this.net.on('state', state => this.render(state));
    this.net.on('notice', notice => this.toast(notice.message, notice.type));
    this.net.on('left', () => { this.$('hud').hidden = true; this.$('main-menu').hidden = false; this.closePanel(); this.refreshWorlds(); });
    this.net.on('replaced', () => {
      this.scene.reset(); this.$('hud').hidden = true; this.$('main-menu').hidden = false; this.closePanel();
      this.toast('Этот герой открыт в другой вкладке. Закройте её, чтобы продолжить здесь.', 'error');
    });
    this.net.on('effects', events => {
      for (const e of events) {
        if (e.type === 'discover' && e.id === this.net.playerId) {
          if (this.$('survival-banner') && !this.$('survival-banner').hidden) { this.toast(`Открыт Тёмный лес · +${e.xp} опыта`); continue; }
          this.$('discovery').hidden = false; clearTimeout(this.discoveryTimer);
          this.discoveryTimer = setTimeout(() => { this.$('discovery').hidden = true; }, 4500);
        }
        if (e.type === 'level' && e.id === this.net.playerId) this.toast(`Уровень ${e.level}! Здоровье восстановлено, сила атаки увеличена.`);
      }
    });
    this.scene.onArtReady = () => this.portraits();
    if (this.scene.artReady) this.portraits();
    if (this.net.socket.connected) this.refreshWorlds();
  }
  portraits() {
    for (const appearance of ['ranger', 'sage']) {
      const source = this.scene.textures.get(`hero-${appearance}-0`).getSourceImage().toDataURL();
      document.documentElement.style.setProperty(`--portrait-${appearance}`, `url("${source}")`);
    }
  }
  setMode(mode) {
    this.mode = mode;
    document.querySelectorAll('[data-mode]').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    this.$('code-field').hidden = mode !== 'join';
    this.$('room-code').required = mode === 'join';
    this.$('start-button').querySelector('span').textContent = mode === 'join' ? 'Присоединиться к другу' : 'Создать приключение';
    this.$('form-error').hidden = true;
  }
  async enter(code) {
    const button = this.$('start-button'); button.disabled = true;
    this.$('form-error').hidden = true;
    const name = this.$('hero-name').value.trim();
    localStorage.setItem('village-survival:name', name);
    try {
      await this.net.enter({ mode: code ? 'join' : this.mode, code: code || this.$('room-code').value, name, appearance: this.appearance, classId: this.rpg.classId });
    } catch (error) { this.$('form-error').textContent = error.message; this.$('form-error').hidden = false; }
    finally { button.disabled = false; }
  }
  async refreshWorlds() {
    try {
      const { worlds } = await this.net.list();
      const box = this.$('saved-worlds'); box.hidden = worlds.length === 0;
      box.innerHTML = `<div class="field-label">ВАШИ ПУТЕШЕСТВИЯ</div>${worlds.slice(0, 3).map(w => `<button class="saved-world" data-code="${escape(w.code)}"><span class="save-world-icon">${icon('tree')}</span><span><strong>${escape(w.name)}</strong><small>${w.code} · Уровень ${w.level} · ${w.members}/2 героя</small></span>${icon('arrow')}</button>`).join('')}`;
      box.querySelectorAll('[data-code]').forEach(button => button.onclick = () => this.enter(button.dataset.code));
    } catch { /* Connection status already explains unavailable server. */ }
  }
  render(state) {
    this.state = state;
    const me = state.players.find(p => p.id === this.net.playerId);
    if (!me) return;
    this.$('hero-label').textContent = me.name;
    this.$('hero-level').textContent = me.level;
    this.$('hero-portrait').querySelector('.portrait-art').className = `portrait-art ${me.appearance}`;
    this.$('hp-fill').style.width = `${me.hp / me.maxHp * 100}%`;
    this.$('hp-fill').classList.toggle('low', me.hp < me.maxHp * .3);
    this.$('hp-label').textContent = `${me.hp} / ${me.maxHp}`;
    this.$('xp-fill').style.width = `${me.xp / levelXp(me.level) * 100}%`;
    this.$('xp-label').textContent = `${me.xp} / ${levelXp(me.level)} XP`;
    this.$('gold-label').textContent = `${me.gold} золота`;
    this.$('world-code').textContent = state.code;
    this.$('coords').textContent = `${Math.floor(me.x / 32)}, ${Math.floor(me.y / 32)}`;
    this.$('ping-value').textContent = `${this.net.latency || '—'} мс · Онлайн`;
    const safe = inVillage(me), location = safe ? 'Тихая сосна' : 'Тёмный лес';
    this.$('location-title').textContent = location;
    this.$('biome-tag').textContent = safe ? 'БЕЗОПАСНАЯ ТЕРРИТОРИЯ' : 'БУДЬТЕ НАЧЕКУ';
    this.$('biome-tag').classList.toggle('danger', !safe);
    this.$('objective-forest').classList.toggle('done', me.explored.includes('forest'));
    this.$('objective-kill').classList.toggle('done', me.kills > 0);
    const ally = state.players.find(p => p.id !== me.id);
    this.$('party-count').textContent = `${state.players.filter(p => p.online).length}/2`;
    this.$('companion-content').innerHTML = ally ? `<strong>${escape(ally.name)} <small>УР. ${ally.level}</small></strong><span>${ally.online ? (ally.hp > 0 ? `${ally.hp} / ${ally.maxHp} HP · в вашем мире` : 'Возрождается в деревне') : 'Не в сети · прогресс сохранён'}</span>` : '<strong>Место для друга</strong><span>Пригласите по коду мира</span>';
    const cooldown = Math.max(0, PLAYER.dashCooldown - (state.elapsed - me.lastDash));
    this.$('dash-cooldown').hidden = cooldown <= 0;
    this.$('dash-cooldown').textContent = (cooldown / 1000).toFixed(1);
    this.$('death-overlay').hidden = me.hp > 0;
    this.$('respawn-counter').textContent = `Возвращение через ${Math.max(1, Math.ceil((me.respawnAt - state.elapsed) / 1000))} с`;
    if (state.savedAt) this.$('save-status').innerHTML = `${icon('save')} Сохранено в ${new Date(state.savedAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
    this.drawMap(this.$('minimap'), false);
    if (this.panel === 'map') this.drawMap(this.$('world-map'), true);
    this.rpg.render(state, me);
    this.survival.render(state, me);
  }
  drawMap(canvas, full) {
    if (!canvas || !this.state) return;
    const c = canvas.getContext('2d'), width = canvas.width, height = canvas.height;
    const sx = width / WORLD.width, sy = height / WORLD.height;
    c.fillStyle = '#2d432e'; c.fillRect(0, 0, width, height);
    c.fillStyle = '#3b5336';
    for (const t of this.scene.map?.trees || []) c.fillRect(t.x * sx - 1, t.y * sy - 1, full ? 5 : 2, full ? 5 : 2);
    c.fillStyle = '#7f8053'; c.fillRect(0, 1120 * sy, width, 64 * sy); c.fillRect(1505 * sx, 0, 64 * sx, height);
    c.fillStyle = '#75815a'; c.beginPath(); c.ellipse(1536 * sx, 1152 * sy, 310 * sx, 270 * sy, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#526d67'; c.beginPath(); c.ellipse(2090 * sx, 690 * sy, 150 * sx, 100 * sy, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#b39a68';
    for (const b of this.scene.map?.buildings || []) c.fillRect((b.x - 55) * sx, (b.y - 60) * sy, 110 * sx, 65 * sy);
    c.fillStyle = '#99bfc0'; c.fillRect(1513 * sx, 1130 * sy, 46 * sx, 46 * sy);
    this.survival.markMap(c, sx, sy, full, this.state);
    for (const m of this.state.monsters) {
      c.fillStyle = '#bc775c'; c.beginPath(); c.arc(m.x * sx, m.y * sy, full ? 3 : 1.5, 0, Math.PI * 2); c.fill();
    }
    for (const p of this.state.players.filter(p => p.online)) {
      const mine = p.id === this.net.playerId;
      c.fillStyle = mine ? '#f2df9c' : '#a0d5e1'; c.strokeStyle = '#263c2d'; c.lineWidth = 2;
      c.beginPath(); c.arc(p.x * sx, p.y * sy, full ? 6 : 4, 0, Math.PI * 2); c.fill(); c.stroke();
      if (mine) {
        c.strokeStyle = '#ead99a70'; c.lineWidth = 1; c.beginPath(); c.arc(p.x * sx, p.y * sy, full ? 11 : 7, 0, Math.PI * 2); c.stroke();
      }
    }
    if (full) {
      c.textAlign = 'center'; c.font = '15px Georgia'; c.fillStyle = '#e4d9ac';
      c.fillText('ТИХАЯ СОСНА', 1536 * sx, 980 * sy);
      c.font = '13px Georgia'; c.fillStyle = '#b2c195'; c.fillText('Т Ё М Н Ы Й  Л Е С', 710 * sx, 720 * sy); c.fillText('ЛЕСНОЙ ПРУД', 2100 * sx, 500 * sy);
    }
    c.strokeStyle = '#b5a77520'; c.lineWidth = 1;
    for (let x = 0; x < width; x += width / 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, height); c.stroke(); }
    for (let y = 0; y < height; y += height / 6) { c.beginPath(); c.moveTo(0, y); c.lineTo(width, y); c.stroke(); }
  }
  openPanel(type) {
    if (this.rpg.handles(type)) return this.rpg.open(type);
    this.modalReturnFocus = document.activeElement;
    this.panel = type; this.scene.pausedInput = true;
    this.scene.input?.keyboard?.resetKeys();
    this.$('modal-backdrop').hidden = false;
    const title = { map: 'Карта окрестностей', hero: 'Ваш герой', settings: 'Небольшая передышка', help: 'Находите свой путь', restore: 'Вернуться к своей истории' }[type];
    const body = {
      map: `<p class="muted">Забытые земли · Деревня и Тёмный лес</p><canvas id="world-map" width="768" height="518"></canvas><div class="map-legend"><span><i class="legend-dot hero-dot"></i>Вы</span><span><i class="legend-dot ally-dot"></i>Напарник</span><span><i class="legend-dot enemy-dot"></i>Противник</span><span>Двигайтесь по тропам. В деревне безопасно.</span></div>`,
      settings: `<p class="muted">Мир продолжает жить, пока вы открываете меню.<br>Для отдыха вернитесь в безопасную деревню.</p><div class="settings-row"><label for="effects-toggle">Эффекты и встряска камеры</label><input id="effects-toggle" type="checkbox" ${this.scene.effectsEnabled ? 'checked' : ''}></div><button id="save-now" class="secondary-button">${icon('save')} Сохранить сейчас</button><button id="backup-key" class="secondary-button">${icon('copy')} Скопировать ключ героя</button><p class="panel-footnote">Ключ возвращает вашего героя на другом компьютере. Храните его у себя и не отправляйте другим игрокам.</p><button id="resume-button" class="primary-button">Продолжить путешествие ${icon('arrow')}</button><button id="leave-world" class="text-button">${icon('door')} Сохранить и выйти в меню</button>`,
      help: `<p class="muted">Вы и ваш друг делите один постоянный мир.<br>Вместе исследуйте лес, побеждайте врагов и набирайтесь опыта.</p><div class="controls-list"><span><kbd>W A S D</kbd> Движение <small>или стрелки</small></span><span><kbd>ЛКМ</kbd> Атака в сторону курсора</span><span><kbd>SPACE</kbd> Рывок <small>перезарядка 2,4 с</small></span><span><kbd>Q E R</kbd> Способности в сторону курсора</span><span><kbd>F</kbd> NPC, добыча, сундуки</span><span><kbd>I / C / J</kbd> Рюкзак / герой / задания</span><span><kbd>1</kbd> Зелье здоровья</span><span><kbd>M</kbd> Карта мира</span><span><kbd>ESC</kbd> Игровое меню</span></div><div class="help-tip">${icon('heart')} В деревне здоровье восстанавливается. После смерти вы вернётесь к фонтану через 5 секунд без потери опыта.</div><p class="panel-footnote">Чтобы пригласить друга, отправьте ему адрес игры и код мира в левом нижнем углу. Максимум два постоянных героя в мире.</p>`,
      restore: `<p class="muted">Введите сохранённый ключ героя, чтобы открыть его миры на этом устройстве.</p><form id="restore-form"><label class="field-label" for="restore-input">ЛИЧНЫЙ КЛЮЧ ГЕРОЯ</label><input id="restore-input" required minlength="32" maxlength="128" autocomplete="off" spellcheck="false" placeholder="Вставьте ключ"><p class="panel-footnote">Текущий ключ будет заменён только в этом браузере. Если он нужен, сначала скопируйте его.</p><button type="button" id="copy-current-key" class="secondary-button">${icon('copy')} Скопировать текущий ключ</button><button type="submit" class="primary-button">Восстановить героя ${icon('arrow')}</button></form>`,
    }[type];
    this.$('modal').classList.toggle('wide', type === 'map');
    this.$('modal').innerHTML = `<div class="modal-heading"><div><div class="eyebrow">VILLAGE SURVIVAL</div><h2 id="modal-title">${title}</h2></div><button id="close-modal" class="icon-button" aria-label="Закрыть окно">${icon('close')}</button></div>${body}`;
    this.$('close-modal').onclick = () => this.closePanel(); this.$('close-modal').focus();
    if (type === 'map') this.drawMap(this.$('world-map'), true);
    if (type === 'settings') {
      this.$('effects-toggle').onchange = event => { this.scene.effectsEnabled = event.target.checked; };
      this.$('resume-button').onclick = () => this.closePanel();
      this.$('backup-key').onclick = () => this.copy(heroToken(), 'Ключ героя скопирован. Сохраните его в надёжном месте.');
      this.$('save-now').onclick = async () => { try { await this.net.save(); this.toast('Мир и герои сохранены.'); } catch (e) { this.toast(e.message, 'error'); } };
      this.$('leave-world').onclick = async event => {
        event.currentTarget.disabled = true;
        try { await this.net.leave(); } catch (e) { this.toast(e.message, 'error'); if (this.$('leave-world')) this.$('leave-world').disabled = false; }
      };
    }
    if (type === 'restore') {
      this.$('copy-current-key').onclick = () => this.copy(heroToken(), 'Текущий ключ героя скопирован.');
      this.$('restore-form').onsubmit = event => {
        event.preventDefault(); const token = this.$('restore-input').value.trim();
        if (!/^[\w-]{32,128}$/.test(token)) return this.toast('Проверьте ключ: от 32 до 128 букв, цифр или дефисов.', 'error');
        localStorage.setItem('village-survival:hero-key', token);
        this.net.socket.disconnect(); this.net.socket.auth.token = token; this.net.socket.connect(); this.closePanel();
      };
    }
  }
  closePanel() {
    this.panel = null; this.$('modal-backdrop').hidden = true;
    this.scene.pausedInput = !this.net.active;
    this.modalReturnFocus?.focus?.(); this.modalReturnFocus = null;
  }
  async copy(text, message) {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const field = document.createElement('textarea'); field.value = text; document.body.append(field); field.select();
        const success = document.execCommand('copy'); field.remove(); if (!success) throw new Error('clipboard');
      }
      this.toast(message);
    } catch { this.toast('Буфер обмена недоступен. Код мира можно выделить и скопировать вручную.', 'error'); }
  }
  toast(message, type) {
    const toast = document.createElement('div'); toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.innerHTML = `${icon(type === 'error' ? 'help' : 'check')}<span></span>`; toast.querySelector('span').textContent = message;
    this.$('toast-stack').append(toast); setTimeout(() => toast.remove(), 5200);
  }
}

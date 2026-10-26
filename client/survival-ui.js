import { SURVIVAL, sheltered, assaultActive } from '../shared/survival.js';

const formatTime = ms => { const seconds = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };

export class SurvivalInterface {
  constructor(ui, { icon }) {
    this.ui = ui; this.icon = icon;
    const panel = document.createElement('button'); panel.id = 'survival-panel'; panel.className = 'survival-panel panel';
    panel.setAttribute('aria-label', 'Время, нападения и защита деревни');
    panel.innerHTML = `<div class="survival-heading"><span id="survival-phase">${icon('sun')} ДЕНЬ 1</span><span id="survival-timer">7:00</span></div><div class="cycle-track"><div id="cycle-fill"></div></div><div id="wave-summary">Лес пока спокоен</div><div class="village-defense-label"><span>${icon('shield')} Защита деревни</span><b id="village-hp-label">900 / 900</b></div><div class="village-defense-track"><div id="village-hp-fill"></div></div><small id="survival-next">До наступления ночи</small>`;
    panel.onclick = () => this.open(); this.ui.$('hud').append(panel);
    const boss = document.createElement('div'); boss.id = 'boss-hud'; boss.className = 'boss-hud'; boss.hidden = true;
    boss.innerHTML = '<div class="boss-hud-label"><span>ДРЕВНИЙ ЛЕСНОЙ СТРАЖ</span><small id="boss-phase-label">ФАЗА I</small></div><div class="boss-hp-track"><div id="boss-hp-fill"></div><span id="boss-hp-value"></span></div><small>Уходите из отмеченных областей · Space — рывок</small>';
    this.ui.$('hud').append(boss);
    const banner = document.createElement('div'); banner.id = 'survival-banner'; banner.className = 'survival-banner'; banner.hidden = true;
    this.ui.$('hud').append(banner);
    document.querySelector('.version').innerHTML = 'ВЫЖИВАНИЕ · ЭТАП 3 <span>v0.3</span>';
    document.querySelector('.connection-info b').textContent = 'v0.3';
    this.ui.net.on('effects', events => this.effects(events));
  }
  render(state, me) {
    const s = state.survival; if (!s) return;
    const active = assaultActive(s), village = state.village;
    this.ui.$('survival-panel').classList.toggle('under-attack', active);
    this.ui.$('survival-panel').classList.toggle('night', s.phase === 'night');
    this.ui.$('survival-phase').innerHTML = `${this.icon(s.phase === 'night' ? 'compass' : 'sun')} ${s.phase === 'night' ? 'НОЧЬ' : 'ДЕНЬ'} ${s.day}`;
    this.ui.$('survival-timer').textContent = formatTime(s.remaining);
    this.ui.$('cycle-fill').style.width = `${s.progress * 100}%`;
    this.ui.$('wave-summary').textContent = active ? `Волна ${s.wave.night} · Врагов: ${s.wave.alive} · Подходят: ${s.wave.total - s.wave.spawned}` : s.wave?.status === 'failed' && s.phase === 'night' ? 'Деревня пала. Староста поможет с ремонтом.' : s.phase === 'night' ? 'Нападение отбито. Доживите до рассвета.' : s.warning ? 'Скоро нападение. Возвращайтесь в деревню.' : `Следующая волна: ${s.day}${s.day % 5 === 0 ? ' · с боссом' : ''}`;
    this.ui.$('village-hp-label').textContent = `${Math.ceil(village.hp)} / ${village.maxHp}`;
    this.ui.$('village-hp-fill').style.width = `${village.hp / village.maxHp * 100}%`;
    this.ui.$('village-hp-fill').classList.toggle('low', village.hp / village.maxHp < .3);
    this.ui.$('survival-next').textContent = s.phase === 'night' ? 'До рассвета · Деревня нуждается в вас' : 'До наступления ночи · День 7 мин / ночь 3 мин';
    document.querySelector('.minimap-footer>span:first-child').innerHTML = `${this.icon(s.phase === 'night' ? 'compass' : 'sun')} ${s.phase === 'night' ? `Ночь ${s.nightNumber}` : `День ${s.day}`} · ${formatTime(s.remaining)}`;
    if (!sheltered(state, me) && this.ui.$('location-title').textContent === 'Тихая сосна') {
      this.ui.$('biome-tag').textContent = active ? 'ДЕРЕВНЯ ПОД АТАКОЙ' : 'ЗАЩИТА НУЖДАЕТСЯ В РЕМОНТЕ';
      this.ui.$('biome-tag').classList.add('danger');
    }
    const bosses = state.monsters.filter(m => m.kind === 'guardian');
    const boss = bosses[0]; this.ui.$('boss-hud').hidden = !boss;
    if (boss) {
      this.ui.$('boss-phase-label').textContent = `ФАЗА ${boss.bossPhase || 1} / 3`;
      this.ui.$('boss-hp-fill').style.width = `${boss.hp / boss.maxHp * 100}%`;
      this.ui.$('boss-hp-value').textContent = `${boss.hp} / ${boss.maxHp}`;
    }
  }
  effects(events) {
    for (const e of events) {
      let title, message;
      if (e.type === 'night-warning') { title = 'СУМЕРКИ СГУЩАЮТСЯ'; message = `До ночи ${e.seconds || 30} с. Вернитесь защищать деревню.`; }
      if (e.type === 'night-start') { title = `НАСТУПИЛА НОЧЬ ${e.night}`; message = e.boss ? 'Волна со Стражем. Держитесь вместе.' : 'Монстры идут к деревне. Подготовьте оружие.'; }
      if (e.type === 'dawn') { title = `РАССВЕТ · ДЕНЬ ${e.day}`; message = 'Ночные враги отступают. Время восстановить силы.'; }
      if (e.type === 'wave-defended') { title = 'ДЕРЕВНЯ ВЫСТОЯЛА'; message = `Ночь ${e.night} пережита. Герои получили опыт и золото.`; }
      if (e.type === 'wave-failed') { title = 'ЗАЩИТА ДЕРЕВНИ ПАЛА'; message = 'Прогресс героев сохранён. Обратитесь к старосте за ремонтом.'; }
      if (e.type === 'boss-awakened') { title = 'ЛЕСНОЙ СТРАЖ ПРОБУЖДЁН'; message = 'Красные области предупреждают об ударах. Используйте рывок.'; }
      if (e.type === 'boss-defeated') { title = 'ДРЕВНИЙ СТРАЖ ПОВЕРЖЕН'; message = 'Эпическая награда ждёт каждого участника боя. Подберите её через F.'; }
      if (e.type === 'boss-phase') this.ui.toast(`Лесной страж: фаза ${e.phase}. ${e.phase === 3 ? 'Атаки ускорились!' : 'Он призывает сумеречных хищников.'}`);
      if (!title) continue;
      this.ui.$('discovery').hidden = true;
      const banner = this.ui.$('survival-banner');
      banner.innerHTML = `<div>${title}</div><p>${message}</p>`; banner.hidden = false;
      clearTimeout(this.bannerTimer); this.bannerTimer = setTimeout(() => { banner.hidden = true; }, 6000);
    }
  }
  open() {
    this.ui.panel = 'survival'; this.ui.scene.pausedInput = true; this.ui.scene.input?.keyboard?.resetKeys();
    this.ui.$('modal-backdrop').hidden = false; this.ui.$('modal').classList.remove('wide');
    this.ui.$('modal').innerHTML = `<div class="modal-heading"><div><div class="eyebrow">VILLAGE SURVIVAL · ВЫЖИВАНИЕ</div><h2 id="modal-title">Дожить до рассвета</h2></div><button id="close-modal" class="icon-button" aria-label="Закрыть окно">${this.icon('close')}</button></div><div class="survival-guide"><p>День длится <b>7 минут</b>, ночь — <b>3 минуты</b>. За 30 секунд до темноты придёт предупреждение.</p><p>Каждую ночь монстры приходят с четырёх сторон. Одни охотятся за героями, другие повреждают защиту у фонтана. Во время нападения деревня не лечит.</p><p>Уничтожьте всех нападающих или сохраните защиту до рассвета. Каждая следующая ночь сложнее, каждая пятая — со Стражем.</p><p>После поражения герои сохраняют прогресс. На рассвете защита частично восстановится; дополнительный ремонт у старосты стоит 15 золота за 150 защиты.</p><p><b>Первый босс доступен раньше:</b> найдите алтарь на восточной поляне, нажмите F и пробудите Стража. Отходите из отмеченных областей и используйте рывок. На 65% и 30% здоровья он меняет фазу.</p><p>Пустой мир приостанавливается. День, волна, защита деревни и состояние босса сохраняются между сессиями.</p></div>`;
    this.ui.$('close-modal').onclick = () => this.ui.closePanel(); this.ui.$('close-modal').focus();
  }
  markMap(c, sx, sy, full, state) {
    c.fillStyle = state.survival?.guardianDefeated ? '#849773' : '#cbbf8c';
    c.save(); c.translate(SURVIVAL.shrine.x * sx, SURVIVAL.shrine.y * sy); c.rotate(Math.PI / 4); c.fillRect(full ? -4 : -2, full ? -4 : -2, full ? 8 : 4, full ? 8 : 4); c.restore();
    for (const m of state.monsters.filter(m => m.kind === 'guardian')) { c.strokeStyle = '#e7b885'; c.lineWidth = 2; c.beginPath(); c.arc(m.x * sx, m.y * sy, full ? 9 : 5, 0, Math.PI * 2); c.stroke(); }
    if (assaultActive(state.survival)) { c.strokeStyle = '#e0a87b'; c.lineWidth = full ? 2 : 1; c.beginPath(); c.arc(SURVIVAL.core.x * sx, SURVIVAL.core.y * sy, full ? 15 : 7, 0, Math.PI * 2); c.stroke(); }
    if (full) { c.font = '11px Georgia'; c.textAlign = 'center'; c.fillStyle = '#d5cea6'; c.fillText('АЛТАРЬ СТРАЖА', SURVIVAL.shrine.x * sx, SURVIVAL.shrine.y * sy - 16); }
  }
}

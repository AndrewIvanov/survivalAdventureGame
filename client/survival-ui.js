import { SURVIVAL, sheltered, assaultActive, waveSize, bossNight } from '../shared/survival.js';
import { GAME_VERSION } from '../shared/version.js';

const formatTime = ms => { const seconds = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };

export class SurvivalInterface {
  constructor(ui, { icon }) {
    this.ui = ui; this.icon = icon;
    const panel = document.createElement('section'); panel.id = 'survival-panel'; panel.className = 'survival-panel panel';
    panel.setAttribute('aria-label', 'Время, нападения и защита деревни');
    panel.innerHTML = `<div class="survival-heading"><span id="survival-phase">${icon('sun')} ДЕНЬ 1</span><span id="survival-timer">5:00</span></div><div class="cycle-track"><div id="cycle-fill"></div></div><div id="wave-summary">Лес пока спокоен</div><div class="village-defense-label"><span>${icon('shield')} Защита деревни</span><b id="village-hp-label">900 / 900</b></div><div class="village-defense-track"><div id="village-hp-fill"></div></div><small id="survival-next">До наступления ночи</small>`;
    panel.innerHTML = `<button id="survival-info" class="survival-info" aria-label="Правила выживания">${panel.innerHTML}</button><button id="skip-day" class="skip-day" aria-pressed="false">Пропустить день</button><small id="skip-day-status"></small>`;
    this.ui.$('hud').append(panel);
    this.ui.$('survival-info').onclick = () => this.open();
    this.ui.$('skip-day').onclick = async () => {
      if (this.skipPending) return;
      this.skipPending = true; this.ui.prop('skip-day', 'disabled', true);
      const ready = !this.ui.state?.survival?.skipDayVotes?.includes(this.ui.net.playerId);
      await this.ui.rpg.perform({ type: 'day:skip', ready });
      this.skipPending = false;
      if (this.ui.state) this.render(this.ui.state, this.ui.state.players.find(p => p.id === this.ui.net.playerId));
    };
    const end = document.createElement('div'); end.id = 'game-over-overlay'; end.className = 'game-over-overlay'; end.hidden = true;
    end.innerHTML = `<section class="game-over-card" role="dialog" aria-modal="true" aria-labelledby="game-over-title"><div class="eyebrow">ПРИКЛЮЧЕНИЕ ЗАВЕРШЕНО</div><h2 id="game-over-title">Отряд пал</h2><p>Все герои отряда погибли. Некому отнести надгробия к алтарю.</p><div id="game-over-result"></div><button id="game-over-restart" class="primary-button">Новое приключение ${icon('arrow')}</button><button id="game-over-menu" class="secondary-button">В главное меню</button><small>Новый мир начнётся с первого дня с топориком и без золота у каждого героя.</small></section>`;
    this.ui.$('hud').append(end);
    const leave = async restart => {
      const button = this.ui.$(restart ? 'game-over-restart' : 'game-over-menu'); button.disabled = true;
      try { await this.ui.net.leave(); this.ui.setMode('create'); if (restart) await this.ui.enter(); }
      catch (error) { this.ui.toast(error.message, 'error'); }
      finally { button.disabled = false; }
    };
    this.ui.$('game-over-restart').onclick = () => leave(true);
    this.ui.$('game-over-menu').onclick = () => leave(false);
    const boss = document.createElement('div'); boss.id = 'boss-hud'; boss.className = 'boss-hud'; boss.hidden = true;
    boss.innerHTML = '<div class="boss-hud-label"><span>ДРЕВНИЙ ЛЕСНОЙ СТРАЖ</span><small id="boss-phase-label">ФАЗА I</small></div><div class="boss-hp-track"><div id="boss-hp-fill"></div><span id="boss-hp-value"></span></div><small>Уходите из отмеченных областей · Space — рывок</small>';
    this.ui.$('hud').append(boss);
    const banner = document.createElement('div'); banner.id = 'survival-banner'; banner.className = 'survival-banner'; banner.hidden = true;
    this.ui.$('hud').append(banner);
    document.querySelector('.version').innerHTML = `РЕМЕСЛО И ПРОФЕССИИ <span>v${GAME_VERSION}</span>`;
    document.querySelector('.connection-info b').textContent = `v${GAME_VERSION}`;
    this.ui.net.on('effects', events => this.effects(events));
  }
  render(state, me) {
    const s = state.survival; if (!s) return;
    const active = assaultActive(s), village = state.village;
    const skip = this.ui.$('skip-day'), votes = s.skipDayVotes || [], voted = votes.includes(me?.id);
    this.ui.prop(skip, 'hidden', s.phase !== 'day' || !!state.gameOver);
    this.ui.prop(skip, 'disabled', !!this.skipPending || !me || me.hp <= 0);
    if (skip.getAttribute('aria-pressed') !== String(voted)) skip.setAttribute('aria-pressed', String(voted));
    this.ui.text(skip, voted ? `Отменить готовность · ${votes.length}/${s.skipDayPlayers}` : 'Пропустить день → ночь');
    this.ui.prop(skip, 'title', s.skipDayPlayers > 1 ? 'Ночь начнётся после согласия обоих героев' : 'Начать ночь прямо сейчас');
    this.ui.prop('skip-day-status', 'hidden', skip.hidden);
    this.ui.text('skip-day-status', s.skipDayPlayers > 1 ? votes.length ? `Готовы: ${votes.length} из ${s.skipDayPlayers}. Ждём напарника.` : 'Начать ночь, когда оба героя готовы' : 'Сразу начать ночь');
    const end = this.ui.$('game-over-overlay');
    if (state.gameOver) {
      if (end.hidden) { this.ui.closePanel(); end.hidden = false; this.ui.$('game-over-restart').focus(); }
      this.ui.scene.pausedInput = true; this.ui.scene.input?.keyboard?.resetKeys();
      this.ui.text('game-over-result', `${state.gameOver.phase === 'night' ? 'Ночь' : 'День'} ${state.gameOver.day} · Побеждено врагов: ${state.gameOver.kills}`);
    }
    this.ui.prop(end, 'hidden', !state.gameOver);
    this.ui.$('survival-panel').classList.toggle('under-attack', active);
    this.ui.$('survival-panel').classList.toggle('night', s.phase === 'night');
    this.ui.html('survival-phase', `${this.icon(s.phase === 'night' ? 'compass' : 'sun')} ${s.phase === 'night' ? 'НОЧЬ' : 'ДЕНЬ'} ${s.day}`);
    this.ui.text('survival-timer', formatTime(s.remaining));
    this.ui.style('cycle-fill', 'width', `${s.progress * 100}%`);
    this.ui.text('wave-summary', active ? `Волна ${s.wave.night} · Врагов: ${s.wave.alive} · Подходят: ${s.wave.total - s.wave.spawned}` : s.wave?.status === 'failed' && s.phase === 'night' ? 'Деревня пала. Староста поможет с ремонтом.' : s.phase === 'night' ? 'Нападение отбито. Доживите до рассвета.' : s.warning ? 'Скоро нападение. Возвращайтесь в деревню.' : `В ночь ${s.day}: ${waveSize(s.day)} монстров${bossNight(s.day) ? ' + босс' : ''}`);
    this.ui.text('village-hp-label', `${Math.ceil(village.hp)} / ${village.maxHp}`);
    this.ui.style('village-hp-fill', 'width', `${village.hp / village.maxHp * 100}%`);
    this.ui.$('village-hp-fill').classList.toggle('low', village.hp / village.maxHp < .3);
    this.ui.text('survival-next', s.phase === 'night' ? 'До рассвета · Жители скрылись, держитесь вместе' : 'До наступления ночи · День 5 мин / ночь 2 мин');
    this.ui.html(document.querySelector('.minimap-footer>span:first-child'), `${this.icon(s.phase === 'night' ? 'compass' : 'sun')} ${s.phase === 'night' ? `Ночь ${s.nightNumber}` : `День ${s.day}`} · ${formatTime(s.remaining)}`);
    if (!sheltered(state, me) && this.ui.$('location-title').textContent === 'Тихая сосна') {
      this.ui.text('biome-tag', active ? 'ДЕРЕВНЯ ПОД АТАКОЙ' : s.phase === 'night' ? 'НОЧНАЯ ОХОТА' : 'ЗАЩИТА НУЖДАЕТСЯ В РЕМОНТЕ');
      this.ui.$('biome-tag').classList.add('danger');
    }
    const bosses = state.monsters.filter(m => m.kind === 'guardian');
    const boss = bosses[0]; this.ui.prop('boss-hud', 'hidden', !boss);
    if (boss) {
      this.ui.$('boss-hud').querySelector('.boss-hud-label>span').textContent = (boss.name || 'Древний лесной страж').toUpperCase();
      this.ui.text('boss-phase-label', `ФАЗА ${boss.bossPhase || 1} / 3`);
      this.ui.style('boss-hp-fill', 'width', `${boss.hp / boss.maxHp * 100}%`);
      this.ui.text('boss-hp-value', `${boss.hp} / ${boss.maxHp}`);
    }
  }
  effects(events) {
    for (const e of events) {
      if (['night-warning', 'night-start', 'dawn', 'wave-defended', 'wave-failed', 'boss-awakened', 'boss-defeated', 'boss-phase'].includes(e.type) && !this.ui.notices.take(`banner:${e.type}`)) continue;
      if (e.type === 'respawn') this.ui.toast(e.id === this.ui.net.playerId ? 'Вы воскресли у алтаря. Напарник вернул ваше надгробие.' : `${e.name || 'Напарник'} воскрес у алтаря.`);
      let title, message;
      if (e.type === 'night-warning') { title = 'СУМЕРКИ СГУЩАЮТСЯ'; message = `До ночи ${e.seconds || 30} с. Подготовьте снаряжение и зелья.`; }
      if (e.type === 'night-start') { title = `НАСТУПИЛА НОЧЬ ${e.night}`; message = e.boss ? 'Босс и усиленная орда охотятся за вами. Держитесь вместе.' : 'Монстры охотятся за героями по всей карте. Жители скрылись.'; }
      if (e.type === 'dawn') { title = `РАССВЕТ · ДЕНЬ ${e.day}`; message = 'Ночные враги отступают. Время восстановить силы.'; }
      if (e.type === 'wave-defended') { title = 'ДЕРЕВНЯ ВЫСТОЯЛА'; message = `Ночь ${e.night} пережита. Герои получили опыт и золото.`; }
      if (e.type === 'wave-failed') { title = 'ЗАЩИТА ДЕРЕВНИ ПАЛА'; message = 'Прогресс героев сохранён. Обратитесь к старосте за ремонтом.'; }
      if (e.type === 'boss-awakened') { title = (e.name || 'Босс пробуждён').toUpperCase(); message = 'Красные области предупреждают об ударах. Используйте рывок.'; }
      if (e.type === 'boss-defeated') { title = `${e.name || 'Босс'} повержен`.toUpperCase(); message = 'Эпическая награда ждёт каждого участника боя. Подберите её через F.'; }
      if (e.type === 'boss-phase') this.ui.toast(`Лесной страж: фаза ${e.phase}. ${e.phase === 3 ? 'Атаки ускорились!' : 'Следите за предупреждающими кругами.'}`);
      if (!title) continue;
      this.ui.prop('discovery', 'hidden', true);
      const banner = this.ui.$('survival-banner');
      banner.innerHTML = `<div>${title}</div><p>${message}</p>`; banner.hidden = false;
      clearTimeout(this.bannerTimer); this.bannerTimer = setTimeout(() => { banner.hidden = true; }, 6000);
    }
  }
  open() {
    this.ui.panel = 'survival'; this.ui.scene.pausedInput = true; this.ui.scene.input?.keyboard?.resetKeys();
    this.ui.prop('modal-backdrop', 'hidden', false); this.ui.$('modal').classList.remove('wide');
    this.ui.html('modal', `<div class="modal-heading"><div><div class="eyebrow">VILLAGE SURVIVAL · ВЫЖИВАНИЕ</div><h2 id="modal-title">Дожить до рассвета</h2></div><button id="close-modal" class="icon-button" aria-label="Закрыть окно">${this.icon('close')}</button></div><div class="survival-guide"><p>День длится <b>5 минут</b>, ночь — <b>2 минуты</b>. За 30 секунд до темноты придёт предупреждение. Кнопка «Пропустить день» сразу начинает ночь; вдвоём нужно согласие обоих подключённых героев.</p><p>Новый герой получает <b>топорик и 0 золота</b>. Дерево добывается через F, а оружие и щит создаются на лесопилке. Кирку можно купить у Миры за 10 монет. Погибший герой оставляет надгробие. Напарник забирает его клавишей <b>F</b> и несёт к <b>Алтарю</b> в северо-западной части деревни. Возле алтаря герой воскресает автоматически. Если живой напарник не в сети, мир ждёт его возвращения. Когда погибнут все герои, игра закончится.</p><p>Днём лес свободен от монстров. Ночью жители скрываются, а монстры охотятся за героями по всей карте, включая деревню. Ночью деревня не лечит.</p><p>Каждую ночь приходит <b>ровно 50 обычных монстров</b>, группами по 5. Босс появляется только в ночи <b>3, 6, 9, 12…</b> и не призывает помощников. Здоровье, урон и скорость врагов снижены ещё на 5% относительно версии 0.4.2. Через монстров можно проходить; удары босса больше не отталкивают героя. Каждая следующая ночь добавляет 20% базового здоровья и 15% базового урона.</p><p>На лесопилке дерево обменивается на меч, щит, лук, палочку и ящики для забора. B — строительство, F возле забора — улучшение до 10 уровня за дерево, руду и золото. В северо-западной шахте добывается руда для стального оружия и закалки в кузнице.</p><p>Навыки ${['q', 'e', 'r'].map(k => this.ui.preferences.label(k)).join('/')} и профессии ${this.ui.preferences.label('t')} улучшаются до 100 ранга прямо над панелью боя. Один ранг даёт примерно +1% эффекта. С 10 уровня выберите профессию через P. Восстановление энергии: 2,4/с в спокойной деревне и 1/с вне её. Подсказки и информационные баннеры показываются один раз за приключение.</p><p><b>Обелиск на восточной поляне</b> позволяет призвать отдельного босса один раз за игровой день для всего отряда. Это единственное исключение для дневных монстров. Новый призыв открывается после рассвета.</p><p>Кузнец днём улучшает оружие, броню, сапоги, щит, шлем и кольцо до <b>+10</b>. Надевайте и снимайте вещи в рюкзаке — I. Новое снаряжение продаётся в деревне и выпадает из врагов.</p><p>Пустой мир приостанавливается. Прогресс героев, время, волна и использованный призыв сохраняются между сессиями.</p></div>`);
    this.ui.$('close-modal').onclick = () => this.ui.closePanel(); this.ui.$('close-modal').focus();
  }
  markMap(c, sx, sy, full, state) {
    c.fillStyle = !state.survival?.summonAvailable ? '#849773' : '#cbbf8c';
    c.save(); c.translate(SURVIVAL.shrine.x * sx, SURVIVAL.shrine.y * sy); c.rotate(Math.PI / 4); c.fillRect(full ? -4 : -2, full ? -4 : -2, full ? 8 : 4, full ? 8 : 4); c.restore();
    for (const m of state.monsters.filter(m => m.kind === 'guardian')) { c.strokeStyle = '#e7b885'; c.lineWidth = 2; c.beginPath(); c.arc(m.x * sx, m.y * sy, full ? 9 : 5, 0, Math.PI * 2); c.stroke(); }
    if (assaultActive(state.survival)) { c.strokeStyle = '#e0a87b'; c.lineWidth = full ? 2 : 1; c.beginPath(); c.arc(SURVIVAL.core.x * sx, SURVIVAL.core.y * sy, full ? 15 : 7, 0, Math.PI * 2); c.stroke(); }
    if (full) { c.font = '11px Georgia'; c.textAlign = 'center'; c.fillStyle = '#d5cea6'; c.fillText('ОБЕЛИСК ПРИЗЫВА', SURVIVAL.shrine.x * sx, SURVIVAL.shrine.y * sy - 16); }
  }
}

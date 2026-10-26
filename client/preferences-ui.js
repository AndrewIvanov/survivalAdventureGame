export class PreferencesInterface {
  constructor(ui, { icon }) {
    this.ui = ui; this.icon = icon; this.listening = null;
    const actions = document.createElement('div'); actions.className = 'menu-actions';
    const button = document.createElement('button'); button.id = 'menu-preferences'; button.className = 'secondary-button'; button.innerHTML = `${icon('settings')} Настройки`;
    actions.append(document.querySelector('.version'), button); document.querySelector('.menu-header').append(actions); button.onclick = () => this.open();
    const toggle = document.createElement('button'); toggle.id = 'hud-toggle'; toggle.className = 'icon-button'; toggle.innerHTML = icon('eye'); toggle.onclick = () => ui.preferences.set('compactHud', !ui.preferences.compactHud);
    ui.$('settings-button').before(toggle);
    ui.preferences.listeners.add(() => this.apply()); this.apply();
    for (const event of ['entered', 'left', 'replaced']) ui.net.on(event, () => this.apply());
    document.addEventListener('keydown', event => {
      if (!this.listening || ui.panel !== 'preferences') return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') { this.listening = null; this.render(); return; }
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) { ui.$('binding-status').textContent = 'Нажмите одну клавишу без Ctrl, Alt, Cmd и Shift.'; return; }
      try { ui.preferences.bind(this.listening, event.code); this.listening = null; this.render(); }
      catch (error) { ui.$('binding-status').textContent = error.message; }
    }, true);
  }
  optionsHtml() {
    const p = this.ui.preferences;
    return `<div class="settings-row"><label for="notifications-toggle">Показывать уведомления<small>Подсказки, баннеры, значки над жителями и всплывающие числа</small></label><input id="notifications-toggle" type="checkbox" ${p.notifications ? 'checked' : ''}></div><div class="settings-row"><label for="compact-hud-toggle">Компактный интерфейс<small>Скрыть боковые панели. Чат открывается через Enter, карта — M.</small></label><input id="compact-hud-toggle" type="checkbox" ${p.compactHud ? 'checked' : ''}></div>`;
  }
  bindOptions() {
    for (const [id, name] of [['notifications-toggle', 'notifications'], ['compact-hud-toggle', 'compactHud']]) this.ui.$(id).onchange = event => this.ui.preferences.set(name, event.target.checked);
  }
  apply() {
    const ui = this.ui, p = ui.preferences;
    document.documentElement.classList.toggle('notifications-muted', !p.notifications && !!ui.net.active); ui.$('hud').classList.toggle('compact-hud', p.compactHud);
    ui.scene.showNotifications = p.notifications;
    ui.$('hud-toggle').title = p.compactHud ? 'Показать боковые панели' : 'Скрыть боковые панели'; ui.$('hud-toggle').setAttribute('aria-label', ui.$('hud-toggle').title); ui.$('hud-toggle').setAttribute('aria-pressed', String(p.compactHud));
    if (!p.notifications) { ui.$('toast-stack').replaceChildren(); ui.$('discovery').hidden = true; if (ui.$('survival-banner')) ui.$('survival-banner').hidden = true; }
    if (p.compactHud && ui.$('chat-panel').contains(document.activeElement)) ui.chat.setOpen(false);
    for (const key of ['q', 'e', 'r', 't']) {
      const label = p.label(key), slot = ui.$(`ability-${key}`), plus = ui.$(`quick-upgrade-${key}`);
      if (slot) { slot.querySelector('.action-key').textContent = label; slot.setAttribute('aria-label', `Способность ${label}`); }
      if (plus) { plus.querySelector('b').textContent = label; plus.setAttribute('aria-label', `Улучшить навык ${label}`); }
    }
  }
  open() {
    const ui = this.ui; this.listening = null; ui.modalReturnFocus = document.activeElement; ui.panel = 'preferences'; ui.scene.pausedInput = true; ui.scene.buildMode = false; ui.scene.input?.keyboard?.resetKeys(); ui.$('modal-backdrop').hidden = false; this.render(); ui.$('close-modal').focus();
  }
  render() {
    const ui = this.ui; ui.$('modal').classList.remove('wide');
    ui.$('modal').innerHTML = `<div class="modal-heading"><div><div class="eyebrow">VILLAGE SURVIVAL</div><h2 id="modal-title">Управление и экран</h2></div><button id="close-modal" class="icon-button" aria-label="Закрыть окно">${this.icon('close')}</button></div><p class="muted">Нажмите на клавишу и задайте новую. Если она уже назначена другому умению, клавиши поменяются местами.</p><div class="binding-list">${['q', 'e', 'r', 't'].map((key, i) => `<div><span>${key === 't' ? 'Умение профессии' : `Умение ${i + 1}`}<small>${key === 't' ? 'Открывается после выбора профессии' : `Слот ${key.toUpperCase()}`}</small></span><button data-bind="${key}" class="secondary-button ${this.listening === key ? 'listening' : ''}" aria-label="Клавиша умения ${key.toUpperCase()}: ${ui.preferences.label(key)}. Изменить">${this.listening === key ? 'Нажмите клавишу…' : ui.preferences.label(key)}</button></div>`).join('')}</div><p id="binding-status" class="binding-status" role="status">Буквы и цифры · Esc отменяет ввод. Клавиши движения и меню сохраняются. Работает и с русской раскладкой.</p><button id="reset-bindings" class="text-button">Вернуть Q / E / R / T</button>${this.optionsHtml()}<p class="panel-footnote">Настройки сохраняются в этом браузере для всех героев.</p>`;
    ui.$('close-modal').onclick = () => { this.listening = null; ui.closePanel(); };
    for (const b of ui.$('modal').querySelectorAll('[data-bind]')) b.onclick = () => { this.listening = b.dataset.bind; this.render(); };
    ui.$('reset-bindings').onclick = () => { this.listening = null; ui.preferences.resetBindings(); this.render(); }; this.bindOptions();
  }
}

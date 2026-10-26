import { ITEMS, ABILITIES } from '../shared/rpg.js';
import { PROFESSIONS, PROFESSION_LEVEL, MAX_SKILL_RANK, skillRank, professionOf } from '../shared/professions.js';
import { materialCount, fenceUpgradeCost, costText, canAfford, FENCES } from '../shared/crafting.js';
import { skillDetails, skillSummary } from './skill-details.js';
import { skillComparison } from '../shared/skill-stats.js';

export class ProgressionInterface {
  constructor(ui, { icon, escape }) {
    this.ui = ui; this.icon = icon; this.escape = escape; this.signature = '';
    const panel = document.createElement('section'); panel.className = 'gather-hud panel';
    panel.innerHTML = `<div class="gather-counts"><span title="Древесина">${icon('tree')} <b id="wood-count">0</b></span><span title="Руда">${icon('pickaxe')} <b id="ore-count">0</b></span><span title="Ящики для забора">${icon('box')} <b id="fence-count">0</b></span><button id="build-toggle" title="Режим строительства · B">Строить <kbd>B</kbd></button></div><p id="gather-goal"></p><button id="profession-open" class="profession-open">Профессия · с 10 уровня</button>`;
    ui.$('hud').append(panel);
    ui.$('build-toggle').onclick = () => this.toggleBuild(); ui.$('profession-open').onclick = () => this.open('profession');
    const upgrades = document.createElement('div'); upgrades.className = 'quick-skills';
    upgrades.innerHTML = `<span id="quick-skill-points"></span>${['q', 'e', 'r', 't'].map(key => `<button id="quick-upgrade-${key}" aria-label="Улучшить навык ${key.toUpperCase()}" title="+1 ранг · Shift + клик: до +10"><b>${key.toUpperCase()}</b> <span>1</span> <strong>+</strong></button>`).join('')}`;
    document.querySelector('.action-area').prepend(upgrades);
    const preview = document.createElement('div'); preview.id = 'skill-upgrade-preview'; preview.className = 'skill-upgrade-preview panel'; preview.hidden = true; preview.setAttribute('role', 'tooltip'); upgrades.append(preview);
    for (const key of ['q', 'e', 'r', 't']) {
      const button = ui.$(`quick-upgrade-${key}`); button.onclick = event => this.upgrade(key, event.shiftKey); button.setAttribute('aria-describedby', preview.id);
      button.onpointerenter = button.onfocus = () => { this.previewKey = key; this.renderPreview(this.me()); };
      button.onpointerleave = button.onblur = () => { this.previewKey = null; preview.hidden = true; };
    }
    const skill = document.createElement('button'); skill.id = 'ability-t'; skill.className = 'action-slot ability-slot'; skill.setAttribute('aria-label', 'Способность профессии T');
    skill.innerHTML = `<span class="action-key">T</span><span class="ability-icon">${icon('flag')}</span><small>Профессия</small><span class="cooldown" hidden></span>`;
    skill.onclick = () => ui.scene.cast('t'); ui.$('dash-button').before(skill);
    const hint = document.createElement('div'); hint.id = 'build-hint'; hint.className = 'build-hint panel'; hint.hidden = true;
    hint.textContent = 'Забор: ЛКМ — поставить · B / Esc — выйти · F у секции — улучшить'; ui.$('hud').append(hint);
    document.querySelector('.action-hint').hidden = true;
    document.addEventListener('keydown', event => {
      if (!ui.net.active || ui.panel || ui.state?.gameOver || event.repeat || /INPUT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.code === 'KeyB') { event.preventDefault(); this.toggleBuild(); }
      if (event.code === 'KeyP') { event.preventDefault(); this.open('profession'); }
    });
    ui.net.on('left', () => { ui.scene.buildMode = false; });
  }
  me() { return this.ui.state?.players.find(p => p.id === this.ui.net.playerId); }
  toggleBuild() {
    if (this.me()?.hp <= 0) return;
    if (!this.ui.scene.buildMode && materialCount(this.me(), 'fenceKit') <= 0) return this.ui.toast('Сделайте ящики для забора на лесопилке: 5 дерева за секцию.');
    this.ui.scene.buildMode = !this.ui.scene.buildMode;
    this.ui.scene.input?.keyboard?.resetKeys();
    this.render(this.ui.state, this.me());
  }
  async upgrade(key, bulk = false) {
    const me = this.me(); if (!me || this.upgrading) return;
    const count = Math.min(bulk ? 10 : 1, me.skillPoints, MAX_SKILL_RANK - skillRank(me, key));
    if (count <= 0 || (key === 't' && !me.profession)) return;
    this.upgrading = true;
    try { await this.ui.rpg.perform({ type: 'skill', key, count }); }
    finally { this.upgrading = false; this.render(this.ui.state, this.me()); }
  }
  render(state, me) {
    if (!state || !me) return;
    for (const [id, item] of [['wood', 'wood'], ['ore', 'ore'], ['fence', 'fenceKit']]) this.ui.text(`${id}-count`, materialCount(me, item));
    this.ui.text('gather-goal', me.inventory.find(i => i.id === me.equipment.weapon)?.baseId === 'axe' ? 'F у дерева → 12 древесины → оружие на лесопилке' : !me.inventory.some(i => i.baseId === 'pickaxe') ? 'Мира: 100 дерева → 1 золото · Кирка: 10 монет' : 'Шахта на северо-западе → руда → кузница · M — карта');
    const profession = professionOf(me), button = this.ui.$('profession-open');
    this.ui.text(button, profession ? `${profession.name} · ${this.ui.preferences.label('t')}: ${profession.skill}` : me.level >= PROFESSION_LEVEL ? 'Выбрать профессию · P' : `Профессия откроется на 10 уровне · сейчас ${me.level}`);
    button.classList.toggle('available', !profession && me.level >= PROFESSION_LEVEL);
    const t = this.ui.$('ability-t'); this.ui.prop(t, 'disabled', !profession || me.hp <= 0);
    this.ui.text(t.querySelector('small'), profession?.short || 'С 10 ур.');
    this.ui.html(t.querySelector('.ability-icon'), this.icon(profession?.icon || 'flag'));
    const left = Math.max(0, (me.cooldowns.t || 0) - state.elapsed);
    this.ui.prop(t.querySelector('.cooldown'), 'hidden', left <= 0); if (left > 0) this.ui.text(t.querySelector('.cooldown'), (left / 1000).toFixed(1));
    this.ui.prop(t, 'title', profession ? `${profession.skill} · ${me.professionRank}/100 · ${profession.cost} энергии · ${profession.cooldown / 1000} с\n${profession.description}` : 'Выберите профессию на 10 уровне');
    const skillSignature = [me.classId, me.profession, me.professionRank, me.abilityRanks.q, me.abilityRanks.e, me.abilityRanks.r, me.stats.damage, me.stats.maxHp].join(':');
    const skillsChanged = skillSignature !== this.skillSignature; this.skillSignature = skillSignature;
    this.ui.text('quick-skill-points', `Навыки: ${me.skillPoints}`);
    for (const key of ['q', 'e', 'r', 't']) {
      const plus = this.ui.$(`quick-upgrade-${key}`), rank = skillRank(me, key);
      this.ui.text(plus.querySelector('span'), `${rank}/100`);
      if (skillsChanged) plus.title = `${skillSummary(me, key)}\n+1 ранг · Shift + клик: до +10`;
      this.ui.prop(plus, 'hidden', key === 't' && !profession);
      this.ui.prop(plus, 'disabled', !!this.upgrading || me.hp <= 0 || me.skillPoints <= 0 || rank >= MAX_SKILL_RANK);
    }
    if (!materialCount(me, 'fenceKit') || state.gameOver || me.hp <= 0) this.ui.scene.buildMode = false;
    this.ui.prop('build-hint', 'hidden', !this.ui.scene.buildMode);
    this.ui.$('build-toggle').classList.toggle('active', !!this.ui.scene.buildMode);
    this.renderPreview(me);
    if (this.handles(this.ui.panel)) this.refresh(me);
  }
  handles(type) { return ['profession', 'fence'].includes(type); }
  renderPreview(me) {
    const box = this.ui.$('skill-upgrade-preview'), key = this.previewKey;
    if (!me || !key || this.ui.panel || this.ui.state?.gameOver) { this.ui.prop(box, 'hidden', true); return; }
    const signature = `${key}:${this.skillSignature}`;
    if (this.previewSignature === signature && !box.hidden) return;
    this.previewSignature = signature;
    const detail = skillComparison(me, key); if (!detail) { this.ui.prop(box, 'hidden', true); return; }
    const html = `<strong>${detail.name}</strong><small>Ранг ${detail.rank}/100${detail.rank < 100 ? ` → ${detail.nextRank}/100` : ' · Максимум'}</small>${skillDetails(me, key)}<p>${detail.notes.join(' ')}</p>`;
    this.ui.html(box, html); this.ui.prop(box, 'hidden', false);
  }
  open(type) {
    this.ui.modalReturnFocus = document.activeElement; this.ui.panel = type; this.ui.scene.pausedInput = true; this.ui.scene.buildMode = false;
    this.ui.scene.input?.keyboard?.resetKeys(); this.ui.prop('modal-backdrop', 'hidden', false);
    this.ui.$('modal').classList.toggle('wide', type === 'profession'); this.signature = ''; this.refresh(this.me()); this.ui.$('close-modal')?.focus();
  }
  refresh(me) {
    if (!me) return;
    const fence = this.ui.state.structures?.find(s => s.id === this.selectedFence), type = this.ui.panel;
    const signature = JSON.stringify([type, me.profession, me.professionRank, me.level, me.gold, me.inventory, fence]);
    if (signature === this.signature) return; this.signature = signature;
    const button = this.ui.rpg.button.bind(this.ui.rpg);
    let body;
    if (type === 'profession') {
      body = `<p class="muted">Выбор один раз с ${PROFESSION_LEVEL}-го уровня. Дополнительная способность — ${this.ui.preferences.label('t')}. Ранги ${['q', 'e', 'r', 't'].map(k => this.ui.preferences.label(k)).join(' / ')} улучшаются прямо над панелью боя.</p><div class="profession-cards">${Object.entries(PROFESSIONS).filter(([, p]) => p.classId === me.classId).map(([id, p]) => `<article class="${me.profession === id ? 'selected' : ''}"><div class="profession-emblem">${this.icon(p.icon)}</div><h3>${p.name}</h3><strong>${p.skill} · ${this.ui.preferences.label('t')}</strong><p>${p.description.replace(/\b([QT])\b/g, k => this.ui.preferences.label(k.toLowerCase()))}</p>${skillDetails({ ...me, profession: id, professionRank: me.profession === id ? me.professionRank : 1 }, 't', true)}<small>${p.cost} энергии · ${p.cooldown / 1000} с</small>${button(me.profession === id ? 'Ваша профессия' : 'Выбрать', { type: 'profession', professionId: id }, 'primary-button', !!me.profession || me.level < PROFESSION_LEVEL)}</article>`).join('')}</div><p class="panel-footnote">Стрелка показывает следующий ранг. Урон указан без критов и округляется в бою: небольшой прирост может накопиться за несколько рангов.</p>`;
    } else if (!fence) body = '<p class="muted">Эта секция уже разрушена.</p>';
    else {
      const cost = fenceUpgradeCost(fence.level + 1), repair = { wood: Math.max(1, Math.ceil((fence.maxHp - fence.hp) / 50)), ore: 1, gold: fence.level * 2 };
      body = `<div class="fence-detail">${this.icon('box')}<h3>Забор · уровень ${fence.level} / ${FENCES.maxLevel}</h3><p>${Math.ceil(fence.hp)} / ${fence.maxHp} прочности</p>${button(fence.level >= 10 ? 'Максимальный уровень 10' : `Улучшить · ${costText(cost)}`, { type: 'build:upgrade', structureId: fence.id }, 'primary-button', fence.level >= 10 || !canAfford(me, cost))}${button(`Починить · ${costText(repair)}`, { type: 'build:repair', structureId: fence.id }, 'secondary-button', fence.hp >= fence.maxHp || !canAfford(me, repair))}${button('Разобрать секцию', { type: 'build:remove', structureId: fence.id }, 'text-button')}<p class="panel-footnote">Монстры ломают заборы, которые мешают им добраться до героев. При разборке материалы не возвращаются.</p></div>`;
    }
    this.ui.html('modal', `<div class="modal-heading"><div><div class="eyebrow">VILLAGE SURVIVAL</div><h2 id="modal-title">${type === 'profession' ? 'Выберите свой путь' : 'Укрепление забора'}</h2></div><button id="close-modal" class="icon-button" aria-label="Закрыть окно">${this.icon('close')}</button></div>${body}`);
    this.ui.$('close-modal').onclick = () => this.ui.closePanel();
    this.ui.$('modal').querySelectorAll('[data-action]').forEach(b => b.onclick = async () => {
      b.disabled = true; const action = JSON.parse(b.dataset.action);
      if (await this.ui.rpg.perform(action)) {
        if (action.type === 'profession') { this.ui.closePanel(); this.ui.toast(`Ваша профессия: ${PROFESSIONS[action.professionId].name}. Новая способность — ${this.ui.preferences.label('t')}.`); }
        if (action.type === 'build:remove') this.ui.closePanel();
      }
      if (b.isConnected) b.disabled = false;
    });
  }
}

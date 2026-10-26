import { CLASSES, ABILITIES, ATTRIBUTES, ITEMS, RARITIES, QUESTS, NPCS, INVENTORY_SIZE, itemStats, effectiveStats } from '../shared/rpg.js';
import { distance, levelXp, inVillage } from '../shared/config.js';

export class RpgInterface {
  constructor(ui, { icon, escape }) {
    this.ui = ui; this.net = ui.net; this.icon = icon; this.escape = escape; this.classId = 'warrior';
    this.selectedItem = null; this.signature = ''; this.prompted = new Set(); this.npcId = null;
    this.portraitCache = new Map();
    this.mount(); this.bind();
  }
  mount() {
    const { icon } = this;
    const picker = document.createElement('div'); picker.className = 'class-picker';
    picker.innerHTML = `<div class="field-label">ПРИЗВАНИЕ ГЕРОЯ</div><div class="class-options">${Object.entries(CLASSES).map(([id, cls]) => `<button type="button" data-class="${id}" class="${id === this.classId ? 'active' : ''}" aria-pressed="${id === this.classId}">${icon(id === 'warrior' ? 'shield' : id === 'mage' ? 'bolt' : 'arrow')}<span>${cls.name}</span></button>`).join('')}</div><p id="class-description">${CLASSES.warrior.description}</p>`;
    this.ui.$('appearance-field').before(picker);
    this.ui.$('hero-portrait').insertAdjacentHTML('afterend', '');
    this.ui.$('xp-fill').parentElement.insertAdjacentHTML('beforebegin', '<div class="mana-track"><div id="mana-fill"></div><span id="mana-label">100 / 100</span></div>');
    const bar = document.querySelector('.action-bar');
    this.ui.$('dash-button').before(...['q', 'e', 'r'].map(key => {
      const button = document.createElement('button'); button.id = `ability-${key}`; button.className = 'action-slot ability-slot';
      button.setAttribute('aria-label', `Способность ${key.toUpperCase()}`);
      button.innerHTML = `<span class="action-key">${key.toUpperCase()}</span><span class="ability-icon"></span><small></small><span class="cooldown" hidden></span>`;
      button.onclick = () => this.ui.scene.cast(key); return button;
    }));
    this.ui.$('character-button').setAttribute('aria-label', 'Инвентарь — I'); this.ui.$('character-button').querySelector('small').textContent = 'Рюкзак';
    const notes = document.createElement('div'); notes.id = 'quest-tracker'; notes.className = 'quest-tracker';
    document.querySelector('.field-notes').append(notes);
    const hint = document.createElement('button'); hint.id = 'interact-prompt'; hint.className = 'interact-prompt panel'; hint.hidden = true;
    hint.onclick = () => this.interact(); this.ui.$('hud').append(hint);
    const tools = document.createElement('div'); tools.className = 'rpg-tools';
    tools.innerHTML = `<button id="rpg-character" class="icon-button" title="Персонаж · C" aria-label="Персонаж — C">${icon('shield')}</button><button id="rpg-journal" class="icon-button" title="Задания · J" aria-label="Задания — J">${icon('flag')}</button><button id="quick-potion" class="icon-button" title="Зелье здоровья · 1" aria-label="Использовать зелье здоровья">${icon('heart')}<span id="potion-count"></span></button>`;
    document.querySelector('.utility-buttons').before(tools);
    this.ui.$('rpg-character').onclick = () => this.open('character');
    this.ui.$('rpg-journal').onclick = () => this.open('journal');
    this.ui.$('quick-potion').onclick = () => this.usePotion();
    document.querySelector('.version').innerHTML = 'RPG · ВТОРОЙ ЭТАП <span>v0.2</span>';
    document.querySelector('.connection-info b').textContent = 'v0.2';
  }
  bind() {
    document.querySelectorAll('[data-class]').forEach(button => button.onclick = () => {
      this.classId = button.dataset.class;
      document.querySelectorAll('[data-class]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
      this.ui.$('class-description').textContent = CLASSES[this.classId].description;
    });
    document.addEventListener('keydown', event => {
      if (/INPUT|TEXTAREA/.test(event.target.tagName) || !this.net.active || event.repeat) return;
      const code = event.code;
      if (['KeyQ', 'KeyE', 'KeyR'].includes(code) && !this.ui.panel) { event.preventDefault(); this.ui.scene.cast(code.slice(-1).toLowerCase()); }
      if (code === 'KeyF' && !this.ui.panel) { event.preventDefault(); this.interact(); }
      if (code === 'KeyC') { event.preventDefault(); this.ui.panel === 'character' ? this.ui.closePanel() : this.open('character'); }
      if (code === 'KeyJ') { event.preventDefault(); this.ui.panel === 'journal' ? this.ui.closePanel() : this.open('journal'); }
      if (code === 'Digit1' && !this.ui.panel) this.usePotion();
    });
    this.net.on('effects', events => {
      for (const e of events) if (e.id === this.net.playerId && ['quest-ready', 'quest-complete'].includes(e.type)) this.ui.toast(`${e.type === 'quest-ready' ? 'Вернитесь за наградой' : 'Задание выполнено'}: ${e.name}`);
    });
  }
  me() { return this.ui.state?.players.find(p => p.id === this.net.playerId); }
  portrait(me) {
    const key = `class-${me.classId}-${me.appearance}-0`;
    if (!this.ui.scene.textures?.exists(key)) return '';
    if (!this.portraitCache.has(key)) this.portraitCache.set(key, `url("${this.ui.scene.textures.get(key).getSourceImage().toDataURL()}")`);
    return this.portraitCache.get(key);
  }
  handles(type) { return ['hero', 'inventory', 'character', 'journal', 'npc', 'class'].includes(type); }
  async perform(action) {
    try { await this.net.action(action); }
    catch (error) { this.ui.toast(error.message, 'error'); }
  }
  usePotion() {
    const item = this.me()?.inventory.find(i => i.baseId === 'health');
    if (item) this.perform({ type: 'use', itemId: item.id }); else this.ui.toast('Зелий здоровья нет. Загляните к торговке Мире.');
  }
  nearest(me) {
    if (!me || me.hp <= 0) return null;
    const choices = [
      ...NPCS.map(n => ({ ...n, kind: 'npc', label: n.name, range: 100 })),
      ...(this.ui.state.loot || []).map(l => ({ ...l, kind: 'loot', label: ITEMS[l.item.baseId].name, range: 80 })),
      ...(this.ui.state.chests || []).filter(c => !c.claimedBy.includes(me.id)).map(c => ({ ...c, kind: 'chest', label: c.supply ? 'Ящик припасов' : 'Лесной тайник', range: 80 })),
    ];
    return choices.filter(o => distance(o, me) < o.range).sort((a, b) => distance(a, me) - distance(b, me))[0];
  }
  interact() {
    const object = this.nearest(this.me());
    if (!object) return this.ui.toast('Подойдите к жителю, добыче или сундуку и нажмите F.');
    if (object.kind === 'npc') { this.npcId = object.id; this.open('npc'); }
    if (object.kind === 'loot') this.perform({ type: 'pickup', lootId: object.id });
    if (object.kind === 'chest') this.perform({ type: 'chest', chestId: object.id });
  }
  render(state, me) {
    if (!me.inventory) return;
    this.ui.$('hero-portrait').querySelector('.portrait-art').style.backgroundImage = this.portrait(me);
    this.ui.$('mana-fill').style.width = `${me.mana / me.maxMana * 100}%`;
    this.ui.$('mana-label').textContent = `${Math.floor(me.mana)} / ${me.maxMana}`;
    document.querySelector('.hero-title>span').textContent = CLASSES[me.classId]?.name || 'Искатель';
    for (const key of ['q', 'e', 'r']) {
      const ability = ABILITIES[me.classId][key], button = this.ui.$(`ability-${key}`);
      if (button.dataset.classId !== me.classId) {
        button.dataset.classId = me.classId;
        button.querySelector('.ability-icon').innerHTML = this.icon(ability.icon);
        button.querySelector('small').textContent = ability.short;
      }
      button.title = `${key.toUpperCase()} · ${ability.name} · ${ability.cost} энергии · ${ability.cooldown / 1000} с\n${ability.description}`;
      const left = Math.max(0, (me.cooldowns[key] || 0) - state.elapsed);
      button.querySelector('.cooldown').hidden = left <= 0;
      button.querySelector('.cooldown').textContent = (left / 1000).toFixed(1);
      button.classList.toggle('no-mana', me.mana < ability.cost);
    }
    const nearby = this.nearest(me), hint = this.ui.$('interact-prompt');
    hint.hidden = !nearby || !!this.ui.panel;
    hint.innerHTML = nearby ? `<kbd>F</kbd><span>${this.escape(nearby.label)}</span>${this.icon(nearby.kind === 'npc' ? 'people' : 'arrow')}` : '';
    this.ui.$('potion-count').textContent = me.inventory.filter(i => i.baseId === 'health').reduce((n, i) => n + i.quantity, 0);
    const active = Object.entries(me.quests).filter(([, q]) => q.status === 'active');
    this.ui.$('quest-tracker').innerHTML = `<button id="tracker-open">${this.icon('flag')} ЗАДАНИЯ <span>J</span></button>${active.length ? active.slice(0, 3).map(([id, q]) => `<div class="tracked-quest ${q.progress >= QUESTS[id].target ? 'ready' : ''}"><strong>${QUESTS[id].name}</strong><span>${q.progress} / ${QUESTS[id].target}${q.progress >= QUESTS[id].target ? ' · За наградой' : ''}</span></div>`).join('') : '<p>Поговорите со старостой<br>или охотницей у восточной тропы.</p>'}`;
    this.ui.$('tracker-open').onclick = () => this.open('journal');
    if (this.ui.panel === 'class' && me.classChosen) { this.ui.closePanel(); this.ui.toast(`Ваше призвание: ${CLASSES[me.classId].name}. Способности доступны на Q, E и R.`); }
    if (this.handles(this.ui.panel)) this.refreshPanel(me);
    if (!me.classChosen && me.hp > 0 && inVillage(me) && !this.ui.panel && !this.prompted.has(state.id)) {
      this.prompted.add(state.id); this.open('class');
    }
  }
  open(type) {
    if (type === 'hero') type = 'inventory';
    this.ui.modalReturnFocus = document.activeElement; this.ui.panel = type;
    this.ui.scene.pausedInput = true; this.ui.scene.input?.keyboard?.resetKeys();
    this.ui.$('modal-backdrop').hidden = false;
    this.ui.$('modal').classList.toggle('wide', ['inventory', 'character', 'class'].includes(type));
    this.signature = ''; this.refreshPanel(this.me());
    this.ui.$('close-modal')?.focus();
  }
  refreshPanel(me) {
    if (!me) return;
    const type = this.ui.panel;
    const signature = JSON.stringify([type, this.npcId, this.selectedItem, me.inventory, me.equipment, me.gold, me.quests, me.classId, me.classChosen, me.attributes, me.statPoints, me.skillPoints, me.abilityRanks, me.level]);
    if (signature === this.signature) return;
    this.signature = signature;
    const title = { inventory: 'Всё, что вы несёте', character: 'Ваше призвание', journal: 'Истории забытых земель', npc: NPCS.find(n => n.id === this.npcId)?.name, class: 'Выберите своё призвание' }[type];
    let content = '';
    if (type === 'inventory') content = this.inventory(me);
    if (type === 'character') content = this.character(me);
    if (type === 'journal') content = this.journal(me);
    if (type === 'class') content = this.classes(me);
    if (type === 'npc') content = this.npc(me);
    this.ui.$('modal').innerHTML = `<div class="modal-heading"><div><div class="eyebrow">VILLAGE SURVIVAL · RPG</div><h2 id="modal-title">${title}</h2></div><button id="close-modal" class="icon-button" aria-label="Закрыть окно">${this.icon('close')}</button></div>${['inventory', 'character', 'journal'].includes(type) ? `<div class="rpg-tabs"><button data-panel="inventory" class="${type === 'inventory' ? 'active' : ''}">Рюкзак · I</button><button data-panel="character" class="${type === 'character' ? 'active' : ''}">Герой · C</button><button data-panel="journal" class="${type === 'journal' ? 'active' : ''}">Задания · J</button></div>` : ''}${content}`;
    this.ui.$('close-modal').onclick = () => this.ui.closePanel();
    this.ui.$('modal').querySelectorAll('[data-panel]').forEach(b => b.onclick = () => this.open(b.dataset.panel));
    this.ui.$('modal').querySelectorAll('[data-item]').forEach(b => b.onclick = () => { this.selectedItem = b.dataset.item; this.refreshPanel(me); });
    this.ui.$('modal').querySelectorAll('[data-action]').forEach(b => b.onclick = async () => {
      const action = JSON.parse(b.dataset.action); b.disabled = true;
      await this.perform(action);
      if (b.isConnected) b.disabled = false;
    });
  }
  button(label, action, className = 'secondary-button', disabled = false) {
    const aria = action.type === 'attribute' ? `${ATTRIBUTES[action.attribute]}: увеличить` : action.type === 'skill' ? `Улучшить способность ${action.key.toUpperCase()}` : null;
    return `<button class="${className}" ${aria ? `aria-label="${aria}"` : ''} data-action="${this.escape(JSON.stringify(action))}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  }
  itemName(item) { return `${ITEMS[item.baseId].name}${item.upgrade ? ` +${item.upgrade}` : ''}`; }
  inventory(me) {
    const equipped = Object.values(me.equipment);
    let selected = me.inventory.find(i => i.id === this.selectedItem) || me.inventory[0];
    const slots = Array.from({ length: INVENTORY_SIZE }, (_, index) => {
      const item = me.inventory[index];
      return item ? `<button class="inventory-slot ${item.id === selected?.id ? 'selected' : ''}" data-item="${item.id}" style="--rarity:${RARITIES[item.rarity].color}" title="${this.itemName(item)}" aria-label="${this.itemName(item)}, ${RARITIES[item.rarity].name}">${this.icon(ITEMS[item.baseId].icon)}${item.quantity > 1 ? `<b>${item.quantity}</b>` : ''}${equipped.includes(item.id) ? '<span class="equipped-mark">◆</span>' : ''}</button>` : `<div class="inventory-slot empty"><span>·</span></div>`;
    }).join('');
    let detail = '<p class="muted">Выберите предмет в рюкзаке.</p>';
    if (selected) {
      const base = itemStats(selected), isEquipped = equipped.includes(selected.id);
      detail = `<div class="item-showcase" style="--rarity:${RARITIES[selected.rarity].color}">${this.icon(base.icon)}</div><div class="item-rarity" style="color:${RARITIES[selected.rarity].color}">${RARITIES[selected.rarity].name}</div><h3>${this.itemName(selected)}</h3><p class="muted">${base.classId ? `Оружие · ${CLASSES[base.classId].name}` : { armor: 'Экипировка · Броня', ring: 'Экипировка · Кольцо', potion: 'Расходуемый предмет', material: 'Материал · можно продать торговке' }[base.type]}</p><div class="item-bonuses">${base.damage ? `Сила атаки <b>${base.damage}</b>` : ''}${base.armor ? `Броня <b>+${base.armor}</b>` : ''}${base.heal ? 'Восстанавливает 65 здоровья' : ''}${base.mana ? `${base.type === 'potion' ? 'Восстанавливает' : 'Максимум энергии +'} ${base.mana}${base.type === 'potion' ? ' энергии' : ''}` : ''}</div>${base.type === 'potion' ? this.button('Использовать', { type: 'use', itemId: selected.id }, 'primary-button') : ['weapon', 'armor', 'ring'].includes(base.type) ? this.button(isEquipped ? 'Снять' : 'Надеть', { type: isEquipped ? 'unequip' : 'equip', itemId: selected.id }, 'primary-button', base.classId && base.classId !== me.classId) : ''}<p class="panel-footnote">${isEquipped ? '◆ Надето на герое' : base.classId && base.classId !== me.classId ? 'Требуется другой класс героя' : 'Предмет сохраняется вместе с героем.'}</p>`;
    }
    return `<div class="inventory-heading"><span>${this.icon('coin')} ${me.gold} золота</span><span>${me.inventory.length} / ${INVENTORY_SIZE} ячеек</span></div><div class="inventory-layout"><div><div class="equipment-summary">${['weapon', 'armor', 'ring'].map(slot => { const item = me.inventory.find(i => i.id === me.equipment[slot]); return `<div><small>${{ weapon: 'ОРУЖИЕ', armor: 'БРОНЯ', ring: 'КОЛЬЦО' }[slot]}</small><span>${item ? this.itemName(item) : 'Не надето'}</span></div>`; }).join('')}</div><div class="inventory-grid">${slots}</div><p class="panel-footnote">F — подбирать добычу · 1 — зелье здоровья<br>Предметы в экипировке также занимают ячейку.</p></div><div class="item-detail">${detail}</div></div>`;
  }
  character(me) {
    const stats = effectiveStats(me), cls = CLASSES[me.classId];
    return `<div class="rpg-character-header"><span class="portrait-art ${me.appearance}" style="background-image:${this.escape(this.portrait(me))}"></span><div><h3>${this.escape(me.name)} · ${cls.name}</h3><p class="muted">Уровень ${me.level} · ${me.xp} / ${levelXp(me.level)} XP</p></div></div><div class="rpg-character-columns"><section><div class="field-label">ХАРАКТЕРИСТИКИ · ОЧКОВ: ${me.statPoints}</div><div class="attributes-list">${Object.entries(ATTRIBUTES).map(([id, label]) => `<div><span>${label}</span><b>${me.attributes[id]}</b>${this.button('+', { type: 'attribute', attribute: id }, 'attribute-plus', me.statPoints <= 0)}</div>`).join('')}</div><div class="sheet-stats"><div><span>Сила атаки</span><b>${stats.damage}</b></div><div><span>Броня</span><b>${stats.armor}</b></div><div><span>Макс. здоровье</span><b>${stats.maxHp}</b></div><div><span>Макс. энергия</span><b>${stats.maxMana}</b></div><div><span>Критический удар</span><b>${Math.round(stats.critical * 100)}%</b></div></div><p class="panel-footnote">Сила усиливает воина, ловкость — лучника и скорость, интеллект — мага и энергию. Выносливость даёт здоровье.</p></section><section><div class="field-label">СПОСОБНОСТИ · ОЧКОВ: ${me.skillPoints}</div>${Object.entries(ABILITIES[me.classId]).map(([key, a]) => `<div class="ability-description"><span class="ability-letter">${key.toUpperCase()}</span><div><strong>${a.name} <small>${me.abilityRanks[key]}/3</small></strong><p>${a.description}</p><small>${a.cost} энергии · ${a.cooldown / 1000} с</small></div>${this.button('+', { type: 'skill', key }, 'attribute-plus', me.skillPoints <= 0 || me.abilityRanks[key] >= 3)}</div>`).join('')}<p class="panel-footnote">Каждый уровень даёт 3 очка характеристик и 1 очко способности. Ранг усиливает эффект на 20%; стойкость получает +4 брони за ранг.</p></section></div>${!me.classChosen ? '<button data-panel="class" class="primary-button">Выбрать призвание</button>' : ''}`;
  }
  questCard(me, id, npc = null) {
    const quest = QUESTS[id], state = me.quests[id];
    return `<article class="quest-card ${state?.status === 'completed' ? 'completed' : ''}"><div class="quest-title"><h3>${quest.name}</h3><span>${state?.status === 'completed' ? 'Выполнено' : state ? `${state.progress} / ${quest.target}` : 'Новое задание'}</span></div><p>${quest.description}</p><div class="quest-reward">${quest.xp} XP · ${quest.gold} золота · ${ITEMS[quest.reward].name}</div>${npc ? !state ? this.button('Принять задание', { type: 'quest:accept', npcId: npc.id, questId: id }) : state.status === 'active' ? this.button(state.progress >= quest.target ? 'Получить награду' : 'Задание в процессе', { type: 'quest:claim', npcId: npc.id, questId: id }, 'secondary-button', state.progress < quest.target) : '' : `<small>Заказчик: ${NPCS.find(n => n.id === quest.npc).name}</small>`}</article>`;
  }
  journal(me) {
    const accepted = Object.keys(me.quests);
    return `<p class="muted">Прогресс личный. Совместные победы поблизости засчитываются обоим героям, если задание принято.</p>${accepted.length ? accepted.map(id => this.questCard(me, id)).join('') : '<div class="journal-empty">Первые истории ждут вас в деревне.<br>Поговорите со старостой возле фонтана — F.</div>'}<div class="panel-footnote">В деревне доступны 4 задания. Сдавайте выполненные задания тому, кто их выдал.</div>`;
  }
  classes(me) {
    return `<p class="muted">Призвание выбирается один раз в деревне. Уровень, золото и прежний прогресс сохранятся.${!inVillage(me) ? '<br>Сначала вернитесь в безопасную деревню.' : ''}</p><div class="class-cards">${Object.entries(CLASSES).map(([id, c]) => `<article><div class="class-emblem" style="color:${c.color}">${this.icon(id === 'warrior' ? 'shield' : id === 'mage' ? 'bolt' : 'arrow')}</div><h3>${c.name}</h3><small>${c.subtitle}</small><p>${c.description}</p><div class="class-base">${c.hp} HP · ${c.mana} энергии</div>${this.button(`Выбрать: ${c.name}`, { type: 'class', classId: id }, 'primary-button', me.classChosen || !inVillage(me))}</article>`).join('')}</div>`;
  }
  npc(me) {
    const npc = NPCS.find(n => n.id === this.npcId); if (!npc) return '';
    let body = Object.entries(QUESTS).filter(([, q]) => q.npc === npc.id).map(([id]) => this.questCard(me, id, npc)).join('');
    const stock = npc.id === 'merchant' ? ['health', 'mana', 'armor', 'ring'] : npc.id === 'smith' ? [CLASSES[me.classId].weapon, 'armor'] : [];
    body += stock.length ? `<div class="field-label shop-gold">ВАШ КОШЕЛЁК · ${me.gold} ЗОЛОТА</div><div class="shop-list">${stock.map(id => `<div>${this.icon(ITEMS[id].icon)}<span><strong>${ITEMS[id].name}</strong><small>${ITEMS[id].price} золота</small></span>${this.button('Купить', { type: 'buy', npcId: npc.id, baseId: id }, 'shop-buy', me.gold < ITEMS[id].price)}</div>`).join('')}</div>` : '';
    if (npc.id === 'smith') {
      const weapon = me.inventory.find(i => i.id === me.equipment.weapon);
      body += `<div class="smith-upgrade"><h3>Закалка оружия</h3><p class="muted">${weapon ? `${this.itemName(weapon)} · ${weapon.upgrade}/3` : 'Сначала наденьте оружие'}</p>${this.button(weapon?.upgrade < 3 ? `Улучшить · ${20 * (weapon.upgrade + 1)} золота` : 'Максимальное улучшение', { type: 'upgrade', npcId: npc.id }, 'secondary-button', !weapon || weapon.upgrade >= 3 || me.gold < 20 * (weapon.upgrade + 1))}</div>`;
    }
    if (npc.id === 'merchant') {
      const sellable = me.inventory.filter(i => !i.starter && !Object.values(me.equipment).includes(i.id));
      body += `<div class="field-label shop-gold">ПРОДАТЬ ИЗ РЮКЗАКА · ПО 1 ШТУКЕ</div><div class="shop-list">${sellable.map(i => `<div>${this.icon(ITEMS[i.baseId].icon)}<span><strong>${this.itemName(i)}</strong><small>${i.quantity} шт. · ${Math.max(1, Math.floor(ITEMS[i.baseId].price * .4))} золота / шт.</small></span>${this.button('Продать', { type: 'sell', npcId: npc.id, itemId: i.id }, 'shop-buy')}</div>`).join('') || '<p class="muted">Нет вещей для продажи.</p>'}</div>`;
    }
    return `<div class="npc-dialogue"><span class="portrait-art ${npc.appearance}"></span><div><div class="eyebrow">${npc.role}</div><p>«${npc.dialogue}»</p></div></div>${body}`;
  }
}

export const DEFAULT_BINDINGS = Object.freeze({ q: 'KeyQ', e: 'KeyE', r: 'KeyR', t: 'KeyT', health: 'Digit1' });
const STORAGE_KEY = 'village-survival:preferences';
const RESERVED = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyB', 'KeyP', 'KeyC', 'KeyJ', 'KeyI', 'KeyM']);
export const bindableCode = code => typeof code === 'string' && /^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code) && !RESERVED.has(code);
export const keyLabel = code => code.startsWith('Numpad') ? `Num ${code.slice(6)}` : code.replace(/^(Key|Digit)/, '');
export function assignBinding(bindings, skill, code) {
  if (!Object.hasOwn(DEFAULT_BINDINGS, skill) || !bindableCode(code)) throw new Error('Эта клавиша занята управлением. Выберите другую букву или цифру.');
  const next = { ...bindings }, other = Object.keys(next).find(key => next[key] === code);
  if (other) next[other] = next[skill];
  next[skill] = code; return next;
}
export class GamePreferences {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage; this.listeners = new Set();
    let saved; try { saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}'); } catch { saved = {}; }
    const codes = Object.keys(DEFAULT_BINDINGS).map(k => saved?.bindings?.[k] ?? DEFAULT_BINDINGS[k]);
    this.bindings = codes.every(bindableCode) && new Set(codes).size === codes.length ? Object.fromEntries(Object.keys(DEFAULT_BINDINGS).map((k, i) => [k, codes[i]])) : { ...DEFAULT_BINDINGS };
    this.notifications = saved?.notifications !== false; this.compactHud = saved?.compactHud === true; this.leftPanelOpen = saved?.leftPanelOpen === true;
  }
  label(skill) { return keyLabel(this.bindings[skill]); }
  actionFor(code) { return Object.keys(this.bindings).find(k => this.bindings[k] === code); }
  skillFor(code) { const action = this.actionFor(code); return action !== 'health' ? action : undefined; }
  bind(skill, code) { this.bindings = assignBinding(this.bindings, skill, code); this.save(); }
  resetBindings() { this.bindings = { ...DEFAULT_BINDINGS }; this.save(); }
  set(name, value) { if (!['notifications', 'compactHud', 'leftPanelOpen'].includes(name)) return; this[name] = !!value; this.save(); }
  save() {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify({ bindings: this.bindings, notifications: this.notifications, compactHud: this.compactHud, leftPanelOpen: this.leftPanelOpen })); } catch { /* Preferences still work until this tab closes. */ }
    for (const listener of this.listeners) listener();
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { GamePreferences, DEFAULT_BINDINGS, assignBinding } from '../client/preferences.js';

test('skill keys swap without duplicates and preserve movement, interaction and menu keys', () => {
  const swapped = assignBinding(DEFAULT_BINDINGS, 'q', 'KeyE');
  assert.equal(swapped.q, 'KeyE'); assert.equal(swapped.e, 'KeyQ'); assert.equal(new Set(Object.values(swapped)).size, 5);
  for (const code of ['KeyW', 'KeyF', 'KeyI', 'KeyB', 'Space', 'Enter', 'Escape', '__proto__']) assert.throws(() => assignBinding(swapped, 'q', code));
  assert.equal(assignBinding(swapped, 't', 'Digit3').t, 'Digit3');
});
test('key bindings and screen options survive reload; malformed preferences recover safely', () => {
  let saved; const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const p = new GamePreferences(storage); assert.equal(p.leftPanelOpen, false); p.bind('q', 'KeyZ'); p.bind('health', 'Digit4'); p.set('notifications', false); p.set('compactHud', true); p.set('leftPanelOpen', true);
  const restored = new GamePreferences(storage); assert.equal(restored.skillFor('KeyZ'), 'q'); assert.equal(restored.skillFor('KeyQ'), undefined); assert.equal(restored.label('q'), 'Z'); assert.equal(restored.notifications, false); assert.equal(restored.compactHud, true);
  assert.equal(restored.actionFor('Digit4'), 'health'); assert.equal(restored.skillFor('Digit4'), undefined); assert.equal(restored.leftPanelOpen, true);
  restored.resetBindings(); assert.deepEqual(restored.bindings, DEFAULT_BINDINGS); assert.equal(restored.notifications, false);
  for (const value of ['{broken', 'null', JSON.stringify({ bindings: { q: 'KeyW', e: 'KeyE', r: 'KeyR', t: 'KeyT' } }), JSON.stringify({ bindings: { q: 'KeyE', e: 'KeyE', r: 'KeyR', t: 'KeyT' } })]) { saved = value; assert.deepEqual(new GamePreferences(storage).bindings, DEFAULT_BINDINGS); }
});
test('older four-skill settings keep their bindings and add the health potion without showing the left panel', () => {
  const storage = { getItem: () => JSON.stringify({ bindings: { q: 'KeyZ', e: 'KeyE', r: 'KeyR', t: 'KeyT' } }) };
  const p = new GamePreferences(storage); assert.equal(p.label('q'), 'Z'); assert.equal(p.label('health'), '1'); assert.equal(p.leftPanelOpen, false);
  p.bind('q', 'Digit1'); assert.equal(p.label('q'), '1'); assert.equal(p.label('health'), 'Z');
});

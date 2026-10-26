import test from 'node:test';
import assert from 'node:assert/strict';
import { GamePreferences, DEFAULT_BINDINGS, assignBinding } from '../client/preferences.js';

test('skill keys swap without duplicates and preserve movement, interaction and menu keys', () => {
  const swapped = assignBinding(DEFAULT_BINDINGS, 'q', 'KeyE');
  assert.equal(swapped.q, 'KeyE'); assert.equal(swapped.e, 'KeyQ'); assert.equal(new Set(Object.values(swapped)).size, 4);
  for (const code of ['KeyW', 'KeyF', 'KeyI', 'KeyB', 'Space', 'Enter', 'Escape', 'Digit1', '__proto__']) assert.throws(() => assignBinding(swapped, 'q', code));
  assert.equal(assignBinding(swapped, 't', 'Digit3').t, 'Digit3');
});
test('key bindings and screen options survive reload; malformed preferences recover safely', () => {
  let saved; const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const p = new GamePreferences(storage); p.bind('q', 'KeyZ'); p.set('notifications', false); p.set('compactHud', true);
  const restored = new GamePreferences(storage); assert.equal(restored.skillFor('KeyZ'), 'q'); assert.equal(restored.skillFor('KeyQ'), undefined); assert.equal(restored.label('q'), 'Z'); assert.equal(restored.notifications, false); assert.equal(restored.compactHud, true);
  restored.resetBindings(); assert.deepEqual(restored.bindings, DEFAULT_BINDINGS); assert.equal(restored.notifications, false);
  for (const value of ['{broken', 'null', JSON.stringify({ bindings: { q: 'KeyW', e: 'KeyE', r: 'KeyR', t: 'KeyT' } }), JSON.stringify({ bindings: { q: 'KeyE', e: 'KeyE', r: 'KeyR', t: 'KeyT' } })]) { saved = value; assert.deepEqual(new GamePreferences(storage).bindings, DEFAULT_BINDINGS); }
});

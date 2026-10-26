import test from 'node:test';
import assert from 'node:assert/strict';
import { GameWorld } from '../server/world.js';
import { sendChat } from '../server/chat.js';
import { CHAT } from '../shared/chat.js';

test('chat uses the actual hero, normalizes text and bounds the session history', () => {
  const world = new GameWorld(), hero = world.join('a', 'Альфа', 'ranger');
  const message = sendChat(world, hero, { text: '  Привет!\nИдём   к боссу?  ', playerId: 'forged', name: 'Босс' }, 0);
  assert.equal(message.text, 'Привет! Идём к боссу?');
  assert.equal(message.playerId, hero.id); assert.equal(message.name, hero.name); assert.equal(message.sentAt, 0);
  for (let i = 1; i <= CHAT.historyLimit; i++) sendChat(world, hero, { text: `Текст ${i}` }, i * CHAT.cooldownMs);
  assert.equal(world.chatMessages.length, CHAT.historyLimit);
  assert.equal(world.chatMessages[0].text, 'Текст 1');
  assert.equal(new GameWorld(world.serialize()).chatMessages.length, 0);
});

test('empty, malformed, oversized, forged and offline chat cannot be broadcast or consume the cooldown', () => {
  const world = new GameWorld(), hero = world.join('a', 'Альфа', 'ranger');
  for (const data of [null, {}, { text: 12 }, { text: ' \n\t ' }, { text: 'а'.repeat(CHAT.maxLength + 1) }]) {
    assert.throws(() => sendChat(world, hero, data, 1000));
  }
  assert.throws(() => sendChat(world, { ...hero }, { text: 'Подмена' }, 1000));
  hero.online = false; assert.throws(() => sendChat(world, hero, { text: 'Не в сети' }, 1000));
  assert.equal(world.chatMessages.length, 0); assert.equal(world.chatLastSent.size, 0);
  hero.online = true;
  assert.equal(sendChat(world, hero, { text: 'а'.repeat(CHAT.maxLength) }, 1000).text.length, CHAT.maxLength);
});

test('cooldown is per hero, survives a rejoin, and fallen heroes can still talk', () => {
  const world = new GameWorld(), a = world.join('a', 'Альфа', 'ranger'), b = world.join('b', 'Бета', 'sage');
  sendChat(world, a, { text: 'Раз' }, 1000);
  assert.throws(() => sendChat(world, a, { text: 'Два' }, 1001), /Подождите/);
  a.hp = 0; sendChat(world, b, { text: 'Сейчас помогу' }, 1001);
  world.leave(a.id); world.join(a.id, 'Альфа', 'ranger');
  assert.throws(() => sendChat(world, a, { text: 'Обход' }, 1002), /Подождите/);
  sendChat(world, a, { text: 'Спасибо' }, 1000 + CHAT.cooldownMs);
  assert.equal(world.chatMessages.length, 3);
});

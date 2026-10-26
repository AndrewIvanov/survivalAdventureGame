import test from 'node:test';
import assert from 'node:assert/strict';
import { NoticeGate, noticeKey } from '../client/notices.js';

test('tips are shown once for an adventure and remain dismissed after reconnect or reload', async () => {
  const values = new Map(); globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const sent = [], ui = { net: { active: {}, playerId: 'a', state: { id: 'world', players: [{ id: 'a', seenNotices: ['banner:night-warning'] }] }, request: async (event, data) => sent.push({ event, data }) } };
  const gate = new NoticeGate(ui);
  assert.equal(gate.take('banner:night-warning'), false); assert.equal(gate.take('banner:night-start'), true); assert.equal(gate.take('banner:night-start'), false);
  clearTimeout(gate.timer); await gate.flush('world'); assert.equal(sent[0].event, 'ui:notices');
  const reloaded = new NoticeGate(ui); assert.equal(reloaded.take('banner:night-start'), false);
  ui.net.state.id = 'new-world'; assert.equal(reloaded.take('banner:night-start'), true); clearTimeout(reloaded.timer);
  ui.net.playerId = 'b'; ui.net.state.players.push({ id: 'b', seenNotices: [] }); assert.equal(reloaded.take('banner:night-start'), true); clearTimeout(reloaded.timer);
  delete globalThis.localStorage;
});
test('changing a number in an informational message does not make it a new tip', () => {
  assert.equal(noticeKey('Уровень 2! Здоровье восстановлено.'), noticeKey('Уровень 100! Здоровье восстановлено.'));
});

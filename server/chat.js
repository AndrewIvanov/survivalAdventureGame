import { randomUUID } from 'node:crypto';
import { CHAT } from '../shared/chat.js';

export function sendChat(world, player, data, now = Date.now()) {
  if (!player?.online || world.players.get(player.id) !== player) throw new Error('Сначала войдите в мир.');
  if (typeof data?.text !== 'string' || data.text.length > CHAT.maxLength) throw new Error(`Сообщение должно быть не длиннее ${CHAT.maxLength} символов.`);
  const text = data.text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/gu, ' ').trim();
  if (!text) throw new Error('Введите сообщение.');
  const lastSent = world.chatLastSent.get(player.id);
  if (lastSent !== undefined && now - lastSent < CHAT.cooldownMs) throw new Error('Подождите немного перед следующим сообщением.');
  const message = { id: randomUUID(), playerId: player.id, name: player.name, text, sentAt: now };
  world.chatLastSent.set(player.id, now);
  world.chatMessages.push(message);
  if (world.chatMessages.length > CHAT.historyLimit) world.chatMessages.shift();
  return message;
}

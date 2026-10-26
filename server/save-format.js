import { createHash } from 'node:crypto';

export const checksum = text => createHash('sha256').update(text).digest('hex');

export function decodeSave(row) {
  if (checksum(row.state) !== row.checksum) throw new Error('Save checksum mismatch');
  const data = JSON.parse(row.state);
  if (![1, 2, 3, 4].includes(data.version) || !Array.isArray(data.players) || !Array.isArray(data.monsters)) throw new Error('Unsupported save format');
  return data;
}

export function summarizeSave(state, playerId, savedAt) {
  const player = state.players.find(p => p.id === playerId);
  return player ? [{ id: state.id, code: state.code, name: state.name, level: player.level, savedAt, members: state.players.length }] : [];
}

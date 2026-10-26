export const noticeKey = message => {
  let hash = 2166136261;
  for (const c of String(message).replace(/\d+/g, '#')) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `toast:${hash >>> 0}`;
};
export class NoticeGate {
  constructor(ui) { this.ui = ui; this.worldId = null; this.seen = new Set(); this.pending = new Set(); }
  take(key) {
    const worldId = this.ui.net.state?.id;
    if (!worldId || !this.ui.net.active) return true;
    if (worldId !== this.worldId || this.playerId !== this.ui.net.playerId) {
      this.worldId = worldId; this.playerId = this.ui.net.playerId; this.pending.clear(); this.seen = new Set(this.ui.net.state.players.find(p => p.id === this.ui.net.playerId)?.seenNotices || []);
      try { for (const value of JSON.parse(localStorage.getItem(this.storageKey()) || '[]')) this.seen.add(value); } catch { /* A damaged preference must not interrupt the game. */ }
    }
    if (this.seen.has(key)) return false;
    this.seen.add(key); this.pending.add(key);
    try { localStorage.setItem(this.storageKey(), JSON.stringify([...this.seen])); } catch { /* Server persistence remains available. */ }
    clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(worldId), 200);
    return true;
  }
  storageKey() { return `village-survival:notices:${this.worldId}:${this.ui.net.playerId}`; }
  async flush(worldId) {
    if (this.ui.net.state?.id !== worldId || !this.ui.net.active) return;
    const keys = [...this.pending].slice(0, 32); this.pending.clear();
    if (!keys.length) return;
    try { await this.ui.net.request('ui:notices', { keys }); } catch { /* The browser copy prevents repeated tips during a reconnect. */ }
  }
}

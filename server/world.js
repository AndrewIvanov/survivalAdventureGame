import { randomBytes, randomUUID } from 'node:crypto';
import { WORLD, PLAYER, MONSTERS, distance, inVillage, clamp } from '../shared/config.js';
import { createMap, createCollisionGrid, canStand, moveEntity, monsterSpawns, seeded } from '../shared/map.js';
import { attack } from './combat.js';
import { updateMonsters } from './ai.js';
import { grantExperience } from './progression.js';

const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const roomCode = () => [...randomBytes(6)].map(n => codeAlphabet[n % codeAlphabet.length]).join('');

export class GameWorld {
  constructor(saved) {
    this.id = saved?.id || randomUUID();
    this.code = saved?.code || roomCode();
    this.name = saved?.name || 'Тихая сосна';
    this.seed = saved?.seed ?? WORLD.seed;
    this.map = createMap(this.seed);
    this.grid = createCollisionGrid(this.map.obstacles);
    this.random = seeded(this.seed + Date.now() % 100000);
    this.elapsed = saved?.elapsed || 0;
    this.kills = saved?.kills || 0;
    this.players = new Map((saved?.players || []).map(p => [p.id, { ...p, online: false, input: {}, inputAt: 0, lastAttack: -1000, lastDash: -3000 }]));
    this.monsters = saved?.monsters || monsterSpawns.map(([x, y, kind], i) => {
      let point = { x, y };
      for (let r = 0; r < 200 && !canStand(point.x, point.y, this.grid, 14); r += 8) point = { x: x + Math.cos(r) * r, y: y + Math.sin(r) * r };
      return { id: `monster-${i}`, kind, x: point.x, y: point.y, homeX: point.x, homeY: point.y, hp: MONSTERS[kind].hp, maxHp: MONSTERS[kind].hp, phase: i * 2.5, angle: 0, state: 'patrol', lastAttack: -2000, hurtUntil: 0, respawnAt: 0 };
    });
    this.events = [];
    this.criticalSave = false;
    this.savedAt = null;
  }

  join(id, name, appearance) {
    let player = this.players.get(id);
    if (!player) {
      if (this.players.size >= 2) throw new Error('В этом мире уже есть два героя. Создайте новый мир.');
      player = {
        id, name, appearance, x: WORLD.spawn.x + this.players.size * 42, y: WORLD.spawn.y,
        hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, level: 1, xp: 0, gold: 0, kills: 0,
        explored: ['village'], angle: -Math.PI / 2, respawnAt: 0, invulnerableUntil: 0,
        lastAttack: -1000, lastDash: -3000, lastHurt: -10000,
      };
      this.players.set(id, player);
    }
    player.online = true; player.input = {}; player.inputAt = 0;
    if (!canStand(player.x, player.y, this.grid)) { player.x = WORLD.spawn.x; player.y = WORLD.spawn.y; }
    this.criticalSave = true;
    return player;
  }

  leave(id) {
    const p = this.players.get(id);
    if (p) { p.online = false; p.input = {}; }
  }

  move(entity, dx, dy, radius = PLAYER.radius) { moveEntity(entity, dx, dy, this.grid, radius); }

  input(id, data, now = Date.now()) {
    const p = this.players.get(id);
    if (!p || !data || !Number.isFinite(data.x) || !Number.isFinite(data.y) || !Number.isFinite(data.angle)) return;
    let x = clamp(data.x, -1, 1), y = clamp(data.y, -1, 1);
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    p.input = { x, y, attack: data.attack === true };
    p.angle = Math.atan2(Math.sin(data.angle), Math.cos(data.angle));
    p.inputAt = now;
  }

  dash(id) {
    const p = this.players.get(id);
    if (!p || p.hp <= 0 || this.elapsed - p.lastDash < PLAYER.dashCooldown) return;
    p.lastDash = this.elapsed;
    p.dashUntil = this.elapsed + 150;
    const input = p.input || {};
    p.dashAngle = input.x || input.y ? Math.atan2(input.y, input.x) : p.angle;
    p.invulnerableUntil = this.elapsed + 200;
    this.events.push({ type: 'dash', id: p.id, x: p.x, y: p.y });
  }

  tick(dt, now = Date.now()) {
    if (![...this.players.values()].some(p => p.online)) return;
    this.elapsed += dt * 1000;
    for (const p of this.players.values()) {
      if (!p.online) continue;
      if (p.hp <= 0) {
        if (this.elapsed >= p.respawnAt) {
          p.x = WORLD.spawn.x; p.y = WORLD.spawn.y; p.hp = p.maxHp;
          p.invulnerableUntil = this.elapsed + 3000;
          this.events.push({ type: 'respawn', id: p.id });
          this.criticalSave = true;
        }
        continue;
      }
      const input = now - p.inputAt < 300 ? p.input : {};
      let dx = (input.x || 0) * PLAYER.speed * dt, dy = (input.y || 0) * PLAYER.speed * dt;
      if (this.elapsed < p.dashUntil) { dx = Math.cos(p.dashAngle) * 650 * dt; dy = Math.sin(p.dashAngle) * 650 * dt; }
      this.move(p, dx, dy);
      if (input.attack) attack(this, p);
      if (inVillage(p) && this.elapsed - p.lastHurt > 3000) p.hp = Math.min(p.maxHp, p.hp + 12 * dt);
      if (!inVillage(p) && !p.explored.includes('forest')) {
        p.explored.push('forest');
        grantExperience(this, p, 15);
        this.events.push({ type: 'discover', id: p.id, name: 'Тёмный лес', xp: 15 });
        this.criticalSave = true;
      }
    }
    updateMonsters(this, dt);
  }

  snapshot(playerId) {
    const player = this.players.get(playerId);
    return {
      id: this.id, code: this.code, name: this.name, elapsed: this.elapsed, kills: this.kills, savedAt: this.savedAt,
      players: [...this.players.values()].map(({ input, inputAt, ...p }) => ({ ...p, hp: Math.ceil(p.hp) })),
      monsters: this.monsters.filter(m => m.hp > 0 && (!player || distance(player, m) < 1150)).map(m => ({ id: m.id, kind: m.kind, x: m.x, y: m.y, hp: Math.ceil(m.hp), maxHp: m.maxHp, angle: m.angle, state: m.state })),
    };
  }

  serialize() {
    return {
      version: 1, id: this.id, code: this.code, name: this.name, seed: this.seed, elapsed: this.elapsed, kills: this.kills,
      players: [...this.players.values()].map(({ input, inputAt, online, dashUntil, ...p }) => p),
      monsters: this.monsters.map(({ targetId, ...m }) => m),
      village: { level: 1, buildings: this.map.buildings.map(b => b.id) }, unlockedRegions: ['village', 'forest'],
    };
  }
}

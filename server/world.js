import { randomBytes, randomUUID } from 'node:crypto';
import { WORLD, PLAYER, MONSTERS, distance, inVillage, clamp } from '../shared/config.js';
import { createMap, createCollisionGrid, canStand, moveEntity, seeded } from '../shared/map.js';
import { attack, updateProjectiles } from './combat.js';
import { updateMonsters } from './ai.js';
import { grantExperience } from './progression.js';
import { initializeRpg, refreshStats } from './inventory.js';
import { effectiveStats } from '../shared/rpg.js';
import { initializeChests } from './rpg.js';
import { progressQuests } from './quests.js';
import { updateZones } from './abilities.js';
import { SURVIVAL, sheltered, clockInfo } from '../shared/survival.js';
import { initializeSurvival, updateSurvival, resolveWave, survivalSnapshot } from './survival.js';
import { checkPartyDefeat } from './game-over.js';
import { updateBosses } from './boss.js';

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
    for (const player of this.players.values()) initializeRpg(player, 'warrior', true);
    this.chests = initializeChests(saved?.chests);
    this.loot = saved?.loot || [];
    this.projectiles = []; this.projectilePool = []; this.zones = [];
    this.monsterPool = [];
    this.survival = initializeSurvival(saved?.survival);
    this.daySkipVotes = new Set();
    this.gameOver = structuredClone(saved?.gameOver || null);
    this.village = { level: 1, buildings: this.map.buildings.map(b => b.id), maxHp: SURVIVAL.villageHp, hp: SURVIVAL.villageHp, failures: 0, ...saved?.village };
    const migrated = saved?.survival && (saved.survival.rulesVersion || 1) < 2;
    this.monsters = structuredClone(saved?.monsters || []).filter(m => {
      if (m.kind === 'guardian' && !m.raidId) return m.hp > 0;
      return !migrated && clockInfo(this.survival.clockMs).phase === 'night';
    });
    for (const monster of this.monsters) if (monster.kind === 'guardian' && !monster.raidId) {
      monster.obelisk = true;
      if (migrated) {
        monster.hp *= 5; monster.maxHp *= 5; monster.damage *= 5;
        this.survival.lastSummonDay = clockInfo(this.survival.clockMs).day;
      }
    }
    if (saved?.survival && (saved.survival.rulesVersion || 1) < 3) {
      for (const monster of this.monsters) {
        monster.hp /= 2; monster.maxHp /= 2; monster.damage = (monster.damage || MONSTERS[monster.kind].damage * 2) / 2;
      }
      const wave = this.survival.wave;
      if (wave?.status === 'active') wave.nextSpawnAt = Math.max(this.elapsed, wave.startedAt + wave.spawned / wave.total * SURVIVAL.nightMs);
      // If the complete old wave was already spawned, retire its ten removed slots.
      let excess = Math.max(0, (saved.survival.wave?.spawned || 0) - (this.survival.wave?.total ?? Infinity));
      this.monsters = this.monsters.filter(m => {
        if (excess && m.raidId === this.survival.wave?.id && m.kind !== 'guardian') { excess--; return false; }
        return true;
      });
    }
    this.events = [];
    this.criticalSave = false;
    this.savedAt = null;
  }

  join(id, name, appearance, classId = 'warrior') {
    let player = this.players.get(id);
    if (!player) {
      if (this.players.size >= 2) throw new Error('В этом мире уже есть два героя. Создайте новый мир.');
      player = {
        id, name, appearance, x: WORLD.spawn.x + this.players.size * 42, y: WORLD.spawn.y,
        hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, level: 1, xp: 0, gold: PLAYER.startingGold, kills: 0,
        explored: ['village'], angle: -Math.PI / 2, respawnAt: 0, invulnerableUntil: 0,
        lastAttack: -1000, lastDash: -3000, lastHurt: -10000,
      };
      initializeRpg(player, classId);
      this.players.set(id, player);
    }
    this.daySkipVotes.clear();
    player.online = true; player.input = {}; player.inputAt = 0;
    if (this.survival.wave?.status === 'active' && !this.survival.wave.participants.includes(id)) this.survival.wave.participants.push(id);
    if (!canStand(player.x, player.y, this.grid)) { player.x = WORLD.spawn.x; player.y = WORLD.spawn.y; }
    this.criticalSave = true;
    return player;
  }

  leave(id, { checkDefeat = true } = {}) {
    const p = this.players.get(id);
    if (p) { p.online = false; p.input = {}; this.daySkipVotes.clear(); if (checkDefeat) checkPartyDefeat(this); }
  }

  move(entity, dx, dy, radius = PLAYER.radius) { moveEntity(entity, dx, dy, this.grid, radius); }

  input(id, data, now = Date.now()) {
    const p = this.players.get(id);
    if (this.gameOver || !p || !data || !Number.isFinite(data.x) || !Number.isFinite(data.y) || !Number.isFinite(data.angle)) return;
    let x = clamp(data.x, -1, 1), y = clamp(data.y, -1, 1);
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    p.input = { x, y, attack: data.attack === true };
    p.angle = Math.atan2(Math.sin(data.angle), Math.cos(data.angle));
    p.inputAt = now;
  }

  dash(id) {
    const p = this.players.get(id);
    if (this.gameOver || !p || p.hp <= 0 || this.elapsed - p.lastDash < PLAYER.dashCooldown) return;
    p.lastDash = this.elapsed;
    p.dashUntil = this.elapsed + 150;
    const input = p.input || {};
    p.dashAngle = input.x || input.y ? Math.atan2(input.y, input.x) : p.angle;
    p.invulnerableUntil = this.elapsed + 200;
    this.events.push({ type: 'dash', id: p.id, x: p.x, y: p.y });
  }

  tick(dt, now = Date.now()) {
    if (this.gameOver || checkPartyDefeat(this) || ![...this.players.values()].some(p => p.online)) return;
    this.elapsed += dt * 1000;
    updateSurvival(this, dt);
    for (const p of this.players.values()) {
      if (!p.online) continue;
      if (p.hp <= 0) {
        if (this.elapsed >= p.respawnAt) {
          p.x = WORLD.spawn.x; p.y = WORLD.spawn.y; p.hp = p.maxHp;
          p.mana = p.maxMana;
          p.invulnerableUntil = this.elapsed + 3000;
          this.events.push({ type: 'respawn', id: p.id });
          this.criticalSave = true;
        }
        continue;
      }
      const input = now - p.inputAt < 300 ? p.input : {};
      const stats = effectiveStats(p);
      let dx = (input.x || 0) * stats.speed * dt, dy = (input.y || 0) * stats.speed * dt;
      if (this.elapsed < p.dashUntil) { dx = Math.cos(p.dashAngle) * 650 * dt; dy = Math.sin(p.dashAngle) * 650 * dt; }
      this.move(p, dx, dy);
      if (input.attack) attack(this, p);
      if (sheltered(this, p) && this.elapsed - p.lastHurt > 3000) p.hp = Math.min(p.maxHp, p.hp + 12 * dt);
      p.mana = Math.min(p.maxMana, p.mana + (sheltered(this, p) ? 12 : 5) * dt);
      if (!inVillage(p) && !p.explored.includes('forest')) {
        p.explored.push('forest');
        grantExperience(this, p, 15);
        progressQuests(this, p, 'explore');
        this.events.push({ type: 'discover', id: p.id, name: 'Тёмный лес', xp: 15 });
        this.criticalSave = true;
      }
    }
    updateProjectiles(this, dt); updateZones(this);
    updateBosses(this, dt);
    updateMonsters(this, dt);
    if (!this.gameOver) resolveWave(this);
    this.loot = this.loot.filter(l => l.permanent || l.expiresAt > this.elapsed);
  }

  snapshot(playerId) {
    const player = this.players.get(playerId);
    return {
      id: this.id, code: this.code, name: this.name, gameOver: this.gameOver, elapsed: this.elapsed, kills: this.kills, savedAt: this.savedAt,
      players: [...this.players.values()].map(({ input, inputAt, ...p }) => ({ ...p, hp: Math.ceil(p.hp) })),
      monsters: this.monsters.filter(m => m.hp > 0 && (!player || distance(player, m) < 1150)).map(m => ({ id: m.id, kind: m.kind, x: m.x, y: m.y, hp: Math.ceil(m.hp), maxHp: m.maxHp, angle: m.angle, state: m.state, elite: m.elite, variant: m.variant, name: m.name, damage: m.damage, raidId: m.raidId, bossPhase: m.bossPhase, telegraph: m.telegraph })),
      loot: this.loot.filter(l => (!l.ownerId || l.ownerId === playerId) && (!player || distance(l, player) < 1000)), chests: this.chests,
      projectiles: this.projectiles.map(({ hit, ...p }) => p), zones: this.zones,
      survival: survivalSnapshot(this), village: this.village,
    };
  }

  serialize() {
    return {
      version: 4, id: this.id, code: this.code, name: this.name, seed: this.seed, elapsed: this.elapsed, kills: this.kills,
      players: [...this.players.values()].map(({ input, inputAt, online, dashUntil, ...p }) => p),
      monsters: this.monsters.map(({ targetId, ...m }) => m),
      chests: this.chests, loot: this.loot,
      village: this.village, survival: this.survival, gameOver: this.gameOver, unlockedRegions: ['village', 'forest'],
    };
  }
}

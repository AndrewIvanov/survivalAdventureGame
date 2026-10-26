import { randomUUID } from 'node:crypto';
import { SURVIVAL, CYCLE_MS, clockInfo, nightStrength, waveSize } from '../shared/survival.js';
import { MONSTERS } from '../shared/config.js';
import { spawnMonster } from './spawns.js';
import { spawnGuardian } from './boss.js';
import { grantExperience } from './progression.js';
import { progressQuests } from './quests.js';

export function initializeSurvival(saved) {
  const state = { clockMs: 0, lastNight: 0, warningDay: 0, wave: null, defendedNights: [], failedNights: [], guardianDefeated: false, defeatedBosses: [], lastSummonDay: 0, ...structuredClone(saved), rulesVersion: 4 };
  if (saved && (saved.rulesVersion || 1) < 2) {
    const oldDay = Math.floor(saved.clockMs / 600000), offset = saved.clockMs % 600000;
    state.clockMs = oldDay * CYCLE_MS + (offset < 420000 ? offset / 420000 * SURVIVAL.dayMs : SURVIVAL.dayMs + (offset - 420000) / 180000 * SURVIVAL.nightMs);
    if (state.wave?.status === 'active') {
      state.wave.total *= 10; state.wave.spawned = 0; state.wave.nextSpawnAt = 0;
      state.wave.bossRequired = state.wave.night % 2 === 0;
      state.wave.bossSpawned = false; state.wave.bossDefeated = false;
    }
  }
  if (saved && (saved.rulesVersion || 1) < 3 && state.wave?.status === 'active') {
    state.wave.total = Math.max(0, state.wave.total - 10);
    state.wave.spawned = Math.min(state.wave.spawned, state.wave.total);
  }
  if (saved && (saved.rulesVersion || 1) < 4 && state.wave?.status === 'active') {
    state.wave.total = waveSize(state.wave.night);
    state.wave.spawned = Math.min(state.wave.spawned, state.wave.total);
  }
  return state;
}

export function beginNight(world, night) {
  const state = world.survival;
  if (state.lastNight >= night) return;
  state.lastNight = night; world.daySkipVotes.clear();
  state.wave = { id: randomUUID(), night, status: 'active', total: waveSize(night), spawned: 0, startedAt: world.elapsed, nextSpawnAt: world.elapsed, bossRequired: night % 2 === 0, bossSpawned: false, bossDefeated: false, participants: [...world.players.keys()] };
  world.events.push({ type: 'night-start', night, boss: state.wave.bossRequired }); world.criticalSave = true;
}

export function skipDay(world, player, ready = true) {
  if (world.gameOver) throw new Error('Игра завершена. Начните новое приключение.');
  if (!player?.online || player.hp <= 0 || world.players.get(player.id) !== player) throw new Error('Герой сейчас не может действовать.');
  const info = clockInfo(world.survival.clockMs);
  if (info.phase !== 'day') throw new Error('Сейчас ночь. Пропустить можно только день.');
  if (typeof ready !== 'boolean') throw new Error('Неверный выбор готовности.');
  if (ready) world.daySkipVotes.add(player.id); else world.daySkipVotes.delete(player.id);
  const online = [...world.players.values()].filter(p => p.online);
  if (online.every(p => world.daySkipVotes.has(p.id))) {
    // Jump the calendar, not simulation time: cooldowns, bosses and health do not advance.
    world.survival.clockMs = (info.day - 1) * CYCLE_MS + SURVIVAL.dayMs;
    beginNight(world, info.day); updateSurvival(world, 0);
    world.criticalSave = true;
  }
}

export function endWave(world, status) {
  const wave = world.survival.wave;
  if (!wave || wave.status !== 'active') return;
  wave.status = status; wave.endedAt = world.elapsed;
  if (status === 'failed') {
    world.survival.failedNights.push(wave.night); world.village.failures++;
    world.events.push({ type: 'wave-failed', night: wave.night });
  } else {
    world.survival.defendedNights.push(wave.night);
    for (const player of world.players.values()) if (player.online && wave.participants.includes(player.id)) {
      grantExperience(world, player, 35 + wave.night * 10); player.gold += 10 + wave.night * 5;
      progressQuests(world, player, 'defense');
    }
    world.events.push({ type: 'wave-defended', night: wave.night, dawn: status === 'survived' });
  }
  // Attackers retreat at dawn or after the village falls. Never run their death rewards.
  if (status !== 'repelled') for (const m of world.monsters) if (m.raidId === wave.id && m.hp > 0) {
    m.hp = 0; m.state = 'retreat'; m.despawnAt = world.elapsed + 1500; m.telegraph = null;
  }
  world.criticalSave = true;
}

export function resolveWave(world) {
  const wave = world.survival.wave;
  if (!wave || wave.status !== 'active') return;
  if (world.village.hp <= 0) return endWave(world, 'failed');
  if (wave.spawned >= wave.total && (!wave.bossRequired || wave.bossDefeated) && !world.monsters.some(m => m.hp > 0 && m.raidId === wave.id)) endWave(world, 'repelled');
}

function spawnBatch(world) {
  const wave = world.survival.wave;
  if (!wave || wave.status !== 'active' || wave.spawned >= wave.total || world.elapsed < wave.nextSpawnAt) return;
  const origins = [[2040, 1152], [1030, 1152], [1536, 650], [1536, 1660]];
  const active = world.monsters.filter(m => m.hp > 0 && (m.raidId || m.summonOwner)).length;
  const reservedBoss = wave.bossRequired && !wave.bossSpawned ? 1 : 0;
  const count = Math.max(0, Math.min(SURVIVAL.batchSize, wave.total - wave.spawned, SURVIVAL.maxRaiders - active - reservedBoss));
  for (let i = 0; i < count; i++) {
    const index = wave.spawned, [x, y] = origins[(index + wave.night) % origins.length];
    const kind = index % 3 === 2 ? 'nightstalker' : index % 2 ? 'goblin' : 'wolf';
    const elite = world.random() < Math.min(.35, .08 + wave.night * .025);
    const config = MONSTERS[kind], scale = nightStrength(wave.night);
    const hp = Math.round(config.hp * scale.hp * (elite ? 1.5 : 1));
    const angle = index * 2.39996, radius = 24 + Math.floor(index / 4) % 8 * 18;
    spawnMonster(world, kind, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, { hp, maxHp: hp, damage: Math.round(config.damage * scale.damage * (elite ? 1.2 : 1)), raidId: wave.id, raidNight: wave.night, objective: 'hunt', elite });
    wave.spawned++;
  }
  if (wave.bossRequired && !wave.bossSpawned && active + count < SURVIVAL.maxRaiders) { spawnGuardian(world, wave); wave.bossSpawned = true; }
  wave.nextSpawnAt = wave.startedAt + wave.spawned / wave.total * SURVIVAL.nightMs;
  if (count) world.criticalSave = true;
}

export function updateSurvival(world, dt) {
  const state = world.survival, previous = state.clockMs, next = previous + dt * 1000;
  // Process boundaries in order, even in a long offline/test step. Offline worlds do not call this.
  let cursor = previous;
  while (cursor < next) {
    const cycle = Math.floor(cursor / CYCLE_MS), offset = cursor % CYCLE_MS;
    const boundary = cycle * CYCLE_MS + (offset < SURVIVAL.dayMs ? SURVIVAL.dayMs : CYCLE_MS);
    if (boundary > next) break;
    if (offset < SURVIVAL.dayMs) beginNight(world, cycle + 1);
    else {
      resolveWave(world);
      if (state.wave?.status === 'active') endWave(world, world.village.hp > 0 ? 'survived' : 'failed');
      // Dawn removes every night creature, including dead bodies and boss helpers.
      // The daily obelisk encounter is the only creature allowed in daylight.
      for (const monster of world.monsters) if (!monster.obelisk) world.monsterPool.push(monster);
      world.monsters = world.monsters.filter(m => m.obelisk && m.hp > 0);
      world.village.hp = Math.min(world.village.maxHp, Math.max(world.village.maxHp * .35, world.village.hp + world.village.maxHp * .15));
      world.events.push({ type: 'dawn', day: cycle + 2 }); world.criticalSave = true;
    }
    cursor = boundary;
  }
  state.clockMs = next;
  const info = clockInfo(next);
  if (info.warning && state.warningDay !== info.day) {
    state.warningDay = info.day; world.events.push({ type: 'night-warning', night: info.day, seconds: Math.ceil(info.remaining / 1000) }); world.criticalSave = true;
  }
  if (info.phase === 'night') { if (state.lastNight < info.day) beginNight(world, info.day); spawnBatch(world); }
  const kept = [];
  for (const monster of world.monsters) {
    const transient = monster.raidId || monster.summonOwner;
    if (monster.hp <= 0 && (!transient || world.elapsed >= (monster.despawnAt || monster.respawnAt - 42000))) world.monsterPool.push(monster);
    else kept.push(monster);
  }
  world.monsters = kept;
}

export function survivalSnapshot(world) {
  const state = world.survival, wave = state.wave;
  const info = clockInfo(state.clockMs);
  const online = [...world.players.values()].filter(p => p.online);
  return { ...info, skipDayVotes: info.phase === 'day' ? online.filter(p => world.daySkipVotes.has(p.id)).map(p => p.id) : [], skipDayPlayers: online.length, clockMs: state.clockMs, lastNight: state.lastNight, lastSummonDay: state.lastSummonDay, summonAvailable: info.phase === 'day' && state.lastSummonDay !== info.day && !world.monsters.some(m => m.obelisk && m.hp > 0), guardianDefeated: state.guardianDefeated, guardianActive: world.monsters.some(m => m.obelisk && m.hp > 0), defeatedBosses: state.defeatedBosses.length, defended: state.defendedNights.length, failed: state.failedNights.length,
    wave: wave ? { ...wave, alive: world.monsters.filter(m => m.hp > 0 && m.raidId === wave.id).length } : null };
}

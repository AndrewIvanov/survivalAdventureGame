import { randomUUID } from 'node:crypto';
import { SURVIVAL, CYCLE_MS, clockInfo } from '../shared/survival.js';
import { MONSTERS } from '../shared/config.js';
import { spawnMonster } from './spawns.js';
import { spawnGuardian } from './boss.js';
import { grantExperience } from './progression.js';
import { progressQuests } from './quests.js';

export function initializeSurvival(saved) {
  return saved || { clockMs: 0, lastNight: 0, warningDay: 0, wave: null, defendedNights: [], failedNights: [], guardianDefeated: false, defeatedBosses: [] };
}

export function beginNight(world, night) {
  const state = world.survival;
  if (state.lastNight >= night) return;
  state.lastNight = night;
  const party = Math.max(1, [...world.players.values()].filter(p => p.online).length);
  state.wave = { id: randomUUID(), night, status: 'active', total: Math.min(36, 6 + night * 2 + party * 2), spawned: 0, startedAt: world.elapsed, nextSpawnAt: world.elapsed, bossRequired: night % 5 === 0, bossSpawned: false, bossDefeated: false, participants: [...world.players.keys()] };
  world.events.push({ type: 'night-start', night, boss: state.wave.bossRequired }); world.criticalSave = true;
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
    const config = MONSTERS[kind], scale = 1 + (wave.night - 1) * .16;
    const hp = Math.round(config.hp * scale * (elite ? 1.5 : 1));
    spawnMonster(world, kind, x + (index % 2 ? 16 : -16), y, { hp, maxHp: hp, damage: Math.round(config.damage * (1 + (wave.night - 1) * .1) * (elite ? 1.2 : 1)), raidId: wave.id, raidNight: wave.night, objective: index % 3 === 0 ? 'hunt' : 'village', elite, villageDamage: kind === 'goblin' ? 4 : 3 });
    wave.spawned++;
  }
  if (wave.bossRequired && !wave.bossSpawned && active + count < SURVIVAL.maxRaiders) { spawnGuardian(world, wave); wave.bossSpawned = true; }
  wave.nextSpawnAt = world.elapsed + SURVIVAL.spawnInterval;
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
    if (transient && monster.hp <= 0 && world.elapsed >= (monster.despawnAt || monster.respawnAt - 42000)) world.monsterPool.push(monster);
    else kept.push(monster);
  }
  world.monsters = kept;
}

export function survivalSnapshot(world) {
  const state = world.survival, wave = state.wave;
  return { ...clockInfo(state.clockMs), clockMs: state.clockMs, lastNight: state.lastNight, guardianDefeated: state.guardianDefeated, guardianActive: world.monsters.some(m => m.kind === 'guardian' && m.hp > 0), defeatedBosses: state.defeatedBosses.length, defended: state.defendedNights.length, failed: state.failedNights.length,
    wave: wave ? { ...wave, alive: world.monsters.filter(m => m.hp > 0 && m.raidId === wave.id).length } : null };
}

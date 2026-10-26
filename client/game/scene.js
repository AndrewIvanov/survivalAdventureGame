import Phaser from 'phaser';
import { WORLD, PLAYER, inVillage, levelXp } from '../../shared/config.js';
import { createMap, seeded } from '../../shared/map.js';
import { createTextures, createGround } from './textures.js';
import { createRpgTextures } from './rpg-art.js';
import { NPCS, RARITIES, ITEMS, CLASSES, ABILITIES } from '../../shared/rpg.js';
import { MONSTERS } from '../../shared/config.js';
import { SurvivalScene } from './survival-scene.js';
import { ProgressionScene } from './progression-scene.js';

export class WorldScene extends Phaser.Scene {
  constructor(network) {
    super('world'); this.network = network; this.entities = new Map(); this.pausedInput = true;
    this.lastSent = 0; this.lastPosition = null; this.effectsEnabled = true; this.buildMode = false;
  }
  create() {
    this.map = createMap();
    createTextures(this); createRpgTextures(this); createGround(this, this.map);
    this.survivalScene = new SurvivalScene(this); this.survivalScene.create();
    this.progressionScene = new ProgressionScene(this); this.progressionScene.create();
    this.rpgViews = new Map();
    this.zoneGraphics = this.add.graphics().setDepth(9000);
    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(-1000);
    this.treeViews = new Map();
    for (const tree of this.map.trees) this.treeViews.set(tree.id, this.add.image(tree.x, tree.y, `tree-${tree.variant}`).setOrigin(.5, .9).setScale(tree.scale).setDepth(tree.y + 10));
    for (const rock of this.map.rocks) this.add.image(rock.x, rock.y, `rock-${rock.variant}`).setOrigin(.5, .8).setDepth(rock.y);
    for (const b of this.map.buildings) {
      const sprite = this.add.image(b.x, b.y, `building-${b.style}`).setOrigin(.5, .84).setDepth(b.y + 20);
      if (b.style === 'altar') sprite.setScale(1.15);
      this.add.text(b.x, b.y + 37, b.name, { fontFamily: 'Georgia, serif', fontSize: '11px', color: '#eee7c6', stroke: '#293d2e', strokeThickness: 3 }).setOrigin(.5).setAlpha(.8).setDepth(b.y + 22);
    }
    this.add.image(1536, 1152, 'fountain').setOrigin(.5, .72).setDepth(1175);
    this.npcObjects = []; this.npcMarkers = [];
    for (const npc of NPCS) {
      this.npcObjects.push(this.add.image(npc.x, npc.y, `hero-${npc.appearance}-0`).setOrigin(.5, .92).setDepth(npc.y));
      const marker = this.add.text(npc.x, npc.y - 62, npc.id === 'hunter' || npc.id === 'elder' ? '!' : '◆', { fontFamily: 'Georgia', fontSize: '20px', color: '#e5ca83', stroke: '#243d2e', strokeThickness: 3 }).setOrigin(.5).setDepth(npc.y + 2);
      this.npcObjects.push(marker); this.npcMarkers.push(marker);
      this.npcObjects.push(this.add.text(npc.x, npc.y + 10, npc.name, { fontFamily: 'Georgia', fontSize: '10px', color: '#eadbb1', stroke: '#253b2b', strokeThickness: 3 }).setOrigin(.5).setDepth(npc.y + 2));
    }
    this.add.image(1880, 1110, 'sign').setOrigin(.5, 1).setDepth(1110);
    this.add.text(1880, 1067, 'ТЁМНЫЙ ЛЕС →', { fontFamily: 'monospace', fontSize: '8px', color: '#3c442d' }).setOrigin(.5).setDepth(1111);
    for (const [x, y] of [[1410, 1080], [1660, 1080], [1420, 1230], [1665, 1230], [1840, 1120], [1220, 1140]]) {
      this.add.circle(x + 5, y - 32, 27, 0xf2cc74, .05).setDepth(y + 1).setBlendMode(Phaser.BlendModes.ADD);
      this.add.image(x, y, 'lantern').setOrigin(.5, 1).setDepth(y);
    }
    const random = seeded(480);
    for (let i = 0; i < 75; i++) {
      const angle = random() * Math.PI * 2, radius = 220 + random() * 200;
      const x = 1536 + Math.cos(angle) * radius, y = 1152 + Math.sin(angle) * radius * .8;
      if (Math.abs(x - 1536) < 65 || Math.abs(y - 1152) < 60) continue;
      this.add.image(x, y, 'flower').setDepth(y - 20).setScale(.7 + random() * .5);
    }
    // A few drifting motes give the forest life without expensive particles.
    this.motes = Array.from({ length: 35 }, (_, i) => {
      const x = 1030 + random() * 1050, y = 740 + random() * 850;
      const mote = this.add.rectangle(x, y, i % 4 ? 2 : 3, 2, i % 4 ? 0xc1c98c : 0xf1d195, .55).setDepth(9999);
      this.tweens.add({ targets: mote, y: y - 25 - random() * 55, x: x + 25, alpha: .15, duration: 3500 + random() * 6000, yoyo: true, repeat: -1, delay: random() * 4000 });
      return mote;
    });
    this.cameraTarget = new Phaser.Math.Vector2(1536, 1140);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height).setZoom(this.defaultZoom());
    this.cameras.main.startFollow(this.cameraTarget, true, .09, .09);
    this.cameras.main.centerOn(1536, 1140);
    this.keys = this.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D', up2: 'UP', down2: 'DOWN', left2: 'LEFT', right2: 'RIGHT', dash: 'SPACE' }, false);
    this.input.mouse.disableContextMenu();
    this.scale.on('resize', () => this.cameras.main.setZoom(this.defaultZoom()));
    this.network.on('entered', result => this.begin(result));
    this.network.on('state', state => this.sync(state));
    this.network.on('effects', events => this.effects(events));
    this.network.on('left', () => this.reset());
    window.addEventListener('blur', () => { this.input.keyboard.resetKeys(); this.network.input({ x: 0, y: 0, angle: 0, attack: false }); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.input.keyboard.resetKeys(); this.network.input({ x: 0, y: 0, angle: 0, attack: false }); } });
    this.artReady = true;
    this.onArtReady?.();
  }
  defaultZoom() { return Math.max(1, Math.min(1.65, this.scale.width / 980)); }
  begin(result) {
    this.reset(); this.pausedInput = false;
    this.sync(result.state);
    const me = result.state.players.find(p => p.id === this.network.playerId);
    this.cameraTarget.set(me.x, me.y);
    this.cameras.main.centerOn(me.x, me.y);
  }
  reset() {
    for (const view of this.entities.values()) view.container.destroy();
    this.entities.clear(); this.pausedInput = true;
    for (const view of this.rpgViews?.values() || []) view.destroy();
    this.rpgViews?.clear(); this.zoneGraphics?.clear();
    this.survivalScene?.reset(); this.progressionScene?.reset(); this.buildMode = false;
    this.cameraTarget.set(1536, 1140);
  }
  makeView(data, player) {
    const shadow = this.add.ellipse(0, 1, player ? 29 : 37, 11, 0x15261c, .4);
    const ring = this.add.ellipse(0, 1, 33, 15).setStrokeStyle(1, data.id === this.network.playerId ? 0xd9c887 : 0x8fb6c0, .75).setVisible(player || data.kind === 'skeleton');
    const axe = player && data.inventory?.find(i => i.id === data.equipment?.weapon)?.baseId === 'axe';
    const sprite = this.add.sprite(0, 0, player ? `class-${axe ? 'axe' : data.classId || 'warrior'}-${data.appearance}-0` : data.kind === 'guardian' ? `guardian-${data.variant || 'forest'}` : data.kind).setOrigin(.5, .92);
    const label = this.add.text(0, player ? -55 : data.kind === 'guardian' ? -158 : -48, player ? data.name : data.kind === 'guardian' ? data.name || MONSTERS.guardian.name : data.elite ? '★' : '', { fontSize: '10px', fontFamily: 'system-ui', color: data.id === this.network.playerId ? '#f3e7bd' : '#d4cca3', stroke: '#1a3027', strokeThickness: 3 }).setOrigin(.5);
    if (data.elite) sprite.setTint(0xc7b1dd);
    const health = this.add.graphics();
    const container = this.add.container(data.x, data.y, [shadow, ring, sprite, label, health]);
    return { container, sprite, health, label, ring, data, player, lastX: data.x, lastY: data.y };
  }
  sync(state) {
    if (!this.sys.isActive()) return;
    for (const object of this.npcObjects) object.setVisible(state.survival?.phase !== 'night');
    for (const marker of this.npcMarkers) marker.setVisible(this.showNotifications !== false && state.survival?.phase !== 'night');
    const visible = new Set();
    for (const data of [...state.players.filter(p => p.online), ...state.monsters, ...(state.allies || [])]) {
      visible.add(data.id);
      let view = this.entities.get(data.id);
      const player = !data.kind;
      if (!view) { view = this.makeView(data, player); this.entities.set(data.id, view); }
      view.data = data;
      view.container.setVisible(!player || data.hp > 0);
      view.container.setAlpha(data.hp <= 0 ? .35 : data.stealthUntil > state.elapsed ? .3 : 1);
      if (data.frozenUntil > state.elapsed) view.sprite.setTint(0xa3d5e5);
      else if (data.burning) view.sprite.setTint(0xe9b182);
      else if (data.elite) view.sprite.setTint(0xc7b1dd); else view.sprite.clearTint();
      view.health.clear();
      if (data.hp < data.maxHp && data.hp > 0) {
        const y = player ? -46 : data.kind === 'guardian' ? -146 : -39, width = data.kind === 'guardian' ? 84 : 36;
        view.health.fillStyle(0x17251e, .9).fillRect(-width / 2, y, width, 5);
        view.health.fillStyle(player ? 0x87ab6c : 0xbb745d).fillRect(-width / 2 + 1, y + 1, (width - 2) * data.hp / data.maxHp, 3);
      }
    }
    for (const [id, view] of this.entities) if (!visible.has(id)) {
      this.tweens.add({ targets: view.container, alpha: 0, duration: 150, onComplete: () => view.container.destroy() });
      this.entities.delete(id);
    }
    this.syncRpg(state);
    this.survivalScene.sync(state);
    this.progressionScene.sync(state);
  }
  syncRpg(state) {
    const ids = new Set();
    for (const object of [...(state.chests || []).map(c => ({ ...c, kind: 'chest' })), ...(state.loot || []).map(l => ({ ...l, kind: 'loot' })), ...(state.projectiles || []).map(p => ({ ...p, kind: 'projectile', projectileKind: p.kind }))]) {
      ids.add(object.id); let view = this.rpgViews.get(object.id);
      if (!view) {
        if (object.kind === 'chest') view = this.add.image(object.x, object.y, 'chest').setOrigin(.5, .85);
        else if (object.kind === 'loot') {
          const color = Phaser.Display.Color.HexStringToColor(RARITIES[object.item.rarity].color).color;
          const glow = this.add.circle(0, 0, 12, color, .13), gem = this.add.rectangle(0, 0, 9, 9, color, .9).setRotation(Math.PI / 4);
          view = this.add.container(object.x, object.y, [glow, gem]);
        } else {
          const magic = ['magic', 'fire'].includes(object.projectileKind);
          const sniper = object.projectileKind === 'sniper';
          view = this.add.container(object.x, object.y, [this.add.rectangle(0, 0, sniper ? 52 : magic ? 14 : 23, sniper ? 10 : magic ? 8 : 3, magic ? object.projectileKind === 'fire' ? 0xf0a45e : 0xb8a7ed : 0xe3d8a2), this.add.circle(sniper ? 24 : magic ? 7 : 11, 0, sniper ? 9 : magic ? 5 : 3, magic ? 0xf3d8ad : 0xe4dec2)]);
        }
        this.rpgViews.set(object.id, view);
      }
      view.setPosition(object.x, object.y).setDepth(object.y + 3);
      if (object.kind === 'chest') view.setAlpha(object.claimedBy.includes(this.network.playerId) ? .4 : 1);
      if (object.kind === 'projectile') { view.setRotation(object.angle); view.projectileData = object; view.receivedAt = this.time.now; }
    }
    for (const [id, view] of this.rpgViews) if (!ids.has(id)) { view.destroy(); this.rpgViews.delete(id); }
    this.zoneGraphics.clear();
    for (const zone of state.zones || []) {
      const color = zone.kind === 'ice' ? 0x9eced3 : zone.kind === 'meteor' ? 0xe6a66d : 0xd9cb8c;
      this.zoneGraphics.fillStyle(color, .09).fillCircle(zone.x, zone.y, zone.radius);
      this.zoneGraphics.lineStyle(2, color, .6).strokeCircle(zone.x, zone.y, zone.radius);
    }
  }
  cast(key) {
    if (this.pausedInput || !this.network.active || document.activeElement?.matches('input, textarea, [contenteditable="true"]')) return;
    const pointer = this.input.activePointer;
    const target = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.network.ability(key, target.x, target.y).catch(e => this.network.emit('notice', { message: e.message, type: 'error' }));
  }
  update(time, delta) {
    if (!this.cameraTarget) return;
    this.survivalScene?.update(time, delta);
    this.progressionScene?.update(time);
    const me = this.entities.get(this.network.playerId);
    const factor = 1 - Math.exp(-delta / 65);
    for (const view of this.rpgViews.values()) if (view.projectileData) {
      const p = view.projectileData, seconds = Math.min(.12, (time - view.receivedAt) / 1000);
      view.setPosition(p.x + Math.cos(p.angle) * p.speed * seconds, p.y + Math.sin(p.angle) * p.speed * seconds - 15);
    }
    for (const view of this.entities.values()) {
      const { data, container, sprite } = view;
      const moved = Math.hypot(data.x - container.x, data.y - container.y) > .8;
      if (Math.hypot(data.x - container.x, data.y - container.y) > 260) container.setPosition(data.x, data.y);
      else { container.x += (data.x - container.x) * factor; container.y += (data.y - container.y) * factor; }
      container.setDepth(container.y + 5);
      sprite.setFlipX(Math.cos(data.angle) < -.15);
      if (view.player) {
        const axe = data.inventory?.find(i => i.id === data.equipment?.weapon)?.baseId === 'axe';
        sprite.setTexture(`class-${axe ? 'axe' : data.classId || 'warrior'}-${data.appearance}-${moved ? 1 + Math.floor(time / 130) % 2 : 0}`);
        sprite.y = moved && data.hp > 0 ? Math.sin(time / 75) * 1.3 : Math.sin(time / 380) * .5;
      } else sprite.y = moved ? Math.sin(time / 90) * 1.5 : 0;
      sprite.setRotation(data.hp <= 0 ? -1.2 : 0);
    }
    const followed = me?.data.hp <= 0 ? [...this.entities.values()].find(v => v.player && v.data.hp > 0) || me : me;
    if (followed) this.cameraTarget.set(followed.container.x, followed.container.y - 25);
    if (time - this.lastSent < 33 || !this.network.active) return;
    this.lastSent = time;
    if (this.pausedInput || document.hidden || !document.hasFocus() || document.activeElement?.matches('input, textarea, [contenteditable="true"]')) {
      this.network.input({ x: 0, y: 0, angle: me?.data.angle || 0, attack: false }); return;
    }
    const pointer = this.input.activePointer;
    const worldPointer = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Number(this.keys.right.isDown || this.keys.right2.isDown) - Number(this.keys.left.isDown || this.keys.left2.isDown);
    const y = Number(this.keys.down.isDown || this.keys.down2.isDown) - Number(this.keys.up.isDown || this.keys.up2.isDown);
    const angle = me ? Math.atan2(worldPointer.y - me.container.y, worldPointer.x - me.container.x) : 0;
    const overUI = !!document.elementFromPoint(pointer.x, pointer.y)?.closest('button, input, .panel');
    this.network.input({ x, y, angle, attack: !this.buildMode && !overUI && pointer.leftButtonDown() });
    if (Phaser.Input.Keyboard.JustDown(this.keys.dash)) this.network.dash();
  }
  floatText(x, y, text, color, size = 15) {
    if (this.showNotifications === false) return;
    const label = this.add.text(x, y, text, { fontFamily: 'Georgia, serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#1b2b22', strokeThickness: 3 }).setOrigin(.5).setDepth(20000);
    this.tweens.add({ targets: label, y: y - 37, alpha: 0, duration: 1000, ease: 'Cubic.easeOut', onComplete: () => label.destroy() });
  }
  effects(events) {
    if (!this.sys.isActive()) return;
    this.survivalScene?.effects(events);
    this.progressionScene?.effects(events);
    for (const event of events) {
      const view = this.entities.get(event.id);
      if (event.type === 'attack') {
        const g = this.add.graphics().setDepth(event.y + 60);
        g.lineStyle(9, 0xf1df9d, .75); g.beginPath(); g.arc(event.x, event.y - 13, 45, event.angle - 1, event.angle + 1); g.strokePath();
        g.lineStyle(3, 0xfff5d1, .9); g.beginPath(); g.arc(event.x, event.y - 13, 51, event.angle - .8, event.angle + .7); g.strokePath();
        this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
      }
      if (event.type === 'hit' || event.type === 'hurt') {
        this.floatText(event.x, event.y, event.critical ? `${event.damage}!` : `−${event.damage}`, event.type === 'hurt' ? '#f0a58c' : event.critical ? '#f3d17f' : '#f0e9cc', event.critical ? 21 : 16);
        if (view) {
          view.sprite.setTintFill(0xf6e6bf);
          this.time.delayedCall(90, () => { if (view.sprite.active) view.data.elite ? view.sprite.setTint(0xc7b1dd) : view.sprite.clearTint(); });
        }
        if (event.id === this.network.playerId && this.effectsEnabled) this.cameras.main.shake(90, .002);
      }
      if (event.type === 'kill') {
        this.floatText(event.x, event.y - 45, `+${event.xp} XP`, '#c9dca2', 12);
        if (this.effectsEnabled) for (let i = 0; i < 5; i++) {
          const spark = this.add.rectangle(event.x, event.y - 15, 3, 3, 0xd3b36d).setDepth(20000);
          this.tweens.add({ targets: spark, x: event.x + Math.cos(i * 1.25) * 30, y: event.y - 15 + Math.sin(i * 1.25) * 24, alpha: 0, duration: 500, onComplete: () => spark.destroy() });
        }
      }
      if (event.type === 'level') { this.floatText(event.x, event.y - 65, `УРОВЕНЬ ${event.level}`, '#f1d58b', 19); if (event.id === this.network.playerId) this.cameras.main.flash(450, 175, 193, 118, false); }
      if (event.type === 'dash' && view && this.effectsEnabled) {
        const ghost = this.add.image(event.x, event.y, view.sprite.texture.key).setOrigin(.5, .92).setAlpha(.4).setTint(0xc9dcb5).setDepth(event.y);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 350, onComplete: () => ghost.destroy() });
      }
      if (event.type === 'spell') {
        const color = event.kind === 'ice' ? 0xb7e3e5 : ['fire', 'meteor'].includes(event.kind) ? 0xe9ab6f : event.kind === 'guard' ? 0xb4c6ac : 0xe8d69a;
        const circle = this.add.circle(event.x, event.y, event.radius, color, .15).setStrokeStyle(3, color, .8).setDepth(event.y + 40);
        this.tweens.add({ targets: circle, scale: 1.12, alpha: 0, duration: event.kind === 'guard' ? 800 : 450, onComplete: () => circle.destroy() });
      }
      if (event.type === 'heal') this.floatText(event.x, event.y - 50, event.resource === 'hp' ? '+ Здоровье' : '+ Энергия', '#b7d99c', 13);
    }
  }
}

export function createGame(network) {
  const scene = new WorldScene(network);
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', backgroundColor: '#455e38', pixelArt: true, roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    render: { antialias: false, powerPreference: 'high-performance' }, scene: [scene],
    input: { keyboard: true, mouse: true }, audio: { noAudio: true },
  });
  return { game, scene };
}

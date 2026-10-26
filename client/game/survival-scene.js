import Phaser from 'phaser';
import { WORLD } from '../../shared/config.js';
import { SURVIVAL } from '../../shared/survival.js';
import { createSurvivalArt } from './survival-art.js';

export class SurvivalScene {
  constructor(scene) { this.scene = scene; this.state = null; this.darkness = 0; }
  create() {
    const scene = this.scene; createSurvivalArt(scene);
    scene.add.image(SURVIVAL.shrine.x, SURVIVAL.shrine.y, 'shrine').setOrigin(.5, .86).setDepth(SURVIVAL.shrine.y);
    scene.add.text(SURVIVAL.shrine.x, SURVIVAL.shrine.y - 100, 'ОБЕЛИСК ПРИЗЫВА', { fontFamily: 'Georgia', fontSize: '10px', color: '#d1d8ad', stroke: '#253b30', strokeThickness: 3 }).setOrigin(.5).setDepth(SURVIVAL.shrine.y + 1);
    this.tint = scene.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x101a40, 1).setOrigin(0).setDepth(15000).setAlpha(0);
    this.glows = [[1410,1048],[1660,1048],[1420,1198],[1665,1198],[1840,1088],[1220,1108],[1536,1120]].map(([x, y]) => scene.add.image(x, y, 'warm-glow').setScale(1.25).setBlendMode(Phaser.BlendModes.ADD).setDepth(15500).setAlpha(0));
    this.heroGlow = scene.add.image(0, 0, 'warm-glow').setScale(1.1).setBlendMode(Phaser.BlendModes.ADD).setDepth(15500).setAlpha(0).setTint(0xb9c7cf);
    this.danger = scene.add.graphics().setDepth(18000);
  }
  sync(state) { this.state = state; }
  update(time, delta) {
    if (!this.state?.survival) return;
    const { survival } = this.state;
    let target = survival.phase === 'night' ? .48 : survival.warning ? .08 + (30000 - survival.remaining) / 30000 * .2 : 0;
    if (survival.phase === 'night' && survival.remaining < 15000) target *= survival.remaining / 15000;
    this.darkness += (target - this.darkness) * (1 - Math.exp(-delta / 850));
    this.tint.setAlpha(this.darkness);
    for (const glow of this.glows) glow.setAlpha(this.darkness * .9);
    const hero = this.scene.entities.get(this.scene.network.playerId);
    if (hero) this.heroGlow.setPosition(hero.container.x, hero.container.y - 18).setAlpha(this.darkness * .36);
    this.danger.clear();
    for (const boss of this.state.monsters.filter(m => m.kind === 'guardian' && m.telegraph)) {
      const attack = boss.telegraph, remaining = attack.resolveAt - this.state.elapsed;
      const progress = Phaser.Math.Clamp(1 - remaining / (attack.resolveAt - attack.startedAt), 0, 1);
      for (const circle of attack.circles) {
        const color = attack.kind === 'roots' ? 0xd5a673 : 0xe99b72;
        this.danger.fillStyle(color, .12 + Math.sin(time / 80) * .035).fillCircle(circle.x, circle.y, circle.radius);
        this.danger.lineStyle(2, color, .9).strokeCircle(circle.x, circle.y, circle.radius);
        this.danger.lineStyle(5, 0xf5c29a, .85).beginPath().arc(circle.x, circle.y, circle.radius - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress).strokePath();
        this.danger.lineStyle(1, color, .6).lineBetween(circle.x - 7, circle.y - 7, circle.x + 7, circle.y + 7).lineBetween(circle.x - 7, circle.y + 7, circle.x + 7, circle.y - 7);
      }
    }
  }
  reset() { this.state = null; this.tint?.setAlpha(0); this.glows?.forEach(g => g.setAlpha(0)); this.heroGlow?.setAlpha(0); this.danger?.clear(); this.darkness = 0; }
  effects(events) {
    for (const e of events) {
      if (e.type === 'boss-impact') for (const c of e.circles) {
        const ring = this.scene.add.circle(c.x, c.y, c.radius, e.kind === 'roots' ? 0x9fb571 : 0xe1ad77, .23).setStrokeStyle(5, 0xe6be82, .8).setDepth(18001);
        this.scene.tweens.add({ targets: ring, scale: 1.2, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
        if (this.scene.effectsEnabled) this.scene.cameras.main.shake(160, .003);
      }
      if (e.type === 'village-hit') this.scene.floatText(e.x, e.y - 25, `−${e.damage}`, '#e1a27c', 12);
    }
  }
}

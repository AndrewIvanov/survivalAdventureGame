export class SkillEffects {
  constructor(scene) { this.scene = scene; }
  fade(object, duration = 600, properties = {}) {
    this.scene.tweens.add({ targets: object, alpha: 0, duration, ...properties, onComplete: () => object.destroy() });
  }
  ring(x, y, radius, color, duration = 650) {
    const ring = this.scene.add.circle(x, y, radius, color, .05).setStrokeStyle(3, color, .9).setDepth(18005).setScale(.15);
    this.fade(ring, duration, { scale: 1 });
  }
  burst(x, y, color, count = 12, radius = 85) {
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2;
      const mote = this.scene.add.rectangle(x, y, 4, 6, color).setRotation(angle).setDepth(18006);
      this.fade(mote, 450 + i % 3 * 100, { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius, angle: i * 30 });
    }
  }
  slash(e, spin = false) {
    const g = this.scene.add.graphics().setPosition(e.x, e.y - 15).setRotation(e.angle || 0).setDepth(18005);
    g.lineStyle(spin ? 5 : 8, 0xf0d7a1, .95).beginPath().arc(0, 0, spin ? 100 : 85, -.9, .9).strokePath();
    g.lineStyle(2, 0xfff0c6, .8).beginPath().arc(0, 0, spin ? 80 : 68, -.9, .9).strokePath();
    this.fade(g, spin ? 750 : 320, { rotation: (e.angle || 0) + (spin ? Math.PI * 4 : 1.2), scale: 1.2 });
    if (spin) this.ring(e.x, e.y, 125, 0xd6d8bb);
  }
  shield(e, color = 0xb6d8c8) {
    const g = this.scene.add.graphics().setPosition(e.x, e.y - 20).setDepth(18005);
    g.fillStyle(color, .15).lineStyle(4, color, 1);
    const points = [{ x: -33, y: -35 }, { x: 0, y: -47 }, { x: 33, y: -35 }, { x: 29, y: 10 }, { x: 0, y: 39 }, { x: -29, y: 10 }];
    g.fillPoints(points, true).strokePoints(points, true);
    this.fade(g, 900, { scale: 1.3 }); this.burst(e.x, e.y - 15, color, 8, 60);
  }
  frost(x, y) {
    this.ring(x, y, 160, 0xb3e7f1, 900);
    const g = this.scene.add.graphics().setPosition(x, y).setDepth(18005);
    g.lineStyle(3, 0xc9f3f7, .9);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, endX = Math.cos(a) * 125, endY = Math.sin(a) * 125;
      g.lineBetween(0, 0, endX, endY);
      for (const turn of [-.7, .7]) g.lineBetween(endX * .65, endY * .65, endX * .65 - Math.cos(a + turn) * 27, endY * .65 - Math.sin(a + turn) * 27);
    }
    this.fade(g, 850, { scale: 1.12 }); this.burst(x, y, 0xa9dce9, 15, 135);
  }
  rain(e, meteors) {
    const x = e.targetX, y = e.targetY;
    this.ring(x, y, meteors ? 130 : 150, meteors ? 0xf3a464 : 0xc9d5a4, 850);
    for (let wave = 0; wave < 3; wave++) this.scene.time.delayedCall(wave * (meteors ? 750 : 850), () => {
      const count = meteors ? 3 : 9;
      for (let i = 0; i < count; i++) {
        const angle = i * 2.4 + wave, radius = 15 + i * (meteors ? 28 : 12);
        const tx = x + Math.cos(angle) * radius, ty = y + Math.sin(angle) * radius;
        const shot = this.scene.add.rectangle(tx - (meteors ? 100 : 25), ty - 240, meteors ? 17 : 3, meteors ? 34 : 28, meteors ? 0xffbd73 : 0xe8dec0).setRotation(meteors ? -.45 : -.12).setDepth(18006);
        this.scene.tweens.add({ targets: shot, x: tx, y: ty, duration: meteors ? 220 : 400, onComplete: () => { shot.destroy(); this.ring(tx, ty, meteors ? 42 : 15, meteors ? 0xf3a464 : 0xdce5b7, 350); } });
      }
    });
  }
  smoke(e) { this.burst(e.x, e.y - 20, 0xa398c9, 18, 75); this.ring(e.x, e.y, 75, 0x988bb9, 700); }
  effects(events) {
    for (const e of events) {
      if (e.type === 'ally-spawn') { this.ring(e.x, e.y, 32, 0xb6c4dc); this.burst(e.x, e.y - 15, 0xc7d5d1, 7, 35); }
      if (e.type !== 'ability-cast') continue;
      if (e.key === 't') {
        if (e.profession === 'healer') { this.ring(e.x, e.y, 350, 0xa9e1ab, 1000); this.burst(e.x, e.y - 20, 0xc8edaf, 18, 110); }
        if (e.profession === 'fire') { this.ring(e.x, e.y - 15, 85, 0xf3a25c); this.burst(e.x, e.y - 20, 0xffd497, 18, 90); }
        if (e.profession === 'ice') this.frost(e.targetX, e.targetY);
        if (e.profession === 'dark') { this.ring(e.x, e.y, 90, 0xb7a7dc, 1100); this.burst(e.x, e.y, 0xd9d2b0, 16, 80); }
        if (e.profession === 'assassin') this.smoke(e);
        if (e.profession === 'sniper') {
          const g = this.scene.add.graphics().setPosition(e.x, e.y - 18).setRotation(e.angle).setDepth(18005);
          g.lineStyle(11, 0xe5dda7, .5).lineBetween(0, 0, 250, 0).lineStyle(3, 0xfff6d4, 1).lineBetween(0, 0, 250, 0);
          this.fade(g, 300, { scaleX: 2 });
        }
        if (e.profession === 'aggressor') this.shield(e, 0xe3af81);
        if (e.profession === 'squire') { this.slash(e, true); this.ring(e.x, e.y, 95, 0xe2e3c1); }
        if (e.profession === 'braveheart') {
          this.ring(e.x, e.y, 90, 0xe9b7a1, 900); this.burst(e.x, e.y - 20, 0xe8c3a7, 12, 65);
          const heart = this.scene.add.text(e.x, e.y - 50, '♥', { fontSize: '35px', color: '#efc0a4', stroke: '#623f37', strokeThickness: 3 }).setOrigin(.5).setDepth(18006); this.fade(heart, 900, { y: e.y - 115 });
        }
      } else if (e.classId === 'warrior') {
        if (e.key === 'r') this.shield(e); else this.slash(e, e.key === 'e');
      } else if (e.classId === 'mage') {
        if (e.key === 'q') this.burst(e.x + Math.cos(e.angle) * 22, e.y - 15, 0xffc385, 8, 35);
        if (e.key === 'e') this.frost(e.targetX, e.targetY);
        if (e.key === 'r') this.rain(e, true);
      } else {
        if (e.key === 'r') this.rain(e, false);
        else {
          const g = this.scene.add.graphics().setPosition(e.x, e.y - 15).setRotation(e.angle).setDepth(18005);
          g.lineStyle(3, e.key === 'q' ? 0xc3e6ec : 0xdde1b4, 1);
          for (let i = e.key === 'e' ? -2 : 0; i <= (e.key === 'e' ? 2 : 0); i++) { const a = i * .16; g.lineBetween(10, 0, Math.cos(a) * 140, Math.sin(a) * 140); }
          this.fade(g, 350, { scaleX: 1.6 });
        }
      }
    }
  }
}

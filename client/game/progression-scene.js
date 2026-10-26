import { createProgressionArt } from './progression-art.js';
import { SkillEffects } from './skill-effects.js';
import { bladeCount } from '../../shared/professions.js';
import { ORE_NODES, FENCES, GATHERING } from '../../shared/crafting.js';
import { distance } from '../../shared/config.js';

export class ProgressionScene {
  constructor(scene) { this.scene = scene; this.state = null; this.views = new Map(); this.oreViews = new Map(); this.stumps = new Map(); this.depleted = new Set(); this.fadedTrees = new Set(); }
  create() {
    const scene = this.scene; createProgressionArt(scene); this.skills = new SkillEffects(scene);
    this.treeIndex = new Map(scene.map.trees.map(tree => [tree.id, tree]));
    for (const node of ORE_NODES) this.oreViews.set(node.id, scene.add.image(node.x, node.y, 'ore-vein').setOrigin(.5, .85).setDepth(node.y));
    this.orbits = scene.add.graphics().setDepth(14000);
    this.preview = scene.add.rectangle(0, 0, 32, 32, 0xb8d193, .3).setStrokeStyle(2, 0xd9e7b7).setDepth(19000).setVisible(false);
    scene.input.on('pointerdown', pointer => {
      if (!scene.buildMode || scene.pausedInput || this.buildPending || !pointer.leftButtonDown()) return;
      if (!pointer.event?.target?.closest?.('canvas')) return;
      const point = scene.cameras.main.getWorldPoint(pointer.x, pointer.y); this.buildPending = true;
      scene.network.action({ type: 'build:place', x: point.x, y: point.y }).catch(e => scene.network.emit('notice', { message: e.message, type: 'error' })).finally(() => { this.buildPending = false; });
    });
  }
  sync(state) {
    this.state = state;
    const depleted = new Set(state.depletedTrees || []);
    for (const id of this.depleted) if (!depleted.has(id)) this.scene.treeViews.get(id)?.setVisible(true);
    for (const id of depleted) if (!this.depleted.has(id)) {
      this.scene.treeViews.get(id)?.setVisible(false);
      const tree = this.treeIndex.get(id); if (tree) this.stumps.set(id, this.scene.add.image(tree.x, tree.y, 'stump').setOrigin(.5, .85).setDepth(tree.y - 10));
    }
    this.depleted = depleted;
    const me = state.players.find(p => p.id === this.scene.network.playerId), faded = new Set();
    if (me?.hp > 0) for (const node of state.resources || []) if (node.kind === 'tree' && Math.abs(node.x - me.x) < 55 && me.y > node.y - 100 && me.y < node.y + 25) { faded.add(node.id); if (!this.fadedTrees.has(node.id)) this.scene.treeViews.get(node.id)?.setAlpha(.4); }
    for (const id of this.fadedTrees) if (!faded.has(id)) this.scene.treeViews.get(id)?.setAlpha(1);
    this.fadedTrees = faded;
    for (const [id, view] of this.stumps) if (!depleted.has(id)) { view.destroy(); this.stumps.delete(id); }
    for (const node of state.resources || []) if (node.kind === 'ore') this.oreViews.get(node.id)?.setAlpha(node.remaining > 0 ? 1 : .2);
    const ids = new Set();
    for (const fence of state.structures || []) {
      ids.add(fence.id); let view = this.views.get(fence.id);
      if (!view) {
        const sprite = this.scene.add.image(0, 0, 'fence-crate').setOrigin(.5, .85), health = this.scene.add.graphics();
        const label = this.scene.add.text(0, -19, `${fence.level}`, { fontFamily: 'Georgia', fontSize: '10px', color: '#e6dfb8', stroke: '#4c4638', strokeThickness: 2 }).setOrigin(.5);
        view = this.scene.add.container(fence.x, fence.y, [sprite, health, label]); view.sprite = sprite; view.health = health; view.label = label; this.views.set(fence.id, view);
      }
      if (view.hp === fence.hp && view.level === fence.level) continue;
      view.hp = fence.hp; view.level = fence.level;
      view.setPosition(fence.x, fence.y).setDepth(fence.y + 16); view.label.setText(String(fence.level));
      view.sprite.setTint(fence.level >= 7 ? 0xc0d5d6 : fence.level >= 4 ? 0xccc6a1 : 0xffffff);
      view.health.clear();
      if (fence.hp < fence.maxHp) { view.health.fillStyle(0x18261f, .9).fillRect(-17, -39, 34, 4); view.health.fillStyle(0xb7c78a).fillRect(-16, -38, 32 * fence.hp / fence.maxHp, 2); }
    }
    for (const [id, view] of this.views) if (!ids.has(id)) { view.destroy(); this.views.delete(id); }
  }
  update(time) {
    const scene = this.scene; if (!this.state) return;
    const me = this.state.players.find(p => p.id === scene.network.playerId), pointer = scene.input.activePointer;
    const point = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.preview.setVisible(!!scene.buildMode && !scene.pausedInput);
    if (scene.buildMode) { const x = Math.round(point.x / 32) * 32, y = Math.round(point.y / 32) * 32; this.preview.setPosition(x, y).setFillStyle(distance(me, { x, y }) <= FENCES.reach ? 0xb8d193 : 0xdd8d70, .3); }
    this.orbits.clear();
    for (const hero of this.state.players) {
      if (!hero.online || hero.hp <= 0) continue;
      const view = scene.entities.get(hero.id); if (!view) continue;
      const x = view.container.x, y = view.container.y - 15;
      if (hero.guardUntil > this.state.elapsed || hero.reflectUntil > this.state.elapsed) this.orbits.lineStyle(2, hero.reflectUntil > this.state.elapsed ? 0xe4b189 : 0xb3d7c4, .35 + Math.sin(time / 150) * .15).strokeEllipse(x, y, 62, 82);
      if (hero.orbitUntil > this.state.elapsed) for (let i = 0; i < bladeCount(hero.professionRank); i++) {
        const a = time / 280 + i * Math.PI * 2 / bladeCount(hero.professionRank), sx = x + Math.cos(a) * 76, sy = y + Math.sin(a) * 76;
        const dx = Math.cos(a + .5), dy = Math.sin(a + .5);
        this.orbits.lineStyle(5, 0x9fadae, .95).lineBetween(sx - dx * 11, sy - dy * 11, sx + dx * 14, sy + dy * 14);
        this.orbits.lineStyle(2, 0xf2efcc, 1).lineBetween(sx - dx * 8, sy - dy * 8, sx + dx * 16, sy + dy * 16);
        this.orbits.lineStyle(3, 0xc8aa70, 1).lineBetween(sx - dx * 7 - dy * 7, sy - dy * 7 + dx * 7, sx - dx * 7 + dy * 7, sy - dy * 7 - dx * 7);
      }
    }
    for (const monster of this.state.monsters) if (monster.burning) {
      const view = scene.entities.get(monster.id); if (!view) continue;
      for (let i = 0; i < 3; i++) { const rise = (time / 35 + i * 8) % 24; this.orbits.fillStyle(i % 2 ? 0xffd08a : 0xf39b5d, 1 - rise / 30).fillTriangle(view.container.x - 9 + i * 7, view.container.y - 20 - rise, view.container.x - 13 + i * 7, view.container.y - 10 - rise, view.container.x - 5 + i * 7, view.container.y - 10 - rise); }
    }
    for (const shot of this.state.projectiles || []) if (['fire', 'power', 'sniper', 'magic'].includes(shot.kind)) {
      const color = shot.kind === 'fire' ? 0xffb96f : shot.kind === 'sniper' ? 0xf4df9a : 0xb9cce5;
      this.orbits.lineStyle(shot.kind === 'sniper' ? 7 : 3, color, .35).lineBetween(shot.x - Math.cos(shot.angle) * 45, shot.y - 15 - Math.sin(shot.angle) * 45, shot.x, shot.y - 15);
    }
    // Holding the mouse on a reachable tree uses the axe instead of attacking empty air.
    if (!scene.buildMode && !scene.pausedInput && me?.hp > 0 && pointer.leftButtonDown() && !document.activeElement?.matches('input, textarea') && !this.harvestPending && !(me.nextHarvestAt > this.state.elapsed)) {
      const axe = me.inventory.find(i => i.id === me.equipment.weapon)?.baseId === 'axe';
      const node = axe && this.state.resources?.find(n => n.kind === 'tree' && n.remaining > 0 && distance(n, me) <= GATHERING.range && distance(n, point) < 70);
      if (node && document.hasFocus() && time - (this.lastHarvestAttempt ?? -1000) >= GATHERING.cooldownMs) {
        this.lastHarvestAttempt = time; this.harvestPending = true;
        scene.network.action({ type: 'resource:harvest', nodeId: node.id }).then(() => { this.harvestError = null; }).catch(e => { if (this.harvestError !== e.message) scene.network.emit('notice', { message: e.message, type: 'error' }); this.harvestError = e.message; }).finally(() => { this.harvestPending = false; });
      }
    }
  }
  effects(events) {
    this.skills.effects(events);
    for (const e of events) {
      if (e.type === 'harvest') { this.scene.floatText(e.x, e.y - 35, `+${e.amount} ${e.resource === 'wood' ? 'дерева' : 'руды'}`, '#d0dfad', 13); this.skills.burst(e.x, e.y - 12, e.resource === 'wood' ? 0xb89c69 : 0xb4ccd5, 6, 30); }
      if (e.type === 'fence-hit') this.scene.floatText(e.x, e.y - 30, `−${e.damage}`, '#dbb48b', 10);
    }
  }
  reset() { this.state = null; this.orbits?.clear(); this.preview?.setVisible(false); for (const view of this.views.values()) view.destroy(); this.views.clear(); for (const view of this.stumps.values()) view.destroy(); this.stumps.clear(); this.depleted.clear(); this.fadedTrees.clear(); for (const view of this.oreViews.values()) view.setAlpha(1); for (const view of this.scene.treeViews?.values() || []) view.setVisible(true).setAlpha(1); }
}

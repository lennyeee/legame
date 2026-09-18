import Phaser from 'phaser';
import { isUnit } from '../systems/items';
import { combatConfig, getCombatStats } from '../config/combat';
import type { AttackEffect, CombatEvent } from '../combat/CombatSimulation';
import { CombatSimulation } from '../combat/CombatSimulation';
import { label } from './text';
import { heroCombat, heroVisuals, heroExpRequired } from '../config/heroes';
import { skillConfigs } from '../config/skills';
import type { HeroLink } from '../systems/heroActivation';
import { boardDisplayScene } from './boardDisplay';
import { boardToScreen } from '../config/layout';

export class CombatView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly range: Phaser.GameObjects.Graphics;
  private readonly flashes = new Map<number, number>();
  private effects: { event: AttackEffect; expires: number }[] = [];
  private heroEffects: { event: Extract<CombatEvent, { kind: 'heroAttack' }>; expires: number }[] = [];
  private rewards: { text: Phaser.GameObjects.Text; expires: number; y: number }[] = [];
  private selectedTile: number | null = null;
  private readonly heroLevels = new Map<string, Phaser.GameObjects.Text>();
  private skillFlashes: { link: HeroLink; text: Phaser.GameObjects.Text; expires: number }[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly battle: CombatSimulation) {
    this.scene = boardDisplayScene(scene);
    scene = this.scene;
    this.range = scene.add.graphics().setDepth(1);
    this.graphics = scene.add.graphics().setDepth(10);
  }

  select(tile: number | null): void {
    this.selectedTile = tile;
    if (tile === null) this.range.clear();
  }

  render(events: CombatEvent[], now: number): void {
    const visuals = combatConfig.visuals;
    for (const event of events) {
      if (event.kind === 'skillStart') {
        const text = label(this.scene, event.link.origin.x, event.link.origin.y - 34, event.link.name, 23, '#fff3a1').setDepth(30);
        this.skillFlashes.push({ link: event.link, text, expires: now + skillConfigs[event.skillId].flashDuration });
      }
      if (event.kind === 'attack') this.effects.push({ event, expires: now + visuals.attackEffectMs });
      if (event.kind === 'heroAttack') this.heroEffects.push({ event, expires: now + visuals.attackEffectMs });
      if (event.kind === 'hit') this.flashes.set(event.enemyId, now + visuals.hitFlashMs);
      if (event.kind === 'kill') {
        const text = label(this.scene, event.position.x, event.position.y - 30, `+$${event.reward}`, 22, '#42693b').setDepth(15);
        this.rewards.push({ text, expires: now + visuals.rewardMs, y: event.position.y - 30 });
      }
    }
    this.graphics.clear();
    this.skillFlashes = this.skillFlashes.filter(flash => {
      if (flash.expires <= now || !this.battle.isHeroLinkValid(flash.link)) { flash.text.destroy(); return false; }
      flash.text.setAlpha(0.4 + 0.6 * Math.abs(Math.cos((flash.expires - now) / 55)));
      return true;
    });
    this.range.clear();
    const links = this.battle.heroLinks;
    for (const [key, text] of this.heroLevels) {
      if (!links.some(link => link.key === key)) { text.destroy(); this.heroLevels.delete(key); }
    }
    for (const link of links) {
      let text = this.heroLevels.get(link.key);
      if (!text) {
        text = label(this.scene, link.origin.x, link.origin.y + 15, '', 12, '#685528').setDepth(12);
        this.heroLevels.set(link.key, text);
      }
      text.setText(`Lv.${link.level}`);
      const width = this.battle.map.cellSize * 2 - 12;
      const x = link.origin.x - width / 2;
      const y = link.origin.y + this.battle.map.cellSize / 2 - 5;
      this.graphics.fillStyle(0xd6ccb2);
      this.graphics.fillRect(x, y, width, 3);
      this.graphics.fillStyle(heroVisuals.color);
      this.graphics.fillRect(x, y, width * link.currentExp / heroExpRequired(link.level), 3);
    }
    if (this.selectedTile !== null) {
      const unit = this.battle.board.tiles[this.selectedTile]?.unit;
      const link = this.battle.heroLinks.find(link => link.leftIndex === this.selectedTile || link.rightIndex === this.selectedTile);
      if (isUnit(unit) || link) {
        const point = link?.origin ?? this.battle.map.cells[this.selectedTile]!;
        const radius = isUnit(unit) ? getCombatStats(unit).range : heroCombat.range;
        const color = isUnit(unit) ? visuals.attackColors[unit.type] : heroVisuals.color;
        this.range.fillStyle(color, 0.1);
        this.range.fillCircle(point.x, point.y, radius);
        this.range.lineStyle(2, color, 0.6);
        this.range.strokeCircle(point.x, point.y, radius);
      } else this.selectedTile = null;
    }
    for (const [id, expires] of this.flashes) {
      if (expires <= now || !this.battle.enemies.some(enemy => enemy.id === id)) this.flashes.delete(id);
    }
    for (const enemy of this.battle.enemies) {
      this.graphics.fillStyle(this.flashes.has(enemy.id) ? visuals.hitColor : visuals.enemyColor);
      this.graphics.fillCircle(enemy.x, enemy.y, visuals.enemyRadius);
      this.graphics.lineStyle(2, 0x784139);
      this.graphics.strokeCircle(enemy.x, enemy.y, visuals.enemyRadius);
      const barWidth = 40;
      const barY = enemy.y - visuals.enemyRadius - 12;
      this.graphics.fillStyle(0x714d43);
      this.graphics.fillRect(enemy.x - barWidth / 2, barY, barWidth, 6);
      this.graphics.fillStyle(0x83b06f);
      this.graphics.fillRect(enemy.x - barWidth / 2, barY, barWidth * enemy.hp / enemy.maxHp, 6);
    }
    this.effects = this.effects.filter(({ event, expires }) =>
      expires > now && this.battle.isAttackerValid(event.tileIndex, event.unit, event.level));
    for (const { event, expires } of this.effects) {
      const alpha = (expires - now) / visuals.attackEffectMs;
      const color = visuals.attackColors[event.type];
      if (event.type === '骑') {
        this.graphics.lineStyle(5, color, alpha);
        this.graphics.strokeCircle(event.origin.x, event.origin.y, event.range);
      } else if (event.type !== '弓') {
        if (event.type === '枪') {
          this.graphics.lineStyle(combatConfig.spearWidth, color, alpha * 0.18);
          this.graphics.lineBetween(event.origin.x, event.origin.y, event.end.x, event.end.y);
        }
        this.graphics.lineStyle(event.type === '刀' ? 5 : 3, color, alpha);
        this.graphics.lineBetween(event.origin.x, event.origin.y, event.end.x, event.end.y);
      }
    }
    this.heroEffects = this.heroEffects.filter(({ event, expires }) => expires > now && this.battle.isHeroLinkValid(event.link));
    for (const { event, expires } of this.heroEffects) {
      this.graphics.lineStyle(3, heroVisuals.color, (expires - now) / visuals.attackEffectMs);
      this.graphics.lineBetween(event.link.origin.x, event.link.origin.y, event.end.x, event.end.y);
    }
    for (const arrow of this.battle.projectiles) {
      this.graphics.fillStyle(visuals.attackColors.弓);
      this.graphics.fillCircle(arrow.x, arrow.y, 5);
    }
    this.rewards = this.rewards.filter(reward => {
      if (reward.expires <= now) { reward.text.destroy(); return false; }
      const remaining = (reward.expires - now) / visuals.rewardMs;
      reward.text.setY(boardToScreen(0, reward.y - (1 - remaining) * 30).y).setAlpha(remaining);
      return true;
    });
  }
}

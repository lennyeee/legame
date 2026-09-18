import Phaser from 'phaser';
import { isUnit } from '../systems/items';
import { combatConfig, getCombatStats } from '../config/combat';
import type { AttackEffect, CombatEvent } from '../combat/CombatSimulation';
import { CombatSimulation } from '../combat/CombatSimulation';
import { label } from './text';

export class CombatView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly range: Phaser.GameObjects.Graphics;
  private readonly flashes = new Map<number, number>();
  private effects: { event: AttackEffect; expires: number }[] = [];
  private rewards: { text: Phaser.GameObjects.Text; expires: number; y: number }[] = [];
  private selectedTile: number | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly battle: CombatSimulation) {
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
      if (event.kind === 'attack') this.effects.push({ event, expires: now + visuals.attackEffectMs });
      if (event.kind === 'hit') this.flashes.set(event.enemyId, now + visuals.hitFlashMs);
      if (event.kind === 'kill') {
        const text = label(this.scene, event.position.x, event.position.y - 30, `+$${event.reward}`, 22, '#42693b').setDepth(15);
        this.rewards.push({ text, expires: now + visuals.rewardMs, y: event.position.y - 30 });
      }
    }
    this.graphics.clear();
    this.range.clear();
    if (this.selectedTile !== null) {
      const unit = this.battle.board.tiles[this.selectedTile]?.unit;
      if (isUnit(unit)) {
        const point = this.battle.map.cells[this.selectedTile]!;
        const radius = getCombatStats(unit).range;
        this.range.fillStyle(visuals.attackColors[unit.type], 0.1);
        this.range.fillCircle(point.x, point.y, radius);
        this.range.lineStyle(2, visuals.attackColors[unit.type], 0.6);
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
    for (const arrow of this.battle.projectiles) {
      this.graphics.fillStyle(visuals.attackColors.弓);
      this.graphics.fillCircle(arrow.x, arrow.y, 5);
    }
    this.rewards = this.rewards.filter(reward => {
      if (reward.expires <= now) { reward.text.destroy(); return false; }
      const remaining = (reward.expires - now) / visuals.rewardMs;
      reward.text.setY(reward.y - (1 - remaining) * 30).setAlpha(remaining);
      return true;
    });
  }
}

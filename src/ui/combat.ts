import Phaser from 'phaser';
import { combatConfig } from '../config/combat';
import type { AttackEffect, CombatEvent } from '../combat/CombatSimulation';
import { CombatSimulation } from '../combat/CombatSimulation';
import { label } from './text';
import { heroVisuals, heroExpRequired, getHeroDefinition } from '../config/heroes';
import { skillConfigs } from '../config/skills';
import type { HeroLink } from '../systems/heroActivation';
import { boardDisplayScene, boardProjection } from './boardDisplay';
import type { DisplaySide } from './boardDisplay';
import { boardDisplay } from '../config/layout';
import { visualAssets } from '../config/visualAssets';

export class CombatView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly range: Phaser.GameObjects.Graphics;
  private readonly uprightBars: Phaser.GameObjects.Graphics | null;
  private readonly enemyImages = new Map<number, { sprite: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Ellipse }>();
  private readonly flashes = new Map<number, number>();
  private effects: { event: AttackEffect; expires: number }[] = [];
  private heroEffects: { event: Extract<CombatEvent, { kind: 'heroAttack' }>; expires: number }[] = [];
  private rewards: { text: Phaser.GameObjects.Text; expires: number; y: number }[] = [];
  private selectedTile: number | null = null;
  private readonly heroLevels = new Map<string, Phaser.GameObjects.Text>();
  private skillFlashes: { link: HeroLink; text: Phaser.GameObjects.Text; expires: number }[] = [];
  private skillAreas: { link:HeroLink; expires:number; radius:number; sword:boolean }[] = [];
  private readonly projection;
  private readonly showHeroExp: boolean;
  private readonly screenScene: Phaser.Scene;

  constructor(private readonly scene: Phaser.Scene, private readonly battle: CombatSimulation,
    side: DisplaySide = 'bottom') {
    this.screenScene = scene;
    this.projection = boardProjection(battle.map, scene.scale?.width ?? 750, side);
    this.showHeroExp = side === 'bottom';
    // 血条是阅读方向固定的 HUD，不能随上半场的几何图形一起翻转。
    this.uprightBars = scene.add.graphics().setDepth(13);
    this.scene = boardDisplayScene(scene, battle.map, side);
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
        const config=skillConfigs[event.skillId],effect=config.effectByLevel[event.link.level-1]!;
        this.skillAreas.push({link:event.link,expires:now+(effect.windup??600),radius:effect.radius??70,sword:config.behavior==='sword'});
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
    this.uprightBars?.clear();
    const liveEnemyIds = new Set(this.battle.enemies.map(enemy => enemy.id));
    for (const [id, view] of this.enemyImages) {
      if (liveEnemyIds.has(id)) continue;
      view.sprite.destroy(); view.shadow.destroy(); this.enemyImages.delete(id);
    }
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
      text.setText(`Lv.${link.level}${link.focus ? ` 连${link.focus.stacks}` : ''}`);
      if (!this.showHeroExp) continue;
      const width = this.battle.map.cellSize * 2 - 12;
      const x = link.origin.x - width / 2;
      const y = link.origin.y + this.battle.map.cellSize / 2 - 5;
      this.graphics.fillStyle(0xd6ccb2);
      this.graphics.fillRect(x, y, width, 3);
      this.graphics.fillStyle(heroVisuals.color);
      this.graphics.fillRect(x, y, width * link.currentExp / heroExpRequired(link.level), 3);
    }
    if (this.selectedTile !== null) {
      const snapshot = this.battle.getUnitCombatSnapshot(this.selectedTile);
      if (snapshot) {
        const point = snapshot.kind === 'hero'
          ? (snapshot.subject as HeroLink).origin : this.battle.map.cells[this.selectedTile]!;
        const color = snapshot.kind === 'soldier'
          ? visuals.attackColors[(snapshot.subject as import('../systems/items').Unit).type] : heroVisuals.color;
        this.range.fillStyle(color, 0.1);
        this.range.fillCircle(point.x, point.y, snapshot.rangePx);
        this.range.lineStyle(2, color, 0.6);
        this.range.strokeCircle(point.x, point.y, snapshot.rangePx);
      } else this.selectedTile = null;
    }
    for (const [id, expires] of this.flashes) {
      if (expires <= now || !this.battle.enemies.some(enemy => enemy.id === id)) this.flashes.delete(id);
    }
    this.skillAreas=this.skillAreas.filter(area=>area.expires>now&&this.battle.isHeroLinkValid(area.link));
    for(const area of this.skillAreas) {
      this.graphics.lineStyle(4,area.sword?0xd7b656:0x88a8b1,.7);
      if(area.sword) {
        const path=this.battle.map.path;
        for(let i=1;i<path.length;i++)this.graphics.lineBetween(path[i-1]!.x,path[i-1]!.y,path[i]!.x,path[i]!.y);
        for(const enemy of this.battle.enemies)this.graphics.lineBetween(enemy.x,enemy.y-28,enemy.x,enemy.y+12);
      } else this.graphics.strokeCircle(area.link.origin.x,area.link.origin.y,area.radius);
    }
    for(const [ally] of this.battle.statuses.allies) {
      const point='origin' in ally ? ally.origin : this.battle.map.cells[this.battle.board.tiles.findIndex(t=>t.unit===ally)];
      if(point){this.graphics.lineStyle(3,0xe2b351,.8);this.graphics.strokeCircle(point.x,point.y,26);}
    }
    for (const enemy of this.battle.enemies) {
      let view = this.enemyImages.get(enemy.id);
      if (!view) {
        const shadow = this.screenScene.add.ellipse(0, 0, 37 * boardDisplay.scale, 9 * boardDisplay.scale,
          0x292720, 0.2).setDepth(10);
        const sprite = this.screenScene.add.image(0, 0, visualAssets.enemy.key).setDepth(11);
        sprite.setScale(visualAssets.enemy.width * boardDisplay.scale / sprite.width);
        view = { sprite, shadow };
        this.enemyImages.set(enemy.id, view);
      }
      const point = this.projection.point(enemy);
      view.sprite.setPosition(point.x, point.y - 5 * boardDisplay.scale)
        .setAlpha(this.flashes.has(enemy.id) ? 0.55 : 1);
      view.shadow.setPosition(point.x, point.y + 31 * boardDisplay.scale);
      const statuses=this.battle.statuses.enemies.get(enemy)??[];
      if(statuses.length){this.graphics.lineStyle(3,statuses.some(e=>e.kind==='stun')?0xe4c860:0x66996b,.9);
        this.graphics.strokeCircle(enemy.x,enemy.y,visuals.enemyRadius+5);}
      const width = 40 * boardDisplay.scale;
      const height = 6 * boardDisplay.scale;
      const y = point.y - (visualAssets.enemy.width / 2 + 5) * boardDisplay.scale;
      this.uprightBars?.fillStyle(0x714d43).fillRect(point.x - width / 2, y, width, height);
      this.uprightBars?.fillStyle(0x83b06f).fillRect(point.x - width / 2, y,
        width * enemy.hp / enemy.maxHp, height);
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
      const def=getHeroDefinition(event.link.heroId);
      if(def.attackMode==='splash')this.graphics.strokeCircle(event.end.x,event.end.y,def.combat.splashRadius);
      if(def.attackMode==='selfArea')this.graphics.strokeCircle(event.link.origin.x,event.link.origin.y,def.baseAttackRange);
    }
    for (const arrow of this.battle.projectiles) {
      this.graphics.fillStyle(visuals.attackColors.弓);
      this.graphics.fillCircle(arrow.x, arrow.y, 5);
    }
    this.rewards = this.rewards.filter(reward => {
      if (reward.expires <= now) { reward.text.destroy(); return false; }
      const remaining = (reward.expires - now) / visuals.rewardMs;
      reward.text.setY(this.projection.point({ x: 0, y: reward.y }).y
        - (1 - remaining) * 30 * boardDisplay.scale).setAlpha(remaining);
      return true;
    });
  }
}

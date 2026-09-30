import Phaser from 'phaser';
import { formatHeroEffect, heroEncyclopediaEntry, heroEncyclopediaIds } from '../content/heroEncyclopedia';
import { worldLore } from '../content/heroLore';
import type { HeroId } from '../config/heroes';
import { label } from '../ui/text';
import { audioForScene } from '../audio/AudioManager';

type Page = 'heroes' | 'world' | HeroId;
const VIEW_TOP = 182;
const VIEW_BOTTOM = 1230;
const VIEW_HEIGHT = VIEW_BOTTOM - VIEW_TOP;

export class HeroEncyclopediaScene extends Phaser.Scene {
  page: Page = 'heroes';
  scrollOffset = 0;
  maxScroll = 0;
  private content?: Phaser.GameObjects.Container;
  private clip?: Phaser.GameObjects.Graphics;
  private touchY: number | null = null;

  constructor() { super('HeroEncyclopediaScene'); }

  create(): void {
    audioForScene(this).menu(this);
    this.input.on('wheel', this.onWheel, this);
    this.input.on('pointerdown', this.onTouchDown, this);
    this.input.on('pointermove', this.onTouchMove, this);
    this.input.on('pointerup', this.onTouchUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('wheel', this.onWheel, this);
      this.input.off('pointerdown', this.onTouchDown, this);
      this.input.off('pointermove', this.onTouchMove, this);
      this.input.off('pointerup', this.onTouchUp, this);
      this.touchY = null;
    });
    this.showPage('heroes');
  }

  showPage(page: Page): void {
    this.page = page;
    this.scrollOffset = 0;
    this.maxScroll = 0;
    this.touchY = null;
    this.children.removeAll(true);
    this.content = undefined;
    this.clip = undefined;
    this.add.rectangle(375, 667, 750, 1334, 0xf7f3e8);
    this.add.rectangle(375, 84, 750, 150, 0xeee9dc);
    const back = this.add.rectangle(76, 83, 104, 62, 0x697e67).setInteractive({ useHandCursor: true });
    label(this, 76, 83, '返回', 23, '#fffaf0');
    back.on('pointerdown', () => {
      audioForScene(this).uiClick();
      if (this.page === 'heroes' || this.page === 'world') this.scene.start('ReadyScene');
      else this.showPage('heroes');
    });
    label(this, 375, 78, page !== 'world' && page !== 'heroes' ? heroEncyclopediaEntry(page).hero.name : '档案', 38);
    this.showTabs(page === 'world' ? 'world' : 'heroes');
    if (page === 'heroes') this.showList();
    else this.showScrollable(page);
  }

  private showTabs(active: 'world' | 'heroes'): void {
    const tabs = [
      { key: 'world' as const, title: '世界', x: 245 },
      { key: 'heroes' as const, title: '武将', x: 505 },
    ];
    tabs.forEach(tab => {
      const selected = tab.key === active;
      const shape = this.add.rectangle(tab.x, 157, 236, 52, selected ? 0x697e67 : 0xe4e0d2)
        .setStrokeStyle(1, 0xb6bbab).setInteractive({ useHandCursor: true });
      label(this, tab.x, 157, tab.title, 23, selected ? '#fffaf0' : '#4c6651');
      shape.on('pointerdown', () => { audioForScene(this).uiClick(); this.showPage(tab.key); });
    });
  }

  private showList(): void {
    label(this, 375, 246, '他们都是为了乐而来的。', 24, '#6d756b');
    heroEncyclopediaIds.forEach((id, index) => {
      const entry = heroEncyclopediaEntry(id);
      const x = index % 2 === 0 ? 205 : 545;
      const y = 360 + Math.floor(index / 2) * 174;
      const card = this.add.rectangle(x, y, 310, 148, 0xfffcf4)
        .setStrokeStyle(3, entry.hero.cardColor === 'gold' ? 0xb49a50 : 0x9b83ae)
        .setInteractive({ useHandCursor: true });
      label(this, x, y - 37, entry.hero.name, 32);
      label(this, x, y + 5, `「${entry.lore.title}」`, 18, '#6d756b').setWordWrapWidth(280, true);
      label(this, x, y + 48, `${entry.recipe}  ·  ${entry.quality}`, 19, '#627863');
      card.on('pointerdown', () => { audioForScene(this).uiClick(); this.showPage(id); });
    });
    label(this, 375, 1200, '选择一位武将查看人物小传与战斗档案', 19, '#8b8272');
  }

  private showScrollable(page: Exclude<Page, 'heroes'>): void {
    this.clip = this.add.graphics();
    this.clip.fillStyle(0xffffff).fillRect(36, VIEW_TOP, 678, VIEW_HEIGHT);
    this.clip.setVisible(false);
    this.content = this.add.container(0, 0);
    this.content.setMask(this.clip.createGeometryMask());
    let y = VIEW_TOP + 22;
    const addText = (value: string, size = 23, color = '#323b32', gap = 20): void => {
      const text = this.add.text(72, y, value, {
        fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, color,
        wordWrap: { width: 606, useAdvancedWrap: true }, lineSpacing: 9,
      }).setOrigin(0, 0);
      this.content!.add(text);
      y += text.height + gap;
    };
    if (page === 'world') {
      addText('外星人真正的目标', 27, '#6d756b', 18);
      addText('天选之子', 39, '#4c6651', 28);
      worldLore.slice(0, 4).forEach(paragraph => addText(paragraph, 23, '#323b32', 25));
      const finalQuote = worldLore[4]?.match(/「(.+)」/)?.[1];
      if (finalQuote) addText(`「${finalQuote}」`, 29, '#4c6651', 26);
      addText('乐目前没有战斗能力。朋友们正在保护他，而我们的目标是阻止外星人击杀乐。', 22, '#323b32', 12);
    } else {
      const { hero, lore, recipe, quality, attackMode, range, levels, skill } = heroEncyclopediaEntry(page);
      const portrait = this.add.rectangle(375, y + 104, 604, 208, 0xe7e4d7)
        .setStrokeStyle(2, hero.cardColor === 'gold' ? 0xb49a50 : 0x9b83ae);
      this.content.add(portrait);
      const portraitText = label(this, 375, y + 104, hero.name, 54);
      this.content.add(portraitText);
      y += 250;
      addText(`「${lore.title}」`, 31, '#4c6651', 12);
      addText(`${quality}品质  ·  战斗定位：${attackMode}`, 21, '#6d756b', 25);
      lore.facts.forEach(([key, value]) => addText(`${key}：${value}`, 22, '#323b32', 10));
      y += 20;
      addText('—— 人物小传 ——', 28, '#4c6651', 26);
      lore.biography.forEach(paragraph => addText(paragraph, 23, '#323b32', 20));
      y += 20;
      addText('—— 战斗档案 ——', 28, '#4c6651', 25);
      addText(`合成配方：${recipe}`, 23);
      addText(`普通攻击：${attackMode}`, 23);
      addText(`攻击范围：${range} px`, 23);
      addText(`技能：${hero.skillName}`, 23);
      addText(hero.description, 22, '#566455', 24);
      if (skill.kind === 'active') {
        addText(`技能冷却 Lv1～5：${skill.cooldownByLevel.map(ms => `${(ms / 1000).toFixed(2).replace(/\.?0+$/, '')}秒`).join(' / ')}`, 21);
        skill.effectByLevel.forEach((effect, index) => addText(`Lv.${index + 1}：${formatHeroEffect(effect)}`, 19, '#566455', 8));
      } else if (skill.kind === 'passive' && skill.effectByLevel) {
        skill.effectByLevel.forEach((effect, index) => addText(`Lv.${index + 1}：${formatHeroEffect(effect)}`, 19, '#566455', 8));
      }
      y += 10;
      addText('等级       攻击       攻速（次/秒）', 22, '#4c6651', 10);
      levels.forEach(row => addText(`Lv.${row.level}          ${row.damage}             ${row.attacksPerSecond.toFixed(2)}`, 21, '#323b32', 9));
    }
    this.maxScroll = Math.max(0, y + 35 - VIEW_BOTTOM);
    if (this.maxScroll > 0) label(this, 375, 1260, '上下滑动查看更多', 18, '#8b8272');
  }

  scrollBy(delta: number): void {
    if (!this.content) return;
    this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + delta, 0, this.maxScroll);
    this.content.setY(-this.scrollOffset);
  }

  private onWheel(_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number): void {
    this.scrollBy(dy);
  }
  private onTouchDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.y >= VIEW_TOP && pointer.y <= VIEW_BOTTOM && this.page !== 'heroes') this.touchY = pointer.y;
  }
  private onTouchMove(pointer: Phaser.Input.Pointer): void {
    if (this.touchY === null || !pointer.isDown) return;
    this.scrollBy(this.touchY - pointer.y);
    this.touchY = pointer.y;
  }
  private onTouchUp(): void { this.touchY = null; }
}

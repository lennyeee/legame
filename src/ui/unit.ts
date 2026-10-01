import Phaser from 'phaser';
import { getLevelColor, unitDisplayNames } from '../config/units';
import type { DragItem } from '../systems/board';
import { label } from './text';
import { isUnit, isFarmer } from '../systems/items';
import { visualAssets } from '../config/visualAssets';
import type { Unit } from '../systems/items';

export class UnitView {
  readonly root: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly name: Phaser.GameObjects.Text;
  private readonly level: Phaser.GameObjects.Text;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly levelBadge: Phaser.GameObjects.Rectangle;
  private readonly sprite: Phaser.GameObjects.Image;
  private spriteType: Unit['type'] | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, size: number) {
    this.background = scene.add.rectangle(0, 0, size, size, 0xfffcf4)
      .setStrokeStyle(2, 0x9aa58c);
    this.name = label(scene, 0, -8, '', 30);
    this.level = label(scene, 0, Math.min(20, size / 2 - 9), '', 17);
    this.shadow = scene.add.ellipse(0, 23, 43, 9, 0x292720, 0.16).setVisible(false);
    this.levelBadge = scene.add.rectangle(0, Math.min(25, size / 2 - 9), 40, 17, 0xfffcf4, 0.86)
      .setVisible(false);
    this.sprite = scene.add.image(0, -8, visualAssets.units.刀.key).setVisible(false);
    this.root = scene.add.container(x, y, [this.background, this.shadow,
      this.sprite, this.name, this.levelBadge, this.level]);
    this.root.setVisible(false);
  }

  show(item: DragItem | null, linked = false, sleeping = false): void {
    this.root.setVisible(item !== null);
    this.background.setVisible(!linked);
    if (!item) return;
    const ordinary = isUnit(item);
    this.background.setFillStyle(getLevelColor(ordinary || isFarmer(item) ? item.level : 1));
    this.shadow.setVisible(ordinary);
    this.levelBadge.setVisible(ordinary);
    this.sprite.setVisible(ordinary);
    if (ordinary && this.spriteType !== item.type) {
      const asset = visualAssets.units[item.type];
      this.sprite.setTexture(asset.key);
      this.sprite.setScale(asset.width / this.sprite.width); // One scale preserves each PNG's aspect ratio.
      this.spriteType = item.type;
    }
    this.name.setText(item === '铲' ? item : ordinary ? unitDisplayNames[item.type] : item.type)
      .setY(ordinary ? -8 : isFarmer(item) ? 0 : sleeping ? -2 : -7);
    this.name.setVisible(!ordinary);
    this.name.setFontSize(ordinary || item === '铲' ? 30 : 24);
    this.name.setScale(Math.min(1, (this.background.width - 8) / Math.max(this.name.width, 1)));
    this.level.setText(item !== '铲' && !linked ? `Lv.${item.level}` : '');
    this.level.setY(ordinary ? this.levelBadge.y : Math.min(20, this.background.height / 2 - 9));
    this.level.setFontSize(ordinary ? 13 : sleeping ? 12 : 17);
    this.level.setScale(Math.min(1, (this.background.width - 8) / Math.max(this.level.width, 1)));
  }
}

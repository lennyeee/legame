import Phaser from 'phaser';
import { getLevelColor } from '../config/units';
import type { DragItem } from '../systems/board';
import { label } from './text';
import { isUnit, isFarmer } from '../systems/items';

export class UnitView {
  readonly root: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly name: Phaser.GameObjects.Text;
  private readonly level: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, size: number) {
    this.background = scene.add.rectangle(0, 0, size, size, 0xfffcf4)
      .setStrokeStyle(2, 0x9aa58c);
    this.name = label(scene, 0, -8, '', 30);
    this.level = label(scene, 0, Math.min(20, size / 2 - 9), '', 17);
    this.root = scene.add.container(x, y, [this.background, this.name, this.level]);
    this.root.setVisible(false);
  }

  show(item: DragItem | null, linked = false, sleeping = false): void {
    this.root.setVisible(item !== null);
    this.background.setVisible(!linked);
    if (!item) return;
    const ordinary = isUnit(item);
    this.background.setFillStyle(getLevelColor(ordinary || isFarmer(item) ? item.level : 1));
    this.name.setText(item === '铲' ? item : item.type).setY(ordinary ? -8 : isFarmer(item) ? 0 : sleeping ? -2 : -7);
    this.name.setFontSize(ordinary || item === '铲' ? 30 : 24);
    this.name.setScale(Math.min(1, (this.background.width - 8) / Math.max(this.name.width, 1)));
    this.level.setText(item !== '铲' && !linked ? `Lv.${item.level}` : '');
    this.level.setFontSize(sleeping ? 12 : 17);
    this.level.setScale(Math.min(1, (this.background.width - 8) / Math.max(this.level.width, 1)));
  }
}

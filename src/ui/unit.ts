import Phaser from 'phaser';
import { getLevelColor } from '../config/units';
import type { DragItem } from '../systems/board';
import { label } from './text';

export class UnitView {
  readonly root: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly name: Phaser.GameObjects.Text;
  private readonly level: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, size: number) {
    this.background = scene.add.rectangle(0, 0, size, size, 0xfffcf4)
      .setStrokeStyle(2, 0x9aa58c);
    this.name = label(scene, 0, -8, '', 30);
    this.level = label(scene, 0, 20, '', 17);
    this.root = scene.add.container(x, y, [this.background, this.name, this.level]);
    this.root.setVisible(false);
  }

  show(item: DragItem | null): void {
    this.root.setVisible(item !== null);
    if (!item) return;
    const shovel = item === '铲';
    this.background.setFillStyle(getLevelColor(shovel ? 1 : item.level));
    this.name.setText(shovel ? '铲' : item.type).setY(shovel ? 0 : -8);
    this.level.setText(shovel ? '' : `Lv.${item.level}`);
    this.level.setScale(Math.min(1, (this.background.width - 8) / Math.max(this.level.width, 1)));
  }
}

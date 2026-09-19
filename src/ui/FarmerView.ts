import type Phaser from 'phaser';
import type { BoardMap } from '../config/maps';
import type { Farmer } from '../systems/items';
import { FarmerProduction } from '../systems/FarmerProduction';
import { boardToScreen } from '../config/layout';
import { label } from './text';

export class FarmerView {
  private readonly badges = new Map<Farmer, { id: number; box: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }>();
  constructor(private readonly scene: Phaser.Scene, private readonly map: BoardMap,
    private readonly production: FarmerProduction, private readonly canCollect: () => boolean,
    private readonly onCollect: () => void) {}

  refresh(): void {
    for (const [farmer, badge] of this.badges) {
      if (this.production.states.get(farmer)?.reward?.id !== badge.id) {
        badge.box.destroy();badge.text.destroy();this.badges.delete(farmer);
      }
    }
    for (const [farmer, state] of this.production.states) {
      if (!state.reward) continue;
      const cell = this.map.cells[state.tileIndex]!;
      const point = boardToScreen(cell.x, cell.y - 26);
      let badge = this.badges.get(farmer);
      if (!badge) {
        const id = state.reward.id;
        const box = this.scene.add.rectangle(point.x, point.y, 64, 28, 0xf3d975)
          .setStrokeStyle(2, 0x987b32).setDepth(40).setInteractive({ useHandCursor: true });
        const text = label(this.scene, point.x, point.y, `$${state.reward.amount}`, 21, '#514a40').setDepth(41);
        box.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation(); // 不将领取同一次按下交给单位拖拽。
          if (this.canCollect() && this.production.collect(farmer, id)) { this.refresh();this.onCollect(); }
        });
        badge = { id, box, text };this.badges.set(farmer, badge);
      }
      badge.box.setPosition(point.x, point.y);badge.text.setPosition(point.x, point.y);
    }
  }

  destroy(): void {
    for (const badge of this.badges.values()) { badge.box.destroy();badge.text.destroy(); }
    this.badges.clear();
  }
}

import Phaser from 'phaser';
import { GAME_VERSION } from '../config/game';
import { label } from '../ui/text';
import { READY_BACKGROUND_COLOR } from '../config/ready';
import { inventoryFromLoadout, createLoadout } from '../systems/equipment';
import type { InventoryItem, Loadout } from '../systems/equipment';

// 仅静态预览，不创建钱包、棋盘运行状态、输入控制器、战斗或计时器。
export class ReadyScene extends Phaser.Scene {
  startState: 'READY' | 'STARTING' | 'RUNNING' = 'READY';
  private inventory: InventoryItem[] = [];
  private openingItems = false;

  constructor() { super('ReadyScene'); }

  create(data: { inventory?: InventoryItem[]; loadout?: Loadout } = {}): void {
    this.inventory = data.inventory ?? inventoryFromLoadout(data.loadout);
    this.openingItems = false;
    this.startState = 'READY';
    this.add.rectangle(375, 667, 750, 1334, READY_BACKGROUND_COLOR).setInteractive();
    label(this, 375, 565, '乐 GAME', 58, '#fffaf0');
    const button = this.add.rectangle(375, 765, 330, 86, 0x697e67)
      .setInteractive({ useHandCursor: true });
    label(this, 375, 765, '开始游戏', 30, '#fffaf0');
    const itemsButton = this.add.rectangle(375, 885, 250, 72, 0x697e67).setInteractive({ useHandCursor: true });
    label(this, 375, 885, '道具', 28, '#fffaf0');
    itemsButton.on('pointerdown', () => {
      if (this.startState !== 'READY' || this.openingItems) return;
      this.openingItems = true;
      this.scene.start('ItemsScene', { inventory: this.inventory });
    });
    label(this, 730, 1314, `v${GAME_VERSION}`, 16, '#fffaf0').setOrigin(1, 1).setAlpha(0.4);
    button.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.requestStartGame();
    });
  }

  requestStartGame(): void {
    if (this.startState !== 'READY' || this.openingItems) return;
    this.startState = 'STARTING'; // 在 Phaser 下一帧切场景前，也阻止重复启动请求。
    // 未来乐入场动画插在这里，完成后调用 startMatch；不要提前创建对局计时器。
    this.startMatch();
  }

  private startMatch(): void {
    if (this.startState !== 'STARTING') return;
    this.startState = 'RUNNING';
    this.scene.start('GameScene', { loadout: createLoadout(this.inventory) });
  }
}

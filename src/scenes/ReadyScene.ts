import Phaser from 'phaser';
import { GAME_VERSION } from '../config/game';
import { testMap } from '../config/maps';
import { drawBoard } from '../ui/board';
import { label } from '../ui/text';
import { createInventory, createLoadout } from '../systems/equipment';
import type { InventoryItem } from '../systems/equipment';

// 仅静态预览，不创建钱包、棋盘运行状态、输入控制器、战斗或计时器。
export class ReadyScene extends Phaser.Scene {
  startState: 'READY' | 'STARTING' | 'RUNNING' = 'READY';
  private inventory: InventoryItem[] = [];
  private openingItems = false;

  constructor() { super('ReadyScene'); }

  create(data: { inventory?: InventoryItem[] } = {}): void {
    this.inventory = data.inventory ?? createInventory();
    this.openingItems = false;
    this.startState = 'READY';
    drawBoard(this, testMap);
    for (const cell of testMap.cells) {
      this.add.rectangle(cell.x, cell.y, testMap.cellSize, testMap.cellSize,
        cell.unlocked ? 0xfffcf4 : 0xc8c0af).setStrokeStyle(2, cell.unlocked ? 0x87937d : 0xc2bcae);
      label(this, cell.x, cell.y, cell.unlocked ? '+' : '锁', 24);
    }
    this.add.rectangle(375, 667, 750, 1334, 0x191b17, 0.55).setInteractive();
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

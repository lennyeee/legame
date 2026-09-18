import Phaser from 'phaser';
import { label } from '../ui/text';

export interface PveOverlayData {
  mode: 'paused' | 'victory' | 'defeat';
  health: number;
}

// PVE 专用界面：暂停整个游戏场景，战斗规则本身不依赖暂停状态。
export class PveOverlayScene extends Phaser.Scene {
  constructor() {
    super('PveOverlayScene');
  }

  create(data: PveOverlayData): void {
    this.add.rectangle(375, 667, 750, 1334, 0x191b17, 0.65).setInteractive();
    const paused = data.mode === 'paused';
    label(this, 375, 565, paused ? '已暂停' : data.mode === 'victory' ? '胜利' : '失败', 58, '#fffaf0');
    if (data.mode === 'victory') {
      label(this, 375, 655, `乐：${'♥'.repeat(data.health)}`, 30, '#fffaf0');
    }
    const button = this.add.rectangle(375, 765, 330, 86, 0x697e67)
      .setInteractive({ useHandCursor: true });
    label(this, 375, 765, paused ? '继续游戏' : '再来一局', 30, '#fffaf0');
    let handled = false;
    button.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (handled) return;
      handled = true;
      if (paused) {
        this.scene.resume('GameScene');
        this.scene.stop();
      } else {
        // stop 完整触发旧场景 shutdown；start 重新执行 create，生成全新单局数据。
        this.scene.stop('GameScene');
        this.scene.start('GameScene');
      }
    });
  }
}

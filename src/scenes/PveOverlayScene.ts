import Phaser from 'phaser';
import { label } from '../ui/text';
import type { Loadout } from '../systems/equipment';

export interface PveOverlayData {
  mode: 'paused' | 'victory' | 'defeat';
  health: number;
  loadout?: Loadout;
}

// PVE 专用界面：暂停整个游戏场景，战斗规则本身不依赖暂停状态。
export class PveOverlayScene extends Phaser.Scene {
  constructor() {
    super('PveOverlayScene');
  }

  create(data: PveOverlayData): void {
    this.add.rectangle(375, 667, 750, 1334, 0x191b17, 0.65).setInteractive();
    const paused = data.mode === 'paused';
    const title = label(this, 375, 565, paused ? '已暂停' : data.mode === 'victory' ? '胜利' : '失败', 58, '#fffaf0');
    if (data.mode === 'victory') {
      label(this, 375, 655, `乐：${'♥'.repeat(data.health)}`, 30, '#fffaf0');
    }
    const button = this.add.rectangle(375, 765, 330, 86, 0x697e67)
      .setInteractive({ useHandCursor: true });
    const buttonText = label(this, 375, 765, paused ? '继续游戏' : '再来一局', 30, '#fffaf0');
    let handled = false;
    let confirming = false;
    // 暂停确认与结算共用同一重开入口，完整shutdown后创建新局并保留loadout。
    const restart = (): void => {
      if (handled) return;
      handled = true;
      this.scene.stop('GameScene');
      this.scene.start('GameScene', { loadout: data.loadout });
    };
    if (paused) {
      const restartButton = this.add.rectangle(375, 875, 330, 86, 0x697e67).setInteractive({ useHandCursor: true });
      const restartText = label(this, 375, 875, '重新开始', 30, '#fffaf0');
      restartButton.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (handled || confirming) return;
        confirming = true;
        title.setText('确定重新开始？');
        button.setVisible(false).disableInteractive();buttonText.setVisible(false);
        restartButton.setVisible(false).disableInteractive();restartText.setVisible(false);
        const warning = label(this, 375, 655, '当前进度将丢失。', 26, '#fffaf0');
        const cancelButton = this.add.rectangle(220, 765, 250, 86, 0x697e67).setInteractive({ useHandCursor: true });
        const cancelText = label(this, 220, 765, '取消', 28, '#fffaf0');
        const confirmButton = this.add.rectangle(530, 765, 250, 86, 0x697e67).setInteractive({ useHandCursor: true });
        const confirmText = label(this, 530, 765, '重新开始', 28, '#fffaf0');
        cancelButton.on('pointerdown', () => {
          if (handled || !confirming) return;
          confirming = false;
          [warning,cancelButton,cancelText,confirmButton,confirmText].forEach(object=>object.destroy());
          title.setText('已暂停');button.setVisible(true).setInteractive({ useHandCursor: true });buttonText.setVisible(true);
          restartButton.setVisible(true).setInteractive({ useHandCursor: true });restartText.setVisible(true);
        });
        confirmButton.on('pointerdown', () => { if (confirming) restart(); });
      });
    }
    button.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (handled || confirming) return;
      if (paused) {
        handled = true;
        this.scene.resume('GameScene');
        this.scene.stop();
      } else {
        restart();
      }
    });
  }
}

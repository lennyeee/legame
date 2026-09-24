import Phaser from 'phaser';
import { label } from '../ui/text';
import type { Loadout } from '../systems/equipment';

export interface PveOverlayData {
  mode: 'paused' | 'victory' | 'defeat' | 'draw';
  health: number;
  loadout?: Loadout;
}

// 开发期暂停/结算界面；Match已在逻辑层统一冻结双方，场景暂停只负责表现。
export class PveOverlayScene extends Phaser.Scene {
  constructor() {
    super('PveOverlayScene');
  }

  create(data: PveOverlayData): void {
    this.add.rectangle(375, 667, 750, 1334, 0x191b17, 0.65).setInteractive();
    const paused = data.mode === 'paused';
    const title = label(this, 375, 565, paused ? '已暂停' : data.mode === 'victory' ? '胜利' : data.mode === 'draw' ? '平局' : '失败', 58, '#fffaf0');
    if (data.mode === 'victory') {
      label(this, 375, 655, `乐：${'♥'.repeat(data.health)}`, 30, '#fffaf0');
    }
    const button = this.add.rectangle(375, 765, 330, 86, 0x697e67)
      .setInteractive({ useHandCursor: true });
    const buttonText = label(this, 375, 765, paused ? '继续游戏' : '再来一局', 30, '#fffaf0');
    let handled = false;
    let confirming = false;
    // 暂停确认与结算共用同一重开入口，完整shutdown后创建新局并保留loadout。
    const leaveMatch = (destination: 'GameScene' | 'ReadyScene'): void => {
      if (handled) return;
      handled = true;
      this.scene.stop('GameScene');
      this.scene.start(destination, { loadout: data.loadout });
    };
    if (paused) {
      const restartButton = this.add.rectangle(375, 875, 330, 86, 0x697e67).setInteractive({ useHandCursor: true });
      const restartText = label(this, 375, 875, '重新开始', 30, '#fffaf0');
      const homeButton = this.add.rectangle(375, 985, 330, 86, 0x697e67).setInteractive({ useHandCursor: true });
      const homeText = label(this, 375, 985, '回到主页', 30, '#fffaf0');
      const menu = [[button, buttonText], [restartButton, restartText], [homeButton, homeText]] as const;
      const confirmAction = (home: boolean) => ((_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (handled || confirming) return;
        confirming = true;
        title.setText(home ? '确定回到主页？' : '确定重新开始？');
        for (const [control, text] of menu) { control.setVisible(false).disableInteractive(); text.setVisible(false); }
        const warning = label(this, 375, 655, home ? '当前对局进度将丢失。' : '当前进度将丢失。', 26, '#fffaf0');
        const cancelButton = this.add.rectangle(220, 765, 250, 86, 0x697e67).setInteractive({ useHandCursor: true });
        const cancelText = label(this, 220, 765, '取消', 28, '#fffaf0');
        const confirmButton = this.add.rectangle(530, 765, 250, 86, 0x697e67).setInteractive({ useHandCursor: true });
        const confirmText = label(this, 530, 765, home ? '回到主页' : '重新开始', 28, '#fffaf0');
        cancelButton.on('pointerdown', () => {
          if (handled || !confirming) return;
          confirming = false;
          [warning,cancelButton,cancelText,confirmButton,confirmText].forEach(object=>object.destroy());
          title.setText('已暂停');
          for (const [control, text] of menu) { control.setVisible(true).setInteractive({ useHandCursor: true }); text.setVisible(true); }
        });
        confirmButton.on('pointerdown', () => { if (confirming) leaveMatch(home ? 'ReadyScene' : 'GameScene'); });
      });
      restartButton.on('pointerdown', confirmAction(false));
      homeButton.on('pointerdown', confirmAction(true));
    }
    button.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (handled || confirming) return;
      if (paused) {
        handled = true;
        this.scene.resume('GameScene');
        this.scene.stop();
      } else {
        leaveMatch('GameScene');
      }
    });
  }
}

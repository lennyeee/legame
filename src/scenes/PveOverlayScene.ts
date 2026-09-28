import Phaser from 'phaser';
import { label } from '../ui/text';
import type { Loadout } from '../systems/equipment';
import { resultPresentation, type ResultSnapshot } from '../match/ResultSnapshot';
import { matchCoinReward } from '../progression/PlayerProgress';
import type { RankChange } from '../progression/rank';

export interface PveOverlayData {
  mode: 'paused' | 'victory' | 'defeat' | 'draw';
  health?: number;
  snapshot?: ResultSnapshot;
  loadout?: Loadout;
  coinReward?: number;
  rankChange?: RankChange;
}

// 开发期暂停/结算界面；Match已在逻辑层统一冻结双方，场景暂停只负责表现。
export class PveOverlayScene extends Phaser.Scene {
  resultSnapshot: ResultSnapshot | null = null;
  constructor() {
    super('PveOverlayScene');
  }

  create(data: PveOverlayData): void {
    this.resultSnapshot = null;
    if (data.mode !== 'paused') {
      this.showResult(data);
      return;
    }
    this.add.rectangle(375, 667, 750, 1334, 0x191b17, 0.65).setInteractive();
    const title = label(this, 375, 565, '已暂停', 58, '#fffaf0');

    const button = this.add.rectangle(375, 765, 330, 86, 0x697e67)
      .setInteractive({ useHandCursor: true });
    const buttonText = label(this, 375, 765, '继续游戏', 30, '#fffaf0');
    let handled = false;
    let confirming = false;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { handled = true; confirming = false; });
    // 离开战斗统一停止旧场景，保留玩家 loadout。
    const leaveMatch = (rematch: boolean): void => {
      if (handled) return;
      handled = true;
      this.scene.stop('GameScene');
      this.scene.start('ReadyScene', { loadout: data.loadout, autoMatch: rematch });
    };
    const homeButton = this.add.rectangle(375, 875, 330, 86, 0x697e67).setInteractive({ useHandCursor: true });
    const homeText = label(this, 375, 875, '返回主页', 30, '#fffaf0');
    const menu = [[button, buttonText], [homeButton, homeText]] as const;
    const confirmAction = ((_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (handled || confirming) return;
      confirming = true;
      title.setText('确定返回主页？');
      for (const [control, text] of menu) { control.setVisible(false).disableInteractive(); text.setVisible(false); }
      const warning = label(this, 375, 655, '当前对局进度将丢失。', 26, '#fffaf0');
      const cancelButton = this.add.rectangle(220, 765, 250, 86, 0x697e67).setInteractive({ useHandCursor: true });
      const cancelText = label(this, 220, 765, '取消', 28, '#fffaf0');
      const confirmButton = this.add.rectangle(530, 765, 250, 86, 0x697e67).setInteractive({ useHandCursor: true });
      const confirmText = label(this, 530, 765, '返回主页', 28, '#fffaf0');
      cancelButton.on('pointerdown', () => {
        if (handled || !confirming) return;
        confirming = false;
        [warning,cancelButton,cancelText,confirmButton,confirmText].forEach(object=>object.destroy());
        title.setText('已暂停');
        for (const [control, text] of menu) { control.setVisible(true).setInteractive({ useHandCursor: true }); text.setVisible(true); }
      });
      confirmButton.on('pointerdown', () => { if (confirming) leaveMatch(false); });
    });
    homeButton.on('pointerdown', confirmAction);
    button.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (handled || confirming) return;
      handled = true;
      this.scene.resume('GameScene');
      this.scene.stop();
    });
  }

  private showResult(data: PveOverlayData): void {
    if (!data.snapshot) throw new Error('Result requires a completed Match snapshot');
    const snapshot = data.snapshot;
    this.resultSnapshot = snapshot;
    let handled = false;
    // 立即拦截输入，但400ms内不改变最终战场画面。
    this.add.rectangle(375, 667, 750, 1334, 0x353d36, 0).setInteractive();
    const timer = this.time.delayedCall(resultPresentation.delayMs, () => {
      if (handled) return;
      handled = true;
      this.scene.stop('GameScene');
      this.scene.start('ResultScene', Object.freeze({ snapshot, coinReward: data.coinReward ?? matchCoinReward(snapshot), rankChange: data.rankChange }));
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      handled = true;
      timer.remove(false);
      this.resultSnapshot = null;
    });
  }
}

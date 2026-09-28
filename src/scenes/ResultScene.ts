import Phaser from 'phaser';
import { label } from '../ui/text';
import type { ResultSnapshot } from '../match/ResultSnapshot';

export interface ResultData { readonly snapshot: ResultSnapshot; readonly coinReward: number }
// 不拥有Match，也不提交永久奖励；只展示已完成的只读结算数据。
export class ResultScene extends Phaser.Scene {
  resultSnapshot: ResultSnapshot | null = null;
  constructor() { super('ResultScene'); }
  create(data: ResultData): void {
    const snapshot = Object.freeze({ ...data.snapshot });
    this.resultSnapshot = snapshot;
    let handled = false;
    this.add.rectangle(375, 667, 750, 1334, 0xf7f3e8);
    label(this, 375, 250, snapshot.result === 'win' ? '胜利' : snapshot.result === 'lose' ? '失败' : '平局', 64);
    label(this, 375, 410, `第 ${snapshot.waveReached} 波`, 32);
    label(this, 375, 490, `击杀 ${snapshot.playerKills}`, 30);
    label(this, 375, 570, `来财 ${snapshot.playerSuccessfulRecruits} 次`, 30);
    label(this, 375, 650, `剩余 $${snapshot.playerRemainingMoney}`, 30);
    if (snapshot.result === 'win') label(this, 375, 730, `乐：${'♥'.repeat(snapshot.playerRemainingHp)}`, 30);
    label(this, 375, 840, `本局金币 +${data.coinReward}`, 36, '#8c6b27');
    const leave = (rematch: boolean): void => {
      if (handled) return;
      handled = true;
      this.scene.start('ReadyScene', { autoMatch: rematch });
    };
    this.add.rectangle(375, 1070, 350, 90, 0x697e67).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => leave(true));
    label(this, 375, 1070, '再来一局', 30, '#fffaf0');
    this.add.rectangle(375, 1190, 280, 72, 0xe1ddcf).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => leave(false));
    label(this, 375, 1190, '返回主页', 28);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { handled = true; this.resultSnapshot = null; });
  }
}

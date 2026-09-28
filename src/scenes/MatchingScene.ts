import Phaser from 'phaser';
import { label } from '../ui/text';
import type { Loadout } from '../systems/equipment';
import { createBattleSetup, flowConfig, matchingDuration, presentationRandom } from '../flow/battleSetup';
import type { BattleSetup, DisplayProfile } from '../flow/battleSetup';

export interface MatchingData {
  loadout?: Loadout;
  presentationRandom?: () => number;
  createOpponentLoadout?: () => Loadout;
}

// 只有表现时钟；VS 完成之前不创建任何 Match runtime。
export class MatchingScene extends Phaser.Scene {
  phase: 'MATCHING' | 'VS' | 'FINISHED' = 'MATCHING';
  setup: BattleSetup | null = null;
  private cancelFlow: (() => void) | null = null;

  constructor() { super('MatchingScene'); }

  create(data: MatchingData = {}): void {
    this.cancelFlow?.();
    const random = data.presentationRandom ?? presentationRandom;
    const setup = createBattleSetup(data.loadout, random, data.createOpponentLoadout);
    this.setup = setup;
    this.phase = 'MATCHING';
    this.add.rectangle(375, 667, 750, 1334, 0xf7f3e8);
    const title = label(this, 375, 620, '正在寻找对手…', 36);
    let valid = true;
    let transitioned = false;
    let vsTimer: Phaser.Time.TimerEvent | null = null;
    const profile = (value: DisplayProfile, y: number): void => {
      this.add.circle(375, y, 48, 0x697e67);
      label(this, 375, y, String(value.avatarVariant + 1), 30, '#fffaf0');
      label(this, 375, y + 85, value.nickname, 32);
    };
    const timer = this.time.delayedCall(matchingDuration(random), () => {
      if (!valid || transitioned || this.phase !== 'MATCHING') return;
      this.phase = 'VS';
      title.setText('VS').setPosition(375, 667);
      profile(setup.opponentProfile, 360);
      profile(setup.playerProfile, 900);
      vsTimer = this.time.delayedCall(flowConfig.vsMs, () => {
        if (!valid || transitioned) return;
        transitioned = true;
        this.phase = 'FINISHED';
        this.scene.start('GameScene', { setup });
      });
    });
    const cancel = (): void => {
      valid = false;
      timer.remove(false);
      vsTimer?.remove(false);
      this.setup = null;
      if (this.cancelFlow === cancel) this.cancelFlow = null;
    };
    this.cancelFlow = cancel;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cancel);
  }
}

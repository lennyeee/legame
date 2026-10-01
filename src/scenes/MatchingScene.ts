import Phaser from 'phaser';
import { label } from '../ui/text';
import type { Loadout } from '../systems/equipment';
import { BOARD_REVEALED_EVENT, createBattleSetup, flowConfig, matchingDuration, presentationRandom } from '../flow/battleSetup';
import type { BattleSetup, DisplayProfile } from '../flow/battleSetup';
import { avatarSymbol, type PlayerProfile } from '../progression/profile';
import { rankDisplay, type RankState } from '../progression/rank';

export interface MatchingData {
  loadout?: Loadout;
  presentationRandom?: () => number;
  createOpponentLoadout?: () => Loadout;
  player?: PlayerProfile & { rank: RankState };
}

// HOME 保持在下面；此场景只拥有本局 setup 和可销毁的 VS 转场。
export class MatchingScene extends Phaser.Scene {
  phase: 'MATCHING' | 'VS_ENTER' | 'VS_HOLD' | 'VS_EXIT' | 'FINISHED' = 'MATCHING';
  setup: BattleSetup | null = null;
  private cancelFlow: (() => void) | null = null;

  constructor() { super('MatchingScene'); }

  create(data: MatchingData = {}): void {
    this.cancelFlow?.();
    const random = data.presentationRandom ?? presentationRandom;
    const setup = createBattleSetup(data.loadout, random, data.createOpponentLoadout, data.player);
    this.setup = setup;
    this.phase = 'MATCHING';
    this.scene.bringToTop();
    let valid = true;
    let launched = false;
    const timers: Phaser.Time.TimerEvent[] = [];
    const tweens: Phaser.Tweens.Tween[] = [];
    const objects: Phaser.GameObjects.GameObject[] = [];
    const wait = (duration: number, next: () => void): void => {
      timers.push(this.time.delayedCall(duration, () => { if (valid) next(); }));
    };
    const animate = (config: Phaser.Types.Tweens.TweenBuilderConfig): void => {
      tweens.push(this.tweens.add(config));
    };
    const panel = (profile: DisplayProfile, y: number): Phaser.GameObjects.Container => {
      const container = this.add.container(375, y, [
        this.add.rectangle(0, 0, 750, 667, 0xeee9dc).setStrokeStyle(2, 0xc2bcae),
        this.add.circle(0, -35, 48, 0x697e67),
        label(this, 0, -35, avatarSymbol(profile.avatarId), 48),
        label(this, 0, 60, profile.nickname, 32),
        label(this, 0, 120, rankDisplay(profile.rank), 26),
      ]).setSize(750, 667).setInteractive();
      // 只遮挡面板仍占据的位置，散开后露出的区域可传递到 GameScene。
      container.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
      objects.push(container);
      return container;
    };
    wait(matchingDuration(random), () => {
      this.phase = 'VS_ENTER';
      const shade = this.add.rectangle(375, 667, 750, 1334, 0x191b17, 0.18);
      const top = panel(setup.opponentProfile, -333.5);
      const bottom = panel(setup.playerProfile, 1667.5);
      const vs = label(this, 375, 667, 'VS', 58).setAlpha(0);
      objects.push(shade, vs);
      animate({ targets: top, y: 333.5, duration: flowConfig.vsEnterMs, ease: 'Cubic.Out' });
      animate({ targets: vs, alpha: 1, duration: flowConfig.vsEnterMs });
      animate({ targets: bottom, y: 1000.5, duration: flowConfig.vsEnterMs, ease: 'Cubic.Out',
        onComplete: () => {
          if (!valid) return;
          this.phase = 'VS_HOLD';
          wait(flowConfig.vsHoldMs, () => {
            if (launched) return;
            launched = true;
            this.phase = 'VS_EXIT';
            // 先启动下层战斗，再揭幕；Match 从此刻开始，完全不等待乐到位。
            this.scene.launch('GameScene', { setup });
            this.scene.bringToTop();
            this.scene.stop('ReadyScene');
            shade.destroy();
            animate({ targets: top, y: -333.5, duration: flowConfig.vsExitMs, ease: 'Cubic.InOut' });
            animate({ targets: vs, alpha: 0, duration: flowConfig.vsExitMs });
            animate({ targets: bottom, y: 1667.5, duration: flowConfig.vsExitMs, ease: 'Cubic.InOut',
              onComplete: () => {
                if (!valid) return;
                this.phase = 'FINISHED';
                this.game.events.emit(BOARD_REVEALED_EVENT, setup);
                this.scene.stop();
              },
            });
          });
        },
      });
    });
    const cancel = (): void => {
      valid = false;
      for (const timer of timers) timer.remove(false);
      for (const tween of tweens) { tween.stop(); tween.remove(); }
      for (const object of objects) object.destroy();
      this.setup = null;
      if (this.cancelFlow === cancel) this.cancelFlow = null;
    };
    this.cancelFlow = cancel;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cancel);
  }
}

import Phaser from 'phaser';
import { GAME_VERSION } from '../config/game';
import { label } from '../ui/text';
import { READY_BACKGROUND_COLOR } from '../config/ready';
import { createLoadout } from '../systems/equipment';
import type { InventoryItem, Loadout } from '../systems/equipment';
import { localPlayerProfile } from '../flow/battleSetup';
import { progressForScene, type PlayerProgress } from '../progression/PlayerProgress';
import { itemDefinitions } from '../config/equipment';

// 仅静态预览，不创建钱包、棋盘运行状态、输入控制器、战斗或计时器。
export class ReadyScene extends Phaser.Scene {
  startState: 'READY' | 'WELCOME' | 'STARTING' | 'MATCHING' = 'READY';
  playerProgress?: PlayerProgress;
  private inventory: InventoryItem[] = [];
  private openingItems = false;
  private lockForMatching: (() => void) | null = null;

  constructor() { super('ReadyScene'); }

  create(data: { inventory?: InventoryItem[]; loadout?: Loadout; autoMatch?: boolean } = {}): void {
    const progress = progressForScene(this);
    this.inventory = progress.inventory();
    this.openingItems = false;
    this.startState = 'READY';
    this.add.rectangle(375, 667, 750, 1334, READY_BACKGROUND_COLOR).setInteractive();
    this.add.circle(100, 110, 40, 0x697e67);
    label(this, 100, 110, '乐', 30, '#fffaf0');
    label(this, 245, 110, localPlayerProfile.nickname, 28);
    const save = progress.save;
    label(this, 555, 110, `金币：${save.coins}`, 26);
    label(this, 375, 170, `对局 ${save.stats.matchesPlayed} · 胜利 ${save.stats.wins} · 最高波次 ${save.stats.highestWave}`, 22);
    this.add.rectangle(375, 440, 600, 450, 0xeee9dc).setStrokeStyle(2, 0xc2bcae);
    label(this, 375, 440, '乐 GAME', 58);
    label(this, 375, 565, '角色 · 地图展示区', 24, '#8b8272');
    const button = this.add.rectangle(375, 765, 330, 86, 0x697e67)
      .setInteractive({ useHandCursor: true });
    const buttonText = label(this, 375, 765, '开始对战', 30, '#fffaf0');
    const itemsButton = this.add.rectangle(375, 885, 250, 72, 0x697e67).setInteractive({ useHandCursor: true });
    label(this, 375, 885, '道具', 28, '#fffaf0');
    itemsButton.on('pointerdown', () => {
      if (this.startState !== 'READY' || this.openingItems) return;
      this.openingItems = true;
      this.scene.start('ItemsScene');
    });
    label(this, 730, 1314, `v${GAME_VERSION}`, 16, '#8b8272').setOrigin(1, 1).setAlpha(0.4);
    button.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.requestStartGame();
    });
    this.lockForMatching = () => {
      button.disableInteractive();
      itemsButton.disableInteractive();
      buttonText.setText('正在寻找对手…').setFontSize(26);
      itemsButton.setAlpha(0.5);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.lockForMatching = null; if (this.startState === 'WELCOME') this.startState = 'STARTING'; });
    if (data.autoMatch) this.requestStartGame(true);
  }

  requestStartGame(rematch = false): void {
    if (this.startState !== 'READY' || this.openingItems) return;
    const progress = progressForScene(this);
    if (!rematch && !progress.hasSeenWelcome()) {
      this.startState = 'WELCOME';
      progress.markWelcomeSeen(); // 已展示即记录；不以ownership或对局数推断。
      const shade = this.add.rectangle(375, 667, 750, 1334, 0x353d36, 0.65).setDepth(20).setInteractive();
      const panel = this.add.rectangle(375, 640, 600, 490, 0xfffcf4).setDepth(21).setInteractive();
      panel.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
      const title = label(this, 375, 470, '恭喜！你中大奖了！', 36).setDepth(22);
      const gift = label(this, 375, 540, '免费送你一个道具！勤俭持家', 26).setDepth(22);
      const description = label(this, 375, 640, itemDefinitions.find(def => def.id === 'frugal_home')!.description, 24)
        .setWordWrapWidth(490, true).setDepth(22);
      const claim = this.add.rectangle(375, 790, 300, 76, 0x697e67).setDepth(22).setInteractive({ useHandCursor: true });
      const claimText = label(this, 375, 790, '立即领取', 28, '#fffaf0').setDepth(23);
      claim.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (this.startState !== 'WELCOME') return;
        this.startState = 'STARTING';
        [shade, panel, title, gift, description, claim, claimText].forEach(object => object.destroy());
        this.startMatch();
      });
      return;
    }
    this.startState = 'STARTING'; // 在 Phaser 下一帧切场景前，也阻止重复启动请求。
    // 匹配/VS 完成后才创建 Match；未来乐入场属于战斗内的表现。
    this.startMatch();
  }

  private startMatch(): void {
    if (this.startState !== 'STARTING') return;
    this.startState = 'MATCHING';
    const progress = progressForScene(this);
    progress.saveEquipment(this.inventory);
    this.inventory = progress.inventory(); // 开局也使用通过ownership校验的永久装备。
    this.lockForMatching?.();
    this.scene.launch('MatchingScene', { loadout: createLoadout(this.inventory) });
  }
}

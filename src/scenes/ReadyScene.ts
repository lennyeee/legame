import Phaser from 'phaser';
import { GAME_VERSION } from '../config/game';
import { label } from '../ui/text';
import { READY_BACKGROUND_COLOR } from '../config/ready';
import { createLoadout } from '../systems/equipment';
import type { InventoryItem, Loadout } from '../systems/equipment';
import { progressForScene, type PlayerProgress } from '../progression/PlayerProgress';
import { itemDefinitions } from '../config/equipment';
import { avatarSymbol } from '../progression/profile';
import { rankDisplay } from '../progression/rank';
import { showProfile, showSettings, type NicknameInputFactory } from '../ui/HomeDialogs';
import { audioForScene, ensureAudioLoader } from '../audio/AudioManager';

// 仅静态预览，不创建钱包、棋盘运行状态、输入控制器、战斗或计时器。
export class ReadyScene extends Phaser.Scene {
  startState: 'READY' | 'WELCOME' | 'STARTING' | 'MATCHING' = 'READY';
  playerProgress?: PlayerProgress;
  nicknameInputFactory?: NicknameInputFactory;
  private inventory: InventoryItem[] = [];
  private openingItems = false;
  private lockForMatching: (() => void) | null = null;

  constructor() { super('ReadyScene'); }

  create(data: { inventory?: InventoryItem[]; loadout?: Loadout; autoMatch?: boolean } = {}): void {
    const progress = progressForScene(this);
    const audio = audioForScene(this);
    audio.setOptions(progress.save.audio);
    audio.menu(this);
    this.inventory = progress.inventory();
    this.openingItems = false;
    this.startState = 'READY';
    this.add.rectangle(375, 667, 750, 1334, READY_BACKGROUND_COLOR).setInteractive();
    this.add.circle(100, 110, 40, 0x697e67);
    const avatar = label(this, 100, 110, '', 40);
    const nickname = label(this, 270, 95, '', 28);
    const save = progress.save;
    const wallet = label(this, 555, 110, `🪙 ${save.coins}`, 26);
    const rank = label(this, 280, 140, '', 22);
    const stats = label(this, 375, 190, '', 22);
    const refresh = (): void => {
      const current = progress.save;
      avatar.setText(avatarSymbol(current.profile.avatarId)); nickname.setText(current.profile.nickname);
      rank.setText(rankDisplay(current.rank)); wallet.setText(`🪙 ${current.coins}`);
      stats.setText(`对局 ${current.stats.matchesPlayed} · 胜利 ${current.stats.wins} · 最高波次 ${current.stats.highestWave}`);
      this.inventory = progress.inventory();
    };
    refresh();
    const profileButton = this.add.rectangle(255, 110, 410, 110, 0x000000, 0).setInteractive({ useHandCursor: true });
    const settingsButton = this.add.rectangle(690, 80, 60, 60, 0xe1ddcf).setInteractive({ useHandCursor: true });
    label(this, 690, 80, '⚙', 32);
    const open = (settings: boolean): void => {
      if (this.startState !== 'READY' || this.openingItems) return;
      audio.uiClick();
      this.openingItems = true;
      const close = (): void => { this.openingItems = false; refresh(); };
      if (settings) showSettings(this, progress, close); else showProfile(this, progress, close, this.nicknameInputFactory);
    };
    profileButton.on('pointerdown', () => open(false)); settingsButton.on('pointerdown', () => open(true));
    this.add.rectangle(375, 440, 600, 450, 0xeee9dc).setStrokeStyle(2, 0xc2bcae);
    label(this, 375, 440, '保卫小乐', 58);
    label(this, 375, 565, '角色 · 地图展示区', 24, '#8b8272');
    const button = this.add.rectangle(375, 765, 330, 86, 0x697e67)
      .setInteractive({ useHandCursor: true });
    const buttonText = label(this, 375, 765, '开始对战', 30, '#fffaf0');
    const itemsButton = this.add.rectangle(375, 885, 250, 72, 0x697e67).setInteractive({ useHandCursor: true });
    label(this, 375, 885, '道具', 28, '#fffaf0');
    itemsButton.on('pointerdown', () => {
      if (this.startState !== 'READY' || this.openingItems) return;
      audio.uiClick();
      this.openingItems = true;
      this.scene.start('ItemsScene');
    });
    label(this, 730, 1314, `v${GAME_VERSION}`, 16, '#8b8272').setOrigin(1, 1).setAlpha(0.4);
    button.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (this.startState === 'READY' && !this.openingItems) audio.startClick();
      this.requestStartGame();
    });
    const shopButton = this.add.rectangle(375, 985, 250, 72, 0x697e67).setInteractive({ useHandCursor: true });
    label(this, 375, 985, '商店', 28, '#fffaf0');
    shopButton.on('pointerdown', () => {
      if (this.startState !== 'READY' || this.openingItems) return;
      audio.uiClick();
      this.openingItems = true;
      this.scene.start('ShopScene');
    });
    const heroesButton = this.add.rectangle(375, 1085, 250, 72, 0x697e67).setInteractive({ useHandCursor: true });
    label(this, 375, 1085, '档案', 28, '#fffaf0');
    heroesButton.on('pointerdown', () => {
      if (this.startState !== 'READY' || this.openingItems) return;
      audio.uiClick();
      this.openingItems = true;
      this.scene.start('HeroEncyclopediaScene');
    });
    const helpButton = this.add.rectangle(375, 1185, 250, 72, 0x697e67).setInteractive({ useHandCursor: true });
    label(this, 375, 1185, '？ 玩法', 26, '#fffaf0');
    helpButton.on('pointerdown', () => {
      if (this.startState !== 'READY' || this.openingItems) return;
      audio.uiClick();
      this.openingItems = true;
      this.scene.start('HowToPlayScene');
    });
    this.lockForMatching = () => {
      button.disableInteractive();
      itemsButton.disableInteractive();
      shopButton.disableInteractive();
      heroesButton.disableInteractive();
      helpButton.disableInteractive();
      profileButton.disableInteractive(); settingsButton.disableInteractive();
      buttonText.setText('正在寻找对手…').setFontSize(26);
      itemsButton.setAlpha(0.5);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.lockForMatching = null; if (this.startState === 'WELCOME') this.startState = 'STARTING'; });
    if (data.autoMatch) this.requestStartGame(true);
    ensureAudioLoader(this);
  }

  requestStartGame(rematch = false): void {
    if (this.startState !== 'READY' || this.openingItems) return;
    const progress = progressForScene(this);
    if (!rematch && !progress.hasSeenWelcome()) {
      this.startState = 'WELCOME';
      progress.markWelcomeSeen(); // 已展示即记录；不以ownership或对局数推断。
      const shade = this.add.rectangle(375, 667, 750, 1334, 0x353d36, 0.65).setDepth(20).setInteractive();
      const panel = this.add.rectangle(375, 665, 650, 850, 0xfff4c4).setDepth(21).setInteractive();
      panel.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
      const title = label(this, 375, 360, '恭喜！', 86, '#e73338').setDepth(22);
      const gift = label(this, 375, 500, '你中大奖了！', 54, '#3a5bcc').setDepth(22);
      const banner = label(this, 375, 600, '免费送你一个道具！', 34, '#d45b10').setDepth(22);
      const name = label(this, 375, 690, '勤俭持家', 48, '#21804c').setDepth(22);
      const joke = label(this, 375, 885, '价值998金币', 25, '#8b8272').setDepth(22);
      const strike = this.add.rectangle(375, 885, 190, 2, 0x8b8272).setDepth(22);
      const free = label(this, 375, 940, '免费送！0金币！', 40, '#d52759').setDepth(22);
      const description = label(this, 375, 795, itemDefinitions.find(def => def.id === 'frugal_home')!.description, 24)
        .setWordWrapWidth(490, true).setDepth(22);
      const claim = this.add.rectangle(375, 1030, 380, 90, 0x697e67).setDepth(22).setInteractive({ useHandCursor: true });
      const claimText = label(this, 375, 1030, '立即领取', 36, '#fffaf0').setDepth(23);
      claim.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (this.startState !== 'WELCOME') return;
        audioForScene(this).uiClick();
        this.startState = 'STARTING';
        [shade, panel, title, gift, banner, name, joke, strike, free, description, claim, claimText].forEach(object => object.destroy());
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
    const save = progress.save;
    this.scene.launch('MatchingScene', { loadout: createLoadout(this.inventory), player: { ...save.profile, rank: save.rank } });
  }
}

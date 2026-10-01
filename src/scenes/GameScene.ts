import { controlsLayout } from '../config/layout';
import Phaser from 'phaser';
import { GAME_VERSION, gameConfig } from '../config/game';
import { testMap } from '../config/maps';
import { recruitmentPrice } from '../systems/recruitment';
import { drawBoard } from '../ui/board';
import { label } from '../ui/text';
import { Match } from '../match/Match';
import { DeploymentView } from '../ui/deployment';
import { DeploymentController } from '../input/DeploymentController';
import { BattleController } from '../combat/BattleController';
import { drawLoadout } from '../ui/loadout';
import { boardDisplayScene } from '../ui/boardDisplay';
import { ActiveItemController } from '../input/ActiveItemController';
import { FarmerView } from '../ui/FarmerView';
import { AIController } from '../controllers/AIController';
import { BOARD_REVEALED_EVENT, type BattleSetup } from '../flow/battleSetup';
import { LeIntroView } from '../ui/LeIntroView';
import { pressureConfig } from '../config/pressure';
import { progressForScene, type PlayerProgress } from '../progression/PlayerProgress';
import { gameplayHints } from '../content/gameplayGuide';
import { isHeroLetter, isUnit } from '../systems/items';
import { audioForScene, ensureAudioLoader } from '../audio/AudioManager';

export class GameScene extends Phaser.Scene {
  playerProgress?: PlayerProgress;
  match: Match | null = null;
  battleSetup: BattleSetup | null = null;
  presentationPhase: 'INTRO' | 'RUNNING' | null = null;
  get sides() { return this.match?.sides ?? null; }
  constructor() {
    super('GameScene');
  }

  create(data: { setup: BattleSetup }): void {
    this.input.enabled = true;
    this.battleSetup = data.setup;
    const match = new Match(testMap, data.setup.playerLoadout, data.setup.opponentLoadout);
    const firstEnemyDelay = pressureConfig.firstEnemyDelay;
    this.match = match;
    this.presentationPhase = 'INTRO';
    const { bottomSide, topSide } = match;
    match.bindController('top', new AIController(topSide));
    const state = bottomSide.recruitment;
    const loadout = state.loadout;
    const moneyText = label(this, 170, 55, '', 32);
    const waveText = label(this, 625, 55, '', 28);
    drawBoard(this, testMap, false);
    const leIntro = new LeIntroView(this, testMap);
    const boardScene = boardDisplayScene(this, testMap, 'bottom');
    const goal = testMap.path[testMap.path.length - 1]!;
    const healthText = label(boardScene, goal.x, goal.y + 24, '', 24, '#a85c4d');
    const topHealthText = label(boardDisplayScene(this, testMap, 'top'), goal.x, goal.y - 24, '', 24, '#a85c4d');
    label(this, 730, 1314, `v${GAME_VERSION}`, 16).setOrigin(1, 1).setAlpha(0.4);
    const activeSlots = drawLoadout(this, loadout);
    let activeController: ActiveItemController | undefined;
    let ended = false;
    const progress = progressForScene(this);
    const audio = audioForScene(this);
    audio.setOptions(progress.save.audio);
    let boardRevealed = false;
    const onBoardRevealed = (setup: BattleSetup): void => {
      if (boardRevealed || ended || setup !== this.battleSetup) return;
      boardRevealed = true;
      audio.battle(this);
    };
    this.game.events.on(BOARD_REVEALED_EVENT, onBoardRevealed);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(BOARD_REVEALED_EVENT, onBoardRevealed));
    const tutorialAtStart = progress.save.tutorial;
    let deploymentHintShown = tutorialAtStart.deploymentHintCompleted;
    let mergeHintShown = tutorialAtStart.mergeHintCompleted;
    let heroHintQueued = false;
    let activeHint: { shape: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } | null = null;
    let hintTween: Phaser.Tweens.Tween | undefined;
    let showNextHint = (): void => {};
    const validMergeAvailable = (): boolean => {
      const positions = [
        ...state.slots.map((_, index) => ({ kind: 'slot' as const, index })),
        ...bottomSide.board.tiles.map((_, index) => ({ kind: 'tile' as const, index })),
      ];
      for (const source of positions) {
        const sourceItem = bottomSide.itemAt(source);
        if (!isUnit(sourceItem)) continue;
        for (const target of positions) {
          if (source.kind === target.kind && source.index === target.index) continue;
          if (!isUnit(bottomSide.itemAt(target))) continue;
          if (bottomSide.dropAction(source, target) === 'merge') return true;
        }
      }
      return false;
    };
    const toastHint = (key: 'deploymentHintCompleted' | 'mergeHintCompleted' | 'heroLetterHintCompleted', message: string): void => {
      if (activeHint) return;
      // 复用棋盘下方的反馈区，提示不会遮挡战场或备战栏。
      const shape = this.add.rectangle(375, controlsLayout.feedbackY, 370, 64, 0x353d36, 0.9)
        .setStrokeStyle(1, 0xd8d1bd).setDepth(30);
      const text = label(this, 375, controlsLayout.feedbackY, message, 18, '#fffaf0')
        .setWordWrapWidth(346, true).setDepth(31);
      activeHint = { shape, text };
      if (key === 'heroLetterHintCompleted') progress.completeTutorialHint(key);
      hintTween = this.tweens.add({ targets: [shape, text], alpha: 0, delay: 4500, duration: 350,
        onComplete: () => {
          shape.destroy(); text.destroy(); activeHint = null; hintTween = undefined;
          showNextHint();
        } });
    };
    showNextHint = (): void => {
      if (ended || !this.input.enabled || activeHint) return;
      const hasDeployable = state.slots.some(item => item !== null && item !== '铲');
      if (!deploymentHintShown && hasDeployable && !progress.save.tutorial.deploymentHintCompleted) {
        deploymentHintShown = true; toastHint('deploymentHintCompleted', gameplayHints.deployment); return;
      }
      if (!mergeHintShown && !progress.save.tutorial.mergeHintCompleted && validMergeAvailable()) {
        mergeHintShown = true; toastHint('mergeHintCompleted', gameplayHints.merge); return;
      }
      if (heroHintQueued && !progress.save.tutorial.heroLetterHintCompleted) {
        heroHintQueued = false; toastHint('heroLetterHintCompleted', gameplayHints.heroLetter);
      }
    };
    const deploymentView = new DeploymentView(this, testMap, gameConfig.slotCount);
    const topDeploymentView = new DeploymentView(this, testMap, 0, 'top');
    topDeploymentView.refresh(topSide.board, topSide.recruitment);
    let knownBottomLinks = new Set(bottomSide.heroes.links.values());
    let knownTopLinks = new Set(topSide.heroes.links.values());
    const playNewHeroes = (): void => {
      const bottom = new Set(bottomSide.heroes.links.values());
      if (!deployment.isDragging) {
        for (const link of bottom) if (!knownBottomLinks.has(link)) audio.sfx('hero_created');
        knownBottomLinks = bottom;
      }
      const top = new Set(topSide.heroes.links.values());
      for (const link of top) if (!knownTopLinks.has(link)) audio.sfx('hero_created');
      knownTopLinks = top;
    };
    const feedback = label(this, 375, controlsLayout.feedbackY, '拖动兵种部署，拖动铲子解锁', 20, '#8b8272');
    const deployment = new DeploymentController(this, bottomSide, deploymentView, (result, observation) => {
      if (result === 'unlock') audio.sfx('shovel');
      if (result === 'merge' && observation && isUnit(observation.sourceItem) && isUnit(observation.targetItem)) audio.sfx('unit_merge');
      if ((result === 'move' || result === 'swap') && observation && observation.sourceItem !== '铲'
        && (observation.source.kind === 'tile' || observation.target?.kind === 'tile')) {
        const createdHero = [...bottomSide.heroes.links.values()].some(link => !knownBottomLinks.has(link));
        if (createdHero) playNewHeroes();
        else audio.sfx('unit_place');
      }
      farmerView.refresh();
      refresh();
      const messages = {
        invalid: '无法放置，已返回原位',
        move: '移动完成',
        swap: '位置已交换',
        merge: '合成成功',
        unlock: '部署格已解锁',
      };
      feedback.setText(messages[result]).setColor(result === 'invalid' ? '#a45e45' : '#697e67');
      if (result !== 'invalid' && observation) {
        if (observation.source.kind === 'slot' && observation.target?.kind === 'tile'
          && observation.sourceItem !== null && observation.sourceItem !== '铲'
          && !progress.save.tutorial.deploymentHintCompleted) {
          progress.completeTutorialHint('deploymentHintCompleted');
        }
        if (result === 'merge' && isUnit(observation.sourceItem) && isUnit(observation.targetItem)
          && !progress.save.tutorial.mergeHintCompleted) {
          progress.completeTutorialHint('mergeHintCompleted');
        }
      }
      showNextHint();
    }, () => !ended && this.input.enabled && !activeController?.isDragging);
    const buttonShape = this.add.graphics();
    const button = this.add.rectangle(375, controlsLayout.recruitY, controlsLayout.recruitWidth, controlsLayout.recruitHeight, 0x697e67, 0)
      .setInteractive({ useHandCursor: true });
    const buttonText = label(this, 375, controlsLayout.recruitY, '', 30, '#fffaf0');

    const refresh = (): void => {
      moneyText.setText(`$ ${state.money}`);
      const price = recruitmentPrice(state);
      const affordable = state.money >= price;
      buttonShape.clear().fillStyle(affordable ? 0x697e67 : 0xbab4a7)
        .fillRoundedRect(375 - controlsLayout.recruitWidth / 2, controlsLayout.recruitY - controlsLayout.recruitHeight / 2,
          controlsLayout.recruitWidth, controlsLayout.recruitHeight, 20);
      buttonText.setText(`来财 $${price}`);
    };
    const farmerView = new FarmerView(this, testMap, bottomSide,
      () => !ended && this.input.enabled && !deployment.isDragging && !activeController?.isDragging, refresh);
    const topFarmerView = new FarmerView(this, testMap, topSide, () => false, () => {}, 'top', false);

    activeController = new ActiveItemController(this, bottomSide, activeSlots, deploymentView,
      () => !ended && this.input.enabled && !deployment.isDragging, success => {
        farmerView.refresh(); deployment.refresh(); refresh();
        feedback.setText(success ? '道具使用成功' : '无法使用，已返回主动槽').setColor(success ? '#697e67' : '#a45e45');
      });

    button.on('pointerdown', () => {
      // 防止另一根手指在拖动中征兵，替换正在拖动的槽位。
      if (ended || !this.input.enabled || deployment.isDragging || activeController?.isDragging) return;
      if (!bottomSide.recruit()) {
        feedback.setText('美金不足，请等待资源增长').setColor('#a45e45');
        return;
      }
      audio.sfx('recruit');
      feedback.setText('征兵完成 · 待放置栏已更新').setColor('#697e67');
      deployment.refresh();
      refresh();
      if (state.slots.some(isHeroLetter) && !progress.save.tutorial.heroLetterHintCompleted) heroHintQueued = true;
      showNextHint();
    });
    deployment.refresh();
    refresh();
    const battle = new BattleController(this, bottomSide, deployment, deploymentView);
    const topBattle = new BattleController(this, topSide);
    const refreshProgress = (): void => {
      waveText.setText(`第 ${match.timeline.wave} 波`);
      healthText.setText('♥'.repeat(match.health.bottom));
      topHealthText.setText('♥'.repeat(match.health.top));
      if (!ended && match.result !== null) {
        ended = true;
        audio.result(match.result === 'bottom' ? 'win' : match.result === 'top' ? 'lose' : 'draw');
        activeController?.cancel();
        deployment.cancel();
        this.input.enabled = false;
        this.scene.pause();
        const mode = match.result === 'draw' ? 'draw' : match.result === 'bottom' ? 'victory' : 'defeat';
        const progress = progressForScene(this);
        const coinReward = progress.commitMatchResult(match.resultSnapshot!);
        this.scene.launch('PveOverlayScene', { mode, snapshot: match.resultSnapshot, loadout,
          coinReward, rankChange: progress.rankChangeFor(match.resultSnapshot!.matchId) });
      }
    };
    refreshProgress();
    const updateMatch = (_time: number, delta: number): void => {
      if (!match.running) return;
      const before = state.money;
      const wasInsufficient = before < recruitmentPrice(state);
      const events = match.update(delta, deployment.draggedTile);
      leIntro.update(match.timeline.elapsedMs);
      if (match.timeline.elapsedMs >= firstEnemyDelay && this.presentationPhase !== 'RUNNING') {
        this.presentationPhase = 'RUNNING';
      }
      audio.combatEvents(events.bottom);
      audio.combatEvents(events.top);
      playNewHeroes();
      battle.render(events.bottom, match.timeline.elapsedMs);
      topBattle.render(events.top, match.timeline.elapsedMs);
      if (state.money !== before) {
        if (wasInsufficient && state.money >= recruitmentPrice(state)) {
          feedback.setText('美金已足够，可以再次征兵').setColor('#697e67');
        }
        refresh();
      }
      activeController?.refresh();
      farmerView.refresh();
      topFarmerView.refresh();
      topDeploymentView.refresh(topSide.board, topSide.recruitment);
      refreshProgress();
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, updateMatch);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (!ended) audio.leaveBattle();
      this.events.off(Phaser.Scenes.Events.UPDATE, updateMatch);
      hintTween?.stop();
      activeHint?.shape.destroy(); activeHint?.text.destroy(); activeHint = null;
      match.destroy();
      farmerView.destroy();
      topFarmerView.destroy();
      leIntro.destroy();
      this.scene.stop('MatchingScene');
      this.match = null;
      this.battleSetup = null;
      this.presentationPhase = null;
    });
    const resumeInput = (): void => { match.resume(); audio.resumeBattle(); this.input.enabled = match.running; };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.RESUME, resumeInput));
    const pauseButton = this.add.rectangle(75, 55, 62, 54, 0x697e67)
      .setInteractive({ useHandCursor: true });
    label(this, 75, 55, 'Ⅱ', 30, '#fffaf0');
    pauseButton.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (ended) return;
      deployment.cancel();
      activeController?.cancel();
      battle.hideRange();
      audio.uiClick();
      match.pause();
      audio.pauseBattle();
      this.input.enabled = false;
      this.events.once(Phaser.Scenes.Events.RESUME, resumeInput);
      this.scene.pause();
      this.scene.launch('PveOverlayScene', { mode: 'paused', health: 0, loadout });
    });
    ensureAudioLoader(this);
  }
}

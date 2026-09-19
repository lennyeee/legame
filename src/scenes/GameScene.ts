import { controlsLayout } from '../config/layout';
import Phaser from 'phaser';
import { GAME_VERSION, gameConfig } from '../config/game';
import { testMap } from '../config/maps';
import { createRecruitmentState, recruit } from '../systems/recruitment';
import { drawBoard } from '../ui/board';
import { label } from '../ui/text';
import { createBoardState } from '../systems/board';
import { DeploymentView } from '../ui/deployment';
import { DeploymentController } from '../input/DeploymentController';
import { BattleController } from '../combat/BattleController';
import { copyLoadout } from '../systems/equipment';
import type { Loadout } from '../systems/equipment';
import { drawLoadout } from '../ui/loadout';
import { boardDisplayScene } from '../ui/boardDisplay';
import { FarmerProduction } from '../systems/FarmerProduction';
import { ActiveItems } from '../systems/ActiveItems';
import { ActiveItemController } from '../input/ActiveItemController';
import { FarmerView } from '../ui/FarmerView';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create(data: { loadout?: Loadout } = {}): void {
    const loadout = copyLoadout(data.loadout);
    this.input.enabled = true;
    const state = createRecruitmentState(loadout);
    const board = createBoardState(testMap);
    const farmers = new FarmerProduction(board, state);
    const moneyText = label(this, 170, 55, '', 32);
    const waveText = label(this, 625, 55, '', 28);
    const boardScene = boardDisplayScene(this);
    drawBoard(boardScene, testMap);
    const goal = testMap.path[testMap.path.length - 1]!;
    const healthText = label(boardScene, goal.x, goal.y + 24, '', 24, '#a85c4d');
    label(this, 730, 1314, `v${GAME_VERSION}`, 16).setOrigin(1, 1).setAlpha(0.4);
    const activeSlots = drawLoadout(this, loadout);
    const activeItems = new ActiveItems(loadout);
    let activeController: ActiveItemController | undefined;
    let ended = false;
    const deploymentView = new DeploymentView(this, testMap, gameConfig.slotCount);
    const feedback = label(this, 375, controlsLayout.feedbackY, '拖动兵种部署，拖动铲子解锁', 20, '#8b8272');
    const deployment = new DeploymentController(this, board, state, deploymentView, result => {
      farmers.sync();
      farmerView.refresh();
      const messages = {
        invalid: '无法放置，已返回原位',
        move: '移动完成',
        swap: '位置已交换',
        merge: '合成成功',
        unlock: '部署格已解锁',
      };
      feedback.setText(messages[result]).setColor(result === 'invalid' ? '#a45e45' : '#697e67');
    }, () => !ended && this.input.enabled && !activeController?.isDragging);
    const buttonShape = this.add.graphics();
    const button = this.add.rectangle(375, controlsLayout.recruitY, controlsLayout.recruitWidth, controlsLayout.recruitHeight, 0x697e67, 0)
      .setInteractive({ useHandCursor: true });
    const buttonText = label(this, 375, controlsLayout.recruitY, '', 30, '#fffaf0');

    const refresh = (): void => {
      moneyText.setText(`$ ${state.money}`);
      const affordable = state.money >= gameConfig.recruitmentCost;
      buttonShape.clear().fillStyle(affordable ? 0x697e67 : 0xbab4a7)
        .fillRoundedRect(375 - controlsLayout.recruitWidth / 2, controlsLayout.recruitY - controlsLayout.recruitHeight / 2,
          controlsLayout.recruitWidth, controlsLayout.recruitHeight, 20);
      buttonText.setText(`来财 $${gameConfig.recruitmentCost}`);
    };
    const farmerView = new FarmerView(this, testMap, farmers,
      () => !ended && this.input.enabled && !deployment.isDragging && !activeController?.isDragging, refresh);

    activeController = new ActiveItemController(this, activeItems, activeSlots, board, state, deploymentView,
      () => !ended && this.input.enabled && !deployment.isDragging, success => {
        farmers.sync(); farmerView.refresh(); deployment.refresh();
        feedback.setText(success ? '升级成功' : '无法升级，已返回主动槽').setColor(success ? '#697e67' : '#a45e45');
      });

    button.on('pointerdown', () => {
      // 防止另一根手指在拖动中征兵，替换正在拖动的槽位。
      if (ended || !this.input.enabled || deployment.isDragging || activeController?.isDragging) return;
      if (!recruit(state)) {
        feedback.setText('美金不足，请等待资源增长').setColor('#a45e45');
        return;
      }
      feedback.setText('征兵完成 · 待放置栏已更新').setColor('#697e67');
      deployment.refresh();
      refresh();
    });
    const incomeTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        const wasInsufficient = state.money < gameConfig.recruitmentCost;
        state.money += gameConfig.incomePerSecond;
        if (wasInsufficient && state.money >= gameConfig.recruitmentCost) {
          feedback.setText('美金已足够，可以再次征兵').setColor('#697e67');
        }
        refresh();
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => incomeTimer.remove());
    deployment.refresh();
    refresh();
    const battle = new BattleController(this, testMap, board, state, deployment, deploymentView, refresh, progress => {
      waveText.setText(`第 ${progress.wave} 波`);
      healthText.setText('♥'.repeat(progress.health));
      if (!ended && progress.status !== 'playing') {
        ended = true;
        farmers.stop();
        activeItems.stop();
        activeController?.cancel();
        incomeTimer.remove();
        deployment.cancel();
        this.input.enabled = false;
        this.scene.pause();
        this.scene.launch('PveOverlayScene', { mode: progress.status, health: progress.health, loadout });
      }
    });
    // 排在战斗帧更新之后：本帧若已结算，不再推进生产或过期。
    const updateItemSystems = (_time: number, delta: number): void => {
      if (ended) return;
      activeItems.update(delta);
      activeController?.refresh();
      farmers.update(delta);
      farmerView.refresh();
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, updateItemSystems);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.UPDATE, updateItemSystems);
      activeItems.destroy();
      farmers.destroy();
      farmerView.destroy();
    });
    const resumeInput = (): void => { this.input.enabled = true; };
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
      this.input.enabled = false;
      this.events.once(Phaser.Scenes.Events.RESUME, resumeInput);
      this.scene.pause();
      this.scene.launch('PveOverlayScene', { mode: 'paused', health: 0, loadout });
    });
  }
}

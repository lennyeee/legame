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

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create(): void {
    this.input.enabled = true;
    const state = createRecruitmentState();
    const board = createBoardState(testMap);
    label(this, 375, 49, '乐 GAME', 30, '#57674f');
    this.add.rectangle(375, 117, 686, 80, 0xeee9dc);
    const moneyText = label(this, 155, 109, '', 32);
    label(this, 155, 138, `每秒 +$${gameConfig.incomePerSecond}`, 16, '#8b8272');
    const waveText = label(this, 580, 117, '', 28);
    drawBoard(this, testMap);
    const goal = testMap.path[testMap.path.length - 1]!;
    const healthText = label(this, goal.x, goal.y + 40, '', 24, '#a85c4d');
    label(this, 730, 1314, `v${GAME_VERSION}`, 16).setOrigin(1, 1).setAlpha(0.4);
    let ended = false;
    const deploymentView = new DeploymentView(this, testMap, gameConfig.slotCount);
    const feedback = label(this, 375, 1170, '拖动兵种部署，拖动铲子解锁', 20, '#8b8272');
    const deployment = new DeploymentController(this, board, state, deploymentView, result => {
      const messages = {
        invalid: '无法放置，已返回原位',
        move: '移动完成',
        swap: '位置已交换',
        merge: '合成成功，等级提升',
        unlock: '部署格已解锁',
      };
      feedback.setText(messages[result]).setColor(result === 'invalid' ? '#a45e45' : '#697e67');
    });
    const button = this.add.rectangle(375, 1240, 430, 84, 0x697e67)
      .setInteractive({ useHandCursor: true });
    const buttonText = label(this, 375, 1240, '', 30, '#fffaf0');

    const refresh = (): void => {
      moneyText.setText(`$ ${state.money}`);
      const affordable = state.money >= gameConfig.recruitmentCost;
      button.setFillStyle(affordable ? 0x697e67 : 0xbab4a7);
      buttonText.setText(affordable
        ? `征兵  $${gameConfig.recruitmentCost}`
        : `美金不足  $${gameConfig.recruitmentCost}`);
    };

    button.on('pointerdown', () => {
      // 防止另一根手指在拖动中征兵，替换正在拖动的槽位。
      if (deployment.isDragging) return;
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
        incomeTimer.remove();
        deployment.cancel();
        this.input.enabled = false;
        this.scene.pause();
        this.scene.launch('PveOverlayScene', { mode: progress.status, health: progress.health });
      }
    });
    const pauseButton = this.add.rectangle(75, 49, 62, 54, 0x697e67)
      .setInteractive({ useHandCursor: true });
    label(this, 75, 49, 'Ⅱ', 30, '#fffaf0');
    pauseButton.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (ended) return;
      deployment.cancel();
      battle.hideRange();
      this.input.enabled = false;
      this.events.once(Phaser.Scenes.Events.RESUME, () => { this.input.enabled = true; });
      this.scene.pause();
      this.scene.launch('PveOverlayScene', { mode: 'paused', health: 0 });
    });
  }
}

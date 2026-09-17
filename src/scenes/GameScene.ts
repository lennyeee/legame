import Phaser from 'phaser';
import { gameConfig } from '../config/game';
import { testMap } from '../config/maps';
import { createRecruitmentState, recruit } from '../systems/recruitment';
import { drawBoard } from '../ui/board';
import { label } from '../ui/text';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create(): void {
    const state = createRecruitmentState();
    label(this, 375, 49, '乐 GAME', 30, '#57674f');
    this.add.rectangle(375, 117, 686, 80, 0xeee9dc);
    const moneyText = label(this, 155, 109, '', 32);
    label(this, 155, 138, `每秒 +$${gameConfig.incomePerSecond}`, 16, '#8b8272');
    label(this, 580, 117, `第 ${gameConfig.initialWave} 波`, 28);
    label(this, 375, 180, `${testMap.name} / 测试地图`, 19, '#8b8272');
    drawBoard(this, testMap);

    label(this, 375, 1022, '待放置', 24);
    const slots = Array.from({ length: gameConfig.slotCount }, (_, index) => {
      const x = 375 + (index - (gameConfig.slotCount - 1) / 2) * 128;
      const box = this.add.rectangle(x, 1092, 108, 100, 0xfffcf4).setStrokeStyle(2, 0xd3caba);
      const text = label(this, x, 1092, '—', 38, '#b6ae9f');
      return { box, text };
    });
    const feedback = label(this, 375, 1170, '征兵后生成 5 个结果，再次征兵会全部替换', 20, '#8b8272');
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
      slots.forEach((slot, index) => {
        slot.text.setText(state.slots[index] ?? '—');
        slot.text.setColor(state.slots[index] ? '#514a40' : '#b6ae9f');
        slot.box.setStrokeStyle(2, state.slots[index] ? 0x9aa58c : 0xd3caba);
      });
    };

    button.on('pointerdown', () => {
      if (!recruit(state)) {
        feedback.setText('美金不足，请等待资源增长').setColor('#a45e45');
        return;
      }
      feedback.setText('征兵完成 · 原槽位内容已替换').setColor('#697e67');
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
    refresh();
  }
}

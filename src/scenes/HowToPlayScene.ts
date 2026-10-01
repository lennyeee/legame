import Phaser from 'phaser';
import { gameplayGuide } from '../content/gameplayGuide';
import { label } from '../ui/text';
import { audioForScene, ensureAudioLoader } from '../audio/AudioManager';

export class HowToPlayScene extends Phaser.Scene {
  constructor() { super('HowToPlayScene'); }

  create(): void {
    audioForScene(this).menu(this);
    this.add.rectangle(375, 667, 750, 1334, 0xf7f3e8);
    this.add.rectangle(375, 92, 750, 150, 0xeee9dc);
    const back = this.add.rectangle(76, 90, 104, 62, 0x697e67).setInteractive({ useHandCursor: true });
    label(this, 76, 90, '返回', 23, '#fffaf0');
    back.on('pointerdown', () => { audioForScene(this).uiClick(); this.scene.start('ReadyScene'); });
    label(this, 375, 90, '怎么玩？', 38);

    gameplayGuide.forEach((step, index) => {
      const y = 222 + index * 194;
      const isFinal = index === gameplayGuide.length - 1;
      this.add.rectangle(375, y + 72, 650, 170, isFinal ? 0xe4e0d2 : 0xfffcf4)
        .setStrokeStyle(2, isFinal ? 0x697e67 : 0xc2bcae);
      this.add.circle(98, y + 19, 23, 0x697e67);
      // Repaint the step number above the circle for reliable depth ordering.
      label(this, 98, y + 19, `${index + 1}`, 24, '#fffaf0');
      label(this, 145, y + 19, step.title, 27, '#4c6651').setOrigin(0, 0.5);
      const body = step.lines.join('\n');
      const text = this.add.text(78, y + 48, body, {
        fontFamily: 'Arial, sans-serif', fontSize: '21px', color: '#323b32',
        wordWrap: { width: 594, useAdvancedWrap: true }, lineSpacing: 8,
        align: index === 2 ? 'center' : 'left',
      }).setOrigin(0, 0);
      if (index === 2) {
        text.setY(y + 49);
        text.setStyle({ fontStyle: 'normal' });
      }
      if (isFinal) label(this, 375, 1225, '别让乐死了。', 30, '#a65040');
    });
    ensureAudioLoader(this);
  }
}

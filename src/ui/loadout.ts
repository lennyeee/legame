import { controlsLayout } from '../config/layout';
import type Phaser from 'phaser';
import { equipmentLimits, itemDefinitions } from '../config/equipment';
import type { Loadout } from '../systems/equipment';
import { label } from './text';

// 纯展示，无输入和道具效果。底部留出版本号，左右空槽不覆盖征兵按钮。
export function drawLoadout(scene: Phaser.Scene, loadout: Loadout): void {
  for (const x of [80, 670]) {
    scene.add.rectangle(x, controlsLayout.reserveY, 74, 86, 0xeee9dc).setStrokeStyle(2, 0xc2bcae);
    label(scene, x, controlsLayout.reserveY, '空', 20, '#999284');
  }
  for (let index = 0; index < equipmentLimits.passive; index++) {
    const x = index < 3 ? 120 : 630;
    const y = controlsLayout.passiveY + (index % 3) * controlsLayout.passiveStep;
    const item = loadout.passive[index];
    const definition = itemDefinitions.find(entry => entry.id === item?.id);
    scene.add.ellipse(x, y, controlsLayout.passiveWidth, controlsLayout.passiveHeight, 0xeee9dc).setStrokeStyle(1, 0xc2bcae);
    label(scene, x, y, definition?.name ?? '—', 18, '#697e67');
  }
}

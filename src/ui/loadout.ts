import type Phaser from 'phaser';
import { equipmentLimits, itemDefinitions } from '../config/equipment';
import type { Loadout } from '../systems/equipment';
import { label } from './text';

// 纯展示，无输入和道具效果。底部留出版本号，左右空槽不覆盖征兵按钮。
export function drawLoadout(scene: Phaser.Scene, loadout: Loadout): void {
  for (const x of [90, 660]) {
    scene.add.rectangle(x, 1240, 84, 72, 0xeee9dc).setStrokeStyle(2, 0xc2bcae);
    label(scene, x, 1240, '空', 20, '#999284');
  }
  for (let index = 0; index < equipmentLimits.passive; index++) {
    const x = 160 + index * 86;
    const item = loadout.passive[index];
    const definition = itemDefinitions.find(entry => entry.id === item?.id);
    scene.add.rectangle(x, 1303, 78, 34, 0xeee9dc).setStrokeStyle(1, 0xc2bcae);
    label(scene, x, 1303, definition?.name ?? '—', 18, '#697e67');
  }
}

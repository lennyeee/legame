import { controlsLayout } from '../config/layout';
import type Phaser from 'phaser';
import { equipmentLimits, itemDefinitions } from '../config/equipment';
import type { Loadout } from '../systems/equipment';
import { label } from './text';

export interface ActiveSlotView { box: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }
// 只绘制槽位；主动道具输入与效果由独立控制器负责。
export function drawLoadout(scene: Phaser.Scene, loadout: Loadout): ActiveSlotView[] {
  const active: ActiveSlotView[] = [];
  for (const x of [80, 670]) {
    const box = scene.add.rectangle(x, controlsLayout.reserveY, 74, 86, 0xeee9dc).setStrokeStyle(2, 0xc2bcae);
    const text = label(scene, x, controlsLayout.reserveY, '空', 20, '#999284');
    active.push({ box, text });
  }
  for (let index = 0; index < equipmentLimits.passive; index++) {
    const x = index < 3 ? 120 : 630;
    const y = controlsLayout.passiveY + (index % 3) * controlsLayout.passiveStep;
    const item = loadout.passive[index];
    const definition = itemDefinitions.find(entry => entry.id === item?.id);
    scene.add.ellipse(x, y, controlsLayout.passiveWidth, controlsLayout.passiveHeight, 0xeee9dc).setStrokeStyle(1, 0xc2bcae);
    label(scene, x, y, definition?.name ?? '—', 18, '#697e67');
  }
  return active;
}

import Phaser from 'phaser';
import type { ItemDefinition } from '../config/equipment';
import { label } from './text';

export interface ItemDetailAction { text: string; enabled: boolean; run: () => boolean; failureText?: string }
// 商店、装备槽、背包卡共享同一详情卡；效果文本只来自definition。
export function showItemDetail(scene: Phaser.Scene, definition: ItemDefinition,
  action: ItemDetailAction, onClose: () => void, price?: number): void {
  let closed = false;
  const shade = scene.add.rectangle(375, 667, 750, 1334, 0x353d36, 0.65).setDepth(20).setInteractive();
  const panel = scene.add.rectangle(375, 667, 610, 540, 0xfffcf4).setDepth(21).setInteractive();
  panel.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
  const title = label(scene, 375, 480, definition.name, 36).setDepth(22);
  const type = label(scene, 375, 540, definition.category === 'active' ? '类型：主动道具' : '类型：被动道具', 24).setDepth(22);
  const description = label(scene, 375, 635, definition.description, 24).setWordWrapWidth(490, true)
    .setFixedSize(500, 130).setAlign('left').setDepth(22);
  const note = label(scene, 375, 750, price === undefined ? '装备将在开始对战后带入本局' : `金币 ${price}`, 22).setDepth(22);
  const button = scene.add.rectangle(375, 835, 350, 72, 0x697e67).setDepth(22);
  const text = label(scene, 375, 835, action.text, 24, '#fffaf0').setWordWrapWidth(330, true).setDepth(23);
  const closeButton = scene.add.rectangle(635, 430, 52, 52, 0xe1ddcf).setDepth(22).setInteractive();
  const closeText = label(scene, 635, 430, '×', 30).setDepth(23);
  const close = (): void => {
    if (closed) return; closed = true;
    [shade, panel, title, type, description, note, button, text, closeButton, closeText].forEach(object => object.destroy());
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, close);
    onClose();
  };
  shade.on('pointerdown', close); closeButton.on('pointerdown', close);
  if (action.enabled) button.setInteractive({ useHandCursor: true }); else button.setAlpha(0.5);
  button.on('pointerdown', () => {
    if (closed || !action.enabled) return;
    if (action.run()) close(); else text.setText(action.failureText ?? '操作未完成');
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
}

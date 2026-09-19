import Phaser from 'phaser';
import { equipmentLimits, itemDefinitions } from '../config/equipment';
import { createInventory, setEquipped } from '../systems/equipment';
import type { InventoryItem } from '../systems/equipment';
import { label } from '../ui/text';

export class ItemsScene extends Phaser.Scene {
  constructor() { super('ItemsScene'); }

  create(data: { inventory?: InventoryItem[] } = {}): void {
    const inventory = data.inventory ?? createInventory();
    label(this, 375, 100, '道具 · 开发背包', 36);
    const back = this.add.rectangle(375, 1200, 300, 76, 0x697e67).setInteractive({ useHandCursor: true });
    label(this, 375, 1200, '返回', 28, '#fffaf0');
    let leaving = false;
    back.on('pointerdown', () => {
      if (leaving) return;
      leaving = true;
      this.scene.start('ReadyScene', { inventory });
    });
    const slots: { category: 'active' | 'passive'; index: number; text: Phaser.GameObjects.Text }[] = [];
    for (const category of ['active', 'passive'] as const) {
      const y = category === 'active' ? 270 : 410;
      label(this, 375, y - 60, category === 'active' ? '主动道具（最多2个）' : '被动道具（最多6个）', 24);
      for (let index = 0; index < equipmentLimits[category]; index++) {
        const x = 375 + (index - (equipmentLimits[category] - 1) / 2) * 100;
        this.add.rectangle(x, y, 90, 72, 0xeee9dc).setStrokeStyle(2, 0xc2bcae);
        slots.push({ category, index, text: label(this, x, y, '', 22) });
      }
    }
    const refresh = (): void => {
      for (const slot of slots) {
        const equipped = inventory.filter(item => item.owned && item.equipped
          && itemDefinitions.find(def => def.id === item.id)?.category === slot.category);
        slot.text.setText(itemDefinitions.find(def => def.id === equipped[slot.index]?.id)?.name ?? '—');
      }
    };
    let modalOpen = false;
    inventory.filter(item => item.owned).forEach((item, index) => {
      const definition = itemDefinitions.find(def => def.id === item.id);
      if (!definition) return;
      const x = 155 + (index % 4) * 145, y = 630 + Math.floor(index / 4) * 120;
      const icon = this.add.rectangle(x, y, 116, 90, 0xe6dfc8).setInteractive({ useHandCursor: true });
      label(this, x, y, definition.name, 28);
      icon.on('pointerdown', () => {
        if (modalOpen) return;
        modalOpen = true;
        const shade = this.add.rectangle(375, 667, 750, 1334, 0x191b17, 0.65).setDepth(20).setInteractive();
        const panel = this.add.rectangle(375, 667, 590, 440, 0xfffcf4).setDepth(21).setInteractive();
        panel.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
        const title = label(this, 375, 510, definition.name, 36).setDepth(22);
        const category = label(this, 375, 565, definition.category === 'passive' ? '被动道具' : '主动道具', 24).setDepth(22);
        const description = label(this, 375, 655, definition.description, 24)
          .setWordWrapWidth(490, true).setFixedSize(500, 110).setAlign('left').setDepth(22);
        const note = label(this, 375, 735, '装备将在开始游戏后带入本局', 19, '#8b8272').setDepth(22);
        const action = this.add.rectangle(375, 815, 250, 64, 0x697e67).setDepth(22).setInteractive({ useHandCursor: true });
        const actionText = label(this, 375, 815, item.equipped ? '卸下' : '装备', 26, '#fffaf0').setDepth(23);
        const close = (): void => {
          [shade, panel, title, category, description, note, action, actionText].forEach(object => object.destroy());
          modalOpen = false;
        };
        shade.on('pointerdown', close);
        action.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          if (setEquipped(inventory, item.id, !item.equipped)) { refresh(); close(); }
          else actionText.setText('装备槽已满');
        });
      });
    });
    refresh();
  }
}

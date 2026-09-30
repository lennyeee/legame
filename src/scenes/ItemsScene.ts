import Phaser from 'phaser';
import { equipmentLimits, itemDefinitions } from '../config/equipment';
import { progressForScene, type PlayerProgress } from '../progression/PlayerProgress';
import { label } from '../ui/text';
import { showItemDetail } from '../ui/ItemDetail';
import { audioForScene, loadAudioInBackground } from '../audio/AudioManager';

export class ItemsScene extends Phaser.Scene {
  playerProgress?: PlayerProgress;
  constructor() { super('ItemsScene'); }
  create(): void {
    const progress = progressForScene(this);
    const audio = audioForScene(this);
    audio.menu(this);
    this.add.rectangle(375, 667, 750, 1334, 0xf7f3e8);
    label(this, 375, 100, '道具', 36);
    label(this, 375, 160, '已装备', 24);
    let modal = false;
    const slots: { category: 'active' | 'passive'; index: number; control: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }[] = [];
    const refresh = (): void => {
      const save = progress.save;
      for (const slot of slots) {
        const id = (slot.category === 'active' ? save.equippedActiveItemIds : save.equippedPassiveItemIds)[slot.index];
        slot.text.setText(itemDefinitions.find(def => def.id === id)?.name ?? '—');
        if (id) slot.control.setInteractive({ useHandCursor: true }); else slot.control.disableInteractive();
      }
    };
    const detail = (id: string): void => {
      if (modal) return;
      const def = itemDefinitions.find(def => def.id === id);
      if (!def || !progress.save.ownedItemIds.includes(id)) return;
      audio.uiClick();
      modal = true;
      const save = progress.save, equipped = [...save.equippedActiveItemIds, ...save.equippedPassiveItemIds].includes(id);
      showItemDetail(this, def, { text: equipped ? '卸下' : '装备', enabled: true,
        run: () => progress.equip(id, !equipped),
        failureText: def.category === 'active' ? '主动道具栏已满，请先卸下一件。' : '被动道具栏已满，请先卸下一件。' },
      () => { modal = false; refresh(); });
    };
    for (const category of ['active', 'passive'] as const) {
      const y = category === 'active' ? 270 : 410;
      label(this, 375, y - 60, category === 'active' ? '主动道具（最多2个）' : '被动道具（最多6个）', 24);
      for (let index = 0; index < equipmentLimits[category]; index++) {
        const x = 375 + (index - (equipmentLimits[category] - 1) / 2) * 100;
        const control = this.add.rectangle(x, y, 90, 72, 0xeee9dc).setStrokeStyle(2, 0xc2bcae);
        const text = label(this, x, y, '', 22).setWordWrapWidth(80, true).setAlign('center');
        slots.push({ category, index, control, text });
        control.on('pointerdown', () => {
          const save = progress.save;
          const id = (category === 'active' ? save.equippedActiveItemIds : save.equippedPassiveItemIds)[index];
          if (id) detail(id);
        });
      }
    }
    label(this, 375, 510, '我的道具', 28);
    for (const category of ['active', 'passive'] as const) {
      const y = category === 'active' ? 630 : 920;
      label(this, 375, y - 60, category === 'active' ? '主动道具' : '被动道具', 24);
      const owned = itemDefinitions.filter(def => def.category === category && progress.save.ownedItemIds.includes(def.id));
      if (!owned.length) label(this, 375, y, '暂无', 22, '#8b8272');
      // 分类分页只限制显示面积；新增定义不需要改固定道具名单或存档结构。
      const pageSize = category === 'active' ? 4 : 8;
      let page = 0;
      const cards: Phaser.GameObjects.GameObject[] = [];
      const pages = Math.ceil(owned.length / pageSize);
      const pageY = category === 'active' ? 720 : 1120;
      const pageLabel = pages > 1 ? label(this, 375, pageY, '', 20) : null;
      const drawPage = (): void => {
        cards.splice(0).forEach(object => object.destroy());
        owned.slice(page * pageSize, (page + 1) * pageSize).forEach((def, index) => {
          const x = 155 + (index % 4) * 145, rowY = y + Math.floor(index / 4) * 100;
          cards.push(this.add.rectangle(x, rowY, 116, 80, 0xe6dfc8).setInteractive({ useHandCursor: true }).on('pointerdown', () => detail(def.id)),
            label(this, x, rowY - 10, def.name, 23).setWordWrapWidth(104, true).setAlign('center'),
            label(this, x, rowY + 25, category === 'active' ? '主动' : '被动', 16, '#8b8272'));
        });
        pageLabel?.setText(`${page + 1} / ${pages}`);
      };
      if (pages > 1) for (const direction of [-1, 1]) {
        const x = 375 + direction * 140;
        this.add.rectangle(x, pageY, 100, 48, 0xe1ddcf).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => { if (!modal) { audio.uiClick(); page = (page + direction + pages) % pages; drawPage(); } });
        label(this, x, pageY, direction < 0 ? '上一页' : '下一页', 20);
      }
      drawPage();
    }
    this.add.rectangle(375, 795, 610, 2, 0xc2bcae);
    this.add.rectangle(375, 1200, 300, 76, 0x697e67).setInteractive({ useHandCursor: true }).on('pointerdown', () => { if (!modal) { audio.uiClick(); this.scene.start('ReadyScene'); } });
    label(this, 375, 1200, '返回', 28, '#fffaf0');
    refresh();
    loadAudioInBackground(this, audio);
  }
}

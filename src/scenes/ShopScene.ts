import Phaser from 'phaser';
import { itemDefinitions } from '../config/equipment';
import { progressForScene, type PlayerProgress } from '../progression/PlayerProgress';
import { shopConfig } from '../progression/shop';
import { label } from '../ui/text';
import { showItemDetail } from '../ui/ItemDetail';
import { audioForScene } from '../audio/AudioManager';

export class ShopScene extends Phaser.Scene {
  playerProgress?: PlayerProgress;
  constructor() { super('ShopScene'); }
  create(): void {
    const progress = progressForScene(this);
    const audio = audioForScene(this);
    audio.menu(this);
    this.add.rectangle(375, 667, 750, 1334, 0xf7f3e8);
    label(this, 375, 120, '商店', 42);
    const wallet = label(this, 375, 210, '', 30);
    label(this, 375, 320, `再完成 ${shopConfig.matchesPerRefresh - progress.save.shop.matchesTowardRefresh} 局刷新货架`, 26);
    const cards: { id: string; state: Phaser.GameObjects.Text }[] = [];
    const collection = label(this, 375, 820, '', 21);
    let modal = false;
    const refresh = (): void => {
      const save = progress.save;
      wallet.setText(`金币：${save.coins}`);
      collection.setText(itemDefinitions.some(def => def.shopEligible && !save.ownedItemIds.includes(def.id))
        ? '已购买商品本期不补货，完成比赛后整批刷新' : '已全部收集');
      for (const card of cards) card.state.setText(save.ownedItemIds.includes(card.id) ? '✓ 已购买' : `金币 ${itemDefinitions.find(def => def.id === card.id)!.shopPrice}`);
    };
    progress.save.shop.shelfItemIds.forEach((id, index) => {
      const def = itemDefinitions.find(def => def.id === id)!;
      const x = 155 + index * 220;
      const card = this.add.rectangle(x, 595, 190, 260, 0xeee9dc).setStrokeStyle(2, 0xc2bcae).setInteractive({ useHandCursor: true });
      label(this, x, 520, def.name, 30).setWordWrapWidth(170, true);
      label(this, x, 595, def.category === 'active' ? '主动' : '被动', 22);
      cards.push({ id, state: label(this, x, 680, '', 24) });
      card.on('pointerdown', () => {
        if (modal) return; audio.uiClick(); modal = true;
        const save = progress.save, owned = save.ownedItemIds.includes(id);
        showItemDetail(this, def, { text: owned ? '已购买' : save.coins < def.shopPrice! ? '金币不足' : '购买',
          enabled: !owned && save.coins >= def.shopPrice!, run: () => progress.buyItem(id), failureText: '无法购买' },
        () => { modal = false; refresh(); }, def.shopPrice!);
      });
    });
    this.add.rectangle(375, 1190, 300, 76, 0x697e67).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { if (!modal) { audio.uiClick(); this.scene.start('ReadyScene'); } });
    label(this, 375, 1190, '返回', 28, '#fffaf0');
    refresh();
  }
}

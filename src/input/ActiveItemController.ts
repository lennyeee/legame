import { itemDefinitions } from '../config/equipment';
import Phaser from 'phaser';
import { label } from '../ui/text';
import type { PlayerSide } from '../systems/PlayerSide';
import type { DeploymentView } from '../ui/deployment';
import type { ActiveSlotView } from '../ui/loadout';

export class ActiveItemController {
  private drag: { index: number; pointerId: number } | null = null;
  private readonly ghost: Phaser.GameObjects.Text;
  constructor(private readonly scene: Phaser.Scene, private readonly side: PlayerSide,
    private readonly slots: ActiveSlotView[], private readonly view: DeploymentView,
    private readonly canInteract: () => boolean, private readonly onUse: (success: boolean) => void) {
    const model = side.activeItems;
    this.ghost = label(scene, 0, 0, '', 22, '#697e67').setDepth(100).setVisible(false);
    slots.forEach((slot, index) => {
      if (!model.slots[index]) return;
      slot.text.setAlign('center');
      slot.box.setInteractive({ useHandCursor: true });
      slot.box.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (this.drag || !p.primaryDown || !side.running || !canInteract() || !model.ready(index)) return;
        this.drag = { index, pointerId: p.id };
        this.ghost.setText(this.itemName(index)).setPosition(p.x, p.y).setVisible(true);
        this.refresh();
      });
    });
    scene.input.on('pointermove', this.move);
    scene.input.on('pointerup', this.finish);
    scene.input.on('pointerupoutside', this.cancelPointer);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.cancel);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy);
    this.refresh();
  }
  private get model() { return this.side.activeItems; }
  private itemName(index: number): string {
    return itemDefinitions.find(item => item.id === this.model.slots[index]?.id)?.name ?? '';
  }
  get isDragging(): boolean { return this.drag !== null; }
  refresh(): void {
    this.slots.forEach((slot, index) => {
      const state = this.model.slots[index];
      if (!state) return;
      slot.text.setText(this.itemName(index).replace(/^(.{3})(.+)$/, '$1\n$2') + '\n' + (this.drag?.index === index ? '拖动中' : state.remainingMs > 0
        ? Math.ceil(state.remainingMs / 1000) + 's' : '可用'));
      slot.box.setStrokeStyle(2, this.model.ready(index) ? 0x697e67 : 0xc2bcae);
    });
  }
  private move = (p: Phaser.Input.Pointer): void => {
    if (p.id === this.drag?.pointerId) this.ghost.setPosition(p.x, p.y);
  };
  private finish = (p: Phaser.Input.Pointer): void => {
    if (!this.drag || p.id !== this.drag.pointerId) return;
    const success = p.event?.type !== 'touchcancel' && this.canInteract()
      && this.side.useActiveItem(this.drag.index, this.view.positionAt(p.x, p.y));
    this.cancel();
    this.onUse(success);
  };
  private cancelPointer = (p: Phaser.Input.Pointer): void => { if (p.id === this.drag?.pointerId) this.cancel(); };
  cancel = (): void => { this.drag = null; this.ghost.setVisible(false); this.refresh(); };
  private destroy = (): void => {
    this.scene.input.off('pointermove', this.move);
    this.scene.input.off('pointerup', this.finish);
    this.scene.input.off('pointerupoutside', this.cancelPointer);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.cancel);
    this.ghost.destroy();
  };
}

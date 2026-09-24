import Phaser from 'phaser';
import type { PlayerSide } from '../systems/PlayerSide';
import { getDragItem } from '../systems/board';
import type { UnitPosition, DropAction } from '../systems/board';
import type { DeploymentView } from '../ui/deployment';

// 鼠标与触摸共享 Phaser Pointer；松手前不改数据，取消即恢复原位。
export class DeploymentController {
  private active: { pointerId: number; source: UnitPosition; x: number; y: number; moved: boolean } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly side: PlayerSide,
    private readonly view: DeploymentView,
    private readonly onDrop: (result: DropAction) => void,
    private readonly canInteract: () => boolean = () => true,
  ) {
    scene.input.on('pointerdown', this.start);
    scene.input.on('pointermove', this.move);
    scene.input.on('pointerup', this.finish);
    scene.input.on('pointerupoutside', this.cancelPointer);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.cancel);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy);
  }

  private get board() { return this.side.board; }
  private get recruitment() { return this.side.recruitment; }

  get isDragging(): boolean { return this.active !== null; }

  get draggedTile(): number | null {
    return this.active?.moved && this.active.source.kind === 'tile' ? this.active.source.index : null;
  }

  refresh(): void {
    this.side.syncDeployment(this.draggedTile);
    this.view.refresh(this.board, this.recruitment, this.active?.moved ? this.active.source : undefined);
  }

  private start = (pointer: Phaser.Input.Pointer): void => {
    if (!this.side.running || !this.canInteract() || this.active || !pointer.primaryDown) return;
    const source = this.view.positionAt(pointer.x, pointer.y);
    if (!source) return;
    const item = getDragItem(this.board, this.recruitment, source);
    if (!item) return;
    this.active = { pointerId: pointer.id, source, x: pointer.x, y: pointer.y, moved: false };
  };

  private move = (pointer: Phaser.Input.Pointer): void => {
    if (!this.active || pointer.id !== this.active.pointerId) return;
    if (!this.active.moved) {
      if (Math.hypot(pointer.x - this.active.x, pointer.y - this.active.y) < 8) return;
      this.active.moved = true;
      this.view.ghost.show(getDragItem(this.board, this.recruitment, this.active.source));
      this.refresh();
    }
    this.view.ghost.root.setPosition(pointer.x, pointer.y);
    this.view.highlight(this.board, this.recruitment, this.active.source, this.view.positionAt(pointer.x, pointer.y));
  };

  private finish = (pointer: Phaser.Input.Pointer): void => {
    if (!this.active || pointer.id !== this.active.pointerId) return;
    // 单击只用于查看射程，不能被当成原位拖放失败，也不暂停战斗。
    if (!this.active.moved) { this.cancel(); return; }
    const cancelled = pointer.event?.type === 'touchcancel';
    const result = cancelled ? 'invalid' : this.side.drop(
      this.active.source, this.view.positionAt(pointer.x, pointer.y),
    );
    this.cancel();
    this.onDrop(result);
  };

  private cancelPointer = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.active?.pointerId) this.cancel();
  };

  cancel = (): void => {
    this.active = null;
    this.view.clearDrag();
    this.refresh();
  };

  private destroy = (): void => {
    this.scene.input.off('pointerdown', this.start);
    this.scene.input.off('pointermove', this.move);
    this.scene.input.off('pointerup', this.finish);
    this.scene.input.off('pointerupoutside', this.cancelPointer);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.cancel);
  };
}

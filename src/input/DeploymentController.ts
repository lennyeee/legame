import Phaser from 'phaser';
import { applyDrop, getDragItem } from '../systems/board';
import type { BoardState, UnitPosition, DropAction } from '../systems/board';
import type { RecruitmentState } from '../systems/recruitment';
import type { DeploymentView } from '../ui/deployment';

// 鼠标与触摸共享 Phaser Pointer；松手前不改数据，取消即恢复原位。
export class DeploymentController {
  private active: { pointerId: number; source: UnitPosition } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly board: BoardState,
    private readonly recruitment: RecruitmentState,
    private readonly view: DeploymentView,
    private readonly onDrop: (result: DropAction) => void,
  ) {
    scene.input.on('pointerdown', this.start);
    scene.input.on('pointermove', this.move);
    scene.input.on('pointerup', this.finish);
    scene.input.on('pointerupoutside', this.cancelPointer);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.cancel);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy);
  }

  get isDragging(): boolean { return this.active !== null; }

  refresh(): void {
    this.view.refresh(this.board, this.recruitment, this.active?.source);
  }

  private start = (pointer: Phaser.Input.Pointer): void => {
    if (this.active || !pointer.primaryDown) return;
    const source = this.view.positionAt(pointer.x, pointer.y);
    if (!source) return;
    const item = getDragItem(this.board, this.recruitment, source);
    if (!item) return;
    this.active = { pointerId: pointer.id, source };
    this.view.ghost.show(item);
    this.refresh();
    this.move(pointer);
  };

  private move = (pointer: Phaser.Input.Pointer): void => {
    if (!this.active || pointer.id !== this.active.pointerId) return;
    this.view.ghost.root.setPosition(pointer.x, pointer.y);
    this.view.highlight(this.board, this.recruitment, this.active.source, this.view.positionAt(pointer.x, pointer.y));
  };

  private finish = (pointer: Phaser.Input.Pointer): void => {
    if (!this.active || pointer.id !== this.active.pointerId) return;
    const cancelled = pointer.event?.type === 'touchcancel';
    const result = cancelled ? 'invalid' : applyDrop(
      this.board, this.recruitment, this.active.source, this.view.positionAt(pointer.x, pointer.y),
    );
    this.cancel();
    this.onDrop(result);
  };

  private cancelPointer = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.active?.pointerId) this.cancel();
  };

  private cancel = (): void => {
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

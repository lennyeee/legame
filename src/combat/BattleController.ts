import type { PlayerSide } from '../systems/PlayerSide';
import Phaser from 'phaser';
import type { DeploymentController } from '../input/DeploymentController';
import type { DeploymentView } from '../ui/deployment';
import { CombatView } from '../ui/combat';
import type { CombatSimulation, CombatEvent } from './CombatSimulation';
import type { UnitCombatSnapshot } from './CombatSimulation';
import { UnitStatsPanel } from '../ui/unitStatsPanel';

// 仅此适配层连接 Phaser 输入/帧循环、规则和画面。
export class BattleController {
  private readonly battle: CombatSimulation;
  private readonly view: CombatView;
  private readonly panel: UnitStatsPanel | null;
  private selected: { index: number; subject: UnitCombatSnapshot['subject'] } | null = null;
  private pending: { id: number; x: number; y: number; index: number; subject: UnitCombatSnapshot['subject']; moved: boolean } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly side: PlayerSide,
    private readonly deployment?: DeploymentController,
    private readonly deploymentView?: DeploymentView,
  ) {
    this.battle = side.combat;
    this.view = new CombatView(scene, this.battle, side.id === 'top' ? 'top' : 'bottom');
    this.panel = deployment && deploymentView ? new UnitStatsPanel(scene, this.battle.map) : null;
    if (deployment && deploymentView) {
      scene.input.on('pointerdown', this.select);
      scene.input.on('pointermove', this.hideWhenDragging);
      scene.input.on('pointerup', this.release);
      scene.input.on('pointerupoutside', this.cancelPointer);
      scene.game.events.on(Phaser.Core.Events.BLUR, this.hideRange);
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy);
  }

  private select = (pointer: Phaser.Input.Pointer): void => {
    if (!this.deployment || !this.deploymentView || !this.side.running || !pointer.primaryDown
      || this.pending || this.deployment.draggedTile !== null) return;
    this.battle.syncBoard();
    const position = this.deploymentView.positionAt(pointer.x, pointer.y);
    const index = position?.kind === 'tile' ? position.index : null;
    const snapshot = index !== null ? this.battle.getUnitCombatSnapshot(index) : null;
    this.hideRange();
    if (!snapshot || index === null) return;
    this.pending = { id: pointer.id, x: pointer.x, y: pointer.y, index, subject: snapshot.subject, moved: false };
    // 按下时立即预览射程；确认是点击而非拖动后再打开面板。
    this.view.select(index);
  };

  hideRange = (): void => {
    this.pending = null;
    this.selected = null;
    this.view.select(null);
    this.panel?.hide();
  };

  private release = (pointer: Phaser.Input.Pointer): void => {
    const pending = this.pending;
    if (!pending || pointer.id !== pending.id) return;
    this.pending = null;
    this.battle.syncBoard(this.deployment?.draggedTile ?? null);
    const position = this.deploymentView?.positionAt(pointer.x, pointer.y);
    const snapshot = this.battle.getUnitCombatSnapshot(pending.index);
    if (pending.moved || position?.kind !== 'tile' || position.index !== pending.index
      || snapshot?.subject !== pending.subject || !this.side.running) {
      this.hideRange();
      return;
    }
    this.selected = { index: pending.index, subject: pending.subject };
    this.view.select(pending.index);
    this.panel?.show(pending.index, snapshot);
  };

  private cancelPointer = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.pending?.id) this.hideRange();
  };

  private hideWhenDragging = (pointer: Phaser.Input.Pointer): void => {
    if (!this.deployment) return;
    this.battle.syncBoard(this.deployment.draggedTile);
    if (pointer.id !== this.pending?.id) return;
    if (this.deployment.draggedTile !== null || Math.hypot(pointer.x - this.pending.x,
      pointer.y - this.pending.y) >= 8) {
      this.pending.moved = true;
      this.view.select(null);
      this.panel?.hide();
      this.selected = null;
    }
  };

  // Match已完成双方统一逻辑步，此处只消费本方事件并呈现，不再调度战斗。
  render(events: CombatEvent[], time: number): void {
    if (events.some(event => event.kind === 'kill')) this.deployment?.refresh();
    if (!this.side.running) this.hideRange();
    if (this.selected) {
      const snapshot = this.battle.getUnitCombatSnapshot(this.selected.index);
      if (snapshot?.subject !== this.selected.subject) this.hideRange();
      else this.panel?.show(this.selected.index, snapshot);
    }
    this.view.render(events, time);
  }

  private destroy = (): void => {
    this.scene.input.off('pointerdown', this.select);
    this.scene.input.off('pointermove', this.hideWhenDragging);
    this.scene.input.off('pointerup', this.release);
    this.scene.input.off('pointerupoutside', this.cancelPointer);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.hideRange);
    this.hideRange();
    this.panel?.destroy();
  };
}

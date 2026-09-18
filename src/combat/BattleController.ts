import Phaser from 'phaser';
import { isUnit } from '../systems/items';
import { waveConfig } from '../config/waves';
import { WaveProgress } from './WaveProgress';
import type { BoardMap } from '../config/maps';
import type { BoardState } from '../systems/board';
import type { DeploymentController } from '../input/DeploymentController';
import type { DeploymentView } from '../ui/deployment';
import { CombatView } from '../ui/combat';
import { CombatSimulation } from './CombatSimulation';

// 仅此适配层连接 Phaser 输入/帧循环、规则和画面。
export class BattleController {
  private readonly battle: CombatSimulation;
  private readonly view: CombatView;
  private previewPointerId: number | null = null;
  private visualTime = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    map: BoardMap,
    board: BoardState,
    private readonly wallet: { money: number },
    private readonly deployment: DeploymentController,
    private readonly deploymentView: DeploymentView,
    private readonly refreshMoney: () => void,
    private readonly refreshProgress: (progress: WaveProgress) => void = () => {},
  ) {
    this.battle = new CombatSimulation(map, board, wallet, undefined, new WaveProgress(waveConfig));
    this.view = new CombatView(scene, this.battle);
    this.refreshProgress(this.battle.progress!);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update);
    scene.input.on('pointerdown', this.select);
    scene.input.on('pointermove', this.hideWhenDragging);
    scene.input.on('pointerup', this.release);
    scene.input.on('pointerupoutside', this.release);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.hideRange);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy);
  }

  private select = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.primaryDown || this.previewPointerId !== null || this.deployment.draggedTile !== null) return;
    const position = this.deploymentView.positionAt(pointer.x, pointer.y);
    const index = position?.kind === 'tile' ? position.index : null;
    const selected = index !== null && isUnit(this.battle.board.tiles[index]?.unit) ? index : null;
    this.previewPointerId = selected !== null ? pointer.id : null;
    this.view.select(selected);
  };

  hideRange = (): void => {
    this.previewPointerId = null;
    this.view.select(null);
  };

  private release = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.previewPointerId) this.hideRange();
  };

  private hideWhenDragging = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.previewPointerId && this.deployment.draggedTile !== null) this.hideRange();
  };

  private update = (_time: number, delta: number): void => {
    // 场景暂停时不累计视觉时间，恢复后弹道/闪光不会跳过暂停时长。
    this.visualTime += delta;
    const before = this.wallet.money;
    const events = this.battle.update(delta, this.deployment.draggedTile);
    if (this.battle.progress!.status !== 'playing') this.hideRange();
    this.view.render(events, this.visualTime);
    this.refreshProgress(this.battle.progress!);
    if (this.wallet.money !== before) this.refreshMoney();
  };

  private destroy = (): void => {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update);
    this.scene.input.off('pointerdown', this.select);
    this.scene.input.off('pointermove', this.hideWhenDragging);
    this.scene.input.off('pointerup', this.release);
    this.scene.input.off('pointerupoutside', this.release);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.hideRange);
  };
}

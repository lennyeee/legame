import Phaser from 'phaser';
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

  constructor(
    private readonly scene: Phaser.Scene,
    map: BoardMap,
    board: BoardState,
    private readonly wallet: { money: number },
    private readonly deployment: DeploymentController,
    private readonly deploymentView: DeploymentView,
    private readonly refreshMoney: () => void,
  ) {
    this.battle = new CombatSimulation(map, board, wallet);
    this.view = new CombatView(scene, this.battle);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update);
    scene.input.on('pointerdown', this.select);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy);
  }

  private select = (pointer: Phaser.Input.Pointer): void => {
    const position = this.deploymentView.positionAt(pointer.x, pointer.y);
    const index = position?.kind === 'tile' ? position.index : null;
    this.view.select(index !== null && this.battle.board.tiles[index]?.unit ? index : null);
  };

  private update = (time: number, delta: number): void => {
    const before = this.wallet.money;
    const events = this.battle.update(delta, this.deployment.draggedTile);
    this.view.render(events, time);
    if (this.wallet.money !== before) this.refreshMoney();
  };

  private destroy = (): void => {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update);
    this.scene.input.off('pointerdown', this.select);
  };
}

import type { BoardMap } from '../config/maps';
import { waveConfig } from '../config/waves';
import { passiveEconomy } from '../config/equipment';
import { CombatSimulation } from '../combat/CombatSimulation';
import { WaveProgress } from '../combat/WaveProgress';
import { createBoardState, applyDrop } from './board';
import type { UnitPosition, DropAction } from './board';
import { createRecruitmentState, recruit, hasPassive } from './recruitment';
import type { Loadout } from './equipment';
import type { Farmer } from './items';
import { getHeroProgression } from './heroProgression';
import { FarmerProduction } from './FarmerProduction';
import { ActiveItems } from './ActiveItems';

// 单方实例的组装边界；地图/配置可以共享，所有运行状态在这里独立创建。
// 暂时保留单边 WaveProgress（含 HP/结算），不引入双边 Match 时间轴。
export class PlayerSide {
  readonly id: string;
  readonly recruitment;
  readonly board;
  readonly heroes;
  readonly progress;
  readonly combat;
  readonly farmers;
  readonly activeItems;
  readonly passives = { ironRiceSeconds: 0 };
  private lifecycle: 'running' | 'paused' | 'stopped' | 'destroyed' = 'running';

  constructor(id: string, map: BoardMap, loadout?: Loadout) {
    this.id = id;
    this.recruitment = createRecruitmentState(loadout);
    this.board = createBoardState(map);
    this.heroes = getHeroProgression(this.board);
    this.progress = new WaveProgress(waveConfig);
    this.combat = new CombatSimulation(map, this.board, this.recruitment, undefined, this.progress);
    this.farmers = new FarmerProduction(this.board, this.recruitment);
    this.activeItems = new ActiveItems(this.recruitment.loadout);
  }

  get running(): boolean { return this.lifecycle === 'running' && this.progress.status === 'playing'; }
  pause(): void { if (this.running) this.lifecycle = 'paused'; }
  resume(): void { if (this.lifecycle === 'paused') this.lifecycle = 'running'; }

  recruit(random?: () => number): boolean {
    return this.running && recruit(this.recruitment, random);
  }

  drop(source: UnitPosition, target: UnitPosition | null, random?: () => number): DropAction {
    if (!this.running) return 'invalid';
    const result = applyDrop(this.board, this.recruitment, source, target, random);
    this.farmers.sync();
    return result;
  }

  useActiveItem(index: number, target: UnitPosition | null): boolean {
    if (!this.running) return false;
    const result = this.activeItems.use(index, this.board, this.recruitment, target);
    this.farmers.sync();
    return result;
  }

  collectFarmerReward(farmer: Farmer, rewardId: number): boolean {
    return this.running && this.farmers.collect(farmer, rewardId);
  }

  // 输入层仍决定何时开始/取消拖动；保留悬起格子的 HeroLink 生命周期。
  syncDeployment(draggedTile: number | null): void {
    if (this.lifecycle !== 'destroyed') this.heroes.sync(draggedTile);
  }

  updateCombat(delta: number, draggedTile: number | null) {
    return this.running ? this.combat.update(delta, draggedTile) : [];
  }

  updateItems(delta: number): void {
    if (!this.running) return;
    this.activeItems.update(delta);
    this.farmers.update(delta);
  }

  // 调度仍由 Phaser 的原有 1 秒定时器提供，暂停不改变原来的余数/节奏。
  tickPassiveSecond(): boolean {
    if (!this.running || !hasPassive(this.recruitment, 'iron_rice_bowl')) return false;
    if (++this.passives.ironRiceSeconds % passiveEconomy.ironRiceIntervalSeconds !== 0) return false;
    this.recruitment.money += passiveEconomy.ironRiceReward;
    return true;
  }

  stop(): void {
    if (this.lifecycle === 'destroyed') return;
    this.lifecycle = 'stopped';
    this.farmers.stop();
    this.activeItems.stop();
  }

  destroy(): void {
    if (this.lifecycle === 'destroyed') return;
    this.stop();
    this.activeItems.destroy();
    this.farmers.destroy();
    this.combat.destroy();
    this.heroes.clear();
    this.lifecycle = 'destroyed';
  }
}

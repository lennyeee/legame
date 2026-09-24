import type { BoardMap } from '../config/maps';
import { combatConfig } from '../config/combat';
import { waveConfig } from '../config/waves';
import type { WaveConfig } from '../config/waves';
import type { Loadout } from '../systems/equipment';
import { PlayerSide } from '../systems/PlayerSide';
import type { CombatEvent } from '../combat/CombatSimulation';
import { MatchTimeline } from './MatchTimeline';

export type SideId = 'bottom' | 'top';
export type MatchResult = 'bottom' | 'top' | 'draw';
export interface MatchEvents { bottom: CombatEvent[]; top: CombatEvent[] }

// 唯一的双边逻辑时钟。每个固定步先完成双方战斗，再统一判定HP结果。
export class Match {
  readonly bottomSide: PlayerSide;
  readonly topSide: PlayerSide;
  readonly sides;
  readonly timeline: MatchTimeline;
  readonly health: Record<SideId, number>;
  status: 'running' | 'paused' | 'ended' | 'destroyed' = 'running';
  result: MatchResult | null = null;
  private accumulator = 0;
  private passiveClock = 0;
  private runtimeElapsedMs = 0;

  constructor(map: BoardMap, bottomLoadout?: Loadout, topLoadout?: Loadout, config: WaveConfig = waveConfig) {
    this.bottomSide = new PlayerSide('bottom', map, bottomLoadout, { automaticWaves: false });
    this.topSide = new PlayerSide('top', map, topLoadout, { automaticWaves: false });
    this.sides = { bottom: this.bottomSide, top: this.topSide };
    this.timeline = new MatchTimeline(config);
    this.health = { bottom: config.baseHealth, top: config.baseHealth };
  }

  get running(): boolean { return this.status === 'running'; }

  update(deltaMs: number, draggedTile: number | null = null): MatchEvents {
    const events: MatchEvents = { bottom: [], top: [] };
    if (!this.running || !Number.isFinite(deltaMs) || deltaMs <= 0) return events;
    this.accumulator += Math.min(deltaMs, combatConfig.maxFrameMs);
    const step = combatConfig.stepMs;
    while (this.running && this.accumulator + 1e-8 >= step) {
      this.accumulator -= step;
      for (const spawn of this.timeline.advance(step)) {
        for (const side of Object.values(this.sides)) {
          side.combat.spawnEnemy(spawn.hpMultiplier).spawnEventId = spawn.id;
        }
      }
      const batch: MatchEvents = { bottom: [], top: [] };
      for (const id of Object.keys(this.sides) as SideId[]) {
        batch[id] = this.sides[id].updateCombat(step, id === 'bottom' ? draggedTile : null);
      }
      // 不在单方escape回调中结算，双方都已完成相同的逻辑步。
      for (const id of ['bottom', 'top'] as const) {
        events[id].push(...batch[id]);
        this.health[id] = Math.max(0, this.health[id] - batch[id].filter(event => event.kind === 'escape').length);
      }
      if (this.health.bottom === 0 || this.health.top === 0) {
        this.result = this.health.bottom === 0 ? (this.health.top === 0 ? 'draw' : 'top') : 'bottom';
        this.status = 'ended';
        this.bottomSide.stop();
        this.topSide.stop();
        break;
      }
      // 生产/CD原有接口使用毫秒：派发累计整毫秒差，避免60Hz浮点累加在12秒边界漏一帧。
      const elapsedMs = Math.round(this.timeline.elapsedMs);
      const runtimeDelta = elapsedMs - this.runtimeElapsedMs;
      this.runtimeElapsedMs = elapsedMs;
      this.bottomSide.updateItems(runtimeDelta);
      this.topSide.updateItems(runtimeDelta);
      this.passiveClock += runtimeDelta;
      if (this.passiveClock + 1e-8 >= 1000) {
        this.passiveClock -= 1000;
        this.bottomSide.tickPassiveSecond();
        this.topSide.tickPassiveSecond();
      }
    }
    return events;
  }

  pause(): void {
    if (!this.running) return;
    this.status = 'paused'; this.bottomSide.pause(); this.topSide.pause();
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'running'; this.bottomSide.resume(); this.topSide.resume();
  }

  // 重开由场景销毁旧Match后重新构造；这里不保留timer或异步回调。
  destroy(): void {
    this.status = 'destroyed';
    this.accumulator = 0; this.passiveClock = 0; this.runtimeElapsedMs = 0;
    this.bottomSide.destroy(); this.topSide.destroy();
  }
}

import { combatConfig, getCombatStats } from '../config/combat';
import type { CombatConfig } from '../config/combat';
import type { BoardMap, MapPoint } from '../config/maps';
import type { BoardState } from '../systems/board';
import type { Unit } from '../systems/items';
import { buildPath } from './path';
import { advanceEnemy, createEnemy, damageEnemy } from './enemies';
import type { Enemy } from './enemies';
import { inRange, lineEnd, piercingTargets, selectTarget } from './targeting';

interface Attacker {
  unit: Unit;
  type: Unit['type'];
  level: number;
  cooldown: number;
}

export interface AttackEffect {
  kind: 'attack';
  tileIndex: number;
  unit: Unit;
  level: number;
  type: Unit['type'];
  origin: MapPoint;
  end: MapPoint;
  range: number;
}

export interface Projectile extends MapPoint {
  id: number;
  tileIndex: number;
  unit: Unit;
  level: number;
  targetId: number;
  damage: number;
  range: number;
}

export type CombatEvent = AttackEffect
  | { kind: 'hit'; enemyId: number }
  | { kind: 'kill'; enemyId: number; position: MapPoint; reward: number }
  | { kind: 'escape'; enemyId: number };

// 无 Phaser 依赖：地图、棋盘和钱包由外部提供，待放置栏从不进入索敌流程。
export class CombatSimulation {
  readonly path;
  readonly map: BoardMap;
  readonly board: BoardState;
  readonly config: CombatConfig;
  private readonly wallet: { money: number };
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  private readonly attackers = new Map<number, Attacker>();
  private elapsed = 0;
  private spawnClock = 0;
  private nextEnemyId = 1;
  private nextProjectileId = 1;
  private suspendedTile: number | null = null;

  constructor(
    map: BoardMap,
    board: BoardState,
    wallet: { money: number },
    config: CombatConfig = combatConfig,
  ) {
    this.map = map;
    this.board = board;
    this.wallet = wallet;
    this.config = config;
    this.path = buildPath(map.path);
  }

  spawnEnemy(): Enemy {
    const enemy = createEnemy(this.nextEnemyId++, this.path, this.config.enemy);
    this.enemies.push(enemy);
    return enemy;
  }

  isAttackerValid(tileIndex: number, unit: Unit, level: number): boolean {
    const tile = this.board.tiles[tileIndex];
    return tileIndex !== this.suspendedTile && !!tile?.unlocked && tile.unit === unit && unit.level === level;
  }

  syncBoard(suspendedTile: number | null = null): void {
    this.suspendedTile = suspendedTile;
    for (const [index, attacker] of this.attackers) {
      if (!this.isAttackerValid(index, attacker.unit, attacker.level) || attacker.unit.type !== attacker.type) {
        this.attackers.delete(index);
      }
    }
    this.board.tiles.forEach((tile, index) => {
      if (!tile.unit || !tile.unlocked || index === suspendedTile || this.attackers.has(index)) return;
      this.attackers.set(index, {
        unit: tile.unit, type: tile.unit.type, level: tile.unit.level,
        cooldown: getCombatStats(tile.unit).attackInterval,
      });
    });
    this.projectiles = this.projectiles.filter(arrow => this.isAttackerValid(arrow.tileIndex, arrow.unit, arrow.level));
  }

  update(deltaMs: number, suspendedTile: number | null = null): CombatEvent[] {
    this.syncBoard(suspendedTile);
    const events: CombatEvent[] = [];
    this.elapsed += Math.max(0, Math.min(deltaMs, this.config.maxFrameMs));
    while (this.elapsed + 1e-8 >= this.config.stepMs) {
      this.step(this.config.stepMs, events);
      this.elapsed -= this.config.stepMs;
    }
    return events;
  }

  private hit(enemy: Enemy, damage: number, events: CombatEvent[]): void {
    const result = damageEnemy(enemy, damage);
    if (result.applied > 0) events.push({ kind: 'hit', enemyId: enemy.id });
    if (result.killed) {
      this.wallet.money += this.config.enemy.killReward;
      events.push({ kind: 'kill', enemyId: enemy.id, position: { x: enemy.x, y: enemy.y }, reward: this.config.enemy.killReward });
    }
  }

  private step(deltaMs: number, events: CombatEvent[]): void {
    const seconds = deltaMs / 1000;
    this.spawnClock += deltaMs;
    if (this.spawnClock + 1e-8 >= this.config.spawnInterval) {
      this.spawnClock -= this.config.spawnInterval;
      this.spawnEnemy();
    }
    this.enemies = this.enemies.filter(enemy => {
      if (enemy.hp <= 0) return false;
      if (!advanceEnemy(enemy, this.path, seconds)) return true;
      events.push({ kind: 'escape', enemyId: enemy.id });
      return false;
    });

    this.projectiles = this.projectiles.filter(arrow => {
      const target = this.enemies.find(enemy => enemy.id === arrow.targetId && enemy.hp > 0);
      const origin = this.map.cells[arrow.tileIndex]!;
      if (!target || !inRange(origin, target, arrow.range)) return false;
      const distance = Math.hypot(target.x - arrow.x, target.y - arrow.y);
      const travel = this.config.arrowSpeed * seconds;
      if (distance <= travel) {
        this.hit(target, arrow.damage, events);
        return false;
      }
      arrow.x += (target.x - arrow.x) / distance * travel;
      arrow.y += (target.y - arrow.y) / distance * travel;
      return true;
    });

    for (const [tileIndex, attacker] of this.attackers) {
      const stats = getCombatStats(attacker.unit);
      attacker.cooldown = Math.max(0, attacker.cooldown - deltaMs);
      if (attacker.cooldown > 1e-8) continue;
      const origin = this.map.cells[tileIndex]!;
      const target = selectTarget(this.enemies, origin, stats.range);
      if (!target) continue;
      attacker.cooldown = stats.attackInterval;
      events.push({
        kind: 'attack', tileIndex, unit: attacker.unit, level: attacker.level, type: attacker.type,
        origin: { x: origin.x, y: origin.y },
        end: attacker.type === '枪' ? lineEnd(origin, target, stats.range) : { x: target.x, y: target.y },
        range: stats.range,
      });
      if (attacker.type === '弓') {
        this.projectiles.push({
          id: this.nextProjectileId++, tileIndex, unit: attacker.unit, level: attacker.level,
          targetId: target.id, damage: stats.damage, range: stats.range, x: origin.x, y: origin.y,
        });
      } else {
        const victims = attacker.type === '枪'
          ? piercingTargets(this.enemies, origin, target, stats.range, this.config.spearWidth)
          : attacker.type === '骑'
            ? this.enemies.filter(enemy => enemy.hp > 0 && inRange(origin, enemy, stats.range))
            : [target];
        victims.forEach(enemy => this.hit(enemy, stats.damage, events));
      }
    }
    this.enemies = this.enemies.filter(enemy => enemy.hp > 0);
  }
}

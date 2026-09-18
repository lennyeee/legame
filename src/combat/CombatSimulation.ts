import { combatConfig, getCombatStats } from '../config/combat';
import type { CombatConfig } from '../config/combat';
import type { BoardMap, MapPoint } from '../config/maps';
import type { BoardState } from '../systems/board';
import type { Unit } from '../systems/items';
import { isUnit } from '../systems/items';
import { buildPath } from './path';
import { advanceEnemy, createEnemy, damageEnemy } from './enemies';
import type { Enemy } from './enemies';
import { inRange, lineEnd, piercingTargets, selectTarget } from './targeting';
import type { WaveProgress } from './WaveProgress';
import { getHeroLinks } from '../systems/heroActivation';
import type { HeroLink } from '../systems/heroActivation';
import { heroCombat } from '../config/heroes';

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
  | { kind: 'heroAttack'; link: HeroLink; end: MapPoint }
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
  private readonly heroAttackers = new Map<string, { link: HeroLink; cooldown: number }>();
  private elapsed = 0;
  readonly progress: WaveProgress | null;
  private nextEnemyId = 1;
  private nextProjectileId = 1;
  private suspendedTile: number | null = null;

  constructor(
    map: BoardMap,
    board: BoardState,
    wallet: { money: number },
    config: CombatConfig = combatConfig,
    progress: WaveProgress | null = null,
  ) {
    this.progress = progress;
    this.map = map;
    this.board = board;
    this.wallet = wallet;
    this.config = config;
    this.path = buildPath(map.path);
  }

  spawnEnemy(hpMultiplier = 1): Enemy {
    const enemy = createEnemy(this.nextEnemyId++, this.path, {
      ...this.config.enemy, maxHp: Math.round(this.config.enemy.maxHp * hpMultiplier),
    });
    this.enemies.push(enemy);
    return enemy;
  }

  isAttackerValid(tileIndex: number, unit: Unit, level: number): boolean {
    const tile = this.board.tiles[tileIndex];
    return tileIndex !== this.suspendedTile && !!tile?.unlocked && tile.unit === unit && unit.level === level;
  }

  syncBoard(suspendedTile: number | null = null): void {
    this.suspendedTile = suspendedTile;
    const links = this.heroLinks;
    for (const [key, state] of this.heroAttackers) {
      if (!links.some(link => link.key === key && link.left === state.link.left && link.right === state.link.right)) this.heroAttackers.delete(key);
    }
    for (const link of links) {
      if (!this.heroAttackers.has(link.key)) this.heroAttackers.set(link.key, { link, cooldown: heroCombat.attackInterval });
    }
    for (const [index, attacker] of this.attackers) {
      if (!this.isAttackerValid(index, attacker.unit, attacker.level) || attacker.unit.type !== attacker.type) {
        this.attackers.delete(index);
      }
    }
    this.board.tiles.forEach((tile, index) => {
      if (!isUnit(tile.unit) || !tile.unlocked || index === suspendedTile || this.attackers.has(index)) return;
      this.attackers.set(index, {
        unit: tile.unit, type: tile.unit.type, level: tile.unit.level,
        cooldown: getCombatStats(tile.unit).attackInterval,
      });
    });
    this.projectiles = this.projectiles.filter(arrow => this.isAttackerValid(arrow.tileIndex, arrow.unit, arrow.level));
  }

  update(deltaMs: number, suspendedTile: number | null = null): CombatEvent[] {
    if (this.progress && this.progress.status !== 'playing') return [];
    this.syncBoard(suspendedTile);
    const events: CombatEvent[] = [];
    this.elapsed += Math.max(0, Math.min(deltaMs, this.config.maxFrameMs));
    while (this.elapsed + 1e-8 >= this.config.stepMs) {
      this.step(this.config.stepMs, events);
      this.elapsed -= this.config.stepMs;
      if (this.progress && this.progress.status !== 'playing') {
        this.projectiles = [];
        this.attackers.clear();
        this.heroAttackers.clear();
        this.elapsed = 0;
        break;
      }
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

  get heroLinks(): HeroLink[] { return getHeroLinks(this.map, this.board, this.suspendedTile); }

  isHeroLinkValid(link: HeroLink): boolean {
    return (!this.progress || this.progress.status === 'playing') && this.heroLinks.some(current =>
      current.key === link.key && current.left === link.left && current.right === link.right);
  }

  private step(deltaMs: number, events: CombatEvent[]): void {
    const seconds = deltaMs / 1000;
    this.progress?.tick(deltaMs, multiplier => this.spawnEnemy(multiplier));
    for (const enemy of [...this.enemies]) {
      if (enemy.hp <= 0) continue;
      if (!advanceEnemy(enemy, this.path, seconds)) continue;
      events.push({ kind: 'escape', enemyId: enemy.id });
      this.enemies = this.enemies.filter(candidate => candidate !== enemy);
      this.progress?.escape();
      if (this.progress?.status === 'defeat') return;
    }

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
    for (const attacker of this.heroAttackers.values()) {
      attacker.cooldown = Math.max(0, attacker.cooldown - deltaMs);
      if (attacker.cooldown > 1e-8) continue;
      const target = selectTarget(this.enemies, attacker.link.origin, heroCombat.range);
      if (!target) continue;
      attacker.cooldown = heroCombat.attackInterval;
      events.push({ kind: 'heroAttack', link: attacker.link, end: { x: target.x, y: target.y } });
      this.hit(target, heroCombat.damage, events);
    }
    this.enemies = this.enemies.filter(enemy => enemy.hp > 0);
    this.progress?.finishStep(this.enemies.length);
  }
}

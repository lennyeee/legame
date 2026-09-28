import { aiConfig } from '../config/ai';
import type { BoardMap, MapPoint } from '../config/maps';
import type { Enemy } from '../combat/enemies';
import type { PlayerSide } from '../systems/PlayerSide';
import { isUnit } from '../systems/items';
import type { ReserveItem, Unit } from '../systems/items';
import { getCombatStats } from '../config/combat';
import { getHeroStats } from '../config/heroes';
import { applyTileBonuses } from '../combat/tileBonuses';

export interface ActionValue {
  combat: 'deploy' | 'hero' | 'merge' | 'holdingMerge' | null;
  construction: boolean;
  unlock: boolean;
  freesHolding: boolean;
  placement: number;
}

export interface CurrentStateSnapshot {
  livingEnemyCount: number;
  enemyProgress: number;
  deployedAttackers: number;
  effectiveAttackers: number;
  activeHeroes: number;
  holding: readonly (ReserveItem | null)[];
  occupiedHolding: number;
  emptyTiles: number;
  hasImmediateMerge: boolean;
  hasImmediateHero: boolean;
  hasCombatDeployment: boolean;
  readiness: 'LOW' | 'OK';
}

// 只读取本方现状，不运行战斗模拟、不写入棋盘，也不读取时间轴。
export function currentStateSnapshot(side: PlayerSide, values: readonly ActionValue[], hasMerge: boolean): CurrentStateSnapshot {
  const c = aiConfig.evaluation.defense;
  const enemies = side.combat.enemies.filter(enemy => enemy.hp > 0);
  const enemyProgress = Math.max(0, ...enemies.map(enemy => Math.min(1, enemy.distance / side.combat.path.totalLength)));
  const deployedAttackers = side.board.tiles.filter(tile => tile.unlocked && isUnit(tile.unit)).length;
  const activeHeroes = side.heroes.links.size;
  const effectiveAttackers = side.board.tiles.filter((tile, index) => tile.unlocked && isUnit(tile.unit)
    && pathDistance(side.combat.map, side.combat.map.cells[index]!)
      <= applyTileBonuses(getCombatStats(tile.unit), side.board, [index]).range).length;
  const effectiveHeroes = [...side.heroes.links.values()].filter(link => pathDistance(side.combat.map, link.origin)
    <= applyTileBonuses(getHeroStats(link.level), side.board, [link.leftIndex, link.rightIndex]).range).length;
  const required = c.minimumAttackers + Math.floor(enemies.length / c.enemiesPerExtraAttacker)
    + (enemyProgress >= c.advancedProgress ? c.advancedExtraAttackers : 0);
  return {
    livingEnemyCount: enemies.length, enemyProgress, deployedAttackers, effectiveAttackers, activeHeroes,
    holding: [...side.recruitment.slots], occupiedHolding: side.recruitment.slots.filter(Boolean).length,
    emptyTiles: side.board.tiles.filter(tile => tile.unlocked && !tile.unit).length,
    hasImmediateMerge: hasMerge, hasImmediateHero: values.some(value => value.combat === 'hero'),
    hasCombatDeployment: values.some(value => value.combat === 'deploy'),
    readiness: effectiveAttackers + effectiveHeroes * c.heroWeight < required ? 'LOW' : 'OK',
  };
}

export function currentStateScore(base: number, kind: 'recruit' | 'collect' | 'drop' | 'item',
  value: ActionValue, state: CurrentStateSnapshot): number {
  const c = aiConfig.evaluation;
  const urgent = state.livingEnemyCount > 0 && state.readiness === 'LOW';
  let score = base + value.placement;
  if (urgent) {
    if (kind === 'collect') score += c.urgency.collect;
    else if (value.combat === 'holdingMerge') score += c.urgency.holdingMerge;
    else if (value.combat) score += c.urgency.combat + state.enemyProgress * c.urgency.progress
      + Math.min(c.urgency.maximumEnemyBonus, state.livingEnemyCount * c.urgency.enemyCount);
    else if (value.construction) score -= c.urgency.constructionPenalty;
    // Farmer/休眠字的叠加只整理空间，不等同于升级正在防守的兵。
    if (base === aiConfig.scores.merge && !value.combat) score -= c.urgency.economicMergePenalty;
  }
  if (state.occupiedHolding >= c.space.holdingThreshold && value.freesHolding) score += c.space.release;
  if (value.unlock) score += state.emptyTiles <= c.space.scarceEmptyTiles
    ? c.space.neededUnlock : -c.space.unnecessaryUnlockPenalty;
  if (kind === 'recruit') {
    const useful = state.hasImmediateMerge || state.hasImmediateHero || state.hasCombatDeployment;
    if (useful) score -= c.recruit.usefulActionPenalty;
    else if (state.occupiedHolding <= c.recruit.processedHoldingLimit || state.emptyTiles > 0)
      score += c.recruit.refreshBonus;
  }
  return score;
}

export function distanceToSegment(point: MapPoint, start: MapPoint, end: MapPoint): number {
  const dx = end.x - start.x, dy = end.y - start.y;
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - start.x - ratio * dx, point.y - start.y - ratio * dy);
}

export function pathDistance(map: BoardMap, point: MapPoint): number {
  return Math.min(...map.path.slice(1).map((end, i) => distanceToSegment(point, map.path[i]!, end)));
}

// 逐候选位置的小幅路径覆盖偏好；不预计算全地图矩阵，不搜索未来布局。
export function placementValue(map: BoardMap, origin: MapPoint, range: number,
  type: Unit['type'] | 'hero', enemies: readonly Enemy[]): number {
  const c = aiConfig.evaluation.placement;
  const spans = map.path.slice(1).map((end, i) => {
    const start = map.path[i]!, distance = distanceToSegment(origin, start, end);
    return distance >= range ? 0 : Math.min(Math.hypot(end.x - start.x, end.y - start.y),
      2 * Math.sqrt(range * range - distance * distance));
  });
  const near = Math.max(0, 1 - pathDistance(map, origin) / range);
  const currentTarget = enemies.some(enemy => enemy.hp > 0 && Math.hypot(enemy.x - origin.x, enemy.y - origin.y) <= range) ? 1 : 0;
  let preference = near;
  if (type === '枪') preference = Math.min(1, Math.max(0, ...spans) / (range * 2)) * c.spearStraightWeight;
  if (type === '弓' || type === 'hero') preference = Math.min(1, spans.reduce((a, b) => a + b, 0) / (range * 2));
  if (type === '骑') preference = Math.min(1, near + map.path.slice(1, -1)
    .filter(point => Math.hypot(point.x - origin.x, point.y - origin.y) <= range).length * c.cavalryCornerWeight);
  return c.maximumBonus * (preference + currentTarget) / 2;
}

export function emptyActionValue(): ActionValue {
  return { combat: null, construction: false, unlock: false, freesHolding: false, placement: 0 };
}

import type { CombatStats } from '../config/combat';
import { tileBonusConfig } from '../config/tileBonuses';
import type { TileBonusType } from '../config/tileBonuses';
import type { BoardState } from '../systems/board';

// 强化只存在于土地；每次用当前占格计算普攻属性，不写入单位或 HeroLink。
export function applyTileBonuses(stats: CombatStats, board: BoardState, tileIndexes: readonly number[]): CombatStats {
  const counts: Record<TileBonusType, number> = { none: 0, attack: 0, attackSpeed: 0, range: 0 };
  for (const index of tileIndexes) counts[board.tiles[index]?.bonusType ?? 'none']++;
  const strength = tileBonusConfig.bonusPerTile;
  return {
    damage: Math.round(stats.damage * (1 + counts.attack * strength)),
    attackInterval: stats.attackInterval / (1 + counts.attackSpeed * strength),
    range: stats.range * (1 + counts.range * strength),
  };
}

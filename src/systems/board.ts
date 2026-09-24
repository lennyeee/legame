import type { BoardMap } from '../config/maps';
import type { RecruitmentState } from './recruitment';
import { mergeItems } from './items';
import { isUnit, isHeroLetter } from './items';
import { initializeHeroProgression, getHeroProgression } from './heroProgression';
import type { Deployable, ReserveItem } from './items';
import { MAX_LEVEL } from '../config/levels';
import { passiveEconomy } from '../config/equipment';
import { tileBonusConfig } from '../config/tileBonuses';
import type { TileBonusType } from '../config/tileBonuses';
import { drawRandom, rollChance } from '../utils/random';

export interface TileState {
  unlocked: boolean;
  bonusType: TileBonusType;
  unit: Deployable | null;
}

export interface BoardState {
  // 下标对应地图 cells 的下标。地图位置只读，运行中的解锁状态保存在这里。
  tiles: TileState[];
}

// 来源和目标使用同一种位置结构，普通单位的规则不区分栏位和棋盘。
export type UnitPosition = { kind: 'slot' | 'tile'; index: number };
export type DragItem = ReserveItem;
export type DropAction = 'invalid' | 'move' | 'swap' | 'merge' | 'unlock';

export function createBoardState(map: BoardMap): BoardState {
  const board = { tiles: map.cells.map(cell => ({ unlocked: cell.unlocked, bonusType: 'none' as const, unit: null })) };
  initializeHeroProgression(board, map);
  return board;
}

export function getDragItem(
  board: BoardState, recruitment: RecruitmentState, source: UnitPosition,
): DragItem | null {
  if (source.kind === 'tile') {
    const tile = board.tiles[source.index];
    return tile?.unlocked ? tile.unit : null;
  }
  return recruitment.slots[source.index] ?? null;
}

function isValidPosition(board: BoardState, recruitment: RecruitmentState, position: UnitPosition): boolean {
  return Number.isInteger(position.index) && position.index >= 0 && position.index < (
    position.kind === 'slot' ? recruitment.slots.length : board.tiles.length
  );
}

function setItem(
  board: BoardState, recruitment: RecruitmentState, position: UnitPosition, item: DragItem | null,
): void {
  if (position.kind === 'slot') recruitment.slots[position.index] = item;
  else {
    // 即使未来规则扩展，也不允许把铲子写成棋盘单位。
    if (item === '铲') throw new Error('铲子不能部署到棋盘');
    board.tiles[position.index]!.unit = item;
  }
}

// 查询不修改状态：高亮和最终落子使用同一套规则。
export function getDropAction(
  board: BoardState, recruitment: RecruitmentState, source: UnitPosition, target: UnitPosition | null,
): DropAction {
  if (!target || !isValidPosition(board, recruitment, source) || !isValidPosition(board, recruitment, target)
    || (source.kind === target.kind && source.index === target.index)) return 'invalid';
  const item = getDragItem(board, recruitment, source);
  if (!item) return 'invalid';
  const targetTile = target.kind === 'tile' ? board.tiles[target.index]! : null;
  const occupant = getDragItem(board, recruitment, target);
  if (item === '铲') {
    if (target.kind === 'slot') return occupant === null ? 'move' : 'invalid';
    return !targetTile!.unlocked && !targetTile!.unit ? 'unlock' : 'invalid';
  }
  if (targetTile && !targetTile.unlocked) return 'invalid';
  // 铲子不参与交换，防止棋盘单位换回栏位时把铲子送进棋盘。
  if (occupant === '铲') return 'invalid';
  if (!occupant) return 'move';
  if (item.type === occupant.type && isUnit(item) === isUnit(occupant) && occupant.level >= MAX_LEVEL
    && (isHeroLetter(item) || item.level === occupant.level)) return 'invalid';
  if (mergeItems(item, occupant)) return 'merge';
  return 'swap';
}

export function applyDrop(
  board: BoardState, recruitment: RecruitmentState, source: UnitPosition, target: UnitPosition | null,
  random?: () => number,
): DropAction {
  const action = getDropAction(board, recruitment, source, target);
  if (action === 'invalid' || !target) return 'invalid';
  const item = getDragItem(board, recruitment, source)!;
  const displacedItem = getDragItem(board, recruitment, target);
  if (action === 'unlock') {
    const tile = board.tiles[target.index]!;
    tile.unlocked = true;
    if (recruitment.loadout.passive.some(entry => entry.id === 'golden_shovel')
      && rollChance(tileBonusConfig.unlockChance, random)) {
      tile.bonusType = drawRandom(tileBonusConfig.types, 1, random)[0]!;
    }
  } else {
    const result = action === 'merge' && item !== '铲' && displacedItem && displacedItem !== '铲'
      ? mergeItems(item, displacedItem)! : item;
    if (action === 'merge' && isHeroLetter(displacedItem)) {
      displacedItem.level = result !== '铲' ? result.level : displacedItem.level;
      setItem(board, recruitment, target, displacedItem);
    } else setItem(board, recruitment, target, result);
  }
  setItem(board, recruitment, source, action === 'swap' ? displacedItem : null);
  if (action === 'merge' && isUnit(item) && isUnit(displacedItem)
    && recruitment.loadout.passive.some(entry => entry.id === 'practice_pays')) {
    recruitment.money += passiveEconomy.practicedMergeReward;
  }
  getHeroProgression(board).sync();
  return action;
}

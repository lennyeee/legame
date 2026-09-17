import type { BoardMap } from '../config/maps';
import type { RecruitmentState } from './recruitment';
import type { Unit, ReserveItem } from './items';

export interface TileState {
  unlocked: boolean;
  unit: Unit | null;
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
  return { tiles: map.cells.map(cell => ({ unlocked: cell.unlocked, unit: null })) };
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
  if (occupant.type === item.type && occupant.level === item.level) return 'merge';
  return 'swap';
}

export function applyDrop(
  board: BoardState, recruitment: RecruitmentState, source: UnitPosition, target: UnitPosition | null,
): DropAction {
  const action = getDropAction(board, recruitment, source, target);
  if (action === 'invalid' || !target) return 'invalid';
  const item = getDragItem(board, recruitment, source)!;
  const displacedItem = getDragItem(board, recruitment, target);
  if (action === 'unlock') {
    board.tiles[target.index]!.unlocked = true;
  } else {
    const result = action === 'merge' && item !== '铲'
      ? { type: item.type, level: item.level + 1 } : item;
    setItem(board, recruitment, target, result);
  }
  setItem(board, recruitment, source, action === 'swap' ? displacedItem : null);
  return action;
}

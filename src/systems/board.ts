import type { Recruit } from '../config/game';
import type { BoardMap } from '../config/maps';
import type { RecruitmentState } from './recruitment';

export interface Unit {
  type: Exclude<Recruit, '铲'>;
  level: number;
}

export interface TileState {
  unlocked: boolean;
  unit: Unit | null;
}

export interface BoardState {
  // 下标对应地图 cells 的下标。地图位置只读，运行中的解锁状态保存在这里。
  tiles: TileState[];
}

export type DragSource = { kind: 'slot' | 'tile'; index: number };
export type DragItem = Unit | '铲';
export type DropAction = 'invalid' | 'deploy' | 'move' | 'swap' | 'merge' | 'unlock';

export function createBoardState(map: BoardMap): BoardState {
  return { tiles: map.cells.map(cell => ({ unlocked: cell.unlocked, unit: null })) };
}

export function getDragItem(
  board: BoardState, recruitment: RecruitmentState, source: DragSource,
): DragItem | null {
  if (source.kind === 'tile') {
    const tile = board.tiles[source.index];
    return tile?.unlocked ? tile.unit : null;
  }
  const item = recruitment.slots[source.index];
  return !item ? null : item === '铲' ? item : { type: item, level: 1 };
}

// 查询不修改状态：高亮和最终落子使用同一套规则。
export function getDropAction(
  board: BoardState, recruitment: RecruitmentState, source: DragSource, targetIndex: number,
): DropAction {
  const target = board.tiles[targetIndex];
  const item = getDragItem(board, recruitment, source);
  if (!target || !item || (source.kind === 'tile' && source.index === targetIndex)) return 'invalid';
  if (item === '铲') return !target.unlocked && !target.unit ? 'unlock' : 'invalid';
  if (!target.unlocked) return 'invalid';
  if (!target.unit) return source.kind === 'slot' ? 'deploy' : 'move';
  if (target.unit.type === item.type && target.unit.level === item.level) return 'merge';
  // 待放置栏不能收回棋盘单位；只有棋盘格之间支持交换。
  return source.kind === 'tile' ? 'swap' : 'invalid';
}

export function applyDrop(
  board: BoardState, recruitment: RecruitmentState, source: DragSource, targetIndex: number,
): DropAction {
  const action = getDropAction(board, recruitment, source, targetIndex);
  if (action === 'invalid') return action;
  const target = board.tiles[targetIndex]!;
  const item = getDragItem(board, recruitment, source)!;
  const displacedUnit = target.unit;
  if (item === '铲') {
    target.unlocked = true;
  } else {
    target.unit = { type: item.type, level: item.level + (action === 'merge' ? 1 : 0) };
  }
  if (source.kind === 'slot') recruitment.slots[source.index] = null;
  else board.tiles[source.index]!.unit = action === 'swap' ? displacedUnit : null;
  return action;
}

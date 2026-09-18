import { heroRecipes } from '../config/heroes';
import type { HeroName } from '../config/heroes';
import type { BoardMap, MapPoint } from '../config/maps';
import type { BoardState } from './board';
import type { HeroLetter } from './items';
import { isUnit } from './items';

// 派生关系，不替换/删除棋盘对象；引用两个字，后续双格状态可挂接在关系上。
export interface HeroLink {
  key: string;
  name: HeroName;
  leftIndex: number;
  rightIndex: number;
  left: HeroLetter;
  right: HeroLetter;
  origin: MapPoint;
}

export function getHeroLinks(map: BoardMap, board: BoardState, suspendedTile: number | null = null): HeroLink[] {
  const links: HeroLink[] = [];
  const used = new Set<number>();
  map.cells.forEach((cell, leftIndex) => {
    const left = board.tiles[leftIndex];
    if (leftIndex === suspendedTile || used.has(leftIndex) || !left?.unlocked || !left.unit || isUnit(left.unit)) return;
    const rightIndex = map.cells.findIndex(next => next.y === cell.y && Math.abs(next.x - cell.x - map.cellSize) < 0.001);
    const right = board.tiles[rightIndex];
    if (rightIndex === suspendedTile || used.has(rightIndex) || !right?.unlocked || !right.unit || isUnit(right.unit)) return;
    const recipe = heroRecipes.find(r => r.letters[0] === left.unit!.type && r.letters[1] === right.unit!.type);
    if (!recipe) return;
    used.add(leftIndex); used.add(rightIndex);
    links.push({ key: `${leftIndex}:${rightIndex}`, name: recipe.name, leftIndex, rightIndex,
      left: left.unit, right: right.unit, origin: { x: cell.x + map.cellSize / 2, y: cell.y } });
  });
  return links;
}

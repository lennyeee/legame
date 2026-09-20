import { heroRecipes, getHeroDefinition } from '../config/heroes';
import type { HeroName, HeroId } from '../config/heroes';
import type { SkillState } from '../combat/skills';
import type { BoardMap, MapPoint } from '../config/maps';
import type { BoardState } from './board';
import type { HeroLetter } from './items';
import { isHeroLetter } from './items';

// 派生关系，不替换/删除棋盘对象；引用两个字，后续双格状态可挂接在关系上。
export interface HeroPlacement {
  key: string;
  heroId: HeroId;
  name: HeroName;
  leftIndex: number;
  rightIndex: number;
  left: HeroLetter;
  right: HeroLetter;
  origin: MapPoint;
}

export interface HeroLink extends HeroPlacement {
  hasteEnhanced?: boolean; // 从配方指定的载体字派生，不是独立持久状态。
  cycleId: number;
  level: number;
  currentExp: number;
  skill: SkillState | null;
}

export function getHeroLinks(map: BoardMap, board: BoardState, suspendedTile: number | null = null,
  incumbents: readonly HeroLink[] = []): HeroPlacement[] {
  const links: HeroPlacement[] = [];
  const used = new Set<number>();
  map.cells.forEach((cell, leftIndex) => {
    const left = board.tiles[leftIndex];
    if (leftIndex === suspendedTile || used.has(leftIndex) || !left?.unlocked || !isHeroLetter(left.unit)) return;
    const rightIndex = map.cells.findIndex(next => next.y === cell.y && Math.abs(next.x - cell.x - map.cellSize) < 0.001);
    const right = board.tiles[rightIndex];
    if (rightIndex === suspendedTile || used.has(rightIndex) || !right?.unlocked || !isHeroLetter(right.unit)) return;
    const recipe = heroRecipes.find(r => r.letters[0] === left.unit!.type && r.letters[1] === right.unit!.type);
    if (!recipe) return;
    used.add(leftIndex); used.add(rightIndex);
    links.push({ key: `${leftIndex}:${rightIndex}`, heroId: recipe.id, name: recipe.name, leftIndex, rightIndex,
      left: left.unit, right: right.unit, origin: { x: cell.x + map.cellSize / 2, y: cell.y } });
  });
  // 已激活组合优先；空出的身份按地图顺序选取，避免新部署抢走旧组合的 EXP/CD。
  const selected = new Map<HeroId, HeroPlacement>();
  for (const old of incumbents) {
    const valid = links.find(link => link.key === old.key && link.left === old.left && link.right === old.right);
    if (valid) selected.set(valid.heroId, valid);
  }
  for (const link of links) if (!selected.has(link.heroId)) selected.set(link.heroId, link);
  return [...selected.values()];
}

export function getHasteCarrier(link: HeroPlacement): HeroLetter {
  return link.left.type === getHeroDefinition(link.heroId).hasteCarrier ? link.left : link.right;
}

import type { HeroLetterType } from '../config/heroes';
import { MAX_LEVEL, clampLevel } from '../config/levels';

export interface Unit {
  hasteEnhanced?: boolean; // 本局一层强化，移动保留、合成 OR 继承。
  type: '刀' | '枪' | '弓' | '骑';
  level: number;
}

export interface HeroLetter { kind: 'heroLetter'; type: HeroLetterType; level: number }
export interface Farmer { kind: 'farmer'; type: '农'; level: number }
export type Deployable = Unit | HeroLetter | Farmer;
export type ReserveItem = Deployable | '铲';

export function isUnit(item: ReserveItem | null | undefined): item is Unit {
  return !!item && item !== '铲' && !('kind' in item);
}
export function isHeroLetter(item: ReserveItem | null | undefined): item is HeroLetter {
  return !!item && item !== '铲' && 'kind' in item && item.kind === 'heroLetter';
}
export function isFarmer(item: ReserveItem | null | undefined): item is Farmer {
  return !!item && item !== '铲' && 'kind' in item && item.kind === 'farmer';
}

export function mergeItems(a: Deployable, b: Deployable): Deployable | null {
  if (b.level >= MAX_LEVEL) return null;
  if (isHeroLetter(a) && isHeroLetter(b) && a.type === b.type) return { ...b, level: clampLevel(b.level + 1) };
  if (isFarmer(a) && isFarmer(b) && a.level === b.level) return { ...b, level: clampLevel(b.level + 1) };
  if (isUnit(a) && isUnit(b)) {
    return a.type === b.type && a.level === b.level ? { type: a.type, level: clampLevel(a.level + 1),
      ...(a.hasteEnhanced || b.hasteEnhanced ? { hasteEnhanced: true } : {}) } : null;
  }
  return null;
}

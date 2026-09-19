import type { HeroLetterType } from '../config/heroes';
import { MAX_LEVEL, clampLevel } from '../config/levels';

export interface Unit {
  type: '刀' | '枪' | '弓' | '骑';
  level: number;
}

export interface HeroLetter { kind: 'heroLetter'; type: HeroLetterType; level: number }
export type Deployable = Unit | HeroLetter;
export type ReserveItem = Deployable | '铲';

export function isUnit(item: ReserveItem | null | undefined): item is Unit {
  return !!item && item !== '铲' && !('kind' in item);
}

export function mergeItems(a: Deployable, b: Deployable): Deployable | null {
  if (b.level >= MAX_LEVEL) return null;
  if (!isUnit(a) && !isUnit(b) && a.type === b.type) return { ...b, level: clampLevel(b.level + 1) };
  if (isUnit(a) && isUnit(b)) {
    return a.type === b.type && a.level === b.level ? { type: a.type, level: clampLevel(a.level + 1) } : null;
  }
  return null;
}

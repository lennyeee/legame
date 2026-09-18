import type { HeroLetterType } from '../config/heroes';

export interface Unit {
  type: '刀' | '枪' | '弓' | '骑';
  level: number;
}

export interface HeroLetter { kind: 'heroLetter'; type: HeroLetterType }
export type Deployable = Unit | HeroLetter;
export type ReserveItem = Deployable | '铲';

export function isUnit(item: ReserveItem | null | undefined): item is Unit {
  return !!item && item !== '铲' && !('kind' in item);
}

export function mergeItems(a: Deployable, b: Deployable): Deployable | null {
  if (isUnit(a) && isUnit(b)) {
    return a.type === b.type && a.level === b.level ? { type: a.type, level: a.level + 1 } : null;
  }
  return null;
}

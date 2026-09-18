import { heroRecipes } from '../config/heroes';
import type { HeroName, HeroLetterType } from '../config/heroes';

export interface Unit {
  type: '刀' | '枪' | '弓' | '骑';
  level: number;
}

export interface HeroLetter { kind: 'heroLetter'; type: HeroLetterType }
export interface Hero { kind: 'hero'; type: HeroName }
export type Deployable = Unit | HeroLetter | Hero;
export type ReserveItem = Deployable | '铲';

export function isUnit(item: ReserveItem | null | undefined): item is Unit {
  return !!item && item !== '铲' && !('kind' in item);
}

export function mergeItems(a: Deployable, b: Deployable): Deployable | null {
  if (isUnit(a) && isUnit(b)) {
    return a.type === b.type && a.level === b.level ? { type: a.type, level: a.level + 1 } : null;
  }
  if (!isUnit(a) && !isUnit(b) && a.kind === 'heroLetter' && b.kind === 'heroLetter') {
    const recipe = heroRecipes.find(({ letters }) =>
      (letters[0] === a.type && letters[1] === b.type) || (letters[1] === a.type && letters[0] === b.type));
    if (recipe) return { kind: 'hero', type: recipe.name };
  }
  return null;
}

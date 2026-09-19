import { gameConfig, recruitmentWeights } from '../config/game';
import type { ReserveItem } from './items';
import { drawWeighted } from '../utils/random';
import { copyLoadout } from './equipment';
import type { Loadout } from './equipment';
import { heroRecipes } from '../config/heroes';
import { itemEffects } from '../config/itemEffects';
import { farmerConfig } from '../config/farmer';

export interface RecruitmentState {
  money: number;
  slots: (ReserveItem | null)[];
  readonly loadout: Loadout;
}

export function createRecruitmentState(loadout?: Loadout): RecruitmentState {
  return {
    money: gameConfig.initialMoney,
    slots: Array.from({ length: gameConfig.slotCount }, () => null),
    loadout: copyLoadout(loadout),
  };
}

export function recruit(state: RecruitmentState, random?: () => number): boolean {
  if (state.money < gameConfig.recruitmentCost) return false;
  const results = drawWeighted(recruitmentPool(state.loadout), gameConfig.slotCount, random);
  state.money -= gameConfig.recruitmentCost;
  state.slots = results.map(type => {
    if (type === '铲') return type;
    if (type === '农') return { kind: 'farmer', type, level: 1 };
    if (type === '刀' || type === '枪' || type === '弓' || type === '骑') return { type, level: 1 };
    return { kind: 'heroLetter', type, level: 1 };
  });
  return true;
}

export function recruitmentPool(loadout: Loadout) {
  const multiplier = loadout.passive.some(item => item.id === 'hero_recruitment')
    ? itemEffects.heroRecruitmentMultiplier : 1;
  const pool: { value: typeof gameConfig.recruitmentPool[number] | '农'; weight: number }[] =
    gameConfig.recruitmentPool.map(value => ({ value, weight: recruitmentWeights[value]
      * (heroRecipes.some(recipe => recipe.letters.some(letter => letter === value)) ? multiplier : 1) }));
  if (loadout.passive.some(item => item.id === 'farmer')) pool.push({ value: '农', weight: farmerConfig.recruitmentWeight });
  return pool;
}

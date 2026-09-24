import { gameConfig, recruitmentWeights } from '../config/game';
import type { ReserveItem } from './items';
import { drawWeighted } from '../utils/random';
import { copyLoadout } from './equipment';
import type { Loadout } from './equipment';
import { heroRecipes } from '../config/heroes';
import { itemEffects } from '../config/itemEffects';
import { farmerConfig } from '../config/farmer';
import { passiveEconomy } from '../config/equipment';
import { isUnit } from './items';

export interface RecruitmentState {
  money: number;
  slots: (ReserveItem | null)[];
  readonly loadout: Loadout;
  nextCost: number;
  successfulRecruits: number;
  veteranUsed: boolean;
}

export function createRecruitmentState(loadout?: Loadout): RecruitmentState {
  return {
    money: gameConfig.initialMoney,
    slots: Array.from({ length: gameConfig.slotCount }, () => null),
    loadout: copyLoadout(loadout),
    nextCost: gameConfig.recruitmentCost,
    successfulRecruits: 0,
    veteranUsed: false,
  };
}

export function hasPassive(state: RecruitmentState, id: string): boolean {
  return state.loadout.passive.some(item => item.id === id);
}

export function recruitmentPrice(state: RecruitmentState): number {
  return state.successfulRecruits === 0 && hasPassive(state, 'opening_bonus') ? 0 : state.nextCost;
}

export function recruit(state: RecruitmentState, random?: () => number): boolean {
  const price = recruitmentPrice(state);
  if (state.money < price) return false;
  const results = drawWeighted(recruitmentPool(state.loadout), gameConfig.slotCount, random);
  state.money -= price;
  state.slots = results.map(type => {
    if (type === '铲') return type;
    if (type === '农') return { kind: 'farmer', type, level: 1 };
    if (type === '刀' || type === '枪' || type === '弓' || type === '骑') return { type, level: 1 };
    return { kind: 'heroLetter', type, level: 1 };
  });
  if (hasPassive(state, 'veteran') && !state.veteranUsed) {
    const firstSoldier = state.slots.find(isUnit);
    if (firstSoldier) {
      firstSoldier.level = passiveEconomy.veteranFirstLevel;
      state.veteranUsed = true;
    }
  }
  state.successfulRecruits++;
  if (!hasPassive(state, 'frugal_home')
    || state.successfulRecruits % passiveEconomy.frugalSkipEvery !== 0) {
    state.nextCost += gameConfig.recruitmentPriceIncrease;
  }
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

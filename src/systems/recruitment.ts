import { gameConfig, recruitmentCategoryScale, recruitmentCategories } from '../config/game';
import type { ReserveItem } from './items';
import { drawWeighted } from '../utils/random';
import { copyLoadout } from './equipment';
import type { Loadout } from './equipment';
import { heroLetterRecruitment, recruitableHeroLetters } from '../config/heroes';
import type { HeroId, HeroLetterType } from '../config/heroes';
import { passiveEconomy } from '../config/equipment';
import { isUnit } from './items';

export interface RecruitmentState {
  money: number;
  slots: (ReserveItem | null)[];
  readonly loadout: Loadout;
  nextCost: number;
  successfulRecruits: number;
  veteranUsed: boolean;
  heroLetterNaturalAppearances: Partial<Record<HeroLetterType, number>>;
  completedHeroIds: Set<HeroId>;
}

export function createRecruitmentState(loadout?: Loadout): RecruitmentState {
  return {
    money: gameConfig.initialMoney,
    slots: Array.from({ length: gameConfig.slotCount }, () => null),
    loadout: copyLoadout(loadout),
    nextCost: gameConfig.recruitmentCost,
    successfulRecruits: 0,
    veteranUsed: false,
    heroLetterNaturalAppearances: {},
    completedHeroIds: new Set(),
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
  // 按槽逐次生成并更新临时计数，保证同批多个同字结果也不越过自然出现上限。
  const appearanceCounts = { ...state.heroLetterNaturalAppearances };
  const drawState = { ...state, heroLetterNaturalAppearances: appearanceCounts };
  const results = Array.from({ length: gameConfig.slotCount }, () => {
    const value = drawWeighted(recruitmentPool(state.loadout, drawState), 1, random)[0]!;
    if (value !== '铲' && value !== '农' && !(value === '刀' || value === '枪' || value === '弓' || value === '骑')
      && !heroLetterRecruitment.sharedLetters.includes(value as never)) {
      appearanceCounts[value as HeroLetterType] = (appearanceCounts[value as HeroLetterType] ?? 0) + 1;
    }
    return value;
  });
  state.heroLetterNaturalAppearances = appearanceCounts;
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

export function recruitmentPool(loadout: Loadout, availability?: Pick<RecruitmentState,
  'heroLetterNaturalAppearances' | 'completedHeroIds'>) {
  const hero = loadout.passive.some(item => item.id === 'hero_recruitment');
  const farmer = loadout.passive.some(item => item.id === 'farmer');
  const configured = recruitmentCategories[hero ? (farmer ? 'heroAndFarmer' : 'hero') : (farmer ? 'farmer' : 'default')];
  const candidates = recruitableHeroLetters.filter(letter => {
    if (!availability) return true;
    if (heroLetterRecruitment.sharedLetters.includes(letter as never)) return true;
    const owner = heroLetterRecruitment.exclusiveLetterOwner[letter as keyof typeof heroLetterRecruitment.exclusiveLetterOwner];
    return !!owner && !availability.completedHeroIds.has(owner)
      && (availability.heroLetterNaturalAppearances[letter] ?? 0) < 2;
  });
  // 极端配置下没有英雄字可用时，将该类别权重移至普通兵，保持总池有效且不循环重抽。
  const category = candidates.length ? configured : {
    ...configured, ordinary: configured.ordinary + configured.heroLetter, heroLetter: 0,
  };
  const ordinary = new Set(['刀', '枪', '弓', '骑']);
  const ordinaryWeight = category.ordinary * recruitmentCategoryScale / ordinary.size;
  const letterWeight = candidates.length ? category.heroLetter * recruitmentCategoryScale / candidates.length : 0;
  const pool: { value: typeof gameConfig.recruitmentPool[number] | '农'; weight: number }[] =
    gameConfig.recruitmentPool.filter(value => {
      if (value === '铲' || ordinary.has(value)) return true;
      return candidates.includes(value as HeroLetterType);
    }).map(value => ({ value,
      weight: value === '铲' ? category.shovel * recruitmentCategoryScale
        : ordinary.has(value) ? ordinaryWeight : letterWeight,
    }));
  if (farmer) pool.push({ value: '农', weight: category.farmer * recruitmentCategoryScale });
  return pool;
}

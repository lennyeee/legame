import { gameConfig, recruitmentWeights } from '../config/game';
import type { ReserveItem } from './items';
import { drawRandom } from '../utils/random';
import { copyLoadout } from './equipment';
import type { Loadout } from './equipment';
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
  const weightedPool: (typeof gameConfig.recruitmentPool[number] | '农')[] = gameConfig.recruitmentPool.flatMap(type => Array.from({ length: recruitmentWeights[type] }, () => type));
  if (state.loadout.passive.some(item => item.id === 'farmer')) {
    weightedPool.push(...Array.from({ length: farmerConfig.recruitmentWeight }, () => '农' as const));
  }
  const results = drawRandom(weightedPool, gameConfig.slotCount, random);
  state.money -= gameConfig.recruitmentCost;
  state.slots = results.map(type => {
    if (type === '铲') return type;
    if (type === '农') return { kind: 'farmer', type, level: 1 };
    if (type === '刀' || type === '枪' || type === '弓' || type === '骑') return { type, level: 1 };
    return { kind: 'heroLetter', type, level: 1 };
  });
  return true;
}

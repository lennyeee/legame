import { gameConfig, recruitmentWeights } from '../config/game';
import type { ReserveItem } from './items';
import { drawRandom } from '../utils/random';

export interface RecruitmentState {
  money: number;
  slots: (ReserveItem | null)[];
}

export function createRecruitmentState(): RecruitmentState {
  return {
    money: gameConfig.initialMoney,
    slots: Array.from({ length: gameConfig.slotCount }, () => null),
  };
}

export function recruit(state: RecruitmentState, random?: () => number): boolean {
  if (state.money < gameConfig.recruitmentCost) return false;
  const weightedPool = gameConfig.recruitmentPool.flatMap(type => Array.from({ length: recruitmentWeights[type] }, () => type));
  const results = drawRandom(weightedPool, gameConfig.slotCount, random);
  state.money -= gameConfig.recruitmentCost;
  state.slots = results.map(type => {
    if (type === '铲') return type;
    if (type === '刀' || type === '枪' || type === '弓' || type === '骑') return { type, level: 1 };
    return { kind: 'heroLetter', type, level: 1 };
  });
  return true;
}

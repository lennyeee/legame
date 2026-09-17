import { gameConfig } from '../config/game';
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
  const results = drawRandom(gameConfig.recruitmentPool, gameConfig.slotCount, random);
  state.money -= gameConfig.recruitmentCost;
  state.slots = results.map(type => type === '铲' ? type : { type, level: 1 });
  return true;
}

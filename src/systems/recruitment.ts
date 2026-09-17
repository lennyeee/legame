import { gameConfig } from '../config/game';
import type { Recruit } from '../config/game';
import { drawRandom } from '../utils/random';

export interface RecruitmentState {
  money: number;
  slots: (Recruit | null)[];
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
  state.slots = results;
  return true;
}

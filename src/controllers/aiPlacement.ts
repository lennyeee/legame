import { aiConfig } from '../config/ai';

// 输入已经过共享规则合法性筛选的同一棋子部署候选；不修改动作评分。
export function chooseNearBestPlacement<T extends { score: number }>(candidates: readonly T[], random: () => number): T {
  if (!candidates.length) throw new RangeError('No legal placement candidates');
  const { nearBestThreshold, bestWeightMultiplier } = aiConfig.placementVariation;
  const best = Math.max(...candidates.map(candidate => candidate.score));
  const near = candidates.filter(candidate => candidate.score >= best - nearBestThreshold);
  if (near.length === 1) return near[0]!;
  const weights = near.map(candidate => 1 + (bestWeightMultiplier - 1)
    * (candidate.score - best + nearBestThreshold) / nearBestThreshold);
  let cursor = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < near.length; i++) {
    cursor -= weights[i]!;
    if (cursor < 0) return near[i]!;
  }
  return near[near.length - 1]!;
}

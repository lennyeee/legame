export const starTiers = ['黑铁', '青铜', '白银', '黄金', '铂金', '翡翠', '钻石'] as const;
const divisions = ['IV', 'III', 'II', 'I'] as const;
export type RankState = Readonly<{ kind: 'stars'; divisionIndex: number; stars: number } | { kind: 'points'; points: number }>;
export interface RankChange {
  readonly beforeRank: RankState; readonly afterRank: RankState;
  readonly result: 'win' | 'lose' | 'draw'; readonly delta: number;
  readonly promoted: boolean; readonly demoted: boolean;
}
export const defaultRank = (): RankState => ({ kind: 'stars', divisionIndex: 0, stars: 0 });
const integer = (value: unknown, max: number): number => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
export function sanitizeRank(value: unknown): RankState {
  const input = value as Partial<{ kind: string; divisionIndex: number; stars: number; points: number }> | null;
  if (input?.kind === 'points') return { kind: 'points', points: integer(input.points, Number.MAX_SAFE_INTEGER) };
  if (input?.kind === 'stars') return { kind: 'stars', divisionIndex: integer(input.divisionIndex, 27), stars: integer(input.stars, 5) };
  return defaultRank();
}
export function rankTitle(rank: RankState): string {
  return rank.kind === 'stars' ? `${starTiers[Math.floor(rank.divisionIndex / 4)]} ${divisions[rank.divisionIndex % 4]}`
    : rank.points >= 200 ? '王者' : rank.points >= 100 ? '宗师' : '大师';
}
export function rankProgress(rank: RankState): string {
  return rank.kind === 'stars' ? '★'.repeat(rank.stars) + '☆'.repeat(5 - rank.stars) : `${rank.points}分`;
}
export const rankDisplay = (rank: RankState): string => `${rankTitle(rank)} ${rankProgress(rank)}`;
const band = (rank: RankState): number => rank.kind === 'stars' ? rank.divisionIndex : 28 + Math.min(2, Math.floor(rank.points / 100));
export function changeRank(before: RankState, result: RankChange['result']): RankChange {
  const old = sanitizeRank(before); let after: RankState = old;
  let delta = result === 'win' ? (old.kind === 'stars' ? 1 : 10) : result === 'lose' ? (old.kind === 'stars' ? -1 : -10) : 0;
  if (old.kind === 'stars') {
    if (result === 'win') after = old.stars < 5 ? { ...old, stars: old.stars + 1 }
      : old.divisionIndex < 27 ? { kind: 'stars', divisionIndex: old.divisionIndex + 1, stars: 0 } : { kind: 'points', points: 0 };
    if (result === 'lose') {
      if (old.stars > 0) after = { ...old, stars: old.stars - 1 };
      else if (old.divisionIndex > 0) after = { kind: 'stars', divisionIndex: old.divisionIndex - 1, stars: 4 };
      else delta = 0;
    }
  } else if (result === 'win') after = { kind: 'points', points: Math.min(Number.MAX_SAFE_INTEGER, old.points + 10) };
  else if (result === 'lose') after = old.points < 10 ? { kind: 'stars', divisionIndex: 27, stars: 4 } : { kind: 'points', points: old.points - 10 };
  if (old.kind === 'points' && after.kind === 'points') delta = after.points - old.points;
  return Object.freeze({ beforeRank: Object.freeze(old), afterRank: Object.freeze(after), result, delta,
    promoted: band(after) > band(old), demoted: band(after) < band(old) });
}
// 身份表现随机，不参与AI或战斗规则。
export function nearbyRank(player: RankState, random: () => number): RankState {
  if (player.kind === 'points') return { kind: 'points', points: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, player.points + (Math.floor(random() * 11) - 5) * 10)) };
  const nearby = random() < 0.85;
  const offset = nearby ? Math.floor(random() * 5) - 2 : (random() < 0.5 ? -1 : 1) * (random() < 0.5 ? 3 : 4);
  return { kind: 'stars', divisionIndex: Math.max(0, Math.min(27, player.divisionIndex + offset)), stars: Math.min(5, Math.floor(random() * 6)) };
}

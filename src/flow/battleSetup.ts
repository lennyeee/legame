import { createDevelopmentAILoadout } from '../controllers/developmentLoadout';
import { copyLoadout } from '../systems/equipment';
import type { Loadout } from '../systems/equipment';
import { avatars, defaultProfile, opponentNickname, type PlayerProfile } from '../progression/profile';
import { defaultRank, nearbyRank, type RankState } from '../progression/rank';

export interface DisplayProfile {
  readonly id: string;
  readonly nickname: string;
  readonly avatarId: string;
  readonly rank: RankState;
}

export interface BattleSetup {
  readonly playerProfile: DisplayProfile;
  readonly opponentProfile: DisplayProfile;
  readonly playerLoadout: Loadout;
  readonly opponentLoadout: Loadout;
}

export const BOARD_REVEALED_EVENT = 'legame-board-revealed';

export const localPlayerProfile: DisplayProfile = Object.freeze({
  id: 'local-player', ...defaultProfile(), rank: Object.freeze(defaultRank()),
});
export const flowConfig = {
  matchingMinMs: 2000, matchingMaxMs: 3000,
  vsEnterMs: 400, vsHoldMs: 1400, vsExitMs: 500, leIntroMs: 7000,
} as const;

// 仅用于表现；不消费招募、铲地或 AI 的随机序列。
export function presentationRandom(): number {
  const sample = new Uint32Array(1);
  globalThis.crypto.getRandomValues(sample);
  return sample[0]! / 0x100000000;
}

export function createBattleSetup(loadout?: Loadout, random = presentationRandom,
  createOpponentLoadout = createDevelopmentAILoadout,
  player: PlayerProfile & { rank: RankState } = localPlayerProfile): BattleSetup {
  return Object.freeze({
    playerProfile: Object.freeze({ id: 'local-player', nickname: player.nickname, avatarId: player.avatarId, rank: Object.freeze({ ...player.rank }) }),
    opponentProfile: Object.freeze({
      id: globalThis.crypto.randomUUID(),
      nickname: opponentNickname(random),
      avatarId: avatars[Math.min(avatars.length - 1, Math.floor(random() * avatars.length))]!.id,
      rank: Object.freeze(nearbyRank(player.rank, random)),
    }),
    playerLoadout: copyLoadout(loadout),
    opponentLoadout: createOpponentLoadout(),
  });
}

export function matchingDuration(random = presentationRandom): number {
  return flowConfig.matchingMinMs + random() * (flowConfig.matchingMaxMs - flowConfig.matchingMinMs);
}

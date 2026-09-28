import { createDevelopmentAILoadout } from '../controllers/developmentLoadout';
import { copyLoadout } from '../systems/equipment';
import type { Loadout } from '../systems/equipment';

export interface DisplayProfile {
  readonly id: string;
  readonly nickname: string;
  readonly avatarVariant: number;
}

export interface BattleSetup {
  readonly playerProfile: DisplayProfile;
  readonly opponentProfile: DisplayProfile;
  readonly playerLoadout: Loadout;
  readonly opponentLoadout: Loadout;
}

export const localPlayerProfile: DisplayProfile = Object.freeze({
  id: 'local-player', nickname: '乐玩家', avatarVariant: 0,
});
export const flowConfig = {
  matchingMinMs: 2000, matchingMaxMs: 3000,
  vsEnterMs: 400, vsHoldMs: 1400, vsExitMs: 500, leIntroMs: 7000,
  nicknames: ['小麦', '晚风', '橘子汽水', '山间月', '小团子', '晴天'],
  avatarVariants: 4,
} as const;

// 仅用于表现；不消费招募、铲地或 AI 的随机序列。
export function presentationRandom(): number {
  const sample = new Uint32Array(1);
  globalThis.crypto.getRandomValues(sample);
  return sample[0]! / 0x100000000;
}

export function createBattleSetup(loadout?: Loadout, random = presentationRandom,
  createOpponentLoadout = createDevelopmentAILoadout): BattleSetup {
  return Object.freeze({
    playerProfile: localPlayerProfile,
    opponentProfile: Object.freeze({
      id: globalThis.crypto.randomUUID(),
      nickname: flowConfig.nicknames[Math.floor(random() * flowConfig.nicknames.length)]!,
      avatarVariant: Math.floor(random() * flowConfig.avatarVariants),
    }),
    playerLoadout: copyLoadout(loadout),
    opponentLoadout: createOpponentLoadout(),
  });
}

export function matchingDuration(random = presentationRandom): number {
  return flowConfig.matchingMinMs + random() * (flowConfig.matchingMaxMs - flowConfig.matchingMinMs);
}

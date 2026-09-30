import { equipmentLimits, itemDefinitions } from '../config/equipment';
import type { ItemDefinition } from '../config/equipment';
import { shopConfig } from './shop';
import { defaultRank, sanitizeRank, type RankState } from './rank';
import { defaultProfile, sanitizeProfile, type PlayerProfile } from './profile';

export const SAVE_VERSION = 3;
export const SAVE_KEY = 'legame.playerSave';
export const WELCOME_EVENT = 'welcome_gift_frugal_v1';
export interface PlayerSave {
  saveVersion: number;
  coins: number;
  ownedItemIds: string[];
  equippedActiveItemIds: string[];
  equippedPassiveItemIds: string[];
  stats: { matchesPlayed: number; wins: number; highestWave: number; totalKills: number };
  seenOneTimeEventIds: string[];
  settledMatchIds: string[];
  shop: { shelfItemIds: string[]; matchesTowardRefresh: number };
  rank: RankState;
  profile: PlayerProfile;
  tutorial: { deploymentHintCompleted: boolean; mergeHintCompleted: boolean; heroLetterHintCompleted: boolean };
  audio: { musicEnabled: boolean; sfxEnabled: boolean };
}
export function defaultPlayerSave(): PlayerSave {
  return { saveVersion: SAVE_VERSION, coins: 0, ownedItemIds: ['frugal_home'],
    equippedActiveItemIds: [], equippedPassiveItemIds: ['frugal_home'],
    stats: { matchesPlayed: 0, wins: 0, highestWave: 0, totalKills: 0 },
    seenOneTimeEventIds: [], settledMatchIds: [], shop: { shelfItemIds: [], matchesTowardRefresh: 0 }, rank: defaultRank(), profile: defaultProfile(),
    tutorial: { deploymentHintCompleted: false, mergeHintCompleted: false, heroLetterHintCompleted: false },
    audio: { musicEnabled: true, sfxEnabled: true } };
}
export const safeInteger = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const ids = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [];

export function sanitizeSave(value: unknown, definitions: readonly ItemDefinition[] = itemDefinitions): PlayerSave {
  const input = record(value), defaults = defaultPlayerSave();
  const owned = ids(input.ownedItemIds ?? defaults.ownedItemIds).filter(id => definitions.some(def => def.id === id));
  const equipped = (category: 'active' | 'passive', value: unknown): string[] => ids(value)
    .filter(id => owned.includes(id) && definitions.some(def => def.id === id && def.category === category))
    .slice(0, equipmentLimits[category]);
  const stats = record(input.stats);
  const shop = record(input.shop);
  const tutorial = record(input.tutorial);
  const audio = record(input.audio);
  const matchesPlayed = safeInteger(stats.matchesPlayed);
  return { saveVersion: SAVE_VERSION, coins: safeInteger(input.coins), ownedItemIds: owned,
    rank: sanitizeRank(input.rank), profile: sanitizeProfile(input.profile),
    equippedActiveItemIds: equipped('active', input.equippedActiveItemIds ?? defaults.equippedActiveItemIds),
    equippedPassiveItemIds: equipped('passive', input.equippedPassiveItemIds ?? defaults.equippedPassiveItemIds),
    stats: { matchesPlayed, wins: Math.min(matchesPlayed, safeInteger(stats.wins)),
      highestWave: safeInteger(stats.highestWave), totalKills: safeInteger(stats.totalKills) },
    seenOneTimeEventIds: ids(input.seenOneTimeEventIds), settledMatchIds: ids(input.settledMatchIds),
    shop: { shelfItemIds: ids(shop.shelfItemIds).filter(id => definitions.some(def => def.id === id && def.shopEligible)).slice(0, shopConfig.shelfSize),
      matchesTowardRefresh: Math.min(shopConfig.matchesPerRefresh - 1, safeInteger(shop.matchesTowardRefresh)) },
    tutorial: {
      deploymentHintCompleted: tutorial.deploymentHintCompleted === true,
      mergeHintCompleted: tutorial.mergeHintCompleted === true,
      heroLetterHintCompleted: tutorial.heroLetterHintCompleted === true,
    }, audio: {
      musicEnabled: audio.musicEnabled !== false,
      sfxEnabled: audio.sfxEnabled !== false,
    } };
}

export type SavePolicy = { kind: 'reset' } | { kind: 'migrate'; migrate: (old: unknown) => unknown };
// 当前不强制清除v1；未来明确指定旧版本迁移函数或reset即可。
export const savePolicies: Readonly<Record<number, SavePolicy>> = { 1: { kind: 'migrate', migrate: old => old }, 2: { kind: 'migrate', migrate: old => old } };
export function migrateSave(value: unknown, policies = savePolicies): PlayerSave {
  const version = record(value).saveVersion;
  if (version === SAVE_VERSION) return sanitizeSave(value);
  if (typeof version !== 'number') return defaultPlayerSave();
  const policy = policies[version];
  if (!policy || policy.kind === 'reset') return defaultPlayerSave();
  return sanitizeSave(policy.migrate(value));
}

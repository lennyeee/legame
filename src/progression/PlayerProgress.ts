import { itemDefinitions } from '../config/equipment';
import type { InventoryItem } from '../systems/equipment';
import { setEquipped } from '../systems/equipment';
import type { ResultSnapshot } from '../match/ResultSnapshot';
import { defaultPlayerSave, migrateSave, sanitizeSave, SAVE_KEY, WELCOME_EVENT } from './PlayerSave';
import type { PlayerSave, SavePolicy } from './PlayerSave';

export interface SaveStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const coinRewards = { base: 1, waveEvery: 5, winBonus: 2, cap: 8 } as const;
export function matchCoinReward(snapshot: Pick<ResultSnapshot, 'result' | 'waveReached'>): number {
  return Math.min(coinRewards.cap, coinRewards.base + Math.floor(snapshot.waveReached / coinRewards.waveEvery)
    + (snapshot.result === 'win' ? coinRewards.winBonus : 0));
}
function browserStorage(): SaveStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
const add = (a: number, b: number): number => Math.min(Number.MAX_SAFE_INTEGER, a + b);

// 永久进度是局外服务，不持有Match/Side；全部写入都通过这里。
export class PlayerProgress {
  private data: PlayerSave;
  constructor(private readonly storage: SaveStorage | null = browserStorage(), policies?: Readonly<Record<number, SavePolicy>>) {
    try {
      const raw = storage?.getItem(SAVE_KEY);
      this.data = raw ? migrateSave(JSON.parse(raw), policies) : defaultPlayerSave();
    } catch { this.data = defaultPlayerSave(); }
    this.persist();
  }
  get save(): Readonly<PlayerSave> { return structuredClone(this.data); }
  inventory(): InventoryItem[] {
    return itemDefinitions.map(({ id }) => ({ id, level: 1, owned: this.data.ownedItemIds.includes(id),
      equipped: this.data.equippedActiveItemIds.includes(id) || this.data.equippedPassiveItemIds.includes(id) }));
  }
  equip(id: string, equipped: boolean): boolean {
    const inventory = this.inventory();
    if (!setEquipped(inventory, id, equipped)) return false;
    this.saveEquipment(inventory); return true;
  }
  saveEquipment(inventory: readonly InventoryItem[]): void {
    // ownership只能来自永久存档，不能信任Scene传来的owned标记。
    const equipped = inventory.filter(item => item.equipped).map(item => item.id);
    this.data = sanitizeSave({ ...this.data, equippedActiveItemIds: equipped, equippedPassiveItemIds: equipped });
    this.persist();
  }
  hasSeenWelcome(): boolean { return this.data.seenOneTimeEventIds.includes(WELCOME_EVENT); }
  markWelcomeSeen(): void {
    if (this.hasSeenWelcome()) return;
    this.data.seenOneTimeEventIds.push(WELCOME_EVENT); this.persist();
  }
  commitMatchResult(snapshot: ResultSnapshot): number {
    const reward = matchCoinReward(snapshot);
    if (this.data.settledMatchIds.includes(snapshot.matchId)) return reward;
    this.data.settledMatchIds.push(snapshot.matchId);
    this.data.coins = add(this.data.coins, reward);
    const stats = this.data.stats;
    stats.matchesPlayed = add(stats.matchesPlayed, 1);
    if (snapshot.result === 'win') stats.wins = add(stats.wins, 1);
    stats.highestWave = Math.max(stats.highestWave, snapshot.waveReached);
    stats.totalKills = add(stats.totalKills, snapshot.playerKills);
    this.persist(); return reward;
  }
  // 仅提供底层API；调用方必须先确认，不在本版主页硬塞设置入口。
  reset(): void { this.data = defaultPlayerSave(); this.persist(); }
  private persist(): void {
    try { this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data)); }
    catch { console.warn('legame: 本地存档写入失败，本次会话继续使用内存进度。'); }
  }
}

// Phaser Game registry保存一个局外服务；各Scene复用，Match之间不重建。
export function progressForScene(scene: { game: { registry: { get(key: string): unknown; set(key: string, value: unknown): unknown } }; playerProgress?: PlayerProgress }): PlayerProgress {
  if (scene.playerProgress) return scene.playerProgress;
  const registry = scene.game.registry;
  let progress = registry.get('playerProgress') as PlayerProgress | undefined;
  if (!progress) { progress = new PlayerProgress(); registry.set('playerProgress', progress); }
  return progress;
}

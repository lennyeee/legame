import { itemDefinitions } from '../config/equipment';
export const shopConfig = { shelfSize: 3, matchesPerRefresh: 2 } as const;
// 局外随机独立使用crypto，不消费任何gameplay/AI随机序列。
export function progressionRandom(): number {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]! / 0x100000000;
}
export function createShelf(owned: readonly string[], random = progressionRandom): string[] {
  const candidates = itemDefinitions.filter(def => def.shopEligible && !owned.includes(def.id)).map(def => def.id);
  const shelf: string[] = [];
  while (shelf.length < shopConfig.shelfSize && candidates.length) {
    const index = Math.floor(Math.max(0, Math.min(0.999999999, random())) * candidates.length);
    shelf.push(candidates.splice(index, 1)[0]!);
  }
  return shelf;
}

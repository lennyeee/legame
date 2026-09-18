import { equipmentLimits, itemDefinitions } from '../config/equipment';
import type { ItemCategory, ItemDefinition } from '../config/equipment';

export interface InventoryItem {
  id: string;
  level: number;
  owned: boolean;
  equipped: boolean;
}
export interface LoadoutItem { readonly id: string; readonly level: number }
export interface Loadout {
  readonly active: readonly LoadoutItem[];
  readonly passive: readonly LoadoutItem[];
}

// 本次网页会话内的开发背包；不持久化，不接入征兵或道具效果。
export function createInventory(): InventoryItem[] {
  return [{ id: 'farmer', level: 1, owned: true, equipped: false }];
}

export function setEquipped(inventory: InventoryItem[], id: string, equipped: boolean,
  definitions: readonly ItemDefinition[] = itemDefinitions): boolean {
  const item = inventory.find(entry => entry.id === id);
  const definition = definitions.find(entry => entry.id === id);
  if (!item || !definition || !item.owned) return false;
  if (item.equipped === equipped) return true;
  if (equipped) {
    const count = inventory.filter(entry => entry.owned && entry.equipped
      && definitions.find(def => def.id === entry.id)?.category === definition.category).length;
    if (count >= equipmentLimits[definition.category]) return false;
  }
  item.equipped = equipped;
  return true;
}

// 与背包对象隔离的单局快照；未来效果系统读取稳定ID/等级，不从UI文字判定。
export function createLoadout(inventory: readonly InventoryItem[],
  definitions: readonly ItemDefinition[] = itemDefinitions): Loadout {
  const result: Record<ItemCategory, LoadoutItem[]> = { active: [], passive: [] };
  const seen = new Set<string>();
  for (const item of inventory) {
    const definition = definitions.find(entry => entry.id === item.id);
    if (!definition || !item.owned || !item.equipped || seen.has(item.id)) continue;
    seen.add(item.id);
    const slots = result[definition.category];
    if (slots.length < equipmentLimits[definition.category]) {
      slots.push(Object.freeze({ id: item.id, level: item.level }));
    }
  }
  return Object.freeze({ active: Object.freeze(result.active), passive: Object.freeze(result.passive) });
}

export function copyLoadout(loadout?: Loadout): Loadout {
  return createLoadout([...(loadout?.active ?? []), ...(loadout?.passive ?? [])]
    .map(item => ({ ...item, owned: true, equipped: true })));
}

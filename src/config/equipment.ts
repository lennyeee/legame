export type ItemCategory = 'active' | 'passive';
export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
}

export const equipmentLimits = { active: 2, passive: 6 } as const;
export const itemDefinitions: readonly ItemDefinition[] = [
  {
    id: 'farmer', name: '农民', category: 'passive',
    description: '携带后，征兵时有概率出现农民。部署后的农民不会攻击，会周期性生产美金。',
  },
  { id: 'hero_recruitment', name: '招贤榜', category: 'passive', description: '装备后提高武将字在来财中的出现概率。' },
  { id: 'upgrade_talisman', name: '升级符', category: 'active', description: '冷却完成后拖到己方单位上，使其提升1级。最高Lv.5。' },
];

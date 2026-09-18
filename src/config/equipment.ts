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
];

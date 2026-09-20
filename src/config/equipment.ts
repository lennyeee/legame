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
  { id: 'golden_hand', name: '点金手', category: 'active', description: '无冷却。拖到己方单位上将其移除，固定获得$1。铲子不可出售。' },
  { id: 'haste_edict', name: '急急如律令', category: 'active', description: '冷却完成后拖到普通兵或激活武将上，永久强化一层普攻速度，不可叠加。武将拆开后强化消失。' },
];

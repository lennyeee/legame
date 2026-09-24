export type ItemCategory = 'active' | 'passive';
export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
}

export const equipmentLimits = { active: 2, passive: 6 } as const;
export const passiveEconomy = {
  ironRiceIntervalSeconds: 10,
  ironRiceReward: 2,
  practicedMergeReward: 2,
  frugalSkipEvery: 3,
  veteranFirstLevel: 2,
} as const;
export const itemDefinitions: readonly ItemDefinition[] = [
  {
    id: 'farmer', name: '农民', category: 'passive',
    description: '携带后，征兵时有概率出现农民。部署后的农民不会攻击，会周期性生产美金。',
  },
  { id: 'hero_recruitment', name: '招贤榜', category: 'passive', description: '装备后提高武将字在来财中的出现概率。' },
  { id: 'upgrade_talisman', name: '升级符', category: 'active', description: '冷却完成后拖到己方单位上，使其提升1级。最高Lv.5。' },
  { id: 'golden_hand', name: '点金手', category: 'active', description: '无冷却。拖到己方单位上将其移除，固定获得$1。铲子不可出售。' },
  { id: 'haste_edict', name: '急急如律令', category: 'active', description: '冷却完成后拖到普通兵或激活武将上，永久强化一层普攻速度，不可叠加。武将强化保存在专属字上，拆开休眠、重组恢复。' },
  { id: 'iron_rice_bowl', name: '铁饭碗', category: 'passive', description: '战斗运行期间每10秒自动获得$2。' },
  { id: 'opening_bonus', name: '开门红', category: 'passive', description: '本局第一次来财免费，之后正常涨价。' },
  { id: 'practice_pays', name: '熟能生巧', category: 'passive', description: '刀枪弓骑成功合成时立即获得$2。' },
  { id: 'frugal_home', name: '勤俭持家', category: 'passive', description: '每第3次成功来财后跳过一次涨价。' },
  { id: 'veteran', name: '老兵', category: 'passive', description: '本局首次来财刷出普通兵时，将最左边的普通兵升至Lv.2。' },
  { id: 'golden_shovel', name: '金铲铲', category: 'passive', description: '铲子解锁土地时有30%概率生成攻击、攻速或射程强化格。' },
];

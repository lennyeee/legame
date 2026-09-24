export const tileBonusConfig = {
  unlockChance: 0.3,
  bonusPerTile: 0.2,
  types: ['attack', 'attackSpeed', 'range'],
} as const;

export type TileBonusType = 'none' | (typeof tileBonusConfig.types)[number];

export const tileBonusVisuals: Record<TileBonusType, { label: string; fill: number }> = {
  none: { label: '', fill: 0xfffcf4 },
  attack: { label: '⚔️', fill: 0xf5e0d1 },
  attackSpeed: { label: '⚡', fill: 0xe8e2f4 },
  range: { label: '🎯', fill: 0xdcebf0 },
};

export const itemEffects = {
  saleReward: 1,
  hasteCooldownMs: 20_000,
  hasteAttackSpeedMultiplier: 1.5,
  upgradeCooldownMs: 20_000,
  heroRecruitmentMultiplier: 2,
} as const;

export function activeItemCooldown(id: string): number | undefined {
  switch (id) {
    case 'upgrade_talisman': return itemEffects.upgradeCooldownMs;
    case 'golden_hand': return 0;
    case 'haste_edict': return itemEffects.hasteCooldownMs;
    default: return undefined;
  }
}

export function itemAttackInterval(interval: number, enhanced?: boolean): number {
  return enhanced ? interval / itemEffects.hasteAttackSpeedMultiplier : interval;
}

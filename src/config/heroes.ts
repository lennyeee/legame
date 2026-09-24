import { attackRangeCells, rangePixels } from './ranges';

export const heroRecipes = [
  { id: 'xiaomei', name: '小美', letters: ['小', '美'], attackMode: 'single', skillId: 'xiaomei_barrage' },
  { id: 'abing', name: '阿饼', letters: ['阿', '饼'], attackMode: 'splash', skillId: 'abing_execute' },
  { id: 'xiaoliu', name: '小六', letters: ['小', '六'], attackMode: 'splash', skillId: 'xiaoliu_haste' },
] as const;

export type HeroName = (typeof heroRecipes)[number]['name'];
export type HeroId = (typeof heroRecipes)[number]['id'];
export function getHeroDefinition(id: HeroId) { return heroRecipes.find(hero => hero.id === id)!; }
export type HeroLetterType = (typeof heroRecipes)[number]['letters'][number];

export const heroCombat = { damage: 10, range: rangePixels(attackRangeCells.hero), attackInterval: 1200, splashRadius: 70 };
export const heroVisuals = { color: 0xb49a50, fill: 0xf5edce, sleepColor: '#8b8272' };

export const heroGrowth = { expBase: 30, expPerLevel: 20, enemyExp: 10, damagePerLevel: 0.5, speedPerLevel: 0.08 };
export function heroExpRequired(level: number): number {
  return heroGrowth.expBase + (level - 1) * heroGrowth.expPerLevel;
}
export function getHeroStats(level: number) {
  return { damage: Math.round(heroCombat.damage * (1 + (level - 1) * heroGrowth.damagePerLevel)),
    attackInterval: heroCombat.attackInterval / (1 + (level - 1) * heroGrowth.speedPerLevel), range: heroCombat.range };
}

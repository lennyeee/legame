import { getHeroStats, heroRecipes, type HeroId } from '../config/heroes';
import { heroLore } from './heroLore';

export const attackModeNames = { single: '单体', splash: '小范围溅射', selfArea: '自身周围范围' } as const;

export function heroEncyclopediaEntry(id: HeroId) {
  const hero = heroRecipes.find(entry => entry.id === id);
  if (!hero) throw new Error(`未收录武将：${id}`);
  return {
    hero, lore: heroLore[id], recipe: hero.letters.join(' + '),
    quality: hero.cardColor === 'gold' ? '金' : '紫',
    attackMode: hero.attackMode ? attackModeNames[hero.attackMode] : '尚未开放',
    range: getHeroStats(1, id).range,
    levels: [1, 2, 3, 4, 5].map(level => ({ level, damage: getHeroStats(level, id).damage,
      attacksPerSecond: hero.attacksPerSecondByLevel[level - 1]!,
      attackInterval: getHeroStats(level, id).attackInterval })),
    skill: hero.skill,
  };
}

export const heroEncyclopediaIds = heroRecipes.map(hero => hero.id);

const effectNames: Record<string, string> = {
  damage: '伤害', maxTargets: '最多目标', duration: '持续', damageBonus: '伤害加成',
  speedBonus: '攻速加成', radius: '半径', tickInterval: '间隔', dotDamage: '每次伤害',
  slow: '减速', windup: '前摇', damageMultiplier: '伤害倍率', speedPerStack: '每层攻速',
  maxStacks: '最多层数', speedMultiplier: '攻速倍率', attacks: '次数',
  minAttackInterval: '最短攻击间隔',
};
const percentEffects = new Set(['damageBonus', 'speedBonus', 'slow', 'speedPerStack']);
const timeEffects = new Set(['duration', 'tickInterval', 'windup', 'minAttackInterval']);
const multiplierEffects = new Set(['damageMultiplier', 'speedMultiplier']);

export function formatHeroEffect(effect: Readonly<Record<string, number>>): string {
  return Object.entries(effect).filter(([key, value]) => key !== 'damage' || value !== 0).map(([key, value]) => {
    const name = effectNames[key] ?? key;
    const shown = percentEffects.has(key) ? `${Math.round(value * 1000) / 10}%`
      : timeEffects.has(key) ? `${value / 1000}秒`
      : multiplierEffects.has(key) ? `${value.toFixed(2)}倍`
      : String(value);
    return `${name} ${shown}`;
  }).join('，');
}

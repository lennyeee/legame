import type { Unit } from '../systems/items';

// 战斗、招募和旧存档继续使用稳定的内部兵种ID；玩家界面统一读取显示名。
export const unitDisplayNames: Record<Unit['type'], string> = {
  刀: '刃', 枪: '贯', 弓: '狙', 骑: '爆',
};

export const unitDescriptions: Record<Unit['type'], string> = {
  刀: '地球抵抗军最基础的近战单位。战术很简单：外星人过来，他过去。',
  枪: '擅长攻击一条直线上的敌人。据说入队考试只有一道题：会不会站直。',
  弓: '负责解决那些离得很远的问题。如果问题已经走到脸上，那是别人的工作。',
  骑: '不太讲究攻击对象。原则上，只要附近都是外星人就行。',
};

// Lv.6 以上统一使用最后一档；颜色不限制实际等级。
export const levelColors = [
  0xfffcf4, // Lv.1 浅色
  0xbad8ad, // Lv.2 绿
  0xaecde8, // Lv.3 蓝
  0xcdb5e4, // Lv.4 紫
  0xefbb83, // Lv.5 橙
  0xe9cf73, // Lv.6+ 金
] as const;

export function getLevelColor(level: number): number {
  return levelColors[Math.min(Math.max(level, 1), levelColors.length) - 1]!;
}

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

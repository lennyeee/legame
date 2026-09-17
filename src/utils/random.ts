// 所有随机行为统一从这里进入；允许注入随机源以便验证边界。
export function drawRandom<T>(
  pool: readonly T[],
  count: number,
  random: () => number = Math.random,
): T[] {
  if (pool.length === 0) throw new Error('随机池不能为空');
  return Array.from({ length: count }, () => pool[Math.floor(random() * pool.length)]!);
}

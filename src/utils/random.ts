// 所有随机行为统一从这里进入；允许注入随机源以便验证边界。
export function drawRandom<T>(
  pool: readonly T[],
  count: number,
  random: () => number = Math.random,
): T[] {
  if (pool.length === 0) throw new Error('随机池不能为空');
  return Array.from({ length: count }, () => pool[Math.floor(random() * pool.length)]!);
}

export function rollChance(chance: number, random: () => number = Math.random): boolean {
  return random() < chance;
}

export function drawWeighted<T>(pool: readonly { value: T; weight: number }[], count: number,
  random: () => number = Math.random): T[] {
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) throw new Error('随机池不能为空');
  return Array.from({ length: count }, () => {
    let remaining = random() * total;
    for (const entry of pool) {
      remaining -= entry.weight;
      if (remaining < 0) return entry.value;
    }
    return pool[pool.length - 1]!.value;
  });
}

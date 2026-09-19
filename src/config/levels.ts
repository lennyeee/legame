export const MAX_LEVEL = 5;
export function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(1, Number.isFinite(level) ? Math.floor(level) : 1));
}

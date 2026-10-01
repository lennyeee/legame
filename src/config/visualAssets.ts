import type { Unit } from '../systems/items';

const base = import.meta.env?.BASE_URL ?? '/legame/';

export const visualAssets = {
  units: {
    刀: { key: 'unit_blade', url: `${base}assets/images/units/blade.png`, width: 62 },
    枪: { key: 'unit_pierce', url: `${base}assets/images/units/pierce.png`, width: 68 },
    弓: { key: 'unit_snipe', url: `${base}assets/images/units/snipe.png`, width: 68 },
    骑: { key: 'unit_blast', url: `${base}assets/images/units/blast.png`, width: 72 },
  } satisfies Record<Unit['type'], { key: string; url: string; width: number }>,
  enemy: { key: 'enemy_basic', url: `${base}assets/images/enemies/enemy_basic.png`, width: 76 },
  home: { key: 'home_background', url: `${base}assets/images/backgrounds/home_bg.png` },
} as const;

export const audioAssets = {
  home_bgm: { file: 'bgm/home_bgm.mp3', volume: 0.28, cooldownMs: 0, maxConcurrent: 1 },
  battle_bgm: { file: 'bgm/battle_bgm.mp3', volume: 0.25, cooldownMs: 0, maxConcurrent: 1 },
  battle_start: { file: 'sfx/battle_start.wav', volume: 0.38, cooldownMs: 120, maxConcurrent: 1 },
  ui_click: { file: 'sfx/ui_click.wav', volume: 0.28, cooldownMs: 55, maxConcurrent: 2 },
  recruit: { file: 'sfx/recruit.wav', volume: 0.32, cooldownMs: 100, maxConcurrent: 1 },
  unit_merge: { file: 'sfx/unit_merge.wav', volume: 0.33, cooldownMs: 100, maxConcurrent: 1 },
  hero_created: { file: 'sfx/hero_created.wav', volume: 0.46, cooldownMs: 180, maxConcurrent: 1 },
  shovel: { file: 'sfx/shovel.wav', volume: 0.34, cooldownMs: 100, maxConcurrent: 1 },
  blade_attack: { file: 'sfx/blade_attack.mp3', volume: 0.17, cooldownMs: 80, maxConcurrent: 2 },
  pierce_attack: { file: 'sfx/pierce_attack.wav', volume: 0.16, cooldownMs: 80, maxConcurrent: 2 },
  snipe_attack: { file: 'sfx/snipe_attack.wav', volume: 0.18, cooldownMs: 100, maxConcurrent: 2 },
  blast_attack: { file: 'sfx/blast_attack.wav', volume: 0.16, cooldownMs: 120, maxConcurrent: 2 },
  enemy_death: { file: 'sfx/enemy_death.mp3', volume: 0.13, cooldownMs: 80, maxConcurrent: 1 },
  victory: { file: 'sfx/victory.mp3', volume: 0.48, cooldownMs: 0, maxConcurrent: 1 },
  defeat: { file: 'sfx/defeat.wav', volume: 0.44, cooldownMs: 0, maxConcurrent: 1 },
} as const;

export type AudioKey = keyof typeof audioAssets;
export type BgmKey = 'home_bgm' | 'battle_bgm';
export type SfxKey = Exclude<AudioKey, BgmKey>;
export const audioTransitionMs = 400;

// Vite's base is /legame/ in both local preview and GitHub Pages.
export function audioAssetUrl(key: AudioKey, base = import.meta.env?.BASE_URL ?? '/legame/'): string {
  return `${base.endsWith('/') ? base : `${base}/`}assets/audio/${audioAssets[key].file}`;
}

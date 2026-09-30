import type Phaser from 'phaser';
import { audioAssets, audioAssetUrl, audioTransitionMs, type AudioKey, type BgmKey, type SfxKey } from '../config/audio';
import type { CombatEvent } from '../combat/CombatSimulation';

export interface AudioOptions { musicEnabled: boolean; sfxEnabled: boolean }
interface Clip {
  readonly isPlaying: boolean; readonly isPaused: boolean;
  volume: number;
  play(config?: { loop?: boolean; volume?: number }): boolean;
  pause(): boolean; resume(): boolean; stop(): boolean; destroy(): void;
  once(event: string, callback: () => void): unknown;
}
export interface AudioBackend {
  readonly locked: boolean;
  add(key: string, config?: { loop?: boolean; volume?: number }): Clip;
  on?(event: string, callback: () => void): unknown;
}
type AudioScene = Pick<Phaser.Scene, 'tweens' | 'input'>;

// One manager per Phaser Game. Combat and menu scenes share music playback but never own it.
export class AudioManager {
  private options: AudioOptions = { musicEnabled: true, sfxEnabled: true };
  private desired: BgmKey | null = null;
  private bgm: Clip | null = null;
  private bgmKey: BgmKey | null = null;
  private fading: Clip | null = null;
  private transitions: { stop?: () => unknown }[] = [];
  private readonly activeSfx = new Map<SfxKey, Set<Clip>>();
  private readonly lastSfx = new Map<SfxKey, number>();
  private paused = false;

  constructor(private readonly backend?: AudioBackend, private readonly now: () => number = () => performance.now()) {
    backend?.on?.('unlocked', () => this.startDesired());
  }

  get state() { return { desired: this.desired, bgmKey: this.bgmKey, paused: this.paused, ...this.options }; }
  setOptions(options: AudioOptions): void {
    const wasEnabled = this.options.musicEnabled;
    this.options = { ...options };
    if (!options.musicEnabled) this.stopMusic();
    else if (!wasEnabled) this.startDesired();
    if (!options.sfxEnabled) this.stopSfx();
  }

  menu(scene?: AudioScene): void { this.paused = false; this.requestBgm('home_bgm', scene); }
  battle(scene?: AudioScene): void { this.paused = false; this.requestBgm('battle_bgm', scene); }
  private awaitGesture(scene?: AudioScene): void {
    scene?.input?.once?.('pointerdown', () => queueMicrotask(() => this.startDesired(scene)));
  }
  private requestBgm(key: BgmKey, scene?: AudioScene): void {
    this.desired = key;
    if (!this.options.musicEnabled || this.paused || !this.backend) return;
    if (this.backend.locked) {
      // Phaser emits 'unlocked' after the first normal pointer interaction.
      this.awaitGesture(scene);
      return;
    }
    if (this.bgmKey === key && (this.bgm?.isPlaying || this.bgm?.isPaused)) return;
    this.startDesired(scene);
  }
  private startDesired(scene?: AudioScene): void {
    if (!this.backend || this.backend.locked || !this.options.musicEnabled || this.paused || !this.desired) return;
    if (this.bgmKey === this.desired && (this.bgm?.isPlaying || this.bgm?.isPaused)) return;
    this.stopTransition();
    const old = this.bgm;
    const nextKey = this.desired;
    const volume = audioAssets[nextKey].volume;
    try {
      const next = this.backend.add(nextKey, { loop: true, volume: old && scene?.tweens ? 0 : volume });
      if (!next.play({ loop: true, volume: old && scene?.tweens ? 0 : volume })) {
        next.destroy(); this.awaitGesture(scene); return;
      }
      this.bgm = next; this.bgmKey = nextKey;
      if (old && scene?.tweens) {
        this.fading = old;
        this.transitions.push(scene.tweens.add({ targets: old, volume: 0, duration: audioTransitionMs, onComplete: () => {
          old.stop(); old.destroy(); if (this.fading === old) this.fading = null;
        } }), scene.tweens.add({ targets: next, volume, duration: audioTransitionMs }));
      } else { old?.stop(); old?.destroy(); }
    } catch { this.awaitGesture(scene); /* Audio must never interrupt gameplay or navigation. */ }
  }

  pauseBattle(): void {
    if (this.paused) return;
    this.paused = true;
    this.stopTransition();
    if (this.bgmKey === 'battle_bgm') this.bgm?.pause();
    this.stopSfx();
  }
  resumeBattle(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.options.musicEnabled && this.desired === 'battle_bgm') {
      if (this.bgm?.isPaused) this.bgm.resume(); else this.startDesired();
    }
  }
  result(outcome: 'win' | 'lose' | 'draw'): void {
    this.paused = false;
    this.desired = null;
    this.stopMusic(); this.stopSfx();
    if (outcome !== 'draw') this.sfx(outcome === 'win' ? 'victory' : 'defeat');
  }
  leaveBattle(): void {
    if (this.desired === 'battle_bgm') this.desired = null;
    if (this.bgmKey === 'battle_bgm') this.stopMusic();
    this.stopSfx(); this.paused = false;
  }
  private stopMusic(): void {
    this.stopTransition();
    this.bgm?.stop(); this.bgm?.destroy(); this.bgm = null; this.bgmKey = null;
  }
  private stopTransition(): void {
    for (const tween of this.transitions) tween.stop?.();
    this.transitions = [];
    this.fading?.stop(); this.fading?.destroy(); this.fading = null;
    if (this.bgmKey && this.bgm) this.bgm.volume = audioAssets[this.bgmKey].volume;
  }
  private stopSfx(): void {
    for (const clips of this.activeSfx.values()) for (const clip of clips) { clip.stop(); clip.destroy(); }
    this.activeSfx.clear();
  }
  sfx(key: SfxKey, allowWhilePaused = false): boolean {
    if (!this.backend || this.backend.locked || !this.options.sfxEnabled || (this.paused && !allowWhilePaused)) return false;
    const config = audioAssets[key], now = this.now();
    const last = this.lastSfx.get(key);
    if (last !== undefined && now - last < config.cooldownMs) return false;
    const playing = this.activeSfx.get(key) ?? new Set<Clip>();
    if (playing.size >= config.maxConcurrent) return false;
    try {
      const clip = this.backend.add(key, { volume: config.volume });
      if (!clip.play({ volume: config.volume })) { clip.destroy(); return false; }
      this.lastSfx.set(key, now);
      playing.add(clip); this.activeSfx.set(key, playing);
      clip.once('complete', () => { playing.delete(clip); clip.destroy(); });
      return true;
    } catch { return false; }
  }
  uiClick(): void { this.sfx('ui_click', true); }
  startClick(): void { this.sfx('battle_start'); }
  combatEvents(events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (event.kind === 'kill') this.sfx('enemy_death');
      if (event.kind !== 'attack') continue;
      const key = event.type === '刀' ? 'blade_attack' : event.type === '枪' ? 'pierce_attack'
        : event.type === '弓' ? 'snipe_attack' : 'blast_attack';
      this.sfx(key);
    }
  }
}

const AUDIO_REGISTRY_KEY = 'legameAudio';
export function audioForScene(scene: Phaser.Scene): AudioManager {
  const registry = scene.game.registry;
  let audio = registry.get(AUDIO_REGISTRY_KEY) as AudioManager | undefined;
  if (!audio) {
    audio = new AudioManager(scene.game.sound as unknown as AudioBackend | undefined);
    registry.set(AUDIO_REGISTRY_KEY, audio);
  }
  return audio;
}

export function preloadAudio(scene: Phaser.Scene): void {
  for (const key of Object.keys(audioAssets) as AudioKey[]) {
    if (!scene.cache.audio.exists(key)) scene.load.audio(key, audioAssetUrl(key));
  }
}

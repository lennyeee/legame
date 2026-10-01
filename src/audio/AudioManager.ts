import type Phaser from 'phaser';
import { audioAssets, audioAssetUrl, audioTransitionMs, heroBasicAttackSfx, type AudioKey, type BgmKey, type SfxKey } from '../config/audio';
import type { CombatEvent } from '../combat/CombatSimulation';
import { installAudioDebug } from './AudioDebug';

export interface AudioOptions { musicEnabled: boolean; sfxEnabled: boolean }
interface Clip {
  readonly isPlaying: boolean; readonly isPaused: boolean;
  readonly audio?: { readonly paused: boolean; addEventListener(event: string, listener: () => void): void; removeEventListener(event: string, listener: () => void): void };
  volume: number;
  play(config?: { loop?: boolean; volume?: number }): boolean;
  pause(): boolean; resume(): boolean; stop(): boolean; destroy(): void;
  once(event: string, callback: () => void): unknown;
}
export interface AudioBackend {
  readonly locked: boolean;
  readonly context?: { readonly state: string; resume(): Promise<void>; addEventListener?(event: string, listener: () => void): void };
  add(key: string, config?: { loop?: boolean; volume?: number }): Clip;
  on?(event: string, callback: () => void): unknown;
}
type AudioScene = Pick<Phaser.Scene, 'tweens' | 'input'> & { events?: Phaser.Events.EventEmitter; game?: Phaser.Game };

// One manager per Phaser Game. Combat and menu scenes share music playback but never own it.
export class AudioManager {
  private options: AudioOptions = { musicEnabled: true, sfxEnabled: true };
  private desired: BgmKey | null = null;
  private bgm: Clip | null = null;
  private bgmKey: BgmKey | null = null;
  private pendingBgm: { key: BgmKey; clip: Clip; cancel: () => void } | null = null;
  private scene?: AudioScene;
  private gestureInput?: AudioScene['input'];
  private gestureCanvas?: HTMLCanvasElement;
  private clearCanvasGesture?: () => void;
  private fading: Clip | null = null;
  private transitions: { stop?: () => unknown }[] = [];
  private readonly activeSfx = new Map<SfxKey, Set<Clip>>();
  private readonly lastSfx = new Map<SfxKey, number>();
  private paused = false;
  readonly diagnostics = { attempt: 'none', result: 'none', unlock: 'none', loader: 'none', history: [] as string[], assets: {} as Record<string, string> };
  recordDiagnostic(kind: 'attempt' | 'result' | 'unlock' | 'loader', detail: string): void {
    const message = `${Math.round(this.now())}ms ${detail}`;
    this.diagnostics[kind] = message;
    this.diagnostics.history.push(`${kind}: ${message}`);
    if (this.diagnostics.history.length > 30) this.diagnostics.history.shift();
  }
  debugStopBgm(): void { this.stopMusic(); }

  constructor(private readonly backend?: AudioBackend, private readonly now: () => number = () => performance.now()) {
    try {
      backend?.on?.('unlocked', () => { this.recordDiagnostic('unlock', 'Phaser unlocked'); this.startDesired(this.scene); });
      backend?.context?.addEventListener?.('statechange', () => {
        this.recordDiagnostic('unlock', `context statechange: ${backend.context?.state}`);
        if (backend.context?.state === 'running') this.startDesired(this.scene);
        else { this.invalidateBgm(); this.awaitGesture(this.scene); }
      });
    } catch { /* Optional audio may be unavailable. */ }
  }

  get state() { return { desired: this.desired, bgmKey: this.bgmKey, pendingBgm: this.pendingBgm?.key ?? null, paused: this.paused, ...this.options }; }
  setOptions(options: AudioOptions): void {
    const wasEnabled = this.options.musicEnabled;
    this.options = { ...options };
    try {
      if (!options.musicEnabled) this.stopMusic();
      else if (!wasEnabled) this.startDesired(this.scene);
      if (!options.sfxEnabled) this.stopSfx();
    } catch { /* Preference changes must not interrupt navigation. */ }
  }

  menu(scene?: AudioScene): void { this.paused = false; try { this.requestBgm('home_bgm', scene); } catch { /* Silent fallback. */ } }
  battle(scene?: AudioScene): void { try { this.requestBgm('battle_bgm', scene); } catch { /* Silent fallback. */ } }
  retryDesired(scene?: AudioScene): void { this.startDesired(this.scene ?? scene); }
  private resumeFromGesture(scene?: AudioScene): void {
    try {
      const context = this.backend?.context;
      if (context && context.state !== 'running') {
        // resume() must be called during the native gesture, not in a later microtask.
        this.recordDiagnostic('unlock', `gesture resume requested: ${context.state}`);
        void context.resume().then(() => { this.recordDiagnostic('unlock', `resume resolved: ${context.state}`); this.startDesired(this.scene ?? scene); }, error => {
          this.recordDiagnostic('unlock', `resume rejected: ${String(error)}`); this.awaitGesture(this.scene ?? scene);
        });
      } else this.startDesired(this.scene ?? scene);
    } catch { this.awaitGesture(this.scene ?? scene); }
  }
  private awaitGesture(scene?: AudioScene): void {
    const canvas = scene?.game?.canvas;
    if (canvas?.addEventListener) {
      if (this.gestureCanvas === canvas) return;
      this.clearCanvasGesture?.();
      const onGesture = (): void => { this.clearCanvasGesture?.(); this.resumeFromGesture(scene); };
      canvas.addEventListener('touchstart', onGesture, { capture: true, once: true });
      canvas.addEventListener('mousedown', onGesture, { capture: true, once: true });
      this.gestureCanvas = canvas;
      this.clearCanvasGesture = () => {
        canvas.removeEventListener('touchstart', onGesture, true);
        canvas.removeEventListener('mousedown', onGesture, true);
        this.gestureCanvas = undefined; this.clearCanvasGesture = undefined;
      };
      return;
    }
    const input = scene?.input;
    if (!input?.once || this.gestureInput === input) return;
    this.gestureInput = input;
    scene?.events?.once('shutdown', () => { if (this.gestureInput === input) this.gestureInput = undefined; });
    input.once('pointerdown', () => {
      this.gestureInput = undefined;
      this.resumeFromGesture(scene);
    });
  }
  private requestBgm(key: BgmKey, scene?: AudioScene): void {
    if (scene) this.scene = scene;
    this.desired = key;
    if (!this.options.musicEnabled || this.paused || !this.backend) return;
    this.startDesired(scene ?? this.scene);
  }
  private startDesired(scene?: AudioScene): void {
    try {
      if (scene) this.scene = scene;
      if (!this.backend || !this.options.musicEnabled || this.paused || !this.desired) return;
      if (this.backend.locked || (this.backend.context && this.backend.context.state !== 'running')) {
        if (this.backend.context?.state !== 'running') this.invalidateBgm();
        this.awaitGesture(scene ?? this.scene);
        return;
      }
      if (this.bgmKey === this.desired && this.bgm?.isPlaying && (!this.bgm.audio || !this.bgm.audio.paused)) return;
      this.discardPending();
      this.stopTransition();
      const old = this.bgm;
      const nextKey = this.desired;
      const volume = audioAssets[nextKey].volume;
      this.recordDiagnostic('attempt', `${nextKey}: add/play loop=true`);
      const next = this.backend.add(nextKey, { loop: true, volume: old && scene?.tweens ? 0 : volume });
      const played = next.play({ loop: true, volume: old && scene?.tweens ? 0 : volume });
      this.recordDiagnostic('result', `${nextKey}: play=${played} isPlaying=${next.isPlaying} volume=${next.volume} context=${this.backend.context?.state ?? 'no WebAudio context'}`);
      if (!played || !next.isPlaying
        || (this.backend.context && this.backend.context.state !== 'running')) {
        next.destroy();
        if (this.backend.context && this.backend.context.state !== 'running') this.invalidateBgm();
        this.awaitGesture(scene ?? this.scene); return;
      }
      if (next.audio) {
        // Phaser HTML5AudioSound.play() can return true before the media play Promise rejects.
        const onPlaying = (): void => {
          this.recordDiagnostic('result', `${nextKey}: HTMLMediaElement playing event`);
          if (this.pendingBgm?.clip !== next) return;
          this.pendingBgm.cancel(); this.pendingBgm = null;
          try {
            if (this.desired === nextKey && this.options.musicEnabled && !this.paused && !next.audio?.paused) this.commitBgm(nextKey, next, this.scene ?? scene);
            else { next.stop(); next.destroy(); }
          } catch { this.invalidateBgm(); this.awaitGesture(this.scene); }
        };
        const onError = (): void => { if (this.pendingBgm?.clip === next) { this.discardPending(); this.awaitGesture(this.scene); } };
        next.audio.addEventListener('playing', onPlaying);
        next.audio.addEventListener('error', onError);
        this.pendingBgm = { key: nextKey, clip: next, cancel: () => {
          next.audio?.removeEventListener('playing', onPlaying); next.audio?.removeEventListener('error', onError);
        } };
        this.awaitGesture(scene ?? this.scene);
      } else this.commitBgm(nextKey, next, scene);
    } catch (error) {
      this.recordDiagnostic('result', `BGM exception: ${String(error)}`);
      if (this.backend?.context && this.backend.context.state !== 'running') this.invalidateBgm();
      this.awaitGesture(scene ?? this.scene); /* Audio must never interrupt gameplay or navigation. */
    }
  }
  private commitBgm(key: BgmKey, next: Clip, scene?: AudioScene): void {
    this.clearCanvasGesture?.();
    const old = this.bgm;
    this.bgm = next; this.bgmKey = key;
    if (old && scene?.tweens && (scene as Phaser.Scene).sys?.isActive?.() !== false) {
      this.fading = old;
      this.transitions.push(scene.tweens.add({ targets: old, volume: 0, duration: audioTransitionMs, onComplete: () => {
        old.stop(); old.destroy(); if (this.fading === old) this.fading = null;
      } }), scene.tweens.add({ targets: next, volume: audioAssets[key].volume, duration: audioTransitionMs }));
    } else { next.volume = audioAssets[key].volume; old?.stop(); old?.destroy(); }
  }
  private discardPending(): void {
    const pending = this.pendingBgm;
    this.pendingBgm = null;
    if (pending) { pending.cancel(); pending.clip.stop(); pending.clip.destroy(); }
  }
  private invalidateBgm(): void {
    try { this.stopMusic(); } catch { this.bgm = null; this.bgmKey = null; }
  }

  pauseBattle(): void {
    if (this.paused) return;
    this.paused = true;
    try {
      this.stopTransition();
      this.bgm?.pause();
      this.stopSfx();
    } catch { /* Match pause still succeeds. */ }
  }
  resumeBattle(): void {
    if (!this.paused) return;
    this.paused = false;
    try {
      if (this.options.musicEnabled && this.desired) {
        if (this.bgm?.isPaused && !this.backend?.locked && (!this.backend?.context || this.backend.context.state === 'running')) {
          if (!this.bgm.resume() || !this.bgm.isPlaying) this.invalidateBgm();
        }
        this.startDesired(this.scene);
      }
    } catch { /* Match resume still succeeds. */ }
  }
  result(outcome: 'win' | 'lose' | 'draw'): void {
    this.paused = false;
    this.desired = null;
    try { this.stopMusic(); this.stopSfx(); } catch { /* Result still appears. */ }
    if (outcome !== 'draw') this.sfx(outcome === 'win' ? 'victory' : 'defeat');
  }
  leaveBattle(): void {
    if (this.desired === 'battle_bgm') this.desired = null;
    try { if (this.bgmKey === 'battle_bgm') this.stopMusic(); this.stopSfx(); } catch { /* HOME still appears. */ }
    this.paused = false;
  }
  private stopMusic(): void {
    this.clearCanvasGesture?.();
    this.discardPending();
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
    try {
      if (!this.backend || this.backend.locked || !this.options.sfxEnabled || (this.paused && !allowWhilePaused)) return false;
      const config = audioAssets[key], now = this.now();
      const last = this.lastSfx.get(key);
      if (last !== undefined && now - last < config.cooldownMs) return false;
      const playing = this.activeSfx.get(key) ?? new Set<Clip>();
      if (playing.size >= config.maxConcurrent) return false;
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
      if (event.kind === 'heroLevelUp') this.sfx('hero_level_up');
      if (event.kind === 'heroAttack') this.sfx(heroBasicAttackSfx[event.link.heroId]);
      if (event.kind !== 'attack') continue;
      const key = event.type === '刀' ? 'blade_attack' : event.type === '枪' ? 'pierce_attack'
        : event.type === '弓' ? 'snipe_attack' : 'blast_attack';
      this.sfx(key);
    }
  }
}

const AUDIO_REGISTRY_KEY = 'legameAudio';
const fallbackAudio = new WeakMap<object, AudioManager>();
export function audioForScene(scene: Phaser.Scene): AudioManager {
  const owner = scene.game ?? scene;
  try {
    const registry = scene.game.registry;
    let audio = registry.get(AUDIO_REGISTRY_KEY) as AudioManager | undefined;
    if (!audio) {
      audio = new AudioManager(scene.game.sound as unknown as AudioBackend | undefined);
      registry.set(AUDIO_REGISTRY_KEY, audio);
      try { installAudioDebug(scene.game, audio); } catch { /* Diagnostic UI cannot change normal audio initialization. */ }
    }
    return audio;
  } catch {
    let audio = fallbackAudio.get(owner);
    if (!audio) { audio = new AudioManager(); fallbackAudio.set(owner, audio); }
    return audio;
  }
}

const audioLoaderLaunches = new WeakSet<Phaser.Game>();

// Launch one audio-only Scene. Phaser queues launches until its next update, so guard that interval too.
export function ensureAudioLoader(scene: Phaser.Scene): void {
  const game = scene.game;
  try {
    if (audioLoaderLaunches.has(game) || scene.scene.isActive('AudioLoaderScene')) return;
    audioLoaderLaunches.add(game);
    scene.scene.launch('AudioLoaderScene');
  } catch { audioLoaderLaunches.delete(game); /* Audio loading must never hold up a visible Scene. */ }
}

// Called only by the persistent AudioLoaderScene after HOME is created, never from preload.
export function loadAudioInBackground(scene: Phaser.Scene, audio = audioForScene(scene)): void {
  try {
    audio.recordDiagnostic('loader', 'audio loader started');
    const onFileComplete = (key: string): void => {
      audio.diagnostics.assets[key] = 'filecomplete: cache ready';
      audio.recordDiagnostic('loader', `${scene.sys?.settings.key ?? 'scene'} filecomplete ${key}; cache=${scene.cache.audio.exists(key)}`);
      if (key === audio.state.desired) audio.retryDesired(scene);
    };
    scene.load.on('filecomplete', onFileComplete);
    scene.load.on('fileload', (file: { key: string }) => {
      audio.diagnostics.assets[file.key] = 'downloaded; waiting for decode/process/cache';
      audio.recordDiagnostic('loader', `download complete ${file.key}; decode/process pending`);
    });
    scene.load.on('loaderror', (file: { key: string }) => {
      audio.diagnostics.assets[file.key] = 'download error';
      audio.recordDiagnostic('loader', `download error ${file.key}`);
    });
    scene.load.on('complete', () => {
      for (const key of Object.keys(audio.diagnostics.assets)) if (!scene.cache.audio.exists(key) && audio.diagnostics.assets[key].startsWith('downloaded')) {
        audio.diagnostics.assets[key] = 'loader finished without cache (process/decode failed or interrupted)';
      }
      audio.recordDiagnostic('loader', 'loader complete');
    });
    scene.events.once('shutdown', () => scene.load.off('filecomplete', onFileComplete));
    scene.events.once('shutdown', () => audio.recordDiagnostic('loader', 'audio loader shutdown; game ending'));
    let queued = false;
    for (const key of Object.keys(audioAssets) as AudioKey[]) {
      if (scene.cache.audio.exists(key)) continue;
      audio.diagnostics.assets[key] = 'queued';
      try { scene.load.audio(key, audioAssetUrl(key)); queued = true; } catch { /* Skip unsupported files. */ }
    }
    if (queued) scene.load.start();
  } catch { /* Asset loading is optional; Scene.create has already succeeded. */ }
}

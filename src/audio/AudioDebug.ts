import type Phaser from 'phaser';
import type { AudioManager } from './AudioManager';
import { audioAssets, type BgmKey } from '../config/audio';

export const audioDebugEnabled = (search: string): boolean => new URLSearchParams(search).get('audioDebug') === '1';

// Read live Phaser objects, not only AudioManager's bookkeeping. None of these flags proves audibility.
export function audioDebugSnapshot(game: Phaser.Game, audio: AudioManager): string {
  const sound = game.sound as Phaser.Sound.WebAudioSoundManager;
  const state = audio.state;
  const scenes = game.scene.getScenes(true).map(scene => {
    const runtime = scene as Phaser.Scene & { presentationPhase?: string; phase?: string; startState?: string };
    return `${scene.sys.settings.key}:${runtime.presentationPhase ?? runtime.phase ?? runtime.startState ?? scene.sys.settings.status}`;
  });
  const rows = [
    `Backend: ${sound.context ? 'WebAudio' : game.config.audio.noAudio ? 'NoAudio' : 'HTML5Audio'} (${sound.constructor.name})`,
    `Context: ${sound.context?.state ?? 'n/a'} time=${sound.context?.currentTime ?? 'n/a'}`,
    `locked=${sound.locked} pauseOnBlur=${sound.pauseOnBlur} mute=${sound.mute} masterVolume=${sound.volume}`,
    `musicEnabled=${state.musicEnabled} sfxEnabled=${state.sfxEnabled}`,
    `Scenes/phases: ${scenes.join(', ')}`,
  ];
  for (const key of ['home_bgm', 'battle_bgm'] as const) {
    const cached = game.cache.audio.get(key) as { duration?: number } | undefined;
    rows.push(`${key}: cache=${game.cache.audio.exists(key)} decodedDuration=${cached?.duration ?? 'n/a'} desired=${state.desired === key} confirmed=${state.bgmKey === key} pending=${state.pendingBgm === key}`,
      `  load: ${audio.diagnostics.assets[key] ?? 'not observed'}`);
    const clips = sound.getAll(key);
    rows.push(`  Sound objects=${clips.length}`);
    for (const clip of clips) {
      const detail = clip as unknown as { isPlaying: boolean; isPaused: boolean; volume: number; mute: boolean; seek: number; duration: number; pendingRemove: boolean; audio?: HTMLAudioElement; volumeNode?: GainNode; source?: AudioBufferSourceNode };
      rows.push(`  playing=${detail.isPlaying} paused=${detail.isPaused} volume=${detail.volume} gain=${detail.volumeNode?.gain.value ?? 'n/a'} mute=${detail.mute} seek=${detail.seek} duration=${detail.duration} removed=${detail.pendingRemove} source=${!!detail.source}`);
      if (detail.audio) rows.push(`  media paused=${detail.audio.paused} readyState=${detail.audio.readyState} time=${detail.audio.currentTime} error=${detail.audio.error?.message ?? 'none'}`);
    }
  }
  rows.push(`Last attempt: ${audio.diagnostics.attempt}`, `Last result/error: ${audio.diagnostics.result}`,
    `Last unlock/resume: ${audio.diagnostics.unlock}`, `Last loader: ${audio.diagnostics.loader}`,
    'Recent events:', ...audio.diagnostics.history.slice(-12));
  rows.push('Asset readiness:', ...Object.keys(audioAssets).map(key => `${key}: cache=${game.cache.audio.exists(key)} ${audio.diagnostics.assets[key] ?? ''}`));
  return rows.join('\n');
}

export function installAudioDebug(game: Phaser.Game, audio: AudioManager,
  search = globalThis.location?.search ?? '', doc = globalThis.document): (() => void) | undefined {
  if (!audioDebugEnabled(search) || !doc?.body) return;
  const panel = doc.createElement('details');
  panel.open = true;
  panel.style.cssText = 'position:fixed;right:0;top:0;z-index:99999;width:min(360px,96vw);max-height:65vh;overflow:auto;background:#17251fee;color:#fff;padding:8px;font:11px monospace;pointer-events:auto';
  const title = doc.createElement('summary'); title.textContent = 'Audio Debug (tap to collapse)'; panel.append(title);
  const status = doc.createElement('pre'); status.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere';
  let direct: Phaser.Sound.BaseSound | undefined;
  let disposed = false;
  const stopDirect = (): void => { direct?.stop(); direct?.destroy(); direct = undefined; };
  const button = (text: string, run: () => void): void => {
    const control = doc.createElement('button'); control.textContent = text;
    control.style.cssText = 'margin:3px;padding:7px;font-size:12px';
    control.onclick = () => { try { run(); } catch (error) { audio.recordDiagnostic('result', `debug: ${String(error)}`); } refresh(); };
    panel.append(control);
  };
  const refresh = (): void => {
    if (disposed) return;
    try { status.textContent = audioDebugSnapshot(game, audio); } catch (error) { status.textContent = `snapshot error: ${String(error)}`; }
  };
  button('Resume AudioContext', () => {
    const context = (game.sound as Phaser.Sound.WebAudioSoundManager).context;
    audio.recordDiagnostic('unlock', `direct resume requested: ${context?.state ?? 'no context'}`);
    // Called synchronously in the actual click handler. No synthetic pointer events.
    void context?.resume().then(() => { if (!disposed) audio.recordDiagnostic('unlock', `direct resume resolved: ${context.state}`); }, error => {
      if (!disposed) audio.recordDiagnostic('unlock', `direct resume rejected: ${String(error)}`);
    });
  });
  const playDirect = (key: BgmKey): void => {
    audio.debugStopBgm(); stopDirect();
    direct = game.sound.add(key, { loop: true, volume: audioAssets[key].volume });
    const result = direct.play({ loop: true, volume: audioAssets[key].volume });
    audio.recordDiagnostic('result', `DIRECT ${key}: play=${result}; bypass manager/fade. Listen to confirm audibility.`);
  };
  button('Play Home BGM Direct', () => playDirect('home_bgm'));
  button('Play Battle BGM Direct', () => playDirect('battle_bgm'));
  button('Stop BGM', () => { audio.debugStopBgm(); stopDirect(); });
  panel.append(status); doc.body.append(panel); refresh();
  const timer = setInterval(refresh, 500);
  const dispose = (): void => { disposed = true; clearInterval(timer); stopDirect(); panel.remove(); };
  game.events.once('destroy', dispose);
  return dispose;
}

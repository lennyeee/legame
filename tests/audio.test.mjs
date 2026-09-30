import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    if (!context.parentURL?.includes('/node_modules/') && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith('.ts')) return next(url, context);
    return { format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }) };
  },
});
const { AudioManager, audioForScene, loadAudioInBackground } = await import('../src/audio/AudioManager.ts');
const { audioAssets, audioAssetUrl } = await import('../src/config/audio.ts');
const { PlayerProgress } = await import('../src/progression/PlayerProgress.ts');
const { defaultPlayerSave, sanitizeSave } = await import('../src/progression/PlayerSave.ts');

class Clip extends EventEmitter {
  constructor(key, config) { super(); this.key = key; this.volume = config?.volume ?? 1; this.isPlaying = false; this.isPaused = false; this.plays = 0; this.position = 0; }
  play(config) { this.isPlaying = true; this.isPaused = false; this.plays++; this.position = 123; if (config?.volume !== undefined) this.volume = config.volume; return true; }
  pause() { this.isPaused = true; this.isPlaying = false; return true; }
  resume() { this.isPaused = false; this.isPlaying = true; return true; }
  stop() { this.isPaused = false; this.isPlaying = false; return true; }
  destroy() { this.destroyed = true; }
}
class Backend extends EventEmitter {
  locked = false;
  clips = [];
  add(key, config) { const clip = new Clip(key, config); this.clips.push(clip); return clip; }
  keys() { return this.clips.map(clip => clip.key); }
}
function setup() { const backend = new Backend(); let now = 0; return { backend, audio: new AudioManager(backend, () => now), advance: ms => { now += ms; } }; }
function attack(type) { return { kind: 'attack', type }; }

test('all supplied audio keys resolve beneath the Vite base, without enemy_hit', () => {
  assert.deepEqual(Object.keys(audioAssets).sort(), [
    'home_bgm','battle_bgm','battle_start','ui_click','recruit','unit_merge','hero_created','shovel',
    'blade_attack','pierce_attack','snipe_attack','blast_attack','enemy_death','victory','defeat',
  ].sort());
  assert.equal(Object.hasOwn(audioAssets, 'enemy_hit'), false);
  for (const key of Object.keys(audioAssets)) {
    const url = audioAssetUrl(key, '/legame/');
    assert.ok(url.startsWith('/legame/assets/audio/'));
    assert.ok(existsSync(fileURLToPath(new URL(`../public${url.slice('/legame'.length)}`, import.meta.url))), key);
    assert.ok(audioAssets[key].volume > 0 && audioAssets[key].volume < 1);
  }
});

test('one menu track persists across menu pages, battle switches once, pause resumes same clip and HOME resumes menu', () => {
  const { backend, audio } = setup();
  audio.menu(); const home = backend.clips[0];
  audio.menu(); audio.menu(); assert.deepEqual(backend.keys(), ['home_bgm']); assert.equal(home.plays, 1);
  audio.battle(); const battle = backend.clips[1];
  assert.equal(home.destroyed, true); assert.equal(battle.isPlaying, true);
  audio.battle(); assert.equal(backend.clips.length, 2);
  audio.pauseBattle(); assert.equal(battle.isPaused, true);
  audio.resumeBattle(); assert.equal(battle.isPlaying, true); assert.equal(battle.plays, 1);
  audio.leaveBattle(); assert.equal(battle.destroyed, true);
  audio.menu(); assert.deepEqual(backend.keys(), ['home_bgm','battle_bgm','home_bgm']);
});

test('BGM transition uses a short crossfade when the scene has tweens', () => {
  const { backend, audio } = setup(); audio.menu();
  const tweenCalls = []; const scene = { tweens: { add: config => { tweenCalls.push(config); return config; } } };
  audio.battle(scene);
  assert.equal(tweenCalls.length, 2);
  assert.equal(backend.clips[1].volume, 0);
  tweenCalls[0].onComplete(); assert.equal(backend.clips[0].destroyed, true);
});

test('pausing during crossfade silences old menu clip and resumes the same battle clip', () => {
  const { backend, audio } = setup(); audio.menu();
  const tweens = []; const scene = { tweens: { add: config => {
    const tween = { ...config, stopped: false, stop() { this.stopped = true; } }; tweens.push(tween); return tween;
  } } };
  audio.battle(scene); const battle = backend.clips[1];
  audio.pauseBattle();
  assert.equal(backend.clips[0].destroyed, true);
  assert.equal(battle.isPaused, true);
  assert.equal(tweens.every(tween => tween.stopped), true);
  audio.resumeBattle(); assert.equal(battle.plays, 1); assert.equal(battle.isPlaying, true);
});

test('locked audio waits for browser unlock without blocking scene flow', () => {
  const { backend, audio } = setup(); backend.locked = true;
  audio.menu(); assert.equal(backend.clips.length, 0);
  backend.locked = false; backend.emit('unlocked');
  assert.deepEqual(backend.keys(), ['home_bgm']);
});

test('an autoplay-rejected play safely retries after the first ordinary pointer interaction', async () => {
  const { backend, audio } = setup();
  const normalAdd = backend.add.bind(backend); let rejected = false;
  backend.add = (key, config) => {
    const clip = normalAdd(key, config);
    if (!rejected) { rejected = true; clip.play = () => false; }
    return clip;
  };
  const scene = { input: new EventEmitter() };
  audio.menu(scene); assert.equal(backend.clips[0].destroyed, true);
  scene.input.emit('pointerdown'); await Promise.resolve();
  assert.equal(backend.clips[1].key, 'home_bgm');
  assert.equal(backend.clips[1].isPlaying, true);
});

test('result stops battle BGM, plays outcome once and does not start menu until HOME', () => {
  for (const [outcome, key] of [['win','victory'], ['lose','defeat']]) {
    const { backend, audio } = setup(); audio.battle(); const battle = backend.clips[0];
    audio.result(outcome); assert.equal(battle.destroyed, true);
    assert.deepEqual(backend.keys(), ['battle_bgm', key]); assert.equal(audio.state.desired, null);
    audio.menu(); assert.equal(backend.clips.at(-1).key, 'home_bgm');
  }
});

test('music and SFX toggles are independent and reset to defaults in a new save', () => {
  const { backend, audio } = setup(); audio.menu();
  audio.setOptions({ musicEnabled: false, sfxEnabled: true });
  assert.equal(audio.state.bgmKey, null); assert.equal(audio.sfx('ui_click'), true);
  audio.setOptions({ musicEnabled: true, sfxEnabled: false });
  assert.equal(audio.state.bgmKey, 'home_bgm'); assert.equal(audio.sfx('recruit'), false);
  assert.deepEqual(defaultPlayerSave().audio, { musicEnabled: true, sfxEnabled: true });
  assert.deepEqual(sanitizeSave({ ...defaultPlayerSave(), audio: undefined }).audio, defaultPlayerSave().audio);
  assert.ok(backend.keys().includes('ui_click'));
});

test('audio preferences persist through PlayerProgress and reset restores both switches', () => {
  let raw = null; const storage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  const first = new PlayerProgress(storage); first.setAudioPreference('musicEnabled', false); first.setAudioPreference('sfxEnabled', false);
  const second = new PlayerProgress(storage); assert.deepEqual(second.save.audio, { musicEnabled: false, sfxEnabled: false });
  second.reset(); assert.deepEqual(second.save.audio, { musicEnabled: true, sfxEnabled: true });
});

test('combat events map four real attacks and deaths to restrained sounds without altering events', () => {
  const { backend, audio, advance } = setup();
  const events = [attack('刀'), attack('枪'), attack('弓'), attack('骑'), { kind: 'kill' }];
  const before = structuredClone(events); audio.combatEvents(events);
  assert.deepEqual(events, before);
  assert.deepEqual(backend.keys(), ['blade_attack','pierce_attack','snipe_attack','blast_attack','enemy_death']);
  audio.combatEvents([...events, ...events, ...events]);
  assert.equal(backend.clips.length, 5); // Same frame is silenced, gameplay event list is untouched.
  advance(120); for (const clip of backend.clips) clip.emit('complete');
  audio.combatEvents(events); assert.equal(backend.clips.length, 10);
  assert.equal(backend.keys().includes('enemy_hit'), false);
});

test('paused gameplay suppresses combat sounds while pause menu UI can click', () => {
  const { backend, audio } = setup(); audio.battle(); audio.pauseBattle();
  audio.combatEvents([attack('刀'), { kind: 'kill' }]);
  assert.deepEqual(backend.keys(), ['battle_bgm']);
  audio.uiClick(); assert.deepEqual(backend.keys(), ['battle_bgm','ui_click']);
  audio.resumeBattle(); audio.combatEvents([attack('刀')]);
  assert.equal(backend.keys().at(-1), 'blade_attack');
});

test('failed audio initialization returns a silent per-game manager instead of throwing', () => {
  const broken = { on() { throw new Error('AudioContext unavailable'); }, get locked() { throw new Error('AudioContext unavailable'); } };
  const game = { registry: new Map(), sound: broken };
  const scene = { game, input: new EventEmitter() };
  const audio = audioForScene(scene);
  assert.doesNotThrow(() => audio.menu(scene));
  assert.doesNotThrow(() => audio.sfx('ui_click'));
  assert.equal(audio.state.desired, 'home_bgm');
  assert.equal(audioForScene(scene), audio);
  const inaccessible = { game: { registry: { get() { throw new Error('no registry'); } } } };
  assert.doesNotThrow(() => audioForScene(inaccessible).menu());
});

test('audio decoding stalled or failed in a background loader cannot hold Scene.create', () => {
  const { audio } = setup();
  const load = Object.assign(new EventEmitter(), {
    queued: [], started: false,
    audio(key, url) { this.queued.push([key, url]); },
    start() { this.started = true; },
  });
  const scene = { cache: { audio: { exists: () => false } }, load, events: new EventEmitter() };
  audio.menu(scene);
  assert.doesNotThrow(() => loadAudioInBackground(scene, audio));
  assert.equal(load.started, true); assert.equal(load.queued.length, Object.keys(audioAssets).length);
  // Deliberately emit neither complete nor error: the HOME scene is already alive.
  assert.equal(audio.state.desired, 'home_bgm');
  load.emit('loaderror', { key: 'home_bgm' });
  assert.equal(audio.state.desired, 'home_bgm');
  scene.events.emit('shutdown'); assert.equal(load.listenerCount('filecomplete'), 0);
});

test('missing assets and a throwing loader degrade silently; late BGM completion retries the current track', () => {
  const { backend, audio } = setup();
  backend.add = () => { throw new Error('not decoded yet'); };
  const load = Object.assign(new EventEmitter(), {
    audio() { throw new Error('unsupported format'); }, start() { throw new Error('decode failure'); },
  });
  const scene = { input: new EventEmitter(), cache: { audio: { exists: () => false } },
    load, events: new EventEmitter() };
  audio.menu(scene);
  assert.doesNotThrow(() => loadAudioInBackground(scene, audio));
  assert.equal(audio.state.desired, 'home_bgm');
  backend.add = Backend.prototype.add;
  load.emit('filecomplete', 'home_bgm', 'audio');
  assert.equal(backend.clips.at(-1).key, 'home_bgm');
  assert.equal(backend.clips.at(-1).isPlaying, true);
});

test('a late BGM decode retries battle without reverting to menu music', () => {
  const { backend, audio } = setup();
  backend.add = () => { throw new Error('not decoded yet'); };
  const load = Object.assign(new EventEmitter(), { audio() {}, start() {} });
  const scene = { input: new EventEmitter(), cache: { audio: { exists: () => false } },
    load, events: new EventEmitter() };
  audio.menu(scene); loadAudioInBackground(scene, audio);
  audio.battle(scene);
  backend.add = Backend.prototype.add;
  load.emit('filecomplete', 'home_bgm', 'audio');
  assert.equal(backend.clips.length, 0);
  load.emit('filecomplete', 'battle_bgm', 'audio');
  assert.deepEqual(backend.keys(), ['battle_bgm']);
});

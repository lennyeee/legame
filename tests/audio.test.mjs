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
const { installAudioDebug, audioDebugSnapshot } = await import('../src/audio/AudioDebug.ts');
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

test('both BGM playback URLs use the supplied MP3 files under the Pages base', () => {
  for (const key of ['home_bgm', 'battle_bgm']) {
    const url = audioAssetUrl(key, '/legame/');
    assert.equal(url, `/legame/assets/audio/bgm/${key}.mp3`);
    assert.ok(existsSync(fileURLToPath(new URL(`../public${url.slice('/legame'.length)}`, import.meta.url))));
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

function suspendedContext() {
  return Object.assign(new EventEmitter(), {
    state: 'suspended', resumes: 0,
    addEventListener(event, listener) { this.on(event, listener); },
    resume() { this.resumes++; this.state = 'running'; this.emit('statechange'); return Promise.resolve(); },
  });
}

test('HOME keeps desired BGM pending until a real gesture resumes a suspended context', async () => {
  const backend = new Backend(); backend.context = suspendedContext();
  const audio = new AudioManager(backend); const scene = { input: new EventEmitter(), events: new EventEmitter() };
  audio.menu(scene);
  assert.equal(audio.state.desired, 'home_bgm'); assert.equal(audio.state.bgmKey, null);
  assert.equal(backend.clips.length, 0);
  scene.input.emit('pointerdown'); await Promise.resolve();
  assert.equal(backend.context.resumes, 1);
  assert.equal(audio.state.bgmKey, 'home_bgm'); assert.equal(backend.clips[0].isPlaying, true);
});

test('native canvas touch restores HOME BGM even when a button stops Phaser pointer propagation', async () => {
  const backend = new Backend(); backend.context = suspendedContext(); backend.locked = true;
  const listeners = new Map();
  const canvas = {
    addEventListener(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); },
    removeEventListener(event, listener) { listeners.get(event)?.delete(listener); },
    dispatch(event) { for (const listener of [...(listeners.get(event) ?? [])]) listener(); },
  };
  const audio = new AudioManager(backend);
  const scene = { input: new EventEmitter(), events: new EventEmitter(), game: { canvas } };
  audio.menu(scene);
  assert.equal(scene.input.listenerCount('pointerdown'), 0); // Phaser stopPropagation can suppress it.
  canvas.dispatch('touchstart'); // Native capture still runs before Phaser's object handler.
  backend.locked = false; backend.emit('unlocked'); await Promise.resolve();
  assert.equal(backend.context.resumes, 1);
  assert.equal(audio.state.bgmKey, 'home_bgm'); assert.deepEqual(backend.keys(), ['home_bgm']);
  assert.equal(listeners.get('touchstart').size, 0);
});

test('a true play result while WebAudio becomes suspended never marks BGM as playing', async () => {
  const backend = new Backend(); backend.context = suspendedContext(); backend.context.state = 'running';
  const normalAdd = backend.add.bind(backend); let first = true;
  backend.add = (key, config) => {
    const clip = normalAdd(key, config); const play = clip.play.bind(clip);
    if (first) { first = false; clip.play = config => { const started = play(config); backend.context.state = 'suspended'; return started; }; }
    return clip;
  };
  const audio = new AudioManager(backend); const scene = { input: new EventEmitter(), events: new EventEmitter() };
  audio.menu(scene);
  assert.equal(audio.state.desired, 'home_bgm'); assert.equal(audio.state.bgmKey, null);
  assert.equal(backend.clips[0].destroyed, true);
  scene.input.emit('pointerdown'); await Promise.resolve();
  assert.equal(audio.state.bgmKey, 'home_bgm'); assert.equal(backend.clips.at(-1).isPlaying, true);
});

test('failed battle switch cannot leave a silent menu BGM marked as actual playback', async () => {
  const backend = new Backend(); backend.context = suspendedContext(); backend.context.state = 'running';
  const audio = new AudioManager(backend); const scene = { input: new EventEmitter(), events: new EventEmitter() };
  audio.menu(scene); const menu = backend.clips[0];
  const normalAdd = backend.add.bind(backend); let interrupt = true;
  backend.add = (key, config) => {
    const clip = normalAdd(key, config); const play = clip.play.bind(clip);
    if (interrupt) { interrupt = false; clip.play = config => { const started = play(config); backend.context.state = 'suspended'; return started; }; }
    return clip;
  };
  audio.battle(scene);
  assert.equal(menu.destroyed, true); assert.equal(audio.state.desired, 'battle_bgm');
  assert.equal(audio.state.bgmKey, null);
  scene.input.emit('pointerdown'); await Promise.resolve();
  assert.equal(audio.state.bgmKey, 'battle_bgm');
});

test('HTML5 play returning true does not count as audible until its media element fires playing', () => {
  const backend = new Backend();
  backend.add = (key, config) => {
    const clip = new Clip(key, config);
    clip.audio = Object.assign(new EventEmitter(), {
      paused: true, addEventListener(event, listener) { this.on(event, listener); },
      removeEventListener(event, listener) { this.off(event, listener); },
    });
    backend.clips.push(clip); return clip;
  };
  const audio = new AudioManager(backend); const scene = { input: new EventEmitter(), events: new EventEmitter() };
  audio.menu(scene);
  assert.equal(audio.state.desired, 'home_bgm'); assert.equal(audio.state.pendingBgm, 'home_bgm');
  assert.equal(audio.state.bgmKey, null);
  scene.input.emit('pointerdown');
  assert.equal(backend.clips[0].destroyed, true);
  const second = backend.clips[1];
  second.audio.paused = false; second.audio.emit('playing');
  assert.equal(audio.state.pendingBgm, null); assert.equal(audio.state.bgmKey, 'home_bgm');
});

test('unlock after switching to battle starts only the current desired BGM', async () => {
  const backend = new Backend(); backend.context = suspendedContext();
  const audio = new AudioManager(backend);
  const home = { input: new EventEmitter(), events: new EventEmitter() };
  const battle = { input: new EventEmitter(), events: new EventEmitter() };
  audio.menu(home); audio.battle(battle);
  battle.input.emit('pointerdown'); await Promise.resolve();
  assert.deepEqual(backend.keys(), ['battle_bgm']); assert.equal(audio.state.bgmKey, 'battle_bgm');
});

test('music disabled during unlock stays silent; enabling it resumes the desired track', async () => {
  const backend = new Backend(); backend.context = suspendedContext();
  const audio = new AudioManager(backend); const scene = { input: new EventEmitter(), events: new EventEmitter() };
  audio.menu(scene); audio.setOptions({ musicEnabled: false, sfxEnabled: true });
  scene.input.emit('pointerdown'); await Promise.resolve();
  assert.equal(audio.state.bgmKey, null); assert.equal(backend.clips.length, 0);
  audio.setOptions({ musicEnabled: true, sfxEnabled: true });
  assert.equal(audio.state.bgmKey, 'home_bgm'); assert.deepEqual(backend.keys(), ['home_bgm']);
});

test('WebAudio interruption invalidates actual BGM and recovery starts the desired track again', async () => {
  const backend = new Backend(); backend.context = suspendedContext(); backend.context.state = 'running';
  const audio = new AudioManager(backend); const scene = { input: new EventEmitter(), events: new EventEmitter() };
  audio.menu(scene); const original = backend.clips[0];
  backend.context.state = 'interrupted'; backend.context.emit('statechange');
  assert.equal(original.destroyed, true); assert.equal(audio.state.bgmKey, null);
  assert.equal(audio.state.desired, 'home_bgm');
  scene.input.emit('pointerdown'); await Promise.resolve();
  assert.equal(audio.state.bgmKey, 'home_bgm'); assert.equal(backend.clips[1].isPlaying, true);
});

test('failed battle resume does not leave a false playing state', () => {
  const { backend, audio } = setup(); audio.battle(); const first = backend.clips[0];
  audio.pauseBattle(); first.resume = () => false;
  audio.resumeBattle();
  assert.equal(first.destroyed, true); assert.equal(audio.state.bgmKey, 'battle_bgm');
  assert.equal(backend.clips[1].isPlaying, true);
});

test('inactive scene fallback restores nonzero BGM volume when crossfade cannot run', () => {
  const { backend, audio } = setup(); audio.menu();
  const scene = { sys: { isActive: () => false }, tweens: { add() { throw new Error('inactive tween must not run'); } } };
  audio.battle(scene);
  assert.equal(backend.clips[1].isPlaying, true);
  assert.equal(backend.clips[1].volume, audioAssets.battle_bgm.volume);
  assert.equal(backend.clips[0].destroyed, true);
});

test('audio diagnostics distinguish downloaded, decoded/cache-ready and failed assets', () => {
  const { audio } = setup(); const cached = new Set();
  const load = Object.assign(new EventEmitter(), { audio() {}, start() {} });
  loadAudioInBackground({ cache: { audio: { exists: key => cached.has(key) } }, load, events: new EventEmitter() }, audio);
  load.emit('fileload', { key: 'home_bgm' });
  assert.match(audio.diagnostics.assets.home_bgm, /waiting for decode/);
  cached.add('home_bgm'); load.emit('filecomplete', 'home_bgm');
  assert.match(audio.diagnostics.assets.home_bgm, /cache ready/);
  load.emit('fileload', { key: 'battle_bgm' }); load.emit('complete');
  assert.match(audio.diagnostics.assets.battle_bgm, /without cache/);
  load.emit('loaderror', { key: 'ui_click' });
  assert.equal(audio.diagnostics.assets.ui_click, 'download error');
});

test('audio debug is absent by default and for every query except audioDebug=1', () => {
  let created = 0; const doc = { body: {}, createElement() { created++; throw new Error('must not create DOM'); } };
  const { audio } = setup(); const before = audio.state;
  for (const search of ['', '?audioDebug=0', '?audioDebug=true', '?other=1']) assert.equal(installAudioDebug({}, audio, search, doc), undefined);
  assert.equal(created, 0); assert.deepEqual(audio.state, before);
});

test('debug overlay is read-only until real buttons run; direct playback bypasses manager and cleans up', () => {
  const { backend, audio } = setup(); backend.context = suspendedContext(); backend.context.state = 'running';
  backend.getAll = key => backend.clips.filter(clip => clip.key === key);
  const game = { sound: backend, config: { audio: {} }, events: new EventEmitter(),
    cache: { audio: { exists: () => true, get: () => ({ duration: 123 }) } },
    scene: { getScenes: () => [{ sys: { settings: { key: 'ReadyScene' } }, startState: 'READY' }] } };
  const element = () => ({ children: [], style: {}, append(...items) { this.children.push(...items); }, remove() { this.removed = true; } });
  const doc = { body: element(), createElement: element };
  audio.menu(); const before = audio.state;
  const dispose = installAudioDebug(game, audio, '?audioDebug=1', doc);
  try {
    assert.deepEqual(audio.state, before); assert.equal(backend.clips.length, 1);
    const snapshot = audioDebugSnapshot(game, audio);
    assert.match(snapshot, /Backend: WebAudio/); assert.match(snapshot, /ReadyScene:READY/);
    assert.match(snapshot, /decodedDuration=123/); assert.match(snapshot, /playing=true/);
    const panel = doc.body.children[0];
    panel.children.find(child => child.textContent === 'Play Battle BGM Direct').onclick();
    assert.equal(backend.clips.at(-1).key, 'battle_bgm');
    assert.equal(audio.state.desired, 'home_bgm'); // Direct test is not a menu/battle state transition.
    assert.match(audio.diagnostics.result, /DIRECT battle_bgm/);
    panel.children.find(child => child.textContent === 'Stop BGM').onclick();
    assert.equal(backend.clips.at(-1).destroyed, true);
  } finally { dispose(); }
  assert.equal(doc.body.children[0].removed, true);
});

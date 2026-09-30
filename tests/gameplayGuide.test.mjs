import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

const phaser = 'data:text/javascript,' + encodeURIComponent(`export default { Scene: class {}, Scenes: { Events: { SHUTDOWN: 'shutdown' } } };`);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'phaser') return { url: phaser, shortCircuit: true };
    if (!context.parentURL?.includes('/node_modules/') && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith('.ts')) return next(url, context);
    return { format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }) };
  },
});
const { defaultPlayerSave, sanitizeSave } = await import('../src/progression/PlayerSave.ts');
const { PlayerProgress } = await import('../src/progression/PlayerProgress.ts');
const { gameplayGuide, gameplayHints } = await import('../src/content/gameplayGuide.ts');
const { HowToPlayScene } = await import('../src/scenes/HowToPlayScene.ts');

test('新玩家教程状态默认false，旧存档缺字段安全补false，完成状态持久保存并可由reset清除', () => {
  assert.deepEqual(defaultPlayerSave().tutorial, {
    deploymentHintCompleted: false, mergeHintCompleted: false, heroLetterHintCompleted: false,
  });
  const old = { ...defaultPlayerSave() };
  delete old.tutorial;
  assert.deepEqual(sanitizeSave(old).tutorial, defaultPlayerSave().tutorial);
  let stored = JSON.stringify(old);
  const progress = new PlayerProgress({ getItem: () => stored, setItem: (_key, value) => { stored = value; } });
  progress.completeTutorialHint('deploymentHintCompleted');
  assert.equal(JSON.parse(stored).tutorial.deploymentHintCompleted, true);
  assert.equal(new PlayerProgress({ getItem: () => stored, setItem: (_key, value) => { stored = value; } })
    .save.tutorial.deploymentHintCompleted, true);
  progress.reset();
  assert.deepEqual(progress.save.tutorial, defaultPlayerSave().tutorial);
});

test('玩法说明按五个步骤提供指定规则与重点提醒', () => {
  assert.deepEqual(gameplayGuide.map(step => step.title), ['征兵', '拖上战场', '召唤武将', '扩大战场', '保护乐']);
  assert.match(gameplayGuide[0].lines.join(''), /刃、贯、狙、爆/);
  assert.match(gameplayGuide[1].lines.join(''), /相同兵种 \+ 相同等级/);
  assert.match(gameplayGuide[2].lines.join(''), /小.*美.*小美/);
  assert.match(gameplayGuide[3].lines.join(''), /铲子.*未解锁的土地/);
  assert.match(gameplayGuide[4].lines.join(''), /3 点生命/);
  assert.equal(gameplayHints.deployment, '拖动单位，把他们放上战场。');
  assert.equal(gameplayHints.merge, '相同兵种、相同等级，可以拖到一起升级。');
});

test('说明页显示五步指引并通过明确返回按钮回HOME', () => {
  const scene = new HowToPlayScene(), objects = [], routes = [];
  scene.game = { registry: new Map() };
  function object(kind, x, y, width, height) {
    const value = Object.assign(new EventEmitter(), { kind, x, y, width, height, text: '',
      setInteractive() { this.interactive = true; return this; }, setStrokeStyle() { return this; },
      setOrigin() { return this; }, setWordWrapWidth() { return this; }, setStyle() { return this; }, setY(y) { this.y = y; return this; } });
    objects.push(value); return value;
  }
  scene.add = {
    rectangle: (...args) => object('rectangle', ...args),
    circle: (...args) => object('circle', ...args),
    text: (x, y, text) => { const item = object('text', x, y, 0, 0); item.text = text; return item; },
  };
  scene.scene = { start: key => routes.push(key) };
  scene.create();
  for (const title of ['怎么玩？', '征兵', '拖上战场', '召唤武将', '扩大战场', '保护乐', '别让乐死了。']) {
    assert.ok(objects.some(item => item.text === title), `missing ${title}`);
  }
  objects.find(item => item.interactive)?.emit('pointerdown');
  assert.deepEqual(routes, ['ReadyScene']);
});

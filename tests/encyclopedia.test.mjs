import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

const phaser = 'data:text/javascript,' + encodeURIComponent(`export default {
  Scene: class {}, Math: { Clamp: (value, min, max) => Math.max(min, Math.min(max, value)) },
  Scenes: { Events: { SHUTDOWN: 'shutdown' } }
};`);
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

const { heroRegistry, getHeroStats } = await import('../src/config/heroes.ts');
const { heroEncyclopediaEntry, heroEncyclopediaIds, formatHeroEffect } = await import('../src/content/heroEncyclopedia.ts');
const { heroLore, worldLore } = await import('../src/content/heroLore.ts');
const { unitDisplayNames, unitDescriptions } = await import('../src/config/units.ts');
const { unitLevelStats, getCombatStats } = await import('../src/config/combat.ts');
const { gameplayGuide, gameplayHints } = await import('../src/content/gameplayGuide.ts');
const { itemDefinitions } = await import('../src/config/equipment.ts');
const { opponentNames } = await import('../src/progression/profile.ts');
const { HeroEncyclopediaScene } = await import('../src/scenes/HeroEncyclopediaScene.ts');

test('图鉴恰好收录Registry中8名武将，人物叙事与战斗配置分层', () => {
  assert.deepEqual(heroEncyclopediaIds, heroRegistry.filter(hero => hero.available).map(hero => hero.id));
  assert.equal(heroEncyclopediaIds.length, 8);
  for (const id of heroEncyclopediaIds) {
    const entry = heroEncyclopediaEntry(id);
    assert.equal(entry.hero, heroRegistry.find(hero => hero.id === id));
    assert.equal(entry.lore, heroLore[id]);
    assert.ok(entry.lore.biography.length >= 10);
    assert.equal(entry.recipe, entry.hero.letters.join(' + '));
    assert.equal(entry.range, entry.hero.baseAttackRange);
    assert.equal(entry.skill, entry.hero.skill);
    for (const row of entry.levels) {
      assert.equal(row.damage, getHeroStats(row.level, id).damage);
      assert.equal(row.attackInterval, getHeroStats(row.level, id).attackInterval);
      assert.equal(row.attacksPerSecond, entry.hero.attacksPerSecondByLevel[row.level - 1]);
    }
  }
  assert.match(worldLore.join(''), /天选之子/);
  assert.match(worldLore.join(''), /想动乐/);
  assert.match(formatHeroEffect(heroEncyclopediaEntry('xiaomei').skill.effectByLevel[0]), /伤害 100/);
  assert.match(formatHeroEffect(heroEncyclopediaEntry('abing').skill.effectByLevel[0]), /持续 4秒/);
});

test('网页标题和游戏画布名称使用正式名称《保卫小乐》', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>保卫小乐<\/title>/);
  assert.match(html, /aria-label="保卫小乐"/);
});

test('普通兵仅更改显示名，内部ID、属性和说明仍按原类型索引', () => {
  assert.deepEqual(unitDisplayNames, { 刀: '刃', 枪: '贯', 弓: '狙', 骑: '爆' });
  assert.deepEqual(Object.keys(unitDescriptions), ['刀', '枪', '弓', '骑']);
  assert.deepEqual(Object.keys(unitLevelStats), ['刀', '枪', '弓', '骑']);
  for (const type of Object.keys(unitDisplayNames)) {
    assert.ok(getCombatStats({ type, level: 1 }).damage > 0);
  }
});

function sceneHarness() {
  const scene = new HeroEncyclopediaScene();
  scene.events = new EventEmitter();
  scene.input = new EventEmitter();
  scene.game = { registry: new Map() };
  scene.children = { removeAll() { for (const item of objects) item.active = false; } };
  scene.scene = { start(key) { destinations.push(key); } };
  const objects = [], destinations = [];
  function object(kind, x, y, width = 0, height = 0) {
    const value = Object.assign(new EventEmitter(), {
      kind, x, y, width, height, active: true, interactive: false, text: '',
      setInteractive() { this.interactive = true; return this; },
      setStrokeStyle() { return this; }, setOrigin() { return this; }, setVisible() { return this; },
      setMask() { return this; }, createGeometryMask() { return {}; },
      setY(next) { this.y = next; return this; },
      setText(next) { this.text = next; return this; },
      setWordWrapWidth() { return this; }, fillStyle() { return this; }, fillRect() { return this; },
      add(child) { (this.children ??= []).push(child); return this; },
    });
    objects.push(value);
    return value;
  }
  scene.add = {
    rectangle(x, y, width, height) { return object('rectangle', x, y, width, height); },
    graphics() { return object('graphics', 0, 0); },
    container(x, y) { return object('container', x, y); },
    text(x, y, text, style) {
      const value = object('text', x, y, 0, Math.max(33, Math.ceil([...text].length / 22) * 33));
      value.text = text;
      value.style = style;
      return value;
    },
  };
  scene.create();
  const click = (x, y) => {
    const target = objects.findLast(value => value.active && value.interactive && value.x === x && value.y === y);
    assert.ok(target, `no target at ${x},${y}`);
    target.emit('pointerdown', { id: 1, x, y });
    target.emit('pointerup', { id: 1, x, y });
  };
  return { scene, objects, destinations, click };
}

test('档案默认英雄分类，八名卡片/详情/世界分类切换与HOME返回可达', () => {
  const { scene, objects, destinations, click } = sceneHarness();
  assert.equal(scene.page, 'heroes');
  assert.ok(objects.some(item => item.active && item.text === '档案'));
  assert.ok(objects.some(item => item.active && item.text === '世界'));
  assert.ok(objects.some(item => item.active && item.text === '英雄'));
  for (const id of heroEncyclopediaIds) assert.ok(objects.some(item => item.active && item.text === heroEncyclopediaEntry(id).hero.name));
  click(205, 360);
  assert.equal(scene.page, heroEncyclopediaIds[0]);
  assert.ok(objects.some(item => item.active && item.text === '—— 战斗档案 ——'));
  click(76, 83);
  assert.equal(scene.page, 'heroes');
  click(245, 157);
  assert.equal(scene.page, 'world');
  assert.ok(objects.some(item => item.active && item.text === '天选之子'));
  assert.ok(objects.some(item => item.active && item.text.includes('想动乐，先过我们这一关。')));
  assert.ok(objects.some(item => item.active && item.text.includes('阻止外星人击杀乐')));
  click(505, 157);
  assert.equal(scene.page, 'heroes');
  click(76, 83);
  assert.deepEqual(destinations, ['ReadyScene']);
});

test('长小传纵向触摸/滚轮可滚到底且不切换英雄，返回按钮保持在滚动区外', () => {
  const { scene, objects, click } = sceneHarness();
  click(205, 360);
  assert.ok(scene.maxScroll > 0);
  scene.scrollBy(400);
  assert.equal(scene.scrollOffset, 400);
  scene.onTouchDown({ id: 1, x: 375, y: 600 });
  scene.onTouchMove({ id: 1, x: 375, y: 400, isDown: true });
  assert.equal(scene.scrollOffset, 600);
  scene.onTouchUp();
  assert.equal(scene.page, heroEncyclopediaIds[0]);
  scene.onWheel({}, [], 0, 5000);
  assert.equal(scene.scrollOffset, scene.maxScroll);
  assert.ok(objects.some(item => item.active && item.interactive && item.y === 83));
  click(76, 83);
  assert.equal(scene.page, 'heroes');
  assert.equal(scene.scrollOffset, 0);
});

test('英雄列表只接受位移阈值内的明确点击，触摸拖动不会误选英雄', () => {
  const { scene, objects } = sceneHarness();
  const card = objects.find(item => item.active && item.interactive && item.x === 205 && item.y === 360);
  assert.ok(card);
  card.emit('pointerdown', { id: 1, x: 205, y: 360 });
  card.emit('pointerup', { id: 1, x: 205, y: 380 });
  assert.equal(scene.page, 'heroes');
  card.emit('pointerdown', { id: 1, x: 205, y: 360 });
  card.emit('pointerup', { id: 1, x: 205, y: 360 });
  assert.equal(scene.page, heroEncyclopediaIds[0]);
});

test('主要玩家可见内容使用“英雄”术语，不显示旧“武将”称呼', () => {
  const visible = [...gameplayGuide.flatMap(step => [step.title, ...step.lines]), ...Object.values(gameplayHints),
    ...itemDefinitions.map(item => item.description), ...heroEncyclopediaIds.map(id => heroEncyclopediaEntry(id).hero.name), ...opponentNames];
  assert.ok(visible.every(text => !text.includes('武将')));
  const { scene, objects } = sceneHarness();
  assert.ok(objects.some(item => item.active && item.text === '英雄'));
  assert.ok(objects.every(item => !item.active || !item.text.includes('武将')));
});

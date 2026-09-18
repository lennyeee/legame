import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

// 使用真实控制器及范围绘制代码，只替代依赖浏览器的 Phaser 常量和图形对象。
const phaserStub = 'data:text/javascript,' + encodeURIComponent(`export default {
  Scenes: { Events: { UPDATE: 'update', SHUTDOWN: 'shutdown' } },
  Core: { Events: { BLUR: 'blur' } }
};`);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'phaser') return { url: phaserStub, shortCircuit: true };
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith('.ts')) return next(url, context);
    return { format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }) };
  },
});
const { getBattlefieldLayout } = await import('../src/ui/boardLayout.ts');
const { testMap } = await import('../src/config/maps.ts');
const { createBoardState } = await import('../src/systems/board.ts');
const { BattleController } = await import('../src/combat/BattleController.ts');

test('上方入口右下、终点左上，路径和格子统一计算且不改变基础地图', () => {
  const before = structuredClone(testMap);
  const upper = getBattlefieldLayout(testMap, 750, true);
  assert.deepEqual(upper.path[0], { x: 645, y: 545 });
  assert.deepEqual(upper.path.at(-1), { x: 105, y: 275 });
  for (const key of ['path', 'cells']) {
    upper[key].forEach((point, index) => {
      const base = testMap[key][index];
      assert.equal(point.x, 750 - base.x);
      assert.equal(point.y, 2 * testMap.mirrorY - base.y);
      if (key === 'cells') assert.equal(point.unlocked, base.unlocked);
    });
  }
  assert.deepEqual(testMap, before);
  const lower = getBattlefieldLayout(testMap, 750, false);
  assert.deepEqual(lower.path, testMap.path);
  assert.deepEqual(lower.cells, testMap.cells);
});

test('不同地图及分界线沿用同一变换，无第二套上半坐标', () => {
  const map = { ...testMap, mirrorY: 400,
    path: [{ x: 30, y: 450 }, { x: 320, y: 700 }],
    cells: [{ x: 60, y: 490, unlocked: false }] };
  assert.deepEqual(getBattlefieldLayout(map, 400, true), {
    path: [{ x: 370, y: 350 }, { x: 80, y: 100 }],
    cells: [{ x: 340, y: 310, unlocked: false }],
  });
});

function setup() {
  const graphics = [];
  const scene = {
    events: new EventEmitter(), input: new EventEmitter(), game: { events: new EventEmitter() },
    add: { graphics() {
      const graphic = {
        circle: false,
        clear() { this.circle = false; return this; },
        setDepth() { return this; }, fillStyle() { return this; }, lineStyle() { return this; },
        fillCircle() { this.circle = true; return this; }, strokeCircle() { return this; },
      };
      graphics.push(graphic);
      return graphic;
    } },
  };
  const board = createBoardState(testMap);
  board.tiles[0].unit = { type: '刀', level: 1 };
  const deployment = { draggedTile: null };
  let position = { kind: 'tile', index: 0 };
  new BattleController(scene, testMap, board, { money: 100 }, deployment,
    { positionAt: () => position }, () => {});
  const pointer = { id: 1, primaryDown: true, x: 195, y: 650 };
  const render = () => scene.events.emit('update', 0, 0);
  return { scene, deployment, pointer, render, range: graphics[0], setPosition: next => { position = next; } };
}

for (const event of ['pointerup', 'pointerupoutside']) {
  test(`按住显示，${event} 立即清除且下一帧不残留`, () => {
    const { scene, pointer, render, range } = setup();
    scene.input.emit('pointerdown', pointer);
    render();
    assert.equal(range.circle, true);
    scene.input.emit(event, pointer);
    assert.equal(range.circle, false);
    render();
    assert.equal(range.circle, false);
  });
}

test('开始拖动立即清除范围，拖动中后续帧及松手不恢复', () => {
  const { scene, pointer, render, range, deployment } = setup();
  scene.input.emit('pointerdown', pointer);
  render();
  assert.equal(range.circle, true);
  deployment.draggedTile = 0;
  scene.input.emit('pointermove', pointer);
  assert.equal(range.circle, false);
  render();
  assert.equal(range.circle, false);
  deployment.draggedTile = null;
  scene.input.emit('pointerup', pointer);
  render();
  assert.equal(range.circle, false);
});

test('待放置栏、空格和其他区域均不显示范围', () => {
  const { scene, pointer, render, range, setPosition } = setup();
  for (const position of [{ kind: 'slot', index: 0 }, { kind: 'tile', index: 1 }, null]) {
    setPosition(position);
    scene.input.emit('pointerdown', pointer);
    render();
    assert.equal(range.circle, false);
    scene.input.emit('pointerup', pointer);
  }
});

test('其他手指松开不影响当前按住；失焦会清除，退出场景会移除监听', () => {
  const { scene, pointer, render, range } = setup();
  scene.input.emit('pointerdown', pointer);
  render();
  scene.input.emit('pointerup', { ...pointer, id: 2 });
  assert.equal(range.circle, true);
  scene.game.events.emit('blur');
  assert.equal(range.circle, false);
  render();
  assert.equal(range.circle, false);
  scene.events.emit('shutdown');
  for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside']) {
    assert.equal(scene.input.listenerCount(event), 0);
  }
  assert.equal(scene.game.events.listenerCount('blur'), 0);
});

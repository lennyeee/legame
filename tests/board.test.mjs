import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

// 使用本机 Node 24 的 TypeScript 支持，不额外引入测试框架。
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
    return next(specifier, context);
  },
});
const { createBoardState, applyDrop, getDropAction } = await import('../src/systems/board.ts');
const { createRecruitmentState, recruit } = await import('../src/systems/recruitment.ts');
const { testMap } = await import('../src/config/maps.ts');
const { getLevelColor } = await import('../src/config/units.ts');
const slot = index => ({ kind: 'slot', index });
const tile = index => ({ kind: 'tile', index });
const unit = (type = '刀', level = 1) => ({ type, level });
const setup = () => ({ board: createBoardState(testMap), recruitment: createRecruitmentState() });

test('四种普通兵从槽位部署为 Lv.1，清空来源，不扣钱', () => {
  for (const type of ['刀', '枪', '弓', '骑']) {
    const { board, recruitment } = setup();
    recruitment.slots[0] = type;
    assert.equal(applyDrop(board, recruitment, slot(0), 0), 'deploy');
    assert.deepEqual(board.tiles[0].unit, unit(type));
    assert.equal(recruitment.slots[0], null);
    assert.equal(recruitment.money, 100);
  }
});

test('非法目标和锁定格不消耗槽位，也不更改棋盘', () => {
  const { board, recruitment } = setup();
  recruitment.slots[0] = '刀';
  const before = structuredClone({ board, recruitment });
  for (const target of [-1, 999, 3]) {
    assert.equal(applyDrop(board, recruitment, slot(0), target), 'invalid');
    assert.deepEqual({ board, recruitment }, before);
  }
});

test('铲子只解锁锁定格，消耗后可正常部署，不改地图模板', () => {
  const { board, recruitment } = setup();
  recruitment.slots[0] = '铲';
  assert.equal(applyDrop(board, recruitment, slot(0), 0), 'invalid');
  assert.equal(recruitment.slots[0], '铲');
  assert.equal(applyDrop(board, recruitment, slot(0), 3), 'unlock');
  assert.deepEqual(board.tiles[3], { unlocked: true, unit: null });
  assert.equal(recruitment.slots[0], null);
  assert.equal(testMap.cells[3].unlocked, false);
  recruitment.slots[0] = '骑';
  assert.equal(applyDrop(board, recruitment, slot(0), 3), 'deploy');
});

test('棋盘单位移动到空格保留类型与等级', () => {
  const { board, recruitment } = setup();
  board.tiles[0].unit = unit('弓', 4);
  assert.equal(applyDrop(board, recruitment, tile(0), 1), 'move');
  assert.equal(board.tiles[0].unit, null);
  assert.deepEqual(board.tiles[1].unit, unit('弓', 4));
});

test('棋盘非法移动和原位松手恢复原状，不能与自己合成', () => {
  const { board, recruitment } = setup();
  board.tiles[0].unit = unit();
  const before = structuredClone(board);
  for (const target of [-1, 3, 0]) {
    assert.equal(applyDrop(board, recruitment, tile(0), target), 'invalid');
    assert.deepEqual(board, before);
  }
});

test('不同类型交换位置但不合成、不升级', () => {
  const { board, recruitment } = setup();
  board.tiles[0].unit = unit('刀', 2);
  board.tiles[1].unit = unit('枪', 2);
  assert.equal(applyDrop(board, recruitment, tile(0), 1), 'swap');
  assert.deepEqual(board.tiles[0].unit, unit('枪', 2));
  assert.deepEqual(board.tiles[1].unit, unit('刀', 2));
});

test('同类型不同等级也只交换、不合成', () => {
  const { board, recruitment } = setup();
  board.tiles[0].unit = unit('刀', 1);
  board.tiles[1].unit = unit('刀', 2);
  assert.equal(applyDrop(board, recruitment, tile(0), 1), 'swap');
  assert.deepEqual(board.tiles[0].unit, unit('刀', 2));
  assert.deepEqual(board.tiles[1].unit, unit('刀', 1));
});

test('同类型同等级在目标格升级，清空来源，无等级上限', () => {
  for (const level of [1, 2, 5, 6, 20]) {
    const { board, recruitment } = setup();
    board.tiles[0].unit = unit('骑', level);
    board.tiles[1].unit = unit('骑', level);
    assert.equal(applyDrop(board, recruitment, tile(0), 1), 'merge');
    assert.equal(board.tiles[0].unit, null);
    assert.deepEqual(board.tiles[1].unit, unit('骑', level + 1));
  }
});

test('待放置栏可合成匹配单位，但不能替换不匹配的占用格', () => {
  const { board, recruitment } = setup();
  board.tiles[0].unit = unit('刀');
  recruitment.slots[0] = '枪';
  assert.equal(applyDrop(board, recruitment, slot(0), 0), 'invalid');
  assert.equal(recruitment.slots[0], '枪');
  recruitment.slots[0] = '刀';
  assert.equal(applyDrop(board, recruitment, slot(0), 0), 'merge');
  assert.equal(recruitment.slots[0], null);
  assert.deepEqual(board.tiles[0].unit, unit('刀', 2));
});

test('再次征兵不删除棋盘单位，不重置解锁状态', () => {
  const { board, recruitment } = setup();
  recruitment.slots[0] = '铲';
  applyDrop(board, recruitment, slot(0), 3);
  recruitment.slots[0] = '刀';
  applyDrop(board, recruitment, slot(0), 3);
  const before = structuredClone(board);
  assert.equal(recruit(recruitment, () => 0.3), true);
  assert.deepEqual(board, before);
  assert.deepEqual(recruitment.slots, Array(5).fill('枪'));
});

test('高亮查询不改变数据，空来源不执行动作', () => {
  const { board, recruitment } = setup();
  recruitment.slots[0] = '刀';
  const before = structuredClone({ board, recruitment });
  assert.equal(getDropAction(board, recruitment, slot(0), 0), 'deploy');
  assert.deepEqual({ board, recruitment }, before);
  assert.equal(applyDrop(board, recruitment, slot(1), 0), 'invalid');
  assert.equal(applyDrop(board, recruitment, tile(0), 1), 'invalid');
});

test('等级前六档颜色不同，Lv.6 以上保持金色', () => {
  assert.equal(new Set([1, 2, 3, 4, 5, 6].map(getLevelColor)).size, 6);
  assert.equal(getLevelColor(7), getLevelColor(6));
  assert.equal(getLevelColor(20), getLevelColor(6));
});

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
    recruitment.slots[0] = unit(type);
    assert.equal(applyDrop(board, recruitment, slot(0), tile(0)), 'move');
    assert.deepEqual(board.tiles[0].unit, unit(type));
    assert.equal(recruitment.slots[0], null);
    assert.equal(recruitment.money, 20);
  }
});

test('非法目标和锁定格不消耗槽位，也不更改棋盘', () => {
  const { board, recruitment } = setup();
  recruitment.slots[0] = unit('刀');
  const before = structuredClone({ board, recruitment });
  for (const target of [-1, 999, 3]) {
    assert.equal(applyDrop(board, recruitment, slot(0), tile(target)), 'invalid');
    assert.deepEqual({ board, recruitment }, before);
  }
});

test('铲子只解锁锁定格，消耗后可正常部署，不改地图模板', () => {
  const { board, recruitment } = setup();
  recruitment.slots[0] = '铲';
  assert.equal(applyDrop(board, recruitment, slot(0), tile(0)), 'invalid');
  assert.equal(recruitment.slots[0], '铲');
  assert.equal(applyDrop(board, recruitment, slot(0), tile(3)), 'unlock');
  assert.deepEqual(board.tiles[3], { unlocked: true, bonusType: 'none', unit: null });
  assert.equal(recruitment.slots[0], null);
  assert.equal(testMap.cells[3].unlocked, false);
  recruitment.slots[0] = unit('骑');
  assert.equal(applyDrop(board, recruitment, slot(0), tile(3)), 'move');
});

test('棋盘单位移动到空格保留类型与等级', () => {
  const { board, recruitment } = setup();
  board.tiles[0].unit = unit('弓', 4);
  assert.equal(applyDrop(board, recruitment, tile(0), tile(1)), 'move');
  assert.equal(board.tiles[0].unit, null);
  assert.deepEqual(board.tiles[1].unit, unit('弓', 4));
});

test('棋盘非法移动和原位松手恢复原状，不能与自己合成', () => {
  const { board, recruitment } = setup();
  board.tiles[0].unit = unit();
  const before = structuredClone(board);
  for (const target of [-1, 3, 0]) {
    assert.equal(applyDrop(board, recruitment, tile(0), tile(target)), 'invalid');
    assert.deepEqual(board, before);
  }
});

test('不同类型交换位置但不合成、不升级', () => {
  const { board, recruitment } = setup();
  board.tiles[0].unit = unit('刀', 2);
  board.tiles[1].unit = unit('枪', 2);
  assert.equal(applyDrop(board, recruitment, tile(0), tile(1)), 'swap');
  assert.deepEqual(board.tiles[0].unit, unit('枪', 2));
  assert.deepEqual(board.tiles[1].unit, unit('刀', 2));
});

test('同类型不同等级也只交换、不合成', () => {
  const { board, recruitment } = setup();
  board.tiles[0].unit = unit('刀', 1);
  board.tiles[1].unit = unit('刀', 2);
  assert.equal(applyDrop(board, recruitment, tile(0), tile(1)), 'swap');
  assert.deepEqual(board.tiles[0].unit, unit('刀', 2));
  assert.deepEqual(board.tiles[1].unit, unit('刀', 1));
});

test('同类型同等级在目标格升级，清空来源，逐级升至Lv.5', () => {
  for (const level of [1, 2, 3, 4]) {
    const { board, recruitment } = setup();
    board.tiles[0].unit = unit('骑', level);
    board.tiles[1].unit = unit('骑', level);
    assert.equal(applyDrop(board, recruitment, tile(0), tile(1)), 'merge');
    assert.equal(board.tiles[0].unit, null);
    assert.deepEqual(board.tiles[1].unit, unit('骑', level + 1));
  }
});

test('待放置栏和棋盘可交换不匹配单位，也可合成匹配单位', () => {
  const { board, recruitment } = setup();
  board.tiles[0].unit = unit('刀');
  recruitment.slots[0] = unit('枪');
  assert.equal(applyDrop(board, recruitment, slot(0), tile(0)), 'swap');
  assert.deepEqual(recruitment.slots[0], unit('刀'));
  assert.deepEqual(board.tiles[0].unit, unit('枪'));
  board.tiles[0].unit = unit('刀');
  recruitment.slots[0] = unit('刀');
  assert.equal(applyDrop(board, recruitment, slot(0), tile(0)), 'merge');
  assert.equal(recruitment.slots[0], null);
  assert.deepEqual(board.tiles[0].unit, unit('刀', 2));
});

test('再次征兵不删除棋盘单位，不重置解锁状态', () => {
  const { board, recruitment } = setup();
  recruitment.slots[0] = '铲';
  applyDrop(board, recruitment, slot(0), tile(3));
  recruitment.slots[0] = unit('刀');
  applyDrop(board, recruitment, slot(0), tile(3));
  const before = structuredClone(board);
  assert.equal(recruit(recruitment, () => 0.2), true);
  assert.deepEqual(board, before);
  assert.deepEqual(recruitment.slots, Array.from({ length: 5 }, () => unit('枪')));
});

test('高亮查询不改变数据，空来源不执行动作', () => {
  const { board, recruitment } = setup();
  recruitment.slots[0] = unit('刀');
  const before = structuredClone({ board, recruitment });
  assert.equal(getDropAction(board, recruitment, slot(0), tile(0)), 'move');
  assert.deepEqual({ board, recruitment }, before);
  assert.equal(applyDrop(board, recruitment, slot(1), tile(0)), 'invalid');
  assert.equal(applyDrop(board, recruitment, tile(0), tile(1)), 'invalid');
});

test('等级前六档颜色不同，Lv.6 以上保持金色', () => {
  assert.equal(new Set([1, 2, 3, 4, 5, 6].map(getLevelColor)).size, 6);
  assert.equal(getLevelColor(7), getLevelColor(6));
  assert.equal(getLevelColor(20), getLevelColor(6));
});

// 对四个方向使用同一组断言，避免只修复某个拖拽入口。
for (const sourceKind of ['slot', 'tile']) {
  for (const targetKind of ['slot', 'tile']) {
    const source = { kind: sourceKind, index: 0 };
    const target = { kind: targetKind, index: 1 };
    const write = (state, position, value) => {
      if (position.kind === 'slot') state.recruitment.slots[position.index] = value;
      else state.board.tiles[position.index].unit = value;
    };
    const read = (state, position) => position.kind === 'slot'
      ? state.recruitment.slots[position.index] : state.board.tiles[position.index].unit;

    test(`${sourceKind} → ${targetKind}：空目标移动并保留高级单位`, () => {
      const state = setup();
      write(state, source, unit('骑', 6));
      assert.equal(applyDrop(state.board, state.recruitment, source, target), 'move');
      assert.equal(read(state, source), null);
      assert.deepEqual(read(state, target), unit('骑', 6));
    });

    test(`${sourceKind} → ${targetKind}：Lv.1、Lv.2 同级合成`, () => {
      for (const level of [1, 2]) {
        const state = setup();
        write(state, source, unit('刀', level));
        write(state, target, unit('刀', level));
        assert.equal(applyDrop(state.board, state.recruitment, source, target), 'merge');
        assert.equal(read(state, source), null);
        assert.deepEqual(read(state, target), unit('刀', level + 1));
      }
    });

    test(`${sourceKind} → ${targetKind}：不同类型或等级完整交换`, () => {
      for (const other of [unit('枪', 2), unit('刀', 3)]) {
        const state = setup();
        write(state, source, unit('刀', 2));
        write(state, target, other);
        assert.equal(applyDrop(state.board, state.recruitment, source, target), 'swap');
        assert.deepEqual(read(state, source), other);
        assert.deepEqual(read(state, target), unit('刀', 2));
      }
    });
  }
}

test('非法区域、越界槽位、锁定格、原槽位不修改任何数据', () => {
  const state = setup();
  state.recruitment.slots[0] = unit('刀', 4);
  const before = structuredClone(state);
  for (const target of [null, slot(-1), slot(5), slot(0), tile(3), tile(99)]) {
    assert.equal(applyDrop(state.board, state.recruitment, slot(0), target), 'invalid');
    assert.deepEqual(state, before);
  }
});

test('铲子只可在空槽之间移动；不与单位或其他铲子交换/合成', () => {
  const { board, recruitment } = setup();
  recruitment.slots[0] = '铲';
  assert.equal(applyDrop(board, recruitment, slot(0), slot(1)), 'move');
  assert.equal(recruitment.slots[0], null);
  assert.equal(recruitment.slots[1], '铲');
  recruitment.slots[2] = '铲';
  recruitment.slots[3] = unit('刀', 2);
  board.tiles[0].unit = unit('骑', 3);
  const before = structuredClone({ board, recruitment });
  for (const [source, target] of [
    [slot(1), slot(2)], [slot(1), slot(3)], [slot(3), slot(1)],
    [slot(1), tile(0)], [slot(1), tile(1)], [tile(0), slot(1)],
  ]) {
    assert.equal(applyDrop(board, recruitment, source, target), 'invalid');
    assert.deepEqual({ board, recruitment }, before);
  }
  assert.equal(applyDrop(board, recruitment, slot(1), tile(3)), 'unlock');
  assert.equal(recruitment.slots[1], null);
  assert.deepEqual(board.tiles[3], { unlocked: true, bonusType: 'none', unit: null });
});

test('征兵覆盖高级待放置单位为 Lv.1，棋盘保持不变；余额不足不覆盖', () => {
  const { board, recruitment } = setup();
  board.tiles[0].unit = unit('弓', 4);
  recruitment.slots[0] = unit('刀', 5);
  const before = structuredClone(board);
  assert.equal(recruit(recruitment, () => 0), true);
  assert.deepEqual(board, before);
  assert.deepEqual(recruitment.slots, Array.from({ length: 5 }, () => unit('刀')));
  assert.equal(recruitment.money, 10);
  recruitment.money = 9;
  recruitment.slots[0] = unit('骑', 6);
  const beforeFailure = structuredClone(recruitment);
  assert.equal(recruit(recruitment, () => 0.9), false);
  assert.deepEqual(recruitment, beforeFailure);
});

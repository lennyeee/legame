import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
  return next(specifier, context);
} });
const { heroRecipes } = await import('../src/config/heroes.ts');
const { gameConfig, recruitmentWeights } = await import('../src/config/game.ts');
const { createBoardState, applyDrop, getDragItem } = await import('../src/systems/board.ts');
const { createRecruitmentState, recruit } = await import('../src/systems/recruitment.ts');
const { CombatSimulation } = await import('../src/combat/CombatSimulation.ts');
const { testMap } = await import('../src/config/maps.ts');
const letter = type => ({ kind: 'heroLetter', type });
const hero = type => ({ kind: 'hero', type });
const position = (kind, index) => ({ kind, index });
function setup() { return { board: createBoardState(testMap), reserve: createRecruitmentState() }; }
function put(board, reserve, p, item) {
  if (p.kind === 'slot') reserve.slots[p.index] = item;
  else board.tiles[p.index].unit = item;
}

test('征兵池保留原五种并能抽到每个武将字，仍覆盖全部5槽且扣10', () => {
  const total = Object.values(recruitmentWeights).reduce((a, b) => a + b, 0);
  let offset = 0;
  for (const type of gameConfig.recruitmentPool) {
    const state = createRecruitmentState();
    state.slots.fill(hero('赵云'));
    recruit(state, () => (offset + 0.5) / total);
    const expected = type === '铲' ? type : heroRecipes.some(r => r.letters.includes(type))
      ? letter(type) : { type, level: 1 };
    assert.deepEqual(state.slots, Array(5).fill(expected));
    assert.equal(state.money, 90);
    offset += recruitmentWeights[type];
  }
});

for (const recipe of heroRecipes) for (const reversed of [false, true]) {
  for (const sourceKind of ['slot', 'tile']) for (const targetKind of ['slot', 'tile']) {
    test(`${recipe.name} ${reversed ? '反' : '正'}序 ${sourceKind}→${targetKind}合成`, () => {
      const { board, reserve } = setup();
      const source = position(sourceKind, 0), target = position(targetKind, 1);
      const letters = reversed ? [...recipe.letters].reverse() : recipe.letters;
      put(board, reserve, source, letter(letters[0]));
      put(board, reserve, target, letter(letters[1]));
      assert.equal(applyDrop(board, reserve, source, target), 'merge');
      assert.equal(getDragItem(board, reserve, source), null);
      assert.deepEqual(getDragItem(board, reserve, target), hero(recipe.name));
      assert.equal('level' in getDragItem(board, reserve, target), false);
    });
  }
}

test('无关字、重复字、武将与兵种不会误合成；铲子保留原限制', () => {
  for (const [a, b] of [
    [letter('赵'), letter('关')], [letter('赵'), letter('赵')],
    [letter('赵'), { type: '刀', level: 1 }], [hero('赵云'), hero('赵云')],
    [hero('赵云'), letter('云')], [hero('赵云'), { type: '骑', level: 2 }],
    [letter('赵'), '铲'], [hero('赵云'), '铲'], ['铲', letter('云')],
  ]) {
    const { board, reserve } = setup();
    reserve.slots[0] = a; reserve.slots[1] = b;
    const shovel = a === '铲' || b === '铲';
    assert.equal(applyDrop(board, reserve, position('slot', 0), position('slot', 1)), shovel ? 'invalid' : 'swap');
    assert.deepEqual(reserve.slots.slice(0, 2), shovel ? [a, b] : [b, a]);
  }
});

test('单字和完整武将四种位置组合可移动、交换；锁定格和路径非法', () => {
  for (const item of [letter('赵'), hero('赵云')]) {
    for (const a of ['slot', 'tile']) for (const b of ['slot', 'tile']) {
      const { board, reserve } = setup();
      const source = position(a, 0), target = position(b, 1);
      put(board, reserve, source, item);
      assert.equal(applyDrop(board, reserve, source, position('tile', 3)), 'invalid');
      assert.equal(applyDrop(board, reserve, source, null), 'invalid');
      assert.equal(applyDrop(board, reserve, source, target), 'move');
      assert.equal(getDragItem(board, reserve, target), item);
      const soldier = { type: '枪', level: 3 };
      put(board, reserve, source, soldier);
      assert.equal(applyDrop(board, reserve, target, source), 'swap');
      assert.equal(getDragItem(board, reserve, source), item);
      assert.equal(getDragItem(board, reserve, target), soldier);
    }
  }
});

test('所有单字及武将不攻击、不创建弹道；替换弓兵也会取消旧攻击状态', () => {
  for (const item of [...heroRecipes.flatMap(r => r.letters.map(letter)), ...heroRecipes.map(r => hero(r.name))]) {
    const { board, reserve } = setup();
    const sim = new CombatSimulation(testMap, board, reserve);
    board.tiles[0].unit = { type: '弓', level: 1 };
    const enemy = sim.spawnEnemy(); enemy.moveSpeed = 0;
    for (let i = 0; i < 170; i++) sim.update(10);
    assert.equal(sim.projectiles.length, 1);
    reserve.slots[0] = item;
    applyDrop(board, reserve, position('slot', 0), position('tile', 0));
    sim.update(0);
    assert.equal(sim.projectiles.length, 0);
    const hp = enemy.hp;
    for (let i = 0; i < 500; i++) assert.deepEqual(sim.update(10), []);
    assert.equal(enemy.hp, hp);
    assert.equal(reserve.money, 100);
  }
});

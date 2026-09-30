import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
  return next(specifier, context);
} });
const { createBoardState } = await import('../src/systems/board.ts');
const { createRecruitmentState } = await import('../src/systems/recruitment.ts');
const { CombatSimulation } = await import('../src/combat/CombatSimulation.ts');
const { heroRecipes, getHeroDefinition, getHeroStats } = await import('../src/config/heroes.ts');
const { getCombatStats } = await import('../src/config/combat.ts');

const map = { name: '属性快照', mirrorY: -500, cellSize: 75,
  path: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
  cells: [{ x: 100, y: 50, unlocked: true }, { x: 175, y: 50, unlocked: true }] };
const letter = (type, level = 1) => ({ kind: 'heroLetter', type, level });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
function setup(type = '刀', level = 1) {
  const board = createBoardState(map), wallet = createRecruitmentState();
  board.tiles[0].unit = { type, level };
  const sim = new CombatSimulation(map, board, wallet);
  sim.syncBoard();
  return { board, sim };
}
function hero(id = 'xiaomei', level = 1) {
  const board = createBoardState(map), wallet = createRecruitmentState();
  const recipe = heroRecipes.find(entry => entry.id === id);
  board.tiles[0].unit = letter(recipe.letters[0], level);
  board.tiles[1].unit = letter(recipe.letters[1], level);
  const sim = new CombatSimulation(map, board, wallet);
  sim.syncBoard();
  return { board, sim, link: sim.heroLinks[0] };
}
function run(sim, ms) {
  const events = [];
  for (let t = 0; t < ms; t += 10) events.push(...sim.update(Math.min(10, ms - t)));
  return events;
}

test('普通兵快照的主目标伤害、实际攻速、格数射程与真实攻击一致', () => {
  const { sim } = setup('刀', 3);
  const snapshot = sim.getUnitCombatSnapshot(0);
  const base = getCombatStats({ type: '刀', level: 3 });
  assert.equal(snapshot.name, '刀兵');
  assert.equal(snapshot.damage, base.damage);
  assert.equal(snapshot.attackIntervalMs, base.attackInterval);
  assert.equal(snapshot.attacksPerSecond, 1000 / base.attackInterval);
  assert.equal(snapshot.rangeCells, base.range / 75);
  const enemy = sim.spawnEnemy(); enemy.hp = enemy.maxHp = 1000; enemy.moveSpeed = 0;
  enemy.x = 100; enemy.y = 0;
  close(run(sim, 400).find(event => event.kind === 'hit').damage, snapshot.damage);
});

test('普通兵攻击类型直接对应真实四种攻击分支，格子和急急如律令实时影响数值', () => {
  const types = { 刀: '单体', 枪: '直线贯穿', 弓: '单体远程', 骑: '范围攻击' };
  for (const [type, description] of Object.entries(types)) {
    const { board, sim } = setup(type);
    const base = sim.getUnitCombatSnapshot(0);
    assert.equal(base.attackType, description);
    board.tiles[0].bonusType = 'attack';
    close(sim.getUnitCombatSnapshot(0).damage, base.damage * 1.2);
    board.tiles[0].bonusType = 'attackSpeed';
    close(sim.getUnitCombatSnapshot(0).attacksPerSecond, base.attacksPerSecond * 1.2);
    board.tiles[0].bonusType = 'range';
    close(sim.getUnitCombatSnapshot(0).rangeCells, base.rangeCells * 1.2);
    board.tiles[0].unit.hasteEnhanced = true;
    close(sim.getUnitCombatSnapshot(0).attacksPerSecond, base.attacksPerSecond * 1.5);
  }
});

test('真实状态 Buff 改变武将快照，过期后恢复', () => {
  const { sim, board } = hero('xiaomei');
  const link = sim.heroLinks[0];
  board.tiles[0].unit = { type: '刀', level: 1 };
  sim.syncBoard();
  const soldier = sim.getUnitCombatSnapshot(0);
  // 使用仍然激活的武将来源，验证战斗系统真实状态加成与到期。
  board.tiles[0].unit = letter('小');
  sim.syncBoard();
  const source = sim.heroLinks[0];
  sim.statuses.buff(source, source, 30, .2, .3);
  const before = sim.getUnitCombatSnapshot(0);
  assert.equal(before.damage, soldier.damage * 1.2 * 10 / 3);
  assert.ok(before.attacksPerSecond > 1000 / 1200);
  run(sim, 40);
  const after = sim.getUnitCombatSnapshot(0);
  assert.equal(after.damage, 10);
  assert.equal(after.attacksPerSecond, 1000 / getHeroStats(1,'xiaomei').attackInterval);
  assert.notEqual(link, source);
});

test('武将快照与真实普通攻击主目标伤害一致，双格同种强化为加法', () => {
  const { sim, board } = hero('xiaomei');
  board.tiles[0].bonusType = 'attack'; board.tiles[1].bonusType = 'attack';
  const snapshot = sim.getUnitCombatSnapshot(1);
  assert.equal(snapshot.damage, 14);
  assert.equal(snapshot.kind, 'hero');
  assert.equal(snapshot.rangeCells, snapshot.rangePx / 75);
  const enemy = sim.spawnEnemy(); enemy.hp = enemy.maxHp = 1000; enemy.moveSpeed = 0;
  enemy.x = 100; enemy.y = 0;
  assert.equal(run(sim, 1250).find(event => event.kind === 'hit' && event.source === 'basic').damage,
    snapshot.damage);
});

test('八名武将的快照名称和普攻类型对应实际攻击模式', () => {
  for (const recipe of heroRecipes) {
    const { sim } = hero(recipe.id);
    const snapshot = sim.getUnitCombatSnapshot(0);
    assert.equal(snapshot.name, recipe.name);
    assert.equal(snapshot.skill.name, getHeroDefinition(recipe.id).skillName);
    assert.equal(snapshot.attackType, recipe.attackMode === 'single' ? '单体'
      : recipe.attackMode === 'selfArea' ? '自身范围'
      : 'splashMultiplier' in recipe ? '目标溅射' : '目标范围');
  }
});

test('八名武将Lv1-Lv5面板快照与实际普攻配置一致', () => {
  for (const recipe of heroRecipes) {
    for (let level = 1; level <= 5; level++) {
      const { sim } = hero(recipe.id, level);
      const snapshot = sim.getUnitCombatSnapshot(0);
      const base = getHeroStats(level, recipe.id);
      assert.equal(snapshot.damage, base.damage);
      close(snapshot.attackIntervalMs, base.attackInterval);
      close(snapshot.attacksPerSecond, 1000 / base.attackInterval);
      assert.equal(snapshot.rangePx, base.range);
    }
  }
});

test('武将等级段EXP、Lv5 MAX和技能CD均读取当前HeroLink状态', () => {
  const { sim, link } = hero('xiaomei', 2);
  link.currentExp = 3.4;
  link.skill.cooldownElapsed = 3600;
  let snapshot = sim.getUnitCombatSnapshot(0);
  assert.deepEqual(snapshot.exp, { current: 3.4, required: 20 });
  assert.match(snapshot.skill.status, /^冷却：/);
  link.skill.phase = 'ready';
  assert.equal(sim.getUnitCombatSnapshot(0).skill.status, '冷却：就绪');
  const max = hero('xiaomei', 5).sim.getUnitCombatSnapshot(0);
  assert.equal(max.exp.required, Infinity);
});

test('小倩叠层、小六强化次数和阿饼自身强化均反映当前真实状态', () => {
  const qian = hero('xiaoqian');
  const base = qian.sim.getUnitCombatSnapshot(0);
  qian.link.focus = { targetId: 1, stacks: 4 };
  const focused = qian.sim.getUnitCombatSnapshot(0);
  assert.match(focused.skill.status, /4 \/ 6/);
  assert.ok(focused.attacksPerSecond > base.attacksPerSecond);
  const liu = hero('xiaoliu');
  liu.link.skill.phase = 'empowered'; liu.link.skill.remainingAttacks = 4;
  assert.match(liu.sim.getUnitCombatSnapshot(0).skill.status, /剩余 4 \/ 7/);
  assert.equal(liu.sim.getUnitCombatSnapshot(0).damage, 9.6);
  const bing = hero('abing');
  bing.sim.statuses.buff(bing.link, bing.link, 1000, .3, .3);
  assert.match(bing.sim.getUnitCombatSnapshot(0).skill.status, /强化中/);
  assert.ok(bing.sim.getUnitCombatSnapshot(0).damage > 10);
});

test('单位离开、武将拆开或正在拖动时快照安全消失', () => {
  const ordinary = setup();
  ordinary.board.tiles[0].unit = null;
  assert.equal(ordinary.sim.getUnitCombatSnapshot(0), null);
  const linked = hero();
  linked.sim.syncBoard(0);
  assert.equal(linked.sim.getUnitCombatSnapshot(1), null);
  linked.sim.syncBoard();
  linked.board.tiles[1].unit = null;
  linked.sim.syncBoard();
  assert.equal(linked.sim.getUnitCombatSnapshot(0), null);
});

test('农民和未激活单字没有战斗属性面板', () => {
  const { sim, board } = setup();
  board.tiles[0].unit = { kind: 'farmer', type: '农', level: 1 };
  sim.syncBoard();
  assert.equal(sim.getUnitCombatSnapshot(0), null);
  board.tiles[0].unit = letter('小');
  sim.syncBoard();
  assert.equal(sim.getUnitCombatSnapshot(0), null);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
  return next(specifier, context);
} });
const { CombatSimulation } = await import('../src/combat/CombatSimulation.ts');
const { buildPath, pointOnPath } = await import('../src/combat/path.ts');
const { advanceEnemy, createEnemy, damageEnemy } = await import('../src/combat/enemies.ts');
const { selectTarget, piercingTargets } = await import('../src/combat/targeting.ts');
const { combatConfig, getCombatStats } = await import('../src/config/combat.ts');
const { testMap } = await import('./fixtures/combatMap.ts');
const { createBoardState, applyDrop } = await import('../src/systems/board.ts');
const { createRecruitmentState, recruit } = await import('../src/systems/recruitment.ts');
const unit = (type, level = 1) => ({ type, level });
const slot = index => ({ kind: 'slot', index });
const tile = index => ({ kind: 'tile', index });
const map = {
  name: '规则测试', mirrorY: -500, cellSize: 60,
  path: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
  cells: [{ x: 400, y: 50, unlocked: true }, { x: 600, y: 50, unlocked: true }],
};
function setup(type, options = {}) {
  const selectedMap = options.map ?? map;
  const board = createBoardState(selectedMap);
  const wallet = createRecruitmentState();
  if (type) board.tiles[0].unit = unit(type);
  const config = {
    ...combatConfig,
    ...options.config,
    enemy: { ...combatConfig.enemy, maxHp: 1000, moveSpeed: 0, ...options.config?.enemy },
  };
  return { board, wallet, sim: new CombatSimulation(selectedMap, board, wallet, config) };
}
function enemyAt(sim, distance) {
  const enemy = sim.spawnEnemy();
  enemy.distance = distance;
  Object.assign(enemy, pointOnPath(sim.path, distance));
  return enemy;
}
function run(sim, ms, suspended = null) {
  const events = [];
  for (let elapsed = 0; elapsed < ms; elapsed += 10) events.push(...sim.update(Math.min(10, ms - elapsed), suspended));
  return events;
}

test('敌人连续移动并跨越地图拐角，位置来自原地图路径', () => {
  const path = buildPath(testMap.path);
  const enemy = createEnemy(1, path, { maxHp: 90, moveSpeed: 50 });
  assert.deepEqual({ x: enemy.x, y: enemy.y }, testMap.path[0]);
  advanceEnemy(enemy, path, 0.5);
  assert.deepEqual({ x: enemy.x, y: enemy.y }, { x: 105, y: 660 });
  advanceEnemy(enemy, path, 2);
  assert.deepEqual({ x: enemy.x, y: enemy.y }, { x: 130, y: 735 });
  assert.equal(advanceEnemy(enemy, path, 100), true);
  assert.equal(enemy.distance, path.totalLength);
  assert.deepEqual({ x: enemy.x, y: enemy.y }, testMap.path.at(-1));
});

test('到达乐正确移除，只发出一次漏怪事件且不奖励', () => {
  const { sim, wallet } = setup(null, { map: testMap, config: { enemy: { moveSpeed: 55 } } });
  sim.spawnEnemy();
  const events = run(sim, 16000);
  assert.equal(events.filter(event => event.kind === 'escape').length, 1);
  assert.equal(events.filter(event => event.kind === 'kill').length, 0);
  assert.equal(sim.enemies.length, 0);
  assert.equal(wallet.money, 100);
});

test('未启用波次的独立战斗不会无限自动刷怪', () => {
  const { sim } = setup();
  run(sim, 60000);
  assert.equal(sim.enemies.length, 0);
});

test('刀近距离快速单体攻击，范围外不受伤', () => {
  const { sim } = setup('刀');
  const near = enemyAt(sim, 450);
  const other = enemyAt(sim, 420);
  const far = enemyAt(sim, 700);
  run(sim, 450);
  assert.equal(near.hp, 988);
  assert.equal(other.hp, 1000);
  assert.equal(far.hp, 1000);
  run(sim, 450);
  assert.equal(near.hp, 976);
});

test('枪朝目标方向一次穿透多个沿线敌人', () => {
  const lineMap = { ...map, cells: [{ x: 400, y: 0, unlocked: true }] };
  const { sim } = setup('枪', { map: lineMap });
  const a = enemyAt(sim, 260);
  const b = enemyAt(sim, 300);
  const outside = enemyAt(sim, 100);
  const events = run(sim, 1250);
  assert.equal(a.hp, 982);
  assert.equal(b.hp, 982);
  assert.equal(outside.hp, 1000);
  const shot = events.find(event => event.kind === 'attack');
  assert.equal(shot.end.x, 250);
});

test('枪的宽度、前向射线与最大射程限制都有效', () => {
  const enemies = [
    { id: 1, x: 100, y: 0, hp: 1 }, { id: 2, x: 150, y: 15, hp: 1 },
    { id: 3, x: 150, y: 17, hp: 1 }, { id: 4, x: -30, y: 0, hp: 1 },
    { id: 5, x: 251, y: 0, hp: 1 },
  ];
  assert.deepEqual(piercingTargets(enemies, { x: 0, y: 0 }, enemies[0], 250, 32).map(enemy => enemy.id), [1, 2]);
});

test('弓远程单体弹道在命中时扣血，不在发射时扣血', () => {
  const { sim } = setup('弓');
  const target = enemyAt(sim, 550);
  const other = enemyAt(sim, 500);
  const far = enemyAt(sim, 900);
  run(sim, 1700);
  assert.equal(sim.projectiles.length, 1);
  assert.equal(target.hp, 1000);
  run(sim, 600);
  assert.equal(target.hp, 970);
  assert.equal(other.hp, 1000);
  assert.equal(far.hp, 1000);
  assert.equal(sim.projectiles.length, 0);
});

test('骑攻击自身半径内所有敌人，半径外不受伤', () => {
  const { sim } = setup('骑');
  const targets = [300, 400, 500].map(distance => enemyAt(sim, distance));
  const far = enemyAt(sim, 560);
  run(sim, 1600);
  assert.deepEqual(targets.map(enemy => enemy.hp), [978, 978, 978]);
  assert.equal(far.hp, 1000);
});

test('索敌优先路径进度最高的合法敌人，死亡/范围外不会入选', () => {
  const { sim } = setup('刀');
  const first = enemyAt(sim, 350);
  const preferred = enemyAt(sim, 480);
  const outside = enemyAt(sim, 800);
  assert.equal(selectTarget(sim.enemies, map.cells[0], 115), preferred);
  preferred.hp = 0;
  assert.equal(selectTarget(sim.enemies, map.cells[0], 115), first);
  assert.notEqual(selectTarget(sim.enemies, map.cells[0], 115), outside);
});

test('每种普通兵在范围外都不会攻击', () => {
  for (const type of ['刀', '枪', '弓', '骑']) {
    const { sim } = setup(type);
    const enemy = enemyAt(sim, 950);
    const events = run(sim, 4000);
    assert.equal(enemy.hp, 1000);
    assert.equal(events.filter(event => event.kind === 'attack').length, 0);
  }
});

test('伤害归零、死亡移除、多个攻击者同帧击杀只奖励一次', () => {
  const { sim, wallet, board } = setup('刀', { map: { ...map, cells: [map.cells[0], map.cells[0]] }, config: { enemy: { maxHp: 10 } } });
  board.tiles[1].unit = unit('刀');
  const enemy = enemyAt(sim, 450);
  const events = run(sim, 450);
  assert.equal(enemy.hp, 0);
  assert.equal(sim.enemies.length, 0);
  assert.equal(events.filter(event => event.kind === 'kill').length, 1);
  assert.equal(wallet.money, 105);
  assert.deepEqual(damageEnemy(enemy, 100), { applied: 0, killed: false });
  run(sim, 1000);
  assert.equal(wallet.money, 105);
});

test('升级提高伤害和攻速，仅弓在Lv.2增加射程', () => {
  for (const type of ['刀', '枪', '弓', '骑']) {
    const base = getCombatStats(unit(type));
    for (const level of [2, 3, 5]) {
      const upgraded = getCombatStats(unit(type, level));
      assert.ok(upgraded.damage > base.damage);
      assert.equal(upgraded.range, type === '弓' ? 225 : base.range);
      assert.ok(upgraded.attackInterval < base.attackInterval);
    }
  }
});

test('待放置栏即使全是高级兵也不能攻击', () => {
  const { sim, wallet } = setup();
  wallet.slots = ['刀', '枪', '弓', '骑', '刀'].map(type => unit(type, 6));
  const enemy = enemyAt(sim, 450);
  assert.equal(run(sim, 5000).filter(event => event.kind === 'attack').length, 0);
  assert.equal(enemy.hp, 1000);
});

test('收回正在射箭的单位立即取消旧箭，栏位不会继续攻击', () => {
  const { sim, wallet, board } = setup('弓');
  const enemy = enemyAt(sim, 550);
  run(sim, 1700);
  assert.equal(sim.projectiles.length, 1);
  assert.equal(applyDrop(board, wallet, tile(0), slot(0)), 'move');
  sim.update(0);
  assert.equal(sim.projectiles.length, 0);
  assert.equal(run(sim, 4000).filter(event => event.kind === 'attack').length, 0);
  assert.equal(enemy.hp, 1000);
});

test('移动和换位均清除旧位置的攻击状态与飞行箭', () => {
  for (const swap of [false, true]) {
    const { sim, wallet, board } = setup('弓');
    const enemy = enemyAt(sim, 550);
    if (swap) board.tiles[1].unit = unit('刀');
    run(sim, 1700);
    const oldUnit = board.tiles[0].unit;
    assert.ok(sim.projectiles.length > 0);
    applyDrop(board, wallet, tile(0), tile(1));
    sim.update(0);
    assert.equal(sim.projectiles.length, 0);
    assert.equal(sim.isAttackerValid(0, oldUnit, 1), false);
    const hp = enemy.hp;
    run(sim, 100);
    assert.equal(enemy.hp, hp);
  }
});

test('战斗中合成会取消旧箭并立即采用升级属性', () => {
  const { sim, wallet, board } = setup('弓');
  const enemy = enemyAt(sim, 550);
  run(sim, 1700);
  const oldUnit = board.tiles[0].unit;
  wallet.slots[0] = unit('弓');
  assert.equal(applyDrop(board, wallet, slot(0), tile(0)), 'merge');
  sim.update(0);
  assert.equal(sim.projectiles.length, 0);
  assert.equal(sim.isAttackerValid(0, oldUnit, 1), false);
  const stats = getCombatStats(board.tiles[0].unit);
  run(sim, 1600);
  assert.equal(sim.projectiles[0].damage, stats.damage);
  assert.equal(sim.projectiles[0].range, stats.range);
  run(sim, 600);
  assert.equal(enemy.hp, 1000 - stats.damage);
});

test('拖动期间暂停来源单位，取消旧箭，无幽灵伤害', () => {
  const { sim } = setup('弓');
  const enemy = enemyAt(sim, 550);
  run(sim, 1700);
  sim.update(0, 0);
  assert.equal(sim.projectiles.length, 0);
  assert.equal(run(sim, 3000, 0).filter(event => event.kind === 'attack').length, 0);
  assert.equal(enemy.hp, 1000);
});

test('弓箭目标死亡、消失或出界时取消，随后可重新索敌', () => {
  for (const reason of ['dead', 'gone', 'range']) {
    const { sim } = setup('弓');
    const enemy = enemyAt(sim, 550);
    run(sim, 1700);
    if (reason === 'dead') enemy.hp = 0;
    if (reason === 'gone') sim.enemies = [];
    if (reason === 'range') enemy.distance = 950;
    run(sim, 30);
    assert.equal(sim.projectiles.length, 0);
    const next = enemyAt(sim, 500);
    run(sim, 2300);
    assert.ok(next.hp < next.maxHp);
  }
});

test('战斗中征兵、交换、合成和铲子解锁可共同运行', () => {
  const { sim, wallet, board } = setup('刀', { map: testMap });
  const deployed = board.tiles[0].unit;
  sim.spawnEnemy();
  recruit(wallet, () => 0.65);
  assert.equal(applyDrop(board, wallet, slot(0), tile(3)), 'unlock');
  run(sim, 100);
  recruit(wallet, () => 0);
  assert.equal(board.tiles[0].unit, deployed);
  applyDrop(board, wallet, slot(0), tile(0));
  run(sim, 100);
  assert.equal(board.tiles[0].unit.level, 2);
  assert.equal(board.tiles[3].unlocked, true);
});

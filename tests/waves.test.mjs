import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
  return next(specifier, context);
} });
const { WaveProgress } = await import('../src/combat/WaveProgress.ts');
const { CombatSimulation } = await import('../src/combat/CombatSimulation.ts');
const { waveConfig } = await import('../src/config/waves.ts');
const { combatConfig } = await import('../src/config/combat.ts');
const { testMap } = await import('../src/config/maps.ts');
const { createBoardState } = await import('../src/systems/board.ts');

function setup(config = waveConfig, enemy = {}) {
  const progress = new WaveProgress(config);
  const board = createBoardState(testMap);
  const wallet = { money: 100 };
  const sim = new CombatSimulation(testMap, board, wallet,
    { ...combatConfig, enemy: { ...combatConfig.enemy, ...enemy } }, progress);
  return { progress, board, wallet, sim };
}
function run(sim, ms) {
  const events = [];
  for (let elapsed = 0; elapsed < ms; elapsed += 10) events.push(...sim.update(Math.min(10, ms - elapsed)));
  return events;
}

test('固定间隔出兵；全部生成但未清空时不能进入下一波', () => {
  const { sim, progress } = setup(waveConfig, { moveSpeed: 0 });
  run(sim, waveConfig.spawnInterval - 20);
  assert.equal(sim.enemies.length, 0);
  run(sim, 40);
  assert.equal(sim.enemies.length, 1);
  run(sim, 30000);
  assert.equal(sim.enemies.length, waveConfig.enemyCounts[0]);
  assert.equal(progress.wave, 1);
  sim.enemies.forEach(enemy => { enemy.hp = 0; });
  run(sim, 20);
  run(sim, waveConfig.waveDelay - 40);
  assert.equal(progress.wave, 1);
  run(sim, 60);
  assert.equal(progress.wave, 2);
  assert.equal(sim.enemies.length, 0);
});

test('真实攻击完成1至5波，数量及生命成长正确，最后胜利并停止', () => {
  const { sim, progress, board, wallet } = setup();
  // 高等级兵快速清场，仍通过真实索敌、伤害和奖励链路验证整局。
  board.tiles[0].unit = { type: '骑', level: 30 };
  const observed = new Map();
  const spawn = sim.spawnEnemy.bind(sim);
  sim.spawnEnemy = multiplier => {
    const enemy = spawn(multiplier);
    const list = observed.get(progress.wave) ?? [];
    list.push(enemy.maxHp);
    observed.set(progress.wave, list);
    return enemy;
  };
  let kills = 0;
  for (let elapsed = 0; elapsed < 180000 && progress.status === 'playing'; elapsed += 100) {
    kills += sim.update(100).filter(event => event.kind === 'kill').length;
  }
  assert.deepEqual([...observed.keys()], [1, 2, 3, 4, 5]);
  waveConfig.enemyCounts.forEach((count, index) => {
    assert.equal(observed.get(index + 1).length, count);
    assert.ok(observed.get(index + 1).every(hp => hp === Math.round(combatConfig.enemy.maxHp * (1 + index * waveConfig.hpGrowth))));
  });
  assert.equal(progress.status, 'victory');
  assert.equal(progress.resultText, '胜利');
  assert.equal(progress.health, 3);
  assert.equal(kills, waveConfig.enemyCounts.reduce((a, b) => a + b, 0));
  assert.equal(wallet.money, 100 + kills * combatConfig.enemy.killReward);
  const before = JSON.stringify({ progress, enemies: sim.enemies, wallet });
  assert.deepEqual(run(sim, 20000), []);
  assert.equal(JSON.stringify({ progress, enemies: sim.enemies, wallet }), before);
});

test('漏怪只扣1生命、不奖励；第三次漏怪失败且立即冻结场上战斗', () => {
  const { sim, progress, wallet } = setup({ ...waveConfig, spawnInterval: 100 }, { moveSpeed: 810 });
  let escaped = 0;
  for (let elapsed = 0; elapsed < 5000 && progress.status === 'playing'; elapsed += 10) {
    const events = sim.update(10);
    escaped += events.filter(event => event.kind === 'escape').length;
    assert.equal(progress.health, Math.max(0, 3 - escaped));
    assert.equal(events.some(event => event.kind === 'kill'), false);
  }
  assert.equal(escaped, 3);
  assert.equal(progress.health, 0);
  assert.equal(progress.status, 'defeat');
  assert.equal(progress.resultText, '失败');
  assert.equal(wallet.money, 100);
  assert.ok(sim.enemies.length > 0);
  assert.equal(sim.projectiles.length, 0);
  const before = JSON.stringify({ progress, enemies: sim.enemies, wallet });
  assert.deepEqual(run(sim, 20000), []);
  progress.escape();
  assert.equal(JSON.stringify({ progress, enemies: sim.enemies, wallet }), before);
});

test('最后一个敌人漏掉后仍有生命则胜利；生命归零时失败优先', () => {
  for (const health of [1, 2]) {
    const { sim, progress, wallet } = setup({ ...waveConfig, baseHealth: health, enemyCounts: [1], spawnInterval: 20 }, { moveSpeed: 10000 });
    run(sim, 500);
    assert.equal(progress.health, health - 1);
    assert.equal(progress.status, health === 1 ? 'defeat' : 'victory');
    assert.equal(wallet.money, 100);
    assert.equal(sim.enemies.length, 0);
  }
});

test('提前清空当前已生成敌人不跳过本波剩余出兵', () => {
  const { sim, progress } = setup(waveConfig, { moveSpeed: 0 });
  run(sim, 2020);
  sim.enemies[0].hp = 0;
  run(sim, 20);
  assert.equal(progress.wave, 1);
  assert.equal(progress.status, 'playing');
  run(sim, 2000);
  assert.equal(progress.spawned, 2);
  assert.equal(sim.enemies.length, 1);
});

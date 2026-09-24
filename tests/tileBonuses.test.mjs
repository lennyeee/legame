import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
  return next(specifier, context);
} });
const { testMap } = await import('../src/config/maps.ts');
const { createBoardState, applyDrop } = await import('../src/systems/board.ts');
const { createRecruitmentState, recruitmentPool } = await import('../src/systems/recruitment.ts');
const { createInventory, setEquipped, createLoadout } = await import('../src/systems/equipment.ts');
const { tileBonusConfig } = await import('../src/config/tileBonuses.ts');
const { applyTileBonuses } = await import('../src/combat/tileBonuses.ts');
const { getCombatStats } = await import('../src/config/combat.ts');
const { getHeroStats } = await import('../src/config/heroes.ts');
const { getSkillStats } = await import('../src/config/skills.ts');
const { CombatSimulation } = await import('../src/combat/CombatSimulation.ts');
const slot = index => ({ kind: 'slot', index }), tile = index => ({ kind: 'tile', index });
const letter = type => ({ kind: 'heroLetter', type, level: 1 });
function setup(equipped = false) {
  const inventory = createInventory();
  if (equipped) assert.equal(setEquipped(inventory, 'golden_shovel', true), true);
  return { board: createBoardState(testMap), wallet: createRecruitmentState(createLoadout(inventory)) };
}
function unlock(board, wallet, index, random) {
  wallet.slots[0] = '铲';
  return applyDrop(board, wallet, slot(0), tile(index), random);
}
function run(sim, ms) {
  const events = [];
  for (let elapsed = 0; elapsed < ms; elapsed += 10) events.push(...sim.update(10));
  return events;
}
function combatCase(type = '刀', bonusType = 'none', enemyX = 100) {
  const map = { name: '强化测试', mirrorY: -500, cellSize: 75,
    path: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
    cells: [{ x: 100, y: 50, unlocked: true }, { x: 175, y: 50, unlocked: true }] };
  const board = createBoardState(map), wallet = createRecruitmentState();
  board.tiles[0].bonusType = bonusType;
  board.tiles[0].unit = type === 'hero' ? letter('小') : { type, level: 1 };
  if (type === 'hero') board.tiles[1].unit = letter('美');
  const sim = new CombatSimulation(map, board, wallet);
  const enemy = sim.spawnEnemy();
  enemy.maxHp = enemy.hp = 1000; enemy.moveSpeed = 0;
  enemy.distance = enemyX; enemy.x = enemyX; enemy.y = 0;
  return { map, board, wallet, sim, enemy };
}

test('8×5地图每局恰好6个普通开放地皮，其余22个非路径格锁定', () => {
  const board = createBoardState(testMap);
  assert.equal(testMap.spaces.length, 40);
  assert.equal(testMap.cells.length, 28);
  assert.equal(board.tiles.filter(item => item.unlocked).length, 6);
  assert.equal(board.tiles.filter(item => !item.unlocked).length, 22);
  assert.ok(board.tiles.every(item => item.bonusType === 'none'));
  assert.deepEqual(testMap.cells.filter(cell => cell.unlocked).map(cell => [cell.x, cell.y]),
    [[187.5, 602.5], [262.5, 602.5], [412.5, 677.5], [412.5, 752.5], [337.5, 602.5], [487.5, 602.5]]);
});

test('无金铲铲只正常解锁；非法操作和已经开放格不消耗随机次数', () => {
  const plain = setup(); let draws = 0;
  assert.deepEqual(recruitmentPool(plain.wallet.loadout), recruitmentPool(setup(true).wallet.loadout));
  assert.equal(unlock(plain.board, plain.wallet, 3, () => { draws++; return 0; }), 'unlock');
  assert.deepEqual(plain.board.tiles[3], { unlocked: true, bonusType: 'none', unit: null });
  assert.equal(draws, 0);
  const geared = setup(true);
  const random = () => { draws++; return 0; };
  assert.equal(unlock(geared.board, geared.wallet, 0, random), 'invalid');
  assert.equal(applyDrop(geared.board, geared.wallet, slot(1), tile(3), random), 'invalid');
  assert.equal(draws, 0);
  assert.equal(unlock(geared.board, geared.wallet, 3, random), 'unlock');
  assert.equal(draws, 2);
  assert.equal(unlock(geared.board, geared.wallet, 3, random), 'invalid');
  assert.equal(draws, 2);
  assert.equal(geared.board.tiles[3].bonusType, 'attack');
});

test('30%边界和三种等权强化均可控；新局特殊格不残留', () => {
  assert.equal(tileBonusConfig.unlockChance, 0.3);
  assert.equal(tileBonusConfig.bonusPerTile, 0.2);
  for (const [roll, type] of [[0, 'attack'], [0.5, 'attackSpeed'], [0.999, 'range']]) {
    const { board, wallet } = setup(true);
    const values = [0.299, roll];
    assert.equal(unlock(board, wallet, 3, () => values.shift()), 'unlock');
    assert.equal(board.tiles[3].bonusType, type);
    assert.equal(values.length, 0);
    assert.ok(createBoardState(testMap).tiles.every(item => item.bonusType === 'none'));
  }
  for (const chance of [0.3, 0.9]) {
    const { board, wallet } = setup(true); let draws = 0;
    assert.equal(unlock(board, wallet, 3, () => { draws++; return chance; }), 'unlock');
    assert.equal(board.tiles[3].bonusType, 'none'); assert.equal(draws, 1);
  }
});

test('普通兵伤害、真实攻击频率和实际索敌半径分别提高20%', () => {
  const base = getCombatStats({ type: '刀', level: 1 });
  for (const kind of ['attack', 'attackSpeed', 'range']) {
    const { board } = combatCase('刀', kind);
    const stats = applyTileBonuses(base, board, [0]);
    assert.equal(stats.damage, kind === 'attack' ? Math.round(base.damage * 1.2) : base.damage);
    assert.equal(stats.attackInterval, kind === 'attackSpeed' ? base.attackInterval / 1.2 : base.attackInterval);
    assert.equal(stats.range, kind === 'range' ? base.range * 1.2 : base.range);
  }
  const plain = combatCase(), attack = combatCase('刀', 'attack');
  run(plain.sim, 500); run(attack.sim, 500);
  assert.equal(1000 - plain.enemy.hp, base.damage);
  assert.equal(1000 - attack.enemy.hp, Math.round(base.damage * 1.2));
  const slow = combatCase(), fast = combatCase('刀', 'attackSpeed');
  assert.equal(run(slow.sim, 400).filter(e => e.kind === 'attack').length, 0);
  assert.equal(run(fast.sim, 400).filter(e => e.kind === 'attack').length, 1);
  const out = combatCase('刀', 'none', 210), inRange = combatCase('刀', 'range', 210);
  assert.equal(run(out.sim, 600).filter(e => e.kind === 'attack').length, 0);
  assert.equal(run(inRange.sim, 600).filter(e => e.kind === 'attack').length, 1);
});

test('格子强化随当前占格变化，移动、交换、合成不写入普通单位或农民', () => {
  const { board, wallet } = setup();
  board.tiles[0].bonusType = 'attack';
  const original = { type: '刀', level: 1 };
  board.tiles[0].unit = original;
  const base = getCombatStats(original);
  assert.equal(applyTileBonuses(base, board, [0]).damage, Math.round(base.damage * 1.2));
  assert.equal(applyDrop(board, wallet, tile(0), tile(1)), 'move');
  assert.equal(board.tiles[1].unit, original);
  assert.equal(applyTileBonuses(base, board, [1]).damage, base.damage);
  const newcomer = { type: '枪', level: 1 }; wallet.slots[0] = newcomer;
  assert.equal(applyDrop(board, wallet, slot(0), tile(0)), 'move');
  assert.equal(applyTileBonuses(getCombatStats(newcomer), board, [0]).damage,
    Math.round(getCombatStats(newcomer).damage * 1.2));
  assert.equal(applyDrop(board, wallet, tile(0), tile(1)), 'swap');
  assert.equal(applyTileBonuses(base, board, [0]).damage, Math.round(base.damage * 1.2));
  assert.equal(applyTileBonuses(getCombatStats(newcomer), board, [1]).damage, getCombatStats(newcomer).damage);
  wallet.slots[0] = { type: '刀', level: 1 };
  assert.equal(applyDrop(board, wallet, slot(0), tile(0)), 'merge');
  assert.equal(board.tiles[0].unit.level, 2);
  assert.equal(applyTileBonuses(getCombatStats(board.tiles[0].unit), board, [0]).damage,
    Math.round(getCombatStats(board.tiles[0].unit).damage * 1.2));
  assert.equal(original.hasteEnhanced, undefined);
  wallet.slots[0] = { kind: 'farmer', type: '农', level: 1 };
  assert.equal(applyDrop(board, wallet, slot(0), tile(1)), 'swap');
  assert.equal(board.tiles[1].unit.kind, 'farmer');
  assert.equal(board.tiles[1].unit.hasteEnhanced, undefined);
});

test('双格武将读取两格，两个同类+40%加法累计、异类并存，技能数值不变', () => {
  const { board, sim, enemy } = combatCase('hero', 'attack');
  board.tiles[1].bonusType = 'attack';
  const base = getHeroStats(1);
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => getHeroStats(index + 1).damage), [10, 15, 20, 25, 30]);
  assert.equal(base.damage, 10);
  const both = applyTileBonuses(base, board, [0, 1]);
  assert.equal(both.damage, 14);
  run(sim, 1250);
  assert.equal(1000 - enemy.hp, both.damage);
  board.tiles[1].bonusType = 'attackSpeed';
  const mixed = applyTileBonuses(base, board, [0, 1]);
  assert.equal(mixed.damage, 12);
  assert.equal(mixed.attackInterval, base.attackInterval / 1.2);
  board.tiles[0].bonusType = 'range'; board.tiles[1].bonusType = 'range';
  assert.equal(applyTileBonuses(base, board, [0, 1]).range, base.range * 1.4);
  assert.equal(getSkillStats('xiaomei_barrage', 1).damage, 100);
  assert.equal(sim.heroLinks[0].skill.cooldownDuration, getSkillStats('xiaomei_barrage', 1).cooldown);
  board.tiles[1].unit = null; sim.syncBoard();
  assert.equal(sim.heroLinks.length, 0);
});

test('武将双攻速格真正缩短普攻间隔、双射程格扩大普通索敌；农民不攻击', () => {
  const slow = combatCase('hero'), fast = combatCase('hero', 'attackSpeed');
  fast.board.tiles[1].bonusType = 'attackSpeed';
  assert.equal(run(slow.sim, 900).filter(e => e.kind === 'heroAttack').length, 0);
  assert.equal(run(fast.sim, 900).filter(e => e.kind === 'heroAttack').length, 1);
  const far = combatCase('hero', 'none', 400), extended = combatCase('hero', 'range', 400);
  extended.board.tiles[1].bonusType = 'range';
  assert.equal(run(far.sim, 1300).filter(e => e.kind === 'heroAttack').length, 0);
  assert.equal(run(extended.sim, 1300).filter(e => e.kind === 'heroAttack').length, 1);
  assert.ok(extended.sim.heroLinks[0].skill.cooldownElapsed > 0);
  assert.equal(far.sim.heroLinks[0].skill.cooldownElapsed, 0);
  const farmer = combatCase('刀', 'attack');
  farmer.board.tiles[0].unit = { kind: 'farmer', type: '农', level: 1 };
  assert.equal(run(farmer.sim, 3000).filter(e => e.kind === 'attack').length, 0);
  assert.equal(farmer.enemy.hp, 1000);
});

test('强化格不改变小美技能伤害与CD；只提升同格普通攻击', () => {
  const { board, sim, enemy } = combatCase('hero', 'attack');
  board.tiles[1].bonusType = 'attack';
  const before = getSkillStats('xiaomei_barrage', 1);
  run(sim, 9990);
  const hp = enemy.hp;
  const events = run(sim, 20);
  assert.equal(events.filter(event => event.kind === 'skillHit').length, 1);
  assert.equal(hp - enemy.hp, before.damage);
  assert.equal(sim.heroLinks[0].skill.cooldownDuration, before.cooldown);
  assert.deepEqual(getSkillStats('xiaomei_barrage', 1), before);
});

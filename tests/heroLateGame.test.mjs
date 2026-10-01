import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
  return next(specifier, context);
} });

const { PlayerSide } = await import('../src/systems/PlayerSide.ts');
const { getHeroDefinition, getHeroStats } = await import('../src/config/heroes.ts');
const { heroSpecial, specialAtLevel } = await import('../src/config/heroSpecial.ts');
const { resolvePercentDamage } = await import('../src/combat/specialDamage.ts');
const { damageEnemy } = await import('../src/combat/enemies.ts');
const { testMap } = await import('../src/config/maps.ts');
const letter = (type, level = 1) => ({ kind: 'heroLetter', type, level });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

function setup(id = 'xiaomei', level = 1) {
  const map = { ...testMap, cellSize: 75, path: [{ x: 0, y: 0 }, { x: 2000, y: 0 }],
    cells: Array.from({ length: 10 }, (_, index) => ({ x: 100 + index * 75, y: 60, unlocked: true })) };
  const side = new PlayerSide('test', map, undefined, { automaticWaves: false });
  const sim = side.combat;
  function place(heroId, index = 0, heroLevel = 1) {
    const recipe = getHeroDefinition(heroId).letters;
    side.board.tiles[index].unit = letter(recipe[0], heroLevel);
    side.board.tiles[index + 1].unit = letter(recipe[1], heroLevel);
    sim.update(0);
    return sim.heroLinks.find(link => link.heroId === heroId);
  }
  const link = place(id, 0, level);
  const run = ms => { const events = []; for (let time = 0; time < ms; time += sim.config.stepMs)
    events.push(...side.updateCombat(Math.min(sim.config.stepMs, ms - time), null)); return events; };
  const enemy = (x = 150, maxHp = 1000, hp = maxHp) => {
    const entity = sim.spawnEnemy(); entity.x = entity.distance = x; entity.y = 0;
    entity.moveSpeed = 0; entity.maxHp = maxHp; entity.hp = hp; return entity;
  };
  const ready = (hero = link) => { hero.skill.cooldownElapsed = hero.skill.cooldownDuration; return run(sim.config.stepMs); };
  return { side, sim, link, place, run, enemy, ready };
}

test('特殊伤害以命中前HP计算，普通敌人倍率1；真实伤害有独立通道', () => {
  const p = setup(), target = p.enemy(150, 1000, 600);
  assert.equal(target.percentDamageMultiplier, 1);
  near(resolvePercentDamage(target, { basis: 'maxHp', ratio: .2 }), 200);
  near(resolvePercentDamage(target, { basis: 'missingHp', ratio: .25 }), 100);
  target.percentDamageMultiplier = .25;
  near(resolvePercentDamage(target, { basis: 'maxHp', ratio: .2 }), 50);
  near(resolvePercentDamage(target, { basis: 'missingHp', ratio: .25 }, 1.2), 30);
  assert.deepEqual(damageEnemy(target, { regular: 20, trueDamage: 30 }), { applied: 50, killed: false });
  assert.equal(target.hp, 550);
});

for (const [level, ratio] of [[1, .18], [5, .30]])
test(`小美Lv${level}每个技能命中保留固定伤害并额外结算${ratio * 100}%最大HP`, () => {
  const p = setup('xiaomei', level), target = p.enemy();
  const events = p.ready(), hit = events.find(event => event.kind === 'hit' && event.source === 'skill');
  assert.ok(hit); assert.equal(hit.heroId, 'xiaomei'); assert.equal(hit.percentBasis, 'maxHp');
  near(hit.specialDamage, 1000 * ratio);
  near(hit.damage - hit.specialDamage, level === 1 ? 100 : 300);
  near(target.hp, 1000 - hit.damage);
});

test('百分比倍率只缩放特殊部分；小美技能仍一次命中、一次死亡和一次EXP', () => {
  const p = setup(), target = p.enemy(150, 1000, 110);
  target.percentDamageMultiplier = .25;
  let hit = p.ready().find(event => event.kind === 'hit' && event.source === 'skill');
  near(hit.specialDamage, 45); near(hit.damage, 110);
  assert.equal(p.sim.enemies.length, 0); assert.equal(p.link.currentExp, 1);
  assert.equal(p.side.recruitment.money, 21);
  const q = setup(), victim = q.enemy(150, 1000, 110);
  const events = q.ready();
  assert.equal(events.filter(event => event.kind === 'hit' && event.enemyId === victim.id).length, 1);
  assert.equal(events.filter(event => event.kind === 'kill' && event.enemyId === victim.id).length, 1);
  assert.equal(q.link.currentExp, 1);
});

test('小美锁定至多五个目标并分别按各自最大HP结算百分比', () => {
  const p = setup(), targets = [1000, 2000, 3000, 4000, 5000, 6000].map(maxHp => p.enemy(150, maxHp));
  const hits = [...p.ready(), ...p.run(600)].filter(event => event.kind === 'hit' && event.source === 'skill');
  assert.equal(hits.length, 5);
  hits.forEach((hit, index) => near(hit.specialDamage, targets[index].maxHp * .18));
  assert.equal(targets[5].hp, 6000);
});

test('永琪Lv5完整四个DOT各承担5%最大HP，离开射程仍结算，固定DOT和减速保留', () => {
  const p = setup('yongqi', 5), target = p.enemy(150, 1000);
  p.ready();
  assert.ok(p.sim.statuses.enemies.get(target).some(effect => effect.kind === 'slow'));
  target.x = target.distance = 1500;
  const dots = p.run(4000).filter(event => event.kind === 'hit' && event.source === 'dot');
  assert.equal(dots.length, 4);
  dots.forEach(hit => { near(hit.specialDamage, 50); near(hit.damage - hit.specialDamage, 10); });
  assert.equal(target.hp, 760);
  assert.equal(p.sim.statuses.enemies.has(target), false);
});

test('阿彪Lv5全路径剑来读取命中前已损失HP，35%为真实伤害', () => {
  const p = setup('abiao', 5), close = p.enemy(150, 10000), far = p.enemy(1500, 1000, 800);
  p.ready(); assert.equal(p.link.skill.phase, 'casting');
  const hits = p.run(400).filter(event => event.kind === 'hit' && event.source === 'skill');
  assert.deepEqual(hits.map(event => event.enemyId), [close.id, far.id]);
  const farHit = hits.find(event => event.enemyId === far.id);
  near(farHit.specialDamage, 70); near(farHit.damage - farHit.specialDamage, 72);
  assert.equal(farHit.percentBasis, 'missingHp'); assert.equal(farHit.trueDamage, true);
  near(far.hp, 658);
});

test('小倩同目标连击2/3/4/5/6/6%，转火或目标死亡后从2%重计', () => {
  const p = setup('xiaoqian'), first = p.enemy(150, 10000), hits = [];
  while (hits.length < 6) hits.push(...p.run(10).filter(event => event.kind === 'hit' && event.heroId === 'xiaoqian'));
  assert.deepEqual(hits.map(hit => Math.round(hit.specialDamage)), [200, 300, 400, 500, 600, 600]);
  assert.equal(p.link.focus.stacks, 6);
  const second = p.enemy(180, 10000); let switched;
  while (!switched) switched = p.run(10).find(event => event.kind === 'hit' && event.enemyId === second.id);
  near(switched.specialDamage, 200);
  second.hp = 0; let returned;
  while (!returned) returned = p.run(10).find(event => event.kind === 'hit' && event.enemyId === first.id);
  near(returned.specialDamage, 200);
});

test('小六Lv5七次强化普攻按实际AOE命中前六击8%、末击20%真实伤害', () => {
  const p = setup('xiaoliu', 5), first = p.enemy(150, 10000), second = p.enemy(170, 10000);
  p.ready(); assert.equal(p.link.skill.remainingAttacks, 7);
  const hits = [];
  while (hits.filter(event => event.enemyId === first.id).length < 7)
    hits.push(...p.run(10).filter(event => event.kind === 'hit' && event.heroId === 'xiaoliu'));
  for (const target of [first, second]) {
    const received = hits.filter(hit => hit.enemyId === target.id);
    assert.equal(received.length, 7);
    assert.deepEqual(received.map(hit => Math.round(hit.specialDamage)), [800,800,800,800,800,800,2000]);
    assert.equal(received.at(-1).trueDamage, true);
    near(received.reduce((sum, hit) => sum + hit.specialDamage, 0), 6800);
  }
  assert.equal(p.link.skill.remainingAttacks, 0);
});

test('小六强化中合法转火保留剩余次数与本次攻击的特殊伤害序号', () => {
  const p = setup('xiaoliu', 5), first = p.enemy(150, 10000);
  p.ready(); let firstHit;
  while (!firstHit) firstHit = p.run(10).find(event => event.kind === 'hit' && event.enemyId === first.id);
  near(firstHit.specialDamage, 800); assert.equal(p.link.skill.remainingAttacks, 6);
  const second = p.enemy(300, 10000); let switched;
  while (!switched) switched = p.run(10).find(event => event.kind === 'hit' && event.enemyId === second.id);
  near(switched.specialDamage, 800);
  assert.equal(p.link.skill.remainingAttacks, 5);
});

test('阿饼Lv5仅四秒自Buff期间AOE各目标另受3.5%最大HP', () => {
  const p = setup('abing', 5), first = p.enemy(150, 10000), second = p.enemy(170, 10000);
  p.ready();
  const hits = p.run(500).filter(event => event.kind === 'hit' && event.heroId === 'abing');
  assert.ok(hits.some(hit => hit.enemyId === first.id));
  assert.ok(hits.some(hit => hit.enemyId === second.id));
  hits.forEach(hit => near(hit.specialDamage, 350));
  p.run(3600); assert.equal(p.sim.statuses.allies.get(p.link)?.has(p.link) ?? false, false);
  const later = p.run(1000).filter(event => event.kind === 'hit' && event.heroId === 'abing');
  assert.ok(later.length > 0); assert.ok(later.every(hit => hit.specialDamage === undefined));
});

test('侯将大喝保留原眩晕并施加三秒易伤；普通兵的伤害也增加10%', () => {
  const p = setup('houjiang'), target = p.enemy(150, 10000);
  p.sim.map.cells[4].x = 150; p.sim.map.cells[4].y = 60;
  p.side.board.tiles[4].unit = { type: '刀', level: 1 }; p.sim.update(0);
  p.ready();
  assert.ok(p.sim.statuses.enemies.get(target).some(effect => effect.kind === 'stun'));
  near(p.sim.statuses.damageMultiplier(target), 1.1);
  const ordinary = p.run(900).find(event => event.kind === 'hit' && !event.heroId);
  assert.ok(ordinary); near(ordinary.damage, 3.3);
  p.run(2200); near(p.sim.statuses.damageMultiplier(target), 1);
});

test('肖战Lv5特殊伤害乘1.20且不重复叠乘，固定技能伤害和普攻Buff照旧', () => {
  const p = setup('xiaozhan', 5), ally = p.place('xiaomei', 2, 5), target = p.enemy(150, 1000);
  p.ready(); near(p.sim.statuses.specialDamageMultiplier(ally), 1.2);
  p.sim.statuses.buff(ally, p.link, 5000, .2, .2, 1.2);
  near(p.sim.statuses.specialDamageMultiplier(ally), 1.2);
  near(p.sim.statuses.basicStats(ally, getHeroStats(5, 'xiaomei')).damage, 32 * 1.2);
  const hit = p.ready(ally).find(event => event.kind === 'hit' && event.heroId === 'xiaomei' && event.source === 'skill');
  assert.ok(hit); near(hit.specialDamage, 360); near(hit.damage - hit.specialDamage, 300);
  assert.equal(target.hp, 340);
});

test('pause、拆散和新局清除DOT/易伤/特殊增幅，不改变旧局结果', () => {
  const p = setup('yongqi'), target = p.enemy(); p.ready();
  p.side.pause(); const before = target.hp;
  assert.deepEqual(p.run(5000), []); assert.equal(target.hp, before);
  p.side.resume(); p.run(1000); assert.ok(target.hp < before);
  p.side.destroy(); assert.equal(p.sim.statuses.enemies.size, 0);
  const next = setup('yongqi'); assert.equal(next.sim.statuses.enemies.size, 0);
  assert.equal(next.sim.statuses.allies.size, 0);
});

test('八名英雄特殊配置分级清晰，基础面板仍从原Registry读取', () => {
  assert.deepEqual(heroSpecial.xiaomeiMaxHp, [.18,.21,.24,.27,.30]);
  assert.deepEqual(heroSpecial.yongqiDotMaxHpTotal, [.12,.14,.16,.18,.20]);
  assert.deepEqual(heroSpecial.abiaoMissingHpTrue, [.15,.20,.25,.30,.35]);
  assert.deepEqual(heroSpecial.xiaoqianMaxHpByHit, [.02,.03,.04,.05,.06]);
  assert.deepEqual(heroSpecial.xiaoliuEmpoweredMaxHp, [.04,.05,.06,.07,.08]);
  assert.deepEqual(heroSpecial.xiaoliuFinalMaxHpTrue, [.10,.125,.15,.175,.20]);
  assert.deepEqual(heroSpecial.abingBuffMaxHp, [.015,.02,.025,.03,.035]);
  assert.deepEqual(heroSpecial.xiaozhanSpecialMultiplier, [1.10,1.125,1.15,1.175,1.20]);
  assert.deepEqual(heroSpecial.houjiangVulnerability, {durationMs:3000,bonus:.10});
  near(specialAtLevel(heroSpecial.xiaoliuEmpoweredMaxHp, 5) * 6
    + specialAtLevel(heroSpecial.xiaoliuFinalMaxHpTrue, 5), .68);
  assert.equal(specialAtLevel(heroSpecial.abingBuffMaxHp, 5), .035);
  assert.equal(specialAtLevel(heroSpecial.xiaozhanSpecialMultiplier, 5), 1.2);
  assert.deepEqual([1,2,3,4,5].map(level => getHeroStats(level, 'xiaomei').damage), [10,14,19,25,32]);
});

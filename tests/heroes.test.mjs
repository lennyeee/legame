import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) specifier += '.ts';
  return next(specifier, context);
} });
const { heroRecipes, heroCombat } = await import('../src/config/heroes.ts');
const { gameConfig, recruitmentWeights } = await import('../src/config/game.ts');
const { createBoardState, applyDrop, getDragItem } = await import('../src/systems/board.ts');
const { getHeroLinks } = await import('../src/systems/heroActivation.ts');
const { createRecruitmentState, recruit } = await import('../src/systems/recruitment.ts');
const { CombatSimulation } = await import('../src/combat/CombatSimulation.ts');
const { testMap } = await import('../src/config/maps.ts');
const letter = type => ({ kind: 'heroLetter', type });
const pos = (kind, index) => ({ kind, index });
function setup(map = testMap) { return { board: createBoardState(map), reserve: createRecruitmentState() }; }
function put(board, reserve, p, item) { if (p.kind === 'slot') reserve.slots[p.index] = item; else board.tiles[p.index].unit = item; }
function run(sim, ms, suspended = null) {
  const events = [];
  for (let i = 0; i < ms; i += 10) events.push(...sim.update(10, suspended));
  return events;
}

test('征兵权重及5槽覆盖不变，只生成单字或原有兵种工具', () => {
  const total = Object.values(recruitmentWeights).reduce((a,b)=>a+b,0);
  let offset = 0;
  for (const type of gameConfig.recruitmentPool) {
    const state = createRecruitmentState();
    state.slots.fill(letter('赵'));
    recruit(state, () => (offset + 0.5) / total);
    const expected = type === '铲' ? type : heroRecipes.some(r=>r.letters.includes(type)) ? letter(type) : {type,level:1};
    assert.deepEqual(state.slots, Array(5).fill(expected));
    assert.equal(state.money, 90);
    offset += recruitmentWeights[type];
  }
});

for (const recipe of heroRecipes) {
  for (const reversed of [false,true]) test(`${recipe.name}横向${reversed?'反序不激活':'正序激活且保留两个对象'}`, () => {
    const {board} = setup();
    const chars = reversed ? [...recipe.letters].reverse() : recipe.letters;
    const a = letter(chars[0]), b = letter(chars[1]);
    board.tiles[0].unit=a; board.tiles[1].unit=b;
    const links=getHeroLinks(testMap,board);
    assert.equal(links.length,reversed?0:1);
    if(!reversed) { assert.equal(links[0].name,recipe.name); assert.deepEqual(links[0].origin,{x:221,y:650}); }
    assert.equal(board.tiles[0].unit,a); assert.equal(board.tiles[1].unit,b);
  });
}
for(const [name,dx,dy] of [['纵向',0,52],['纵向反序',0,-52],['对角线',52,52],['隔格',104,0],['不同排',52,1]]) {
  test(`${name}不能激活`,()=>{
    const map={...testMap,cells:[{x:195,y:650,unlocked:true},{x:195+dx,y:650+dy,unlocked:true}]};
    const {board}=setup(map); board.tiles[0].unit=letter('赵');board.tiles[1].unit=letter('云');
    assert.deepEqual(getHeroLinks(map,board),[]);
  });
}
for(const a of ['slot','tile']) for(const b of ['slot','tile']) test(`${a}→${b}字只交换不压缩合成`,()=>{
  const {board,reserve}=setup(); const source=pos(a,0),target=pos(b,1);
  const x=letter('赵'),y=letter('云');put(board,reserve,source,x);put(board,reserve,target,y);
  assert.equal(applyDrop(board,reserve,source,target),'swap');
  assert.equal(getDragItem(board,reserve,source),y);assert.equal(getDragItem(board,reserve,target),x);
});

test('单字、无关字、重复字、锁定格、待放置栏均不激活',()=>{
  for(const other of [null,letter('赵'),letter('羽'),{type:'刀',level:1}]) {
    const {board,reserve}=setup();board.tiles[0].unit=letter('赵');board.tiles[1].unit=other;reserve.slots[0]=letter('云');
    assert.deepEqual(getHeroLinks(testMap,board),[]);
  }
  const {board}=setup();board.tiles[0].unit=letter('赵');board.tiles[1].unit=letter('云');board.tiles[1].unlocked=false;
  assert.deepEqual(getHeroLinks(testMap,board),[]);
});

test('多个武将关系无重叠、无重复，征兵不改变棋盘关系',()=>{
  const {board,reserve}=setup();
  for(const [a,b,chars] of [[0,1,['赵','云']],[14,15,['关','羽']]]) {board.tiles[a].unit=letter(chars[0]);board.tiles[b].unit=letter(chars[1]);}
  assert.equal(getHeroLinks(testMap,board).length,2);
  const before=getHeroLinks(testMap,board);recruit(reserve,()=>0.8);
  assert.deepEqual(getHeroLinks(testMap,board),before);
});

function battle() {
  const {board,reserve}=setup();board.tiles[0].unit=letter('赵');board.tiles[1].unit=letter('云');
  const sim=new CombatSimulation(testMap,board,reserve);
  const enemy=sim.spawnEnemy();enemy.moveSpeed=0;enemy.hp=enemy.maxHp=1000;
  return {board,reserve,sim,enemy};
}
test('激活武将每周期只攻击一次，从双格中心索敌，正确伤害及奖励',()=>{
  const {sim,enemy,reserve}=battle();
  const events=run(sim,heroCombat.attackInterval*2);
  assert.equal(events.filter(e=>e.kind==='heroAttack').length,2);
  assert.equal(enemy.hp,1000-heroCombat.damage*2);
  assert.equal(sim.projectiles.length,0);
  enemy.hp=1;run(sim,heroCombat.attackInterval);
  assert.equal(reserve.money,105);
});
test('优先路径进度最高的范围内目标，范围外不受伤',()=>{
  const {sim,enemy}=battle();enemy.distance=20;
  const far=sim.spawnEnemy();far.moveSpeed=0;far.distance=800;
  const near=sim.spawnEnemy();near.moveSpeed=0;near.distance=80;
  run(sim,heroCombat.attackInterval);
  assert.equal(enemy.hp,1000);assert.equal(far.hp,far.maxHp);assert.equal(near.hp,near.maxHp-heroCombat.damage);
});
test('拖动任一字立即解除，放回重新开始冷却；移动/交换不残留攻击',()=>{
  for(const index of [0,1]) {
    const {sim,board,reserve,enemy}=battle();run(sim,1000);
    sim.update(0,index);assert.equal(sim.heroLinks.length,0);
    assert.equal(run(sim,2000,index).filter(e=>e.kind==='heroAttack').length,0);
    assert.equal(enemy.hp,1000);
    sim.update(0);assert.equal(sim.heroLinks.length,1);
    assert.equal(run(sim,1000).filter(e=>e.kind==='heroAttack').length,0);
    applyDrop(board,reserve,pos('tile',index),pos('slot',0));sim.update(0);
    assert.equal(sim.heroLinks.length,0);assert.deepEqual(run(sim,2000),[]);
    applyDrop(board,reserve,pos('slot',0),pos('tile',index));sim.update(0);
    assert.equal(sim.heroLinks.length,1);assert.equal(run(sim,1200).filter(e=>e.kind==='heroAttack').length,1);
    applyDrop(board,reserve,pos('tile',0),pos('tile',1));sim.update(0);
    assert.equal(sim.heroLinks.length,0);assert.deepEqual(run(sim,2000),[]);
  }
});
test('普通兵和铲子不会与武将字合成，休眠字替换弓后取消旧弹道',()=>{
  const {board,reserve}=setup();const sim=new CombatSimulation(testMap,board,reserve);
  board.tiles[0].unit={type:'弓',level:1};const enemy=sim.spawnEnemy();enemy.moveSpeed=0;
  run(sim,1700);assert.equal(sim.projectiles.length,1);
  reserve.slots[0]=letter('赵');assert.equal(applyDrop(board,reserve,pos('slot',0),pos('tile',0)),'swap');
  sim.update(0);assert.equal(sim.projectiles.length,0);assert.deepEqual(run(sim,5000),[]);
  reserve.slots[1]='铲';assert.equal(applyDrop(board,reserve,pos('tile',0),pos('slot',1)),'invalid');
});

test('16个52像素部署格不覆盖道路、入口、乐、分界或UI，具有足够横向相邻位',()=>{
  assert.equal(testMap.cells.length,16);assert.equal(testMap.cellSize,52);
  assert.deepEqual(testMap.path,[{x:105,y:635},{x:105,y:735},{x:375,y:735},{x:375,y:905},{x:645,y:905}]);
  const half=testMap.cellSize/2;let pairs=0;
  for(const cell of testMap.cells) {
    assert.ok(cell.y-half>testMap.mirrorY && cell.y+half<986);
    assert.ok(cell.x-half>32 && cell.x+half<718);
    for(let i=1;i<testMap.path.length;i++) {
      const a=testMap.path[i-1],b=testMap.path[i];
      const dx=Math.max(Math.min(a.x,b.x)-(cell.x+half),cell.x-half-Math.max(a.x,b.x),0);
      const dy=Math.max(Math.min(a.y,b.y)-(cell.y+half),cell.y-half-Math.max(a.y,b.y),0);
      assert.ok(Math.hypot(dx,dy)>19,'部署格不能覆盖宽38的道路');
    }
    for(const point of [testMap.path[0],testMap.path.at(-1)]) {
      assert.ok(Math.hypot(Math.max(Math.abs(cell.x-point.x)-half,0),Math.max(Math.abs(cell.y-point.y)-half,0))>30);
    }
    pairs+=testMap.cells.filter(c=>c.y===cell.y&&c.x===cell.x+52).length;
  }
  assert.ok(pairs>=10);
  for(let i=0;i<16;i++)for(let j=i+1;j<16;j++){
    const a=testMap.cells[i],b=testMap.cells[j];assert.ok(Math.abs(a.x-b.x)>=52||Math.abs(a.y-b.y)>=52);
  }
});

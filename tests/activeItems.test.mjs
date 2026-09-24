import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const { ActiveItems } = await import('../src/systems/ActiveItems.ts');
const { createInventory, setEquipped, createLoadout, inventoryFromLoadout } = await import('../src/systems/equipment.ts');
const { createBoardState } = await import('../src/systems/board.ts');
const { createRecruitmentState, recruitmentPool, recruit } = await import('../src/systems/recruitment.ts');
const { getHeroProgression } = await import('../src/systems/heroProgression.ts');
const { FarmerProduction } = await import('../src/systems/FarmerProduction.ts');
const { testMap } = await import('../src/config/maps.ts');
const { itemEffects } = await import('../src/config/itemEffects.ts');
const { recruitmentWeights } = await import('../src/config/game.ts');
const { farmerConfig } = await import('../src/config/farmer.ts');
const { heroRecipes } = await import('../src/config/heroes.ts');
function loadout(...ids) {const inventory=createInventory();ids.forEach(id=>setEquipped(inventory,id,true));return createLoadout(inventory);}
function setup(){const gear=loadout('upgrade_talisman'),board=createBoardState(testMap),wallet=createRecruitmentState(gear),active=new ActiveItems(gear);return {gear,board,wallet,active};}
const letter=(type,level=1)=>({kind:'heroLetter',type,level});

test('升级符开局等待完整集中CD；未装备没有使用机会',()=>{
 const {board,wallet,active}=setup();wallet.slots[0]={type:'刀',level:1};const target={kind:'slot',index:0};
 assert.equal(itemEffects.upgradeCooldownMs,20000);assert.equal(active.use(0,board,wallet,target),false);
 active.update(19999);assert.equal(active.ready(0),false);active.update(1);assert.equal(active.ready(0),true);
 assert.equal(new ActiveItems(loadout()).use(0,board,wallet,target),false);
});
for(const unit of [{type:'刀'},{type:'枪'},{type:'弓'},{type:'骑'},{kind:'farmer',type:'农'},...['小','美','阿','饼','六'].map(type=>({kind:'heroLetter',type}))]) {
 test('升级符支持'+unit.type+'待放置栏与棋盘Lv.1到5，封顶不消耗',()=>{
  for(const kind of ['slot','tile'])for(let level=1;level<=5;level++){
   const {board,wallet,active}=setup(),target={kind,index:0},item={...unit,level};
   if(kind==='slot')wallet.slots[0]=item;else board.tiles[0].unit=item;
   active.update(20000);assert.equal(active.use(0,board,wallet,target),level<5);
   assert.equal(item.level,Math.min(5,level+1));assert.equal(active.slots[0].remainingMs,level<5?20000:0);
  }
 });
}
test('空地、道路、锁定格、铲子及不存在的位置不消耗ready；成功才重新CD',()=>{
 const {board,wallet,active}=setup();active.update(20000);wallet.slots[0]='铲';
 const locked=board.tiles.findIndex(t=>!t.unlocked);board.tiles[locked].unit={type:'刀',level:1};
 for(const target of [null,{kind:'slot',index:0},{kind:'slot',index:1},{kind:'tile',index:locked},{kind:'tile',index:999}]){
  assert.equal(active.use(0,board,wallet,target),false);assert.equal(active.ready(0),true);
 }
 wallet.slots[0]={type:'刀',level:1};assert.equal(active.use(0,board,wallet,{kind:'slot',index:0}),true);
 assert.equal(active.use(0,board,wallet,{kind:'slot',index:0}),false);assert.equal(wallet.slots[0].level,2);
});
test('升级符复用HeroLetter同步：双方升一级、EXP归零、保持激活周期并封顶',()=>{
 const {board,wallet,active}=setup();board.tiles[0].unit=letter('小',3);board.tiles[1].unit=letter('美',3);
 const progression=getHeroProgression(board);progression.sync();const link=[...progression.links.values()][0];assert.ok(link);
 link.currentExp=12;active.update(20000);assert.equal(active.use(0,board,wallet,{kind:'tile',index:0}),true);
 assert.equal(board.tiles[1].unit.level,4);assert.equal(link.currentExp,0);assert.equal(link.level,4);
 active.update(20000);active.use(0,board,wallet,{kind:'tile',index:1});assert.equal(link.level,5);
 active.update(20000);assert.equal(active.use(0,board,wallet,{kind:'tile',index:0}),false);assert.equal(link.level,5);
});
test('农民升级清除旧收益、按新等级重新生产，无幽灵收益',()=>{
 const {board,wallet,active}=setup();const farmer={kind:'farmer',type:'农',level:1};board.tiles[0].unit=farmer;
 const production=new FarmerProduction(board,wallet);production.update(12000);const old=production.states.get(farmer).reward.id;
 active.update(20000);active.use(0,board,wallet,{kind:'tile',index:0});production.sync();
 assert.equal(production.collect(farmer,old),false);assert.equal(production.states.get(farmer).elapsedMs,0);
 production.update(12000);assert.equal(production.states.get(farmer).reward.amount,2);
});
test('主动状态停止/销毁拒绝升级及CD推进；新实例完整CD',()=>{
 const {board,wallet,active,gear}=setup();wallet.slots[0]={type:'刀',level:1};active.update(20000);active.stop();
 assert.equal(active.use(0,board,wallet,{kind:'slot',index:0}),false);active.destroy();active.update(99999);
 assert.equal(active.slots.length,0);assert.equal(new ActiveItems(gear).slots[0].remainingMs,20000);
});
test('招贤榜按武将字类别统一乘2，保持相对权重、不改变普通池、不加入农民',()=>{
 const plain=recruitmentPool(loadout()),boosted=recruitmentPool(loadout('hero_recruitment'));
 assert.equal(itemEffects.heroRecruitmentMultiplier,2);assert.equal(boosted.some(e=>e.value==='农'),false);
 for(const entry of boosted){const isLetter=heroRecipes.some(r=>r.letters.includes(entry.value));
  assert.equal(entry.weight,recruitmentWeights[entry.value]*(isLetter?2:1));
  assert.equal(plain.find(e=>e.value===entry.value).weight,recruitmentWeights[entry.value]);
 }
});
test('农民+招贤榜同时生效；loadout快照隔离装备变更，随机结果覆盖五格',()=>{
 const inventory=createInventory();setEquipped(inventory,'farmer',true);setEquipped(inventory,'hero_recruitment',true);
 const state=createRecruitmentState(createLoadout(inventory));inventory.forEach(i=>i.equipped=false);
 const pool=recruitmentPool(state.loadout);assert.equal(pool.find(e=>e.value==='农').weight,farmerConfig.recruitmentWeight);
 assert.equal(pool.find(e=>e.value==='小').weight,recruitmentWeights['小']*2);
 const total=pool.reduce((s,e)=>s+e.weight,0);const hits={};
 for(let i=0;i<total;i++){state.money=100;recruit(state,()=> (i+.5)/total);const item=state.slots[0];const type=typeof item==='string'?item:item.type;
  hits[type]=(hits[type]??0)+1;assert.equal(state.slots.length,5);assert.ok(state.slots.every(x=>JSON.stringify(x)===JSON.stringify(item)));
 }
 for(const e of pool)assert.equal(hits[e.value],e.weight);
});
test('返回主页从快照恢复三件装备，再开始生成隔离的新快照',()=>{
 const original=loadout('farmer','hero_recruitment','upgrade_talisman'),inventory=inventoryFromLoadout(original);
 assert.deepEqual(createLoadout(inventory),original);setEquipped(inventory,'upgrade_talisman',false);
 assert.equal(original.active.length,1);assert.equal(createLoadout(inventory).active.length,0);
});

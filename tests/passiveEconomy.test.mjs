import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const {createInventory,setEquipped,createLoadout}=await import('../src/systems/equipment.ts');
const {createRecruitmentState,recruit,recruitmentPrice,recruitmentPool}=await import('../src/systems/recruitment.ts');
const {createBoardState,applyDrop}=await import('../src/systems/board.ts');
const {testMap}=await import('../src/config/maps.ts');
const {gameConfig}=await import('../src/config/game.ts');
const {passiveEconomy}=await import('../src/config/equipment.ts');
const slot=index=>({kind:'slot',index}),tile=index=>({kind:'tile',index});
function loadout(...ids){const inventory=createInventory();ids.forEach(id=>assert.equal(setEquipped(inventory,id,true),true));return createLoadout(inventory);}
function wallet(...ids){return createRecruitmentState(loadout(...ids));}
function costs(state,count){const paid=[];for(let n=0;n<count;n++){
 state.money=1000;paid.push(recruitmentPrice(state));assert.equal(recruit(state,()=>0),true);
 }return paid;}

test('正式经济：初始$20、首招$10、之后每次成功+$2，失败不推进',()=>{
 const state=wallet();assert.equal(gameConfig.initialMoney,20);assert.equal(state.money,20);
 assert.equal(gameConfig.recruitmentCost,10);assert.equal(gameConfig.recruitmentPriceIncrease,2);
 assert.deepEqual(costs(state,7),[10,12,14,16,18,20,22]);
 state.slots[0]={type:'刀',level:4};
 state.money=recruitmentPrice(state)-1;const before={money:state.money,count:state.successfulRecruits,price:recruitmentPrice(state),slots:structuredClone(state.slots)};
 assert.equal(recruit(state,()=>0),false);assert.deepEqual({money:state.money,count:state.successfulRecruits,price:recruitmentPrice(state),slots:state.slots},before);
});
test('成功来财完整替换五格；失败保留每格，新局重置资金和价格',()=>{
 const state=wallet();state.slots=Array.from({length:5},(_,i)=>({type:'刀',level:i+1}));
 assert.equal(recruit(state,()=>0),true);
 assert.equal(state.money,10);assert.equal(state.successfulRecruits,1);assert.equal(recruitmentPrice(state),12);
 assert.deepEqual(state.slots,Array.from({length:5},()=>({type:'刀',level:1})));
 state.money=11;const before=structuredClone(state.slots);
 assert.equal(recruit(state,()=>0.99),false);assert.deepEqual(state.slots,before);
 assert.equal(state.money,11);assert.equal(state.successfulRecruits,1);assert.equal(recruitmentPrice(state),12);
 const next=wallet();assert.equal(next.money,20);assert.equal(next.successfulRecruits,0);
 assert.equal(recruitmentPrice(next),10);assert.ok(next.slots.every(item=>item===null));
});
test('开门红首招免费但消耗$10档，第二次实际付$12；每局一次',()=>{
 const inventory=createInventory();setEquipped(inventory,'opening_bonus',true);const state=createRecruitmentState(createLoadout(inventory));
 inventory.find(i=>i.id==='opening_bonus').equipped=false;state.money=0;
 assert.equal(recruitmentPrice(state),0);assert.equal(recruit(state,()=>0),true);assert.equal(state.money,0);
 assert.equal(recruitmentPrice(state),12);assert.equal(recruit(state,()=>0),false);assert.equal(state.successfulRecruits,1);
 state.money=12;assert.equal(recruit(state,()=>0),true);assert.equal(state.money,0);
 assert.deepEqual(costs(state,3),[14,16,18]);
 const newMatch=createRecruitmentState(loadout('opening_bonus'));assert.equal(recruitmentPrice(newMatch),0);
 assert.equal(createRecruitmentState().successfulRecruits,0);assert.equal(recruitmentPrice(createRecruitmentState()),10);
});
test('勤俭持家每第3次成功后跳过涨价，未装备不跳过，与开门红正常叠加',()=>{
 assert.equal(passiveEconomy.frugalSkipEvery,3);
 assert.deepEqual(costs(wallet('frugal_home'),8),[10,12,14,14,16,18,18,20]);
 assert.deepEqual(costs(wallet('opening_bonus','frugal_home'),8),[0,12,14,14,16,18,18,20]);
 assert.deepEqual(costs(wallet(),8),[10,12,14,16,18,20,22,24]);
 assert.deepEqual(costs(wallet('frugal_home'),4),[10,12,14,14]);
});
test('老兵等待首次普通兵，从左向右只升第一个；未装备不触发，新局可再次触发',()=>{
 const state=wallet('veteran');
 assert.equal(recruit(state,()=>0.99),true);assert.equal(state.veteranUsed,false);
 assert.ok(state.slots.every(item=>item.kind==='heroLetter'&&item.level===1));
 state.money=100;assert.equal(recruit(state,()=>0.05),true);
 assert.deepEqual(state.slots.map(item=>item.level),[2,1,1,1,1]);assert.equal(state.veteranUsed,true);
 state.money=100;recruit(state,()=>0.05);assert.ok(state.slots.every(item=>item.level===1));
 const plain=wallet();recruit(plain,()=>0.05);assert.ok(plain.slots.every(item=>item.level===1));
 const reset=wallet('veteran');recruit(reset,()=>0.05);assert.equal(reset.slots[0].level,2);
});
test('熟能生巧只奖励成功普通兵合成；移动、交换、武将字、农民、封顶与未装备不奖励',()=>{
 const reward=passiveEconomy.practicedMergeReward;assert.equal(reward,2);
 for(const [source,target,action] of [
  [{type:'刀',level:1},{type:'刀',level:1},'merge'],
  [{type:'刀',level:1},{type:'枪',level:1},'swap'],
  [{kind:'heroLetter',type:'美',level:1},{kind:'heroLetter',type:'美',level:1},'merge'],
  [{kind:'farmer',type:'农',level:1},{kind:'farmer',type:'农',level:1},'merge'],
  [{type:'刀',level:5},{type:'刀',level:5},'invalid'],
 ])for(const equipped of [false,true]){
  const state=wallet(...(equipped?['practice_pays']:[])),board=createBoardState(testMap);state.slots[0]=source;board.tiles[0].unit=target;
  const before=state.money;assert.equal(applyDrop(board,state,slot(0),tile(0)),action);
  assert.equal(state.money,before+(action==='merge'&&source.type==='刀'&&equipped?reward:0));
 }
 const state=wallet('practice_pays'),board=createBoardState(testMap);
 for(let i=0;i<2;i++){state.slots[0]={type:'枪',level:1};board.tiles[0].unit={type:'枪',level:1};assert.equal(applyDrop(board,state,slot(0),tile(0)),'merge');}
 assert.equal(state.money,20+reward*2);
 const reset=wallet('practice_pays');assert.equal(reset.money,20);
});
test('新被动不改变随机池与农民/招贤榜既有组合',()=>{
 const baseline=recruitmentPool(wallet().loadout);
 for(const id of ['iron_rice_bowl','opening_bonus','practice_pays','frugal_home','veteran'])
  assert.deepEqual(recruitmentPool(wallet(id).loadout),baseline);
 assert.equal(recruitmentPool(wallet('farmer','hero_recruitment','veteran').loadout).some(e=>e.value==='农'),true);
});

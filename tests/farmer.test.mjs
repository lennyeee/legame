import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const {FarmerProduction}=await import('../src/systems/FarmerProduction.ts');
const {farmerConfig}=await import('../src/config/farmer.ts');
const {MAX_LEVEL}=await import('../src/config/levels.ts');
const {createRecruitmentState,recruit}=await import('../src/systems/recruitment.ts');
const {createInventory,setEquipped,createLoadout}=await import('../src/systems/equipment.ts');
const {createBoardState,applyDrop}=await import('../src/systems/board.ts');
const {CombatSimulation}=await import('../src/combat/CombatSimulation.ts');
const {testMap}=await import('../src/config/maps.ts');
const {getHeroProgression}=await import('../src/systems/heroProgression.ts');
const {recruitmentWeights}=await import('../src/config/game.ts');
const farmer=(level=1)=>({kind:'farmer',type:'农',level});
const pos=(kind,index)=>({kind,index});
function setup(){const board=createBoardState(testMap),wallet=createRecruitmentState(),production=new FarmerProduction(board,wallet);
 return {board,wallet,production,drop:(a,b)=>{const result=applyDrop(board,wallet,a,b);production.sync();return result;}};}

test('未装备池绝无农民；装备后按集中权重加入，开局快照不受背包改变影响',()=>{
 const inventory=createInventory();setEquipped(inventory,'farmer',true);
 const equipped=createRecruitmentState(createLoadout(inventory));setEquipped(inventory,'farmer',false);
 const plain=createRecruitmentState(createLoadout(inventory));
 const oldWeight=Object.values(recruitmentWeights).reduce((a,b)=>a+b,0),total=oldWeight+farmerConfig.recruitmentWeight;
 let hits=0;
 for(let i=0;i<total;i++){
  plain.money=equipped.money=100;recruit(plain,()=> (i+0.5)/total);recruit(equipped,()=> (i+0.5)/total);
  assert.equal(plain.slots.some(x=>x?.kind==='farmer'),false);
  if(equipped.slots[0]?.kind==='farmer'){hits++;assert.deepEqual(equipped.slots,Array(5).fill(farmer()));}
 }
 assert.equal(hits,farmerConfig.recruitmentWeight);assert.equal(equipped.loadout.passive[0].id,'farmer');
});
for(let level=1;level<=MAX_LEVEL;level++)test(`Lv.${level}部署8秒产$${level*5}、领取一次后重新计时`,()=>{
 const {board,wallet,production,drop}=setup();const item=farmer(level);wallet.slots[0]=item;
 production.update(30000);assert.equal(production.states.size,0);
 assert.equal(drop(pos('slot',0),pos('tile',0)),'move');
 production.update(7999);assert.equal(production.states.get(item).reward,null);
 production.update(1);const state=production.states.get(item),id=state.reward.id;
 assert.equal(state.reward.amount,level*5);assert.equal(state.reward.remainingMs,5000);
 production.update(4999);assert.equal(state.reward.id,id);assert.equal(state.elapsedMs,0);
 const money=wallet.money;assert.equal(production.collect(item,id),true);assert.equal(wallet.money,money+level*5);
 assert.equal(production.collect(item,id),false);production.update(7999);assert.equal(state.reward,null);
 production.update(1);assert.notEqual(state.reward.id,id);assert.equal(state.reward.amount,level*5);
});
test('超时不发钱、不后台累积，新的8秒从超时瞬间开始；旧奖励ID不可领取',()=>{
 const {board,wallet,production}=setup();const item=farmer();board.tiles[0].unit=item;production.update(8000);
 const state=production.states.get(item),oldId=state.reward.id;
 production.update(5000);assert.equal(wallet.money,100);assert.equal(state.reward,null);assert.equal(state.elapsedMs,0);
 production.update(7999);assert.equal(state.reward,null);production.update(1);
 assert.equal(production.collect(item,oldId),false);assert.equal(wallet.money,100);
});
test('棋盘移动/交换保留生产进度和收益剩余时间，回栏后立即清除并防幽灵领取',()=>{
 const {board,wallet,production,drop}=setup();const item=farmer(2);board.tiles[0].unit=item;production.update(3000);
 drop(pos('tile',0),pos('tile',1));assert.equal(production.states.get(item).elapsedMs,3000);
 board.tiles[0].unit={type:'刀',level:1};drop(pos('tile',1),pos('tile',0));assert.equal(production.states.get(item).elapsedMs,3000);
 production.update(5000);production.update(2000);const id=production.states.get(item).reward.id;
 drop(pos('tile',0),pos('tile',1));assert.equal(production.states.get(item).reward.remainingMs,3000);
 drop(pos('tile',1),pos('slot',0));assert.equal(production.states.size,0);assert.equal(production.collect(item,id),false);
 drop(pos('slot',0),pos('tile',1));assert.equal(production.states.get(item).elapsedMs,0);assert.equal(production.states.get(item).reward,null);
});
for(const a of ['slot','tile'])for(const b of ['slot','tile'])test(`${a}→${b}农民同级合并到5，封顶不吞，不同级交换`,()=>{
 for(let level=1;level<=MAX_LEVEL;level++){
  const {board,wallet,drop}=setup(),source=farmer(level),target=farmer(level);
  if(a==='slot')wallet.slots[0]=source;else board.tiles[0].unit=source;
  if(b==='slot')wallet.slots[1]=target;else board.tiles[1].unit=target;
  const before=structuredClone({board,wallet}),result=drop(pos(a,0),pos(b,1));
  if(level===MAX_LEVEL){assert.equal(result,'invalid');assert.deepEqual({board,wallet},before);}
  else{assert.equal(result,'merge');const item=b==='slot'?wallet.slots[1]:board.tiles[1].unit;assert.deepEqual(item,farmer(level+1));assert.notEqual(item,source);assert.notEqual(item,target);}
 }
 const {board,wallet,drop}=setup();const source=farmer(1),target=farmer(5);
 if(a==='slot')wallet.slots[0]=source;else board.tiles[0].unit=source;
 if(b==='slot')wallet.slots[1]=target;else board.tiles[1].unit=target;
 assert.equal(drop(pos(a,0),pos(b,1)),'swap');assert.equal(b==='slot'?wallet.slots[1]:board.tiles[1].unit,source);
});
test('两个生产中农民合并清除双方美元，新农民从0计时；锁定地皮不可部署',()=>{
 const {board,wallet,production,drop}=setup();const a=farmer(),b=farmer();board.tiles[0].unit=a;board.tiles[1].unit=b;
 production.update(8000);const oldId=production.states.get(a).reward.id;
 assert.equal(drop(pos('tile',0),pos('tile',1)),'merge');assert.equal(production.states.size,1);
 const merged=board.tiles[1].unit;assert.equal(production.states.get(merged).elapsedMs,0);assert.equal(production.states.get(merged).reward,null);
 assert.equal(production.collect(a,oldId),false);production.update(8000);assert.equal(production.states.get(merged).reward.amount,10);
 wallet.slots[0]=farmer();assert.equal(drop(pos('slot',0),pos('tile',3)),'invalid');assert.ok(wallet.slots[0]);
});
test('农民与兵/武将字只交换，不参与攻击、技能、EXP或武将关系',()=>{
 const {board,wallet,production,drop}=setup();const item=farmer(5);board.tiles[0].unit=item;
 for(const other of [{type:'刀',level:5},{kind:'heroLetter',type:'小',level:5}]){
  wallet.slots[0]=other;assert.equal(drop(pos('slot',0),pos('tile',0)),'swap');drop(pos('slot',0),pos('tile',0));
 }
 const sim=new CombatSimulation(testMap,board,wallet);const enemy=sim.spawnEnemy();enemy.moveSpeed=0;
 let events=[];for(let i=0;i<2000;i++)events.push(...sim.update(10));
 assert.deepEqual(events,[]);assert.equal(enemy.hp,enemy.maxHp);assert.equal(getHeroProgression(board).links.size,0);
 assert.equal(wallet.money,100);assert.equal(production.states.get(item).reward,null);
});
test('停止后生产/收益期限冻结且不能领取，销毁和新局不保留旧收益',()=>{
 const {board,wallet,production}=setup();const item=farmer();board.tiles[0].unit=item;production.update(8000);
 const id=production.states.get(item).reward.id;production.stop();production.update(30000);
 assert.equal(production.states.get(item).reward.remainingMs,5000);assert.equal(production.collect(item,id),false);
 production.destroy();assert.equal(production.states.size,0);assert.equal(production.collect(item,id),false);
 const fresh=setup();assert.equal(fresh.production.states.size,0);assert.equal(wallet.money,100);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))specifier+='.ts';return next(specifier,context);}});

const { recruitmentPool, createRecruitmentState, recruit } = await import('../src/systems/recruitment.ts');
const { recruitmentCategoryScale, recruitmentCategories } = await import('../src/config/game.ts');
const { recruitableHeroLetters, heroExpRequired, heroGrowth } = await import('../src/config/heroes.ts');
const { createBoardState, applyDrop } = await import('../src/systems/board.ts');
const { getHeroProgression } = await import('../src/systems/heroProgression.ts');
const { Match } = await import('../src/match/Match.ts');
const { testMap } = await import('./fixtures/combatMap.ts');

const loadout=(hero=false,farmer=false)=>({active:[],passive:[
 ...(hero?[{id:'hero_recruitment',level:1}]:[]),...(farmer?[{id:'farmer',level:1}]:[]),
]});
const soldiers=new Set(['刀','枪','弓','骑']);
function totals(pool){const by={ordinary:0,shovel:0,heroLetter:0,farmer:0};
 for(const {value,weight} of pool){const category=soldiers.has(value)?'ordinary':value==='铲'?'shovel':value==='农'?'farmer':'heroLetter';by[category]+=weight;}
 return by;
}
function rollFor(pool,value){const total=pool.reduce((sum,item)=>sum+item.weight,0);let start=0;
 for(const item of pool){if(item.value===value)return(start+item.weight/2)/total;start+=item.weight;}
 throw Error(`not in pool: ${value}`);
}

for(const [hero,farmer,key] of [[false,false,'default'],[true,false,'hero'],[false,true,'farmer'],[true,true,'heroAndFarmer']]){
 test(`recruitment ${key} has exact category percentages and equal soldier/letter weights`,()=>{
  const pool=recruitmentPool(loadout(hero,farmer)),category=recruitmentCategories[key];
  assert.equal(pool.reduce((sum,item)=>sum+item.weight,0),100*recruitmentCategoryScale);
  for(const [name,weight] of Object.entries(totals(pool)))assert.equal(weight,category[name]*recruitmentCategoryScale);
  const byValue=new Map(pool.map(item=>[item.value,item.weight]));
  assert.equal(new Set(['刀','枪','弓','骑'].map(value=>byValue.get(value))).size,1);
  assert.equal(recruitableHeroLetters.length,13);
  assert.equal(new Set(recruitableHeroLetters.map(value=>byValue.get(value))).size,1);
  assert.equal(byValue.has('农'),farmer);
 });
}

test('five holding draws are independent with replacement; recruit does not adapt to missing complementary letters',()=>{
 const state=createRecruitmentState(loadout()),pool=recruitmentPool(state.loadout);
 const rolls=['小','小','刀','美','刀'].map(value=>rollFor(pool,value));let calls=0;
 assert.equal(recruit(state,()=>rolls[calls++]),true);assert.equal(calls,5);
 assert.deepEqual(state.slots.map(item=>item.type),['小','小','刀','美','刀']);
 assert.equal(state.nextCost,12);assert.equal(state.successfulRecruits,1);
 const before=recruitmentPool(state.loadout);
 state.money=100;calls=0;assert.equal(recruit(state,()=>rolls[calls++]),true);
 assert.deepEqual(recruitmentPool(state.loadout),before);
 assert.deepEqual(state.slots.map(item=>item.type),['小','小','刀','美','刀']);
});

test('human bottom and AI top sides use the same recruitment pool for the same frozen loadout',()=>{
 const equipped=loadout(true,true),match=new Match(testMap,equipped,equipped);
 try{
  const bottom=match.bottomSide,top=match.topSide;
  assert.deepEqual(recruitmentPool(bottom.recruitment.loadout),recruitmentPool(top.recruitment.loadout));
  const roll=rollFor(recruitmentPool(equipped),'将');
  assert.equal(bottom.recruit(()=>roll),true);assert.equal(top.recruit(()=>roll),true);
  assert.deepEqual(bottom.recruitment.slots,top.recruitment.slots);
  assert.equal(bottom.recruitment.money,top.recruitment.money);
 }finally{match.destroy();}
});

const letter=type=>({kind:'heroLetter',type,level:1});
function twoHeroes(){const map={...testMap,cells:[
 {x:195,y:650,unlocked:true},{x:247,y:650,unlocked:true},
 {x:195,y:700,unlocked:true},{x:247,y:700,unlocked:true},
 ]};
 const board=createBoardState(map),reserve=createRecruitmentState();
 [letter('小'),letter('美'),letter('阿'),letter('饼')].forEach((unit,index)=>{board.tiles[index].unit=unit;});
 const growth=getHeroProgression(board);growth.sync();
 const links=[...growth.links.values()];assert.deepEqual(links.map(link=>link.heroId),['xiaomei','abing']);
 return {board,reserve,growth,links};
}

test('actual killer receives 1 EXP and each other positive-damage participant receives only 0.2',()=>{
 const {growth,links:[killer,assistant]}=twoHeroes();
 growth.recordDamage(1,killer,1);growth.recordDamage(1,assistant,1);
 growth.recordDamage(1,assistant,1);growth.recordDamage(1,assistant,0);
 growth.awardKill(1,killer);
 assert.equal(killer.currentExp,heroGrowth.rewards.kill);
 assert.equal(assistant.currentExp,heroGrowth.rewards.assist);
 growth.awardKill(1,killer);assert.equal(killer.currentExp,1);assert.equal(assistant.currentExp,.2);
});

test('range, targeting and zero damage alone grant no EXP; ordinary last hit grants assist only',()=>{
 const {growth,links:[a,b]}=twoHeroes();
 growth.recordDamage(1,a,0);growth.awardKill(1,null);
 assert.deepEqual([a.currentExp,b.currentExp],[0,0]);
 growth.recordDamage(2,a,.5);growth.awardKill(2,null);
 assert.deepEqual([a.currentExp,b.currentExp],[.2,0]);
});

test('five assist awards total exactly one EXP without floating display residue',()=>{
 const {growth,links:[link]}=twoHeroes();
 for(let id=1;id<=5;id++){growth.recordDamage(id,link,1);growth.awardKill(id,null);}
 assert.equal(link.currentExp,1);
});

test('10/20/30/40 are per-level requirements, cumulative 100 reaches capped Lv5',()=>{
 const {growth,links:[link]}=twoHeroes();
 let id=1;
 for(const [level,additional] of [[2,10],[3,20],[4,30],[5,40]]){
  assert.equal(heroExpRequired(level-1),additional);
  for(let n=0;n<additional;n++){growth.recordDamage(id,link,1);growth.awardKill(id++,link);}
  assert.equal(link.level,level);assert.equal(link.left.level,level);assert.equal(link.right.level,level);
  assert.equal(link.currentExp,0);
 }
 growth.recordDamage(id,link,1);growth.awardKill(id,link);
 assert.equal(link.level,5);assert.equal(link.currentExp,0);
});

test('breaking and reforming a pair drops old participation and partial EXP',()=>{
 const {board,reserve,growth,links:[old]}=twoHeroes();
 growth.recordDamage(1,old,1);growth.awardKill(1,null);assert.equal(old.currentExp,.2);
 growth.recordDamage(2,old,1);
 applyDrop(board,reserve,{kind:'tile',index:1},{kind:'slot',index:0});
 applyDrop(board,reserve,{kind:'slot',index:0},{kind:'tile',index:1});
 const fresh=[...growth.links.values()].find(link=>link.heroId==='xiaomei');
 assert.notEqual(fresh,old);assert.equal(fresh.currentExp,0);
 growth.awardKill(2,null);assert.equal(fresh.currentExp,0);
});

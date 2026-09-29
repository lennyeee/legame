import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);},
 load(url,c,next){return url.endsWith('.ts')?{format:'module',shortCircuit:true,
  source:stripTypeScriptTypes(readFileSync(new URL(url),'utf8'),{mode:'transform'})}:next(url,c);}});
const { combatConfig,getCombatStats }=await import('../src/config/combat.ts');
const { heroGrowth }=await import('../src/config/heroes.ts');
const { itemEffects }=await import('../src/config/itemEffects.ts');
const { waveStartForWave }=await import('../src/config/pressure.ts');
const { testMap,gridToWorld }=await import('../src/config/maps.ts');
const { Match }=await import('../src/match/Match.ts');
const { createBoardState }=await import('../src/systems/board.ts');
const { CombatSimulation }=await import('../src/combat/CombatSimulation.ts');
const { pointOnPath }=await import('../src/combat/path.ts');
const { inRange,selectTarget,piercingTargets }=await import('../src/combat/targeting.ts');
const { simulateBalance }=await import('../src/balance/simulator.ts');
const { calibrationScenarios,referencePressure,analysisConfig }=await import('../src/balance/scenarios.ts');

function setup(type,map={name:'Body boundary',mirrorY:0,cellSize:75,
 path:[{x:0,y:0},{x:1000,y:0}],cells:[{x:400,y:0,unlocked:true}]}){
 const board=createBoardState(map),wallet={money:20};if(type)board.tiles[0].unit={type,level:1};
 const sim=new CombatSimulation(map,board,wallet,{...combatConfig,enemy:{...combatConfig.enemy,maxHp:10000,moveSpeed:0}});
 return {board,sim,wallet};
}
function at(sim,distance){const enemy=sim.spawnEnemy();enemy.distance=distance;Object.assign(enemy,pointOnPath(sim.path,distance));return enemy;}
function run(sim,ms){const events=[];for(let t=0;t<ms;t+=10)events.push(...sim.update(Math.min(10,ms-t)));return events;}

test('body intersects circular range at exact boundary; a fully outside living target is rejected',()=>{
 const {sim}=setup(),r=150,body=combatConfig.enemy.hitRadius,inside=at(sim,400+r+body),outside=at(sim,400+r+body+.01);
 assert.equal(inRange({x:400,y:0},inside,r),true);assert.equal(inRange({x:400,y:0},outside,r),false);
 assert.equal(selectTarget([inside,outside],{x:400,y:0},r),inside);
 inside.hp=0;assert.equal(selectTarget([inside,outside],{x:400,y:0},r),null);
 assert.equal(inRange({x:0,y:0},{x:149,y:149,hitRadius:body},r),false); // not a square
});

for(const type of ['刀','枪','骑'])test(`${type} identity on production map with one intervening land column`,()=>{
 const {board,sim}=setup(null,testMap),point=gridToWorld({column:1,row:3});
 const index=testMap.cells.findIndex(c=>c.x===point.x&&c.y===point.y);
 board.tiles[index].unlocked=true;board.tiles[index].unit={type,level:1};
 const enemy=at(sim,450);assert.equal(Math.hypot(point.x-enemy.x,point.y-enemy.y),150);
 const events=run(sim,getCombatStats({type,level:1}).attackInterval+30);
 assert.equal(events.some(e=>e.kind==='attack'),type!=='刀');
 assert.equal(enemy.hp<enemy.maxHp,type!=='刀');
 if(type==='刀'){
  const near=gridToWorld({column:2,row:3}),i=testMap.cells.findIndex(c=>c.x===near.x&&c.y===near.y);
  board.tiles[index].unit=null;board.tiles[i].unlocked=true;board.tiles[i].unit={type,level:1};
  assert.ok(run(sim,800).some(e=>e.kind==='attack'));assert.ok(enemy.hp<enemy.maxHp);
 }
});

test('spear width stays32; segment/body intersection hits edges and rejects a fully outside body',()=>{
 const radius=combatConfig.enemy.hitRadius;
 const enemies=[{id:1,x:100,y:0,hp:1,hitRadius:radius},
  {id:2,x:100,y:16+radius,hp:1,hitRadius:radius},
  {id:3,x:100,y:16+radius+.01,hp:1,hitRadius:radius},
  {id:4,x:150+radius,y:0,hp:1,hitRadius:radius},
  {id:5,x:150+radius+.01,y:0,hp:1,hitRadius:radius}];
 assert.equal(combatConfig.spearWidth,32);
 assert.deepEqual(piercingTargets(enemies,{x:0,y:0},enemies[0],150,32).map(e=>e.id),[1,2,4]);
});

test('cavalry AOE uses the same body boundary, without enlarging its configured150 radius',()=>{
 const {sim}=setup('骑'),range=getCombatStats({type:'骑',level:1}).range;
 assert.equal(range,150);const inside=at(sim,400+range+20),outside=at(sim,400+range+20+.01);
 run(sim,800);assert.equal(inside.hp,10000-2);assert.equal(outside.hp,10000);
});

test('bow legally acquires a body outside center range; arrow survives consistent range check and hits one target',()=>{
 const {sim}=setup('弓'),range=getCombatStats({type:'弓',level:1}).range;
 const target=at(sim,400+range+20),other=at(sim,420);
 run(sim,800);assert.equal(sim.projectiles.length,1);assert.equal(target.hp,10000);
 run(sim,30);assert.equal(sim.projectiles.length,1);
 run(sim,500);assert.equal(target.hp,9998);assert.equal(other.hp,10000);
});

test('bow arrow cancels once the whole target body leaves range',()=>{
 const {sim}=setup('弓'),r=getCombatStats({type:'弓',level:1}).range;
 const target=at(sim,400+r+20);run(sim,800);assert.equal(sim.projectiles.length,1);
 target.distance+=.01;run(sim,30);assert.equal(sim.projectiles.length,0);assert.equal(target.hp,10000);
});

test('new calibration changes ordinary stats but retains economics and bounded geometry',()=>{
 assert.equal(getCombatStats({type:'刀',level:1}).damage,3);
 assert.equal(combatConfig.enemy.moveSpeed,45);assert.equal(combatConfig.enemy.killReward,1);
 assert.equal(itemEffects.upgradeCooldownMs,50000);assert.equal(itemEffects.hasteCooldownMs,20000);
 assert.equal(heroGrowth.enemyExp,5);assert.equal(combatConfig.enemy.hitRadius,20);
 assert.ok(combatConfig.visuals.enemyRadius*2>=42&&combatConfig.visuals.enemyRadius*2<=48);
});

test('same fixed formation/config produces identical complete simulator observations',()=>{
 const scenario=calibrationScenarios.find(s=>s.id==='two-knives'),options={maxElapsedMs:60000};
 assert.deepEqual(simulateBalance(scenario,options),simulateBalance(scenario,options));
});

test('simulator drives production Match/Combat at fixed steps, observes real rewards and cleans runtime',()=>{
 const actual=CombatSimulation.prototype.update,stepActual=Match.prototype.update;
 let combatCalls=0,matchCalls=0;
 try{
  CombatSimulation.prototype.update=function(dt,...rest){assert.equal(dt,combatConfig.stepMs);combatCalls++;return actual.call(this,dt,...rest);};
  Match.prototype.update=function(dt,...rest){assert.equal(dt,combatConfig.stepMs);matchCalls++;return stepActual.call(this,dt,...rest);};
  const result=simulateBalance(calibrationScenarios[1],{maxElapsedMs:60000});
  assert.ok(matchCalls>500);assert.equal(combatCalls,matchCalls*2);
  assert.ok(result.killed>0);assert.equal(result.killIncome,result.killed);
  assert.equal(result.money,20+result.killIncome);assert.equal(result.recruitSpending,0);
  assert.equal(result.spawned,result.killed+result.alive+result.waves.reduce((sum,w)=>sum+w.leaked,0));
  assert.ok(result.firstLeak);assert.ok(result.samples.length>1);
 }finally{CombatSimulation.prototype.update=actual;Match.prototype.update=stepActual;}
});

test('optional script recruits and deploys via shared legal operations; spending/affordability are observed',()=>{
 const result=simulateBalance({id:'script',name:'script',formation:[]},{maxElapsedMs:30000,random:()=>0,
  operate(side,ms,random){
   if(ms===0){assert.equal(side.recruit(random),true);for(let i=0;i<5;i++)side.drop({kind:'slot',index:i},{kind:'tile',index:[0,1,2,6,12][i]});}
  }});
 assert.equal(result.successfulRecruits,1);assert.equal(result.recruitSpending,10);
 assert.equal(result.money,20+result.killIncome-10);
 assert.ok(result.recruitAffordableMs>0);assert.equal(result.finalComposition.length,5);
  assert.ok(result.samples.some(s=>s.budgetRecruitments>=1));
});

test('two adjacent-road Lv1 knives can earn the two first-wave kills needed for the normal second recruit',()=>{
 const result=simulateBalance(calibrationScenarios[1],{maxElapsedMs:waveStartForWave(2)-combatConfig.stepMs});
 assert.ok(result.killed>=2);assert.equal(result.killIncome,result.killed);
 assert.equal(result.health,3); // weak initial defense is not a mandatory wave1 loss
});

test('reference pressure remains deterministic and scenario fixtures never alter the live default map',()=>{
 const before=structuredClone(testMap);simulateBalance(calibrationScenarios[5],{pressure:referencePressure,maxElapsedMs:30000});
 assert.deepEqual(testMap,before);assert.equal(testMap.cells.filter(c=>c.unlocked).length,6);
 assert.equal(analysisConfig.backlogCount,6);assert.equal(analysisConfig.backlogDurationMs,3000);
 const fresh=new Match(testMap);assert.equal(fresh.bottomSide.recruitment.money,20);
 assert.ok(fresh.bottomSide.board.tiles.every(t=>!t.unit));fresh.destroy();
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const { Match }=await import('../src/match/Match.ts');
const { MatchTimeline }=await import('../src/match/MatchTimeline.ts');
const { testMap }=await import('../src/config/maps.ts');
const { waveConfig,getWaveHpMultiplier }=await import('../src/config/waves.ts');
const { combatConfig }=await import('../src/config/combat.ts');
const { heroGrowth }=await import('../src/config/heroes.ts');
const { createInventory,setEquipped,createLoadout }=await import('../src/systems/equipment.ts');
const slot=i=>({kind:'slot',index:i}),tile=i=>({kind:'tile',index:i});
function loadout(...ids){const inv=createInventory();for(const id of ids)setEquipped(inv,id,true);return createLoadout(inv);}
function advance(match,ms){const result={bottom:[],top:[]};for(let left=ms;left>0;left-=10){
 const batch=match.update(Math.min(10,left));for(const id of ['bottom','top'])result[id].push(...batch[id]);
}return result;}
function quiet(...ids){const kit=loadout(...ids);return new Match(testMap,kit,kit,{...waveConfig,spawnInterval:1e9});}
function leaks(match,id,count){for(let n=0;n<count;n++){
 const side=match.sides[id],enemy=side.combat.spawnEnemy();enemy.distance=side.combat.path.totalLength-.001;
}return match.update(combatConfig.stepMs);}
function put(side,item,index){side.recruitment.slots[0]=item;assert.equal(side.drop(slot(0),tile(index)),'move');return item;}
function hero(side){put(side,{kind:'heroLetter',type:'小',level:1},0);put(side,{kind:'heroLetter',type:'美',level:1},1);return [...side.heroes.links.values()][0];}
function snapshot(match){return JSON.stringify({status:match.status,result:match.result,health:match.health,time:match.timeline.elapsedMs,
 sides:Object.values(match.sides).map(s=>({money:s.recruitment.money,slots:s.recruitment.slots,board:s.board,
 enemies:s.combat.enemies,projectiles:s.combat.projectiles,links:[...s.heroes.links.values()],farmers:[...s.farmers.states.values()],
 active:s.activeItems.slots,passives:s.passives}))});}

test('Match只有一条timeline；正式双边路径不创建WaveProgress；HP各3',()=>{
 const m=new Match(testMap);assert.ok(m.timeline instanceof MatchTimeline);
 assert.deepEqual(m.health,{bottom:3,top:3});assert.equal(m.result,null);
 for(const side of Object.values(m.sides)){assert.equal(side.progress,null);assert.equal(side.combat.progress,null);}
 assert.equal(m.bottomSide.combat.enemies.length,0);assert.equal(m.topSide.combat.enemies.length,0);
});
test('同一spawn在2秒同时产生双方独立实体，参数相同且带相同eventId',()=>{
 const m=new Match(testMap);advance(m,1990);assert.equal(m.bottomSide.combat.enemies.length,0);
 advance(m,10);const a=m.bottomSide.combat.enemies[0],b=m.topSide.combat.enemies[0];
 assert.notEqual(a,b);assert.deepEqual(a,b);assert.equal(a.spawnEventId,1);assert.equal(a.id,1);
 assert.equal(a.maxHp,combatConfig.enemy.maxHp);assert.equal(a.moveSpeed,combatConfig.enemy.moveSpeed);
});
test('过渡20波schedule沿用数量/HP曲线；每波末次计划出怪后3秒进入下一波',()=>{
 const t=new MatchTimeline();assert.equal(t.waveStarts.length,20);
 let start=0;for(let w=1;w<=20;w++){
  const events=t.events.filter(e=>e.wave===w);assert.equal(events.length,waveConfig.enemyCounts[w-1]);
  assert.equal(t.waveStarts[w-1],start);assert.equal(events[0].atMs,start+2000);
  events.forEach((e,i)=>{assert.equal(e.atMs,start+(i+1)*2000);assert.equal(e.hpMultiplier,getWaveHpMultiplier(w,waveConfig));});
  start=events.at(-1).atMs+3000;
 }
 assert.equal(t.events[0].atMs,2000);assert.equal(t.waveStarts[1],13000);
});
for(const fast of ['bottom','top'])test(`${fast}清场不改变另一方的出怪时间，积怪不阻止wave2`,()=>{
 const config={...waveConfig,enemyCounts:[2,2],spawnInterval:100,waveDelay:50};
 const m=new Match(testMap,undefined,undefined,config),slow=fast==='bottom'?'top':'bottom';
 advance(m,100);m.sides[fast].combat.enemies.length=0;
 advance(m,100);assert.equal(m.sides[slow].combat.enemies.length,2);
 m.sides[fast].combat.enemies.length=0;advance(m,50);assert.equal(m.timeline.wave,2);
 advance(m,100);assert.equal(m.sides[slow].combat.enemies.length,3);
 assert.equal(m.sides[fast].combat.enemies.length,1);
 assert.equal(m.sides[fast].combat.enemies[0].spawnEventId,3);
 assert.equal(m.sides[slow].combat.enemies.at(-1).spawnEventId,3);
});
for(const id of ['bottom','top'])test(`${id}单个漏怪只扣本方1HP且移除，不重复扣血、不奖励`,()=>{
 const m=quiet(),other=id==='bottom'?'top':'bottom';const events=leaks(m,id,1);
 assert.equal(events[id].filter(e=>e.kind==='escape').length,1);assert.equal(m.health[id],2);assert.equal(m.health[other],3);
 advance(m,1000);assert.equal(m.health[id],2);assert.equal(m.sides[id].combat.enemies.length,0);
 assert.equal(m.sides[id].recruitment.money,20);
});
for(const loser of ['bottom','top'])test(`${loser}归零只在双边周期结束后判另一方胜利`,()=>{
 const m=quiet(),winner=loser==='bottom'?'top':'bottom';leaks(m,loser,3);
 assert.equal(m.status,'ended');assert.equal(m.result,winner);assert.equal(m.health[loser],0);
 assert.equal(m.bottomSide.running,false);assert.equal(m.topSide.running,false);
});
for(const reverse of [false,true])test(`同一逻辑步双归零为draw，${reverse?'top':'bottom'}先update也相同`,()=>{
 const m=quiet();if(reverse){const bottom=m.sides.bottom;delete m.sides.bottom;m.sides.bottom=bottom;}
 const order=[];for(const [id,s]of Object.entries(m.sides)){
  const update=s.updateCombat.bind(s);s.updateCombat=(...args)=>{order.push(id);return update(...args);};
  for(let n=0;n<3;n++){const enemy=s.combat.spawnEnemy();enemy.distance=s.combat.path.totalLength-.001;}
 }
 m.update(combatConfig.stepMs);assert.deepEqual(order,reverse?['top','bottom']:['bottom','top']);
 assert.equal(m.result,'draw');assert.deepEqual(m.health,{bottom:0,top:0});
});
test('同一渲染帧的不同逻辑步死亡不扩成平局窗口；首个已结算步立即停止',()=>{
 const m=quiet();for(const id of ['bottom','top'])for(let n=0;n<3;n++){
  const e=m.sides[id].combat.spawnEnemy();e.distance=m.sides[id].combat.path.totalLength-(id==='bottom'?.01:2);
 }
 m.update(250);assert.equal(m.result,'top');assert.equal(m.health.top,3);
});
test('20波刷完双方存活且清空时保持running，不擅自判胜负',()=>{
 const m=new Match(testMap,undefined,undefined,{...waveConfig,enemyCounts:Array(20).fill(1),spawnInterval:100,waveDelay:50});
 advance(m,4000);for(const side of Object.values(m.sides))side.combat.enemies.length=0;
 advance(m,500);assert.equal(m.timeline.wave,20);assert.equal(m.timeline.finished,true);
 assert.equal(m.status,'running');assert.equal(m.result,null);assert.deepEqual(m.health,{bottom:3,top:3});
});
for(const killer of ['bottom','top'])test(`${killer}击杀只奖励本方$1和参战EXP，相同enemyId不串线`,()=>{
 const m=quiet(),other=killer==='bottom'?'top':'bottom';const links={bottom:hero(m.bottomSide),top:hero(m.topSide)};
 const enemies={};for(const id of ['bottom','top']){const e=m.sides[id].combat.spawnEnemy();e.moveSpeed=0;enemies[id]=e;}
 enemies[killer].hp=1;enemies[other].hp=100000;assert.equal(enemies.bottom.id,enemies.top.id);
 const events=advance(m,1300);assert.ok(events[killer].some(e=>e.kind==='kill'&&e.enemyId===1));
 assert.equal(events[other].some(e=>e.kind==='kill'),false);
 assert.equal(m.sides[killer].recruitment.money,21);assert.equal(m.sides[other].recruitment.money,20);
 assert.equal(links[killer].currentExp,heroGrowth.enemyExp);assert.equal(links[other].currentExp,0);
});
test('pause冻结timeline、双边战斗/HP/EXP/生产/CD/铁饭碗；resume续算',()=>{
 const m=quiet('farmer','iron_rice_bowl','upgrade_talisman');
 for(const side of Object.values(m.sides)){
  hero(side);put(side,{kind:'farmer',type:'农',level:1},6);
  const e=side.combat.spawnEnemy();e.moveSpeed=0;e.hp=e.maxHp=100000;
 }
 advance(m,9000);m.pause();const before=snapshot(m);advance(m,10000);assert.equal(snapshot(m),before);
 for(const side of Object.values(m.sides)){assert.equal(side.recruit(),false);assert.equal(side.drop(tile(0),slot(0)),'invalid');}
 m.resume();advance(m,1000);assert.equal(m.bottomSide.recruitment.money,22);assert.equal(m.topSide.recruitment.money,22);
 assert.ok(m.timeline.elapsedMs>9900);assert.equal(m.bottomSide.activeItems.slots[0].remainingMs,10000);
 advance(m,2000);assert.ok([...m.topSide.farmers.states.values()][0].reward);
});
test('出怪/漏怪截止点附近pause不越过截止点，恢复后双方各执行一次',()=>{
 const m=new Match(testMap);advance(m,1990);m.pause();advance(m,5000);
 assert.equal(m.bottomSide.combat.enemies.length,0);assert.equal(m.topSide.combat.enemies.length,0);
 m.resume();advance(m,10);for(const side of Object.values(m.sides)){
  assert.equal(side.combat.enemies.length,1);side.combat.enemies[0].distance=side.combat.path.totalLength-.001;
 }
 m.pause();const before=snapshot(m);advance(m,5000);assert.equal(snapshot(m),before);
 m.resume();advance(m,20);assert.deepEqual(m.health,{bottom:2,top:2});
 advance(m,100);assert.deepEqual(m.health,{bottom:2,top:2});
});
test('result冻结双边所有runtime与操作，待领取收益和旧引用不能在结束后加钱',()=>{
 const m=quiet('farmer','iron_rice_bowl','upgrade_talisman');const farmers={};
 for(const [id,s]of Object.entries(m.sides)){
  hero(s);farmers[id]=put(s,{kind:'farmer',type:'农',level:1},6);
  s.recruitment.slots[0]={type:'刀',level:1};
  const e=s.combat.spawnEnemy();e.hp=e.maxHp=100000;e.moveSpeed=0;
 }
 advance(m,12000);const rewards={bottom:m.bottomSide.farmers.states.get(farmers.bottom).reward.id,
 top:m.topSide.farmers.states.get(farmers.top).reward.id};
 leaks(m,'bottom',3);const frozen=snapshot(m);
 advance(m,60000);m.resume();assert.equal(snapshot(m),frozen);
 for(const [id,s]of Object.entries(m.sides)){
  assert.equal(s.recruit(()=>0),false);assert.equal(s.drop(slot(0),tile(10)),'invalid');
  assert.equal(s.useActiveItem(0,slot(0)),false);assert.equal(s.collectFarmerReward(farmers[id],rewards[id]),false);
  s.updateItems(50000);s.tickPassiveSecond();assert.deepEqual(s.updateCombat(250,null),[]);
 }
 assert.equal(snapshot(m),frozen);
});
test('result后不消费未来timeline事件、不移动残存敌人或弹道',()=>{
 const m=new Match(testMap);advance(m,2000);leaks(m,'bottom',3);
 const time=m.timeline.elapsedMs,enemy={...m.topSide.combat.enemies[0]};advance(m,60000);
 assert.equal(m.timeline.elapsedMs,time);assert.deepEqual(m.topSide.combat.enemies[0],enemy);
 assert.equal(m.topSide.combat.enemies.length,1);
});
test('固定步不依赖渲染帧拆分，相同输入时间得到相同双边状态',()=>{
 const a=quiet(),b=quiet();hero(a.bottomSide);hero(b.bottomSide);
 for(const m of [a,b])m.bottomSide.combat.spawnEnemy();
 advance(a,3000);for(let i=0;i<30;i++)b.update(100);
 assert.equal(snapshot(a),snapshot(b));
});
test('正在飞行的双方弓箭在pause/result后冻结，销毁时清空',()=>{
 const m=quiet();for(const s of Object.values(m.sides)){
  put(s,{type:'弓',level:1},0);const e=s.combat.spawnEnemy();e.moveSpeed=0;e.hp=e.maxHp=100000;
 }
 advance(m,1700);assert.equal(m.bottomSide.combat.projectiles.length,1);assert.equal(m.topSide.combat.projectiles.length,1);
 m.pause();const paused=snapshot(m);advance(m,1000);assert.equal(snapshot(m),paused);
 m.resume();leaks(m,'bottom',3);assert.equal(m.topSide.combat.projectiles.length,1);
 const ended=snapshot(m);advance(m,5000);assert.equal(snapshot(m),ended);
 m.destroy();assert.equal(m.topSide.combat.projectiles.length,0);assert.equal(m.bottomSide.combat.projectiles.length,0);
});
test('小美释放中尚未命中的目标在pause/result不继续受伤，旧Link销毁后不能影响新Match',()=>{
 const m=quiet(),links=[];for(const s of Object.values(m.sides)){
  const link=hero(s);links.push(link);link.skill.cooldownElapsed=link.skill.cooldownDuration-combatConfig.stepMs;
  for(let i=0;i<5;i++){const e=s.combat.spawnEnemy();e.moveSpeed=0;e.hp=e.maxHp=100000;}
 }
 advance(m,20);for(const link of links){assert.equal(link.skill.phase,'casting');assert.equal(link.skill.nextTarget,1);}
 m.pause();const paused=snapshot(m);advance(m,1000);assert.equal(snapshot(m),paused);
 m.resume();leaks(m,'top',3);const ended=snapshot(m);advance(m,5000);assert.equal(snapshot(m),ended);
 m.destroy();for(const link of links)assert.equal(link.skill,null);
 const fresh=quiet();advance(fresh,1000);assert.equal(fresh.bottomSide.recruitment.money,20);
 assert.equal(fresh.bottomSide.heroes.links.size,0);
});
test('连续销毁重建Match清空双方旧敌人/弹道/技能/参与/农民/CD/强化并保留loadout',()=>{
 const kit=loadout('farmer','haste_edict','iron_rice_bowl');let m=new Match(testMap,kit,kit,{...waveConfig,spawnInterval:1e9});
 for(let round=0;round<4;round++){
  for(const side of Object.values(m.sides)){
   const link=hero(side);side.heroes.grantHaste('xiaomei');side.heroes.recordDamage(1,link,1);
   put(side,{kind:'farmer',type:'农',level:1},6);side.combat.spawnEnemy();
  }
  advance(m,12000);m.pause();const old=m,oldSides=m.sides;
  const collect=()=>oldSides.bottom.collectFarmerReward(oldSides.bottom.board.tiles[6].unit,1);
  old.destroy();old.destroy();m=new Match(testMap,kit,kit,{...waveConfig,spawnInterval:1e9});
  old.resume();old.update(20000);assert.equal(collect(),false);
  assert.equal(old.status,'destroyed');assert.deepEqual(m.health,{bottom:3,top:3});assert.equal(m.timeline.elapsedMs,0);
  assert.equal(m.status,'running');assert.equal(m.result,null);
  for(const id of ['bottom','top']){
   const s=m.sides[id],o=oldSides[id];assert.equal(o.combat.enemies.length,0);assert.equal(o.combat.projectiles.length,0);
   assert.equal(o.heroes.links.size,0);assert.equal(o.heroes.hasteHeroes.size,0);assert.equal(o.farmers.states.size,0);
   assert.equal(o.activeItems.slots.length,0);assert.equal(s.recruitment.money,20);
   assert.ok(s.board.tiles.every(t=>t.unit===null&&t.bonusType==='none'));assert.ok(s.recruitment.slots.every(x=>x===null));
   assert.equal(s.activeItems.slots[0].remainingMs,20000);assert.equal(s.passives.ironRiceSeconds,0);
   assert.deepEqual(s.recruitment.loadout,kit);
  }
 }
});

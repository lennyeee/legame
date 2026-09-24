import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const {createBoardState,applyDrop}=await import('../src/systems/board.ts');
const {createRecruitmentState,recruit}=await import('../src/systems/recruitment.ts');
const {getHeroProgression}=await import('../src/systems/heroProgression.ts');
const {heroRecipes,heroCombat,heroGrowth,heroExpRequired,getHeroStats}=await import('../src/config/heroes.ts');
const {CombatSimulation}=await import('../src/combat/CombatSimulation.ts');
const {WaveProgress}=await import('../src/combat/WaveProgress.ts');
const {waveConfig}=await import('../src/config/waves.ts');
const {testMap}=await import('./fixtures/combatMap.ts');
const letter=(type,level=1)=>({kind:'heroLetter',type,level});
const p=(kind,index)=>({kind,index});
function setup(levels=[1,1],map=testMap){
 const board=createBoardState(map),reserve=createRecruitmentState();
 board.tiles[0].unit=letter('小',levels[0]);board.tiles[1].unit=letter('美',levels[1]);
 const growth=getHeroProgression(board);growth.sync();
 const sim=new CombatSimulation(map,board,reserve);sim.update(0);
 return {board,reserve,growth,sim,link:sim.heroLinks[0]};
}
function run(sim,ms){const events=[];for(let i=0;i<ms;i+=10)events.push(...sim.update(10));return events;}
function enemy(sim,hp=1000){const e=sim.spawnEnemy();e.moveSpeed=0;e.hp=e.maxHp=hp;return e;}
function grant(growth,link,exp,id=999){growth.recordDamage(id,link,1);growth.awardKill(id,exp);}

test('新征武将字Lv.1，不含EXP；移动交换保留高级字对象',()=>{
 const {board,reserve}=setup([3,3]);recruit(reserve,()=>15.5/20);assert.deepEqual(reserve.slots[0],letter('小'));
 const original=board.tiles[0].unit;reserve.slots[0]=null;
 applyDrop(board,reserve,p('tile',0),p('slot',0));assert.equal(reserve.slots[0],original);assert.equal(original.level,3);
 reserve.slots[1]=letter('饼',5);applyDrop(board,reserve,p('slot',0),p('slot',1));assert.equal(reserve.slots[1],original);assert.equal(original.level,3);
});
for(const levels of [[3,1],[2,5],[7,7]])test(`${levels.join('+')}向高等级同步且拆开永久保留`,()=>{
 const {board,reserve,growth,link}=setup(levels);const high=Math.min(5,Math.max(...levels));
 assert.equal(link.level,high);assert.equal(link.currentExp,0);
 assert.deepEqual([board.tiles[0].unit.level,board.tiles[1].unit.level],[high,high]);
 applyDrop(board,reserve,p('tile',1),p('slot',0));assert.equal(growth.links.size,0);assert.equal(reserve.slots[0].level,high);
 applyDrop(board,reserve,p('slot',0),p('tile',1));assert.equal(board.tiles[0].unit.level,high);
});

test('通用配方支持未来共享字，不修改生产征兵池',()=>{
 heroRecipes.push({id:'huangzhong',skillId:null,name:'黄忠',letters:['黄','忠']},{id:'huangzu',skillId:null,name:'黄祖',letters:['黄','祖']});
 try{const {board,reserve,growth}=setup();board.tiles[0].unit=letter('黄',3);board.tiles[1].unit=letter('祖');growth.sync();assert.equal(board.tiles[1].unit.level,3);assert.equal([...growth.links.values()][0].name,'黄祖');
 applyDrop(board,reserve,p('tile',1),p('slot',0));board.tiles[1].unit=letter('忠');growth.sync();assert.equal(board.tiles[1].unit.level,3);
 }finally{heroRecipes.splice(-2);}
});
for(const a of ['slot','tile'])for(const b of ['slot','tile'])for(const material of [1,4,5])test(`${a}→${b}同字Lv.${material}材料只让目标4→5`,()=>{
 const board=createBoardState(testMap),reserve=createRecruitmentState();
 const source=p(a,0),target=p(b,2);const item=letter('小',4);
 function put(pos,value){if(pos.kind==='tile')board.tiles[pos.index].unit=value;else reserve.slots[pos.index]=value;}
 put(source,letter('小',material));put(target,item);
 assert.equal(applyDrop(board,reserve,source,target),'merge');assert.equal(item.level,5);
 assert.equal(a==='tile'?board.tiles[0].unit:reserve.slots[0],null);
 assert.equal(b==='tile'?board.tiles[2].unit:reserve.slots[2],item);
});
test('不同字只能交换不能触发等级提升',()=>{
 const {board,reserve}=setup([3,3]);reserve.slots[0]=letter('小',4);
 assert.equal(applyDrop(board,reserve,p('slot',0),p('tile',1)),'swap');assert.equal(board.tiles[1].unit.level,4);assert.equal(reserve.slots[0].level,3);
});
test('激活组合同字目标+1、伙伴同步、EXP清零、保持目标对象',()=>{
 const {board,reserve,growth,link}=setup([3,3]);grant(growth,link,25);
 const original=board.tiles[0].unit;reserve.slots[0]=letter('小',9);
 applyDrop(board,reserve,p('slot',0),p('tile',0));
 assert.equal(board.tiles[0].unit,original);assert.equal(link.level,4);assert.equal(link.currentExp,0);assert.equal(board.tiles[1].unit.level,4);
});
test('拆开丢失EXP和参战资格，重新激活是全新周期',()=>{
 const {board,reserve,growth,link}=setup([3,3]);grant(growth,link,25);growth.recordDamage(1,link,5);
 applyDrop(board,reserve,p('tile',1),p('slot',0));applyDrop(board,reserve,p('slot',0),p('tile',1));
 const fresh=[...growth.links.values()][0];assert.notEqual(fresh.cycleId,link.cycleId);assert.equal(fresh.currentExp,0);
 growth.awardKill(1,1000);assert.equal(fresh.level,3);assert.equal(fresh.currentExp,0);
 growth.recordDamage(2,link,5);growth.awardKill(2,1000);assert.equal(fresh.level,3);
 grant(growth,fresh,10);assert.equal(fresh.currentExp,10);
});
test('拖动开始即失去未满EXP，取消拖动也从新周期0开始',()=>{
 const {growth,link,sim}=setup();grant(growth,link,20);sim.update(0,1);assert.equal(growth.links.size,0);
 sim.update(0);assert.equal(sim.heroLinks[0].currentExp,0);assert.notEqual(sim.heroLinks[0].cycleId,link.cycleId);
});
test('自然EXP写回两字，连续升级保留正确溢出，普通sync不清零',()=>{
 const {growth,link,board}=setup();const exp=heroExpRequired(1)+heroExpRequired(2)+7;
 grant(growth,link,exp);assert.equal(link.level,3);assert.equal(link.currentExp,7);
 growth.sync();assert.equal(link.currentExp,7);assert.equal(board.tiles[0].unit.level,3);assert.equal(board.tiles[1].unit.level,3);
 grant(growth,link,heroExpRequired(3)-7);assert.equal(link.level,4);assert.equal(link.currentExp,0);
});
test('零伤害不记录，多次命中只记录一次，重复死亡不重复给EXP',()=>{
 const {growth,link}=setup();growth.recordDamage(1,link,0);growth.awardKill(1,10);assert.equal(link.currentExp,0);
 for(let i=0;i<5;i++)growth.recordDamage(2,link,1);
 growth.awardKill(2,10);growth.awardKill(2,10);assert.equal(link.currentExp,10);
});
test('普通兵最后一击仍让实际参战武将获得完整EXP',()=>{
 const {board,sim,link}=setup();const e=enemy(sim);run(sim,2400);assert.equal(e.hp,1000-2*heroCombat.damage);
 board.tiles[4].unit={type:'弓',level:20};run(sim,1100);
 assert.equal(sim.enemies.length,0);assert.equal(link.currentExp,heroGrowth.enemyExp);
});
test('两个武将有效参战，各得完整EXP；第三个只在范围内不得EXP',()=>{
 const map={...testMap,cells:[{x:195,y:650,unlocked:true},{x:247,y:650,unlocked:true},{x:195,y:690,unlocked:true},{x:247,y:690,unlocked:true},{x:195,y:610,unlocked:true},{x:247,y:610,unlocked:true},{x:195,y:650,unlocked:true}]};
 const {board,sim,link}=setup([1,1],map);board.tiles[2].unit=letter('阿');board.tiles[3].unit=letter('饼');
 const e=enemy(sim);run(sim,1200);assert.equal(e.hp,1000-2*heroCombat.damage);
 board.tiles[4].unit=letter('小');board.tiles[5].unit=letter('六');board.tiles[6].unit={type:'刀',level:20};run(sim,300);
 assert.equal(sim.enemies.length,0);assert.equal(link.currentExp,10);
 assert.deepEqual(sim.heroLinks.map(l=>l.currentExp),[10,10,0]);
});
test('拆开后原敌人被普通兵击杀不发旧EXP，漏怪也无EXP',()=>{
 const {board,reserve,sim,growth}=setup();const e=enemy(sim);run(sim,1200);
 applyDrop(board,reserve,p('tile',1),p('slot',0));applyDrop(board,reserve,p('slot',0),p('tile',1));sim.update(0);
 const fresh=sim.heroLinks[0];board.tiles[4].unit={type:'弓',level:20};run(sim,1100);assert.equal(sim.enemies.length,0);assert.equal(fresh.currentExp,0);
 const escape=enemy(sim);growth.recordDamage(escape.id,fresh,1);escape.distance=sim.path.totalLength;run(sim,20);growth.awardKill(escape.id,100);assert.equal(fresh.currentExp,0);
});
test('参战武将自己击杀也能得EXP，休眠字不得EXP',()=>{
 const {sim,link}=setup();enemy(sim,1);run(sim,1200);assert.equal(link.currentExp,10);
});
test('等级提升增加伤害和攻速但不改变射程',()=>{
 for(const level of [2,5,50]){const stats=getHeroStats(level);assert.ok(stats.damage>heroCombat.damage);assert.ok(stats.attackInterval<heroCombat.attackInterval);assert.equal(stats.range,heroCombat.range);}
});
test('结算停止EXP和攻击，独立新局从空状态及Lv.1开始',()=>{
 const {board,reserve,growth}=setup();const progress=new WaveProgress(waveConfig);const sim=new CombatSimulation(testMap,board,reserve,undefined,progress);
 enemy(sim);run(sim,1200);const link=sim.heroLinks[0];progress.status='defeat';const before=link.currentExp;
 assert.deepEqual(run(sim,10000),[]);assert.equal(link.currentExp,before);
 growth.clear();assert.equal(growth.links.size,0);const freshBoard=createBoardState(testMap),freshReserve=createRecruitmentState();
 assert.equal(getHeroProgression(freshBoard).links.size,0);recruit(freshReserve,()=>15.5/20);assert.equal(freshReserve.slots[0].level,1);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const {heroRecipes,heroCombat}=await import('../src/config/heroes.ts');
const {getSkillStats,skillConfigs}=await import('../src/config/skills.ts');
const {gameConfig}=await import('../src/config/game.ts');
const {createBoardState,applyDrop}=await import('../src/systems/board.ts');
const {createRecruitmentState}=await import('../src/systems/recruitment.ts');
const {getHeroProgression}=await import('../src/systems/heroProgression.ts');
const {CombatSimulation}=await import('../src/combat/CombatSimulation.ts');
const {WaveProgress}=await import('../src/combat/WaveProgress.ts');
const {waveConfig}=await import('../src/config/waves.ts');
const {testMap}=await import('../src/config/maps.ts');
const letter=(type,level=1)=>({kind:'heroLetter',type,level});
const pos=(kind,index)=>({kind,index});
const id='xiaomei_barrage';
const cfg=skillConfigs[id];
function setup(hero='xiaomei',map={...testMap,cells:[{x:2000,y:650,unlocked:true},{x:2052,y:650,unlocked:true}]}){
 const board=createBoardState(map),wallet=createRecruitmentState();const recipe=heroRecipes.find(r=>r.id===hero);
 board.tiles[0].unit=letter(recipe.letters[0]);board.tiles[1].unit=letter(recipe.letters[1]);
 const sim=new CombatSimulation(map,board,wallet);sim.update(0);return {board,wallet,sim,link:sim.heroLinks[0]};
}
function run(sim,ms,suspended=null){const events=[];for(let t=0;t<ms;t+=10)events.push(...sim.update(Math.min(10,ms-t),suspended));return events;}
function enemy(sim,hp=1000,boss=false){const e=sim.spawnEnemy();e.moveSpeed=0;e.hp=hp;e.maxHp=Math.max(hp,1000);e.isBoss=boss;return e;}

test('正式稳定ID及五种字池，旧配方消失、小只出现一次',()=>{
 assert.deepEqual(heroRecipes.map(r=>r.id),['xiaomei','abing','xiaoliu']);
 assert.deepEqual(heroRecipes.map(r=>r.name),['小美','阿饼','小六']);
 assert.deepEqual(gameConfig.recruitmentPool,['刀','枪','弓','骑','铲','小','美','阿','饼','六']);
 assert.equal(gameConfig.recruitmentPool.filter(x=>x==='小').length,1);
});
test('同一个共享小的等级依次传播给美和六，同字升级仍同步清EXP',()=>{
 const {board,wallet,sim}=setup();const small=board.tiles[0].unit;small.level=4;sim.update(0);
 assert.equal(board.tiles[1].unit.level,4);
 applyDrop(board,wallet,pos('tile',1),pos('slot',0));assert.equal(wallet.slots[0].level,4);
 wallet.slots[1]=letter('六');applyDrop(board,wallet,pos('slot',1),pos('tile',1));sim.update(0);
 assert.equal(board.tiles[0].unit,small);assert.equal(board.tiles[1].unit.level,4);assert.equal(sim.heroLinks[0].heroId,'xiaoliu');
 const link=sim.heroLinks[0];link.currentExp=20;wallet.slots[1]=letter('小');applyDrop(board,wallet,pos('slot',1),pos('tile',0));
 assert.equal(small.level,5);assert.equal(board.tiles[1].unit.level,5);assert.equal(link.currentExp,0);
});
test('首次完整CD、无目标ready保持、出现目标立即释放并重置CD',()=>{
 const {sim,link}=setup();assert.equal(link.skill.cooldownElapsed,0);
 assert.equal(run(sim,cfg.cooldown-20).some(e=>e.kind==='skillStart'),false);
 run(sim,40);assert.equal(link.skill.phase,'ready');run(sim,10000);assert.equal(link.skill.phase,'ready');
 const target=enemy(sim);const events=run(sim,20);
 assert.equal(events.filter(e=>e.kind==='skillStart').length,1);assert.equal(target.hp,900);
 assert.ok(link.skill.cooldownElapsed<30);
});
for(const count of [1,2,3,4])test(`${count}个有效敌人全部选中，逐次命中不同时扣血`,()=>{
 const {sim,link}=setup();run(sim,cfg.cooldown);const targets=Array.from({length:count},(_,i)=>enemy(sim,1000+i));
 const first=run(sim,20);assert.equal(first.filter(e=>e.kind==='skillHit').length,1);
 assert.equal(targets.filter(e=>e.hp<1000).length,1);
 const rest=run(sim,cfg.hitInterval*(count-1));
 assert.equal(rest.filter(e=>e.kind==='skillHit').length,count-1);
 targets.forEach((e,i)=>assert.equal(e.hp,900+i));
 assert.notEqual(link.skill.phase,'casting');
});
test('选绝对当前HP最低5个，排除Boss、死亡目标，稳定处理HP相同者',()=>{
 const {sim}=setup();run(sim,cfg.cooldown);
 const targets=[600,100,500,200,400,300].map(h=>enemy(sim,h));
 targets[0].maxHp=100000;const boss=enemy(sim,1,true);const dead=enemy(sim,0);
 const events=run(sim,700);const hits=events.filter(e=>e.kind==='skillHit').map(e=>e.targetId);
 assert.deepEqual(hits,[targets[1],targets[3],targets[5],targets[4],targets[2]].map(e=>e.id));
 assert.equal(targets[0].hp,600);assert.equal(boss.hp,1);assert.equal(dead.hp,0);
 assert.equal(new Set(hits).size,5);
});
test('列表锁定，后续HP变化不重排、死掉或离场跳过不补选',()=>{
 const {sim,link}=setup();run(sim,cfg.cooldown);const targets=[1000,1001,1002,1003,1004,1005].map(h=>enemy(sim,h));
 run(sim,20);assert.deepEqual(link.skill.targetIds,targets.slice(0,5).map(e=>e.id));
 targets[1].hp=0;sim.enemies=sim.enemies.filter(e=>e!==targets[2]);targets[5].hp=1;targets[4].hp=1;
 const events=run(sim,650);assert.deepEqual(events.filter(e=>e.kind==='skillHit').map(e=>e.targetId),[targets[3].id,targets[4].id]);
 assert.equal(targets[5].hp,1);
});
test('每轮结束后仍要等下一完整CD，不会连续刷技能',()=>{
 const {sim}=setup();run(sim,cfg.cooldown);enemy(sim,10000);run(sim,20);
 assert.equal(run(sim,cfg.cooldown-40).some(e=>e.kind==='skillStart'),false);
 assert.equal(run(sim,60).filter(e=>e.kind==='skillStart').length,1);
});
test('拆开销毁CD及未完成打击，重组重新等完整CD',()=>{
 const {sim,board,wallet,link}=setup();run(sim,cfg.cooldown);const a=enemy(sim),b=enemy(sim);run(sim,20);
 applyDrop(board,wallet,pos('tile',1),pos('slot',0));assert.equal(link.skill,null);
 assert.equal(run(sim,1000).some(e=>e.kind==='skillHit'),false);assert.equal(b.hp,1000);
 applyDrop(board,wallet,pos('slot',0),pos('tile',1));sim.update(0);const fresh=sim.heroLinks[0];assert.equal(fresh.skill.cooldownElapsed,0);
 assert.equal(run(sim,cfg.cooldown-20).some(e=>e.kind==='skillStart'),false);assert.equal(a.hp,900);
});
test('技能命中登记参战，普通兵补刀仍给小美EXP',()=>{
 const map={...testMap,cells:[{x:2000,y:650,unlocked:true},{x:2052,y:650,unlocked:true},{x:195,y:650,unlocked:true}]};
 const {sim,board,link}=setup('xiaomei',map);run(sim,cfg.cooldown);const target=enemy(sim,500);run(sim,20);
 assert.equal(target.hp,400);board.tiles[2].unit={type:'刀',level:20};run(sim,300);
 assert.equal(sim.enemies.length,0);assert.equal(link.currentExp,10);
});
test('技能伤害随等级升高、CD缩短且不低于最小值',()=>{
 for(const level of [2,10,100000]){const stats=getSkillStats(id,level);assert.ok(stats.damage>cfg.damage);assert.ok(stats.cooldown<cfg.cooldown);assert.ok(stats.cooldown>=cfg.minCooldown);}
});
for(const hero of ['abing','xiaoliu'])test(`${hero}范围普攻正常，无技能状态或技能事件`,()=>{
 const {sim,link}=setup(hero,testMap);const a=enemy(sim),b=enemy(sim);const events=run(sim,1200);
 assert.ok(a.hp<1000&&b.hp<1000);assert.equal(link.skill,null);assert.equal(events.some(e=>e.kind.startsWith('skill')),false);
});
test('小美普攻仅单体，技能框架不依赖表现监听者',()=>{
 const {sim}=setup('xiaomei',testMap);const a=enemy(sim),b=enemy(sim);run(sim,1200);assert.equal([a,b].filter(e=>e.hp<1000).length,1);
});
test('结算中途终止后续技能打击，重开清理所有技能状态',()=>{
 const {sim,board,link}=setup();run(sim,cfg.cooldown);enemy(sim);const b=enemy(sim);run(sim,20);
 const progress=new WaveProgress(waveConfig);progress.status='defeat';sim.progress=progress;
 assert.deepEqual(run(sim,5000),[]);assert.equal(b.hp,1000);
 getHeroProgression(board).clear();assert.equal(link.skill,null);assert.equal(getHeroProgression(board).links.size,0);
 const fresh=setup();assert.equal(fresh.link.skill.cooldownElapsed,0);assert.deepEqual(fresh.link.skill.targetIds,[]);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const {heroRecipes,getHeroStats,heroCombat,heroGrowth}=await import('../src/config/heroes.ts');
const {getSkillStats,hasteConfig}=await import('../src/config/skills.ts');
const {heroAttackInterval}=await import('../src/combat/skills.ts');
const {createBoardState,applyDrop}=await import('../src/systems/board.ts');
const {createRecruitmentState}=await import('../src/systems/recruitment.ts');
const {getHeroProgression}=await import('../src/systems/heroProgression.ts');
const {CombatSimulation}=await import('../src/combat/CombatSimulation.ts');
const {WaveProgress}=await import('../src/combat/WaveProgress.ts');
const {waveConfig}=await import('../src/config/waves.ts');
const {testMap}=await import('./fixtures/combatMap.ts');
const letter=type=>({kind:'heroLetter',type,level:1});
const pos=(kind,index)=>({kind,index});
function setup(hero='xiaoliu',near=false){
 const x=near?195:2000;
 const map={...testMap,cells:[{x,y:650,unlocked:true},{x:x+52,y:650,unlocked:true},{x,y:800,unlocked:true},{x:x+52,y:800,unlocked:true}]};
 const board=createBoardState(map),wallet=createRecruitmentState(),sim=new CombatSimulation(map,board,wallet);
 const recipe=heroRecipes.find(r=>r.id===hero);
 function place(start){board.tiles[start].unit=letter(recipe.letters[0]);board.tiles[start+1].unit=letter(recipe.letters[1]);sim.update(0);}
 place(2);
 return {sim,board,wallet,place,link:sim.heroLinks[0],growth:getHeroProgression(board)};
}
function run(sim,ms){let events=[];for(let t=0;t<ms;t+=10)events.push(...sim.update(Math.min(10,ms-t)));return events;}
function enemy(sim,hp=10000,boss=false){const e=sim.spawnEnemy();e.moveSpeed=0;e.hp=e.maxHp=hp;e.isBoss=boss;return e;}

for(const hero of ['xiaomei','abing','xiaoliu'])test(`${hero}唯一性保留原组合、额外字可升级、拆开后继任且旧技能/EXP资格销毁`,()=>{
 const {sim,board,wallet,place,link,growth}=setup(hero);
 link.currentExp=12;link.skill.cooldownElapsed=1234;place(0);
 assert.equal(sim.heroLinks.length,1);assert.equal(sim.heroLinks[0],link);
 growth.recordDamage(999,link,1);
 applyDrop(board,wallet,pos('tile',0),pos('tile',2));sim.update(0);
 assert.equal(link.level,2);assert.equal(link.currentExp,0);assert.equal(board.tiles[3].unit.level,2);
 place(0);assert.equal(sim.heroLinks[0],link);
 applyDrop(board,wallet,pos('tile',3),pos('slot',0));sim.update(0);
 const fresh=sim.heroLinks[0];assert.equal(sim.heroLinks.length,1);assert.notEqual(fresh,link);
 assert.equal(link.skill,null);assert.equal(fresh.skill.cooldownElapsed,0);assert.equal(fresh.currentExp,0);
 growth.awardKill(999,null);assert.equal(fresh.currentExp,0);
});

for(const hero of ['abing','xiaoliu'])test(`${hero}普攻复用主目标周围AOE，范围外不受伤`,()=>{
 const {sim,link}=setup(hero,true);const a=enemy(sim),b=enemy(sim),far=enemy(sim);
 a.distance=100;b.distance=130;far.distance=800;
 const events=run(sim,getHeroStats(1,link.heroId).attackInterval+30);assert.equal(events.filter(e=>e.kind==='heroAttack').length,1);
 assert.equal(a.hp,10000-getHeroStats(1,link.heroId).damage);assert.equal(b.hp,10000-getHeroStats(1,link.heroId).damage);assert.equal(far.hp,10000);
});

test('阿饼完整CD后仅自身强化，Boss也可触发但没有处决和即时奖励',()=>{
 const {sim,link,wallet}=setup('abing',true),boss=enemy(sim,1e8,true),before=wallet.money;
 run(sim,11980);assert.equal(sim.statuses.allies.has(link),false);
 const events=run(sim,40);assert.equal(events.filter(e=>e.kind==='skillStart').length,1);
 assert.equal(sim.statuses.allies.has(link),true);assert.ok(boss.hp>0);
 assert.equal(wallet.money,before);assert.equal(link.currentExp,0);
 run(sim,4020);assert.equal(sim.statuses.allies.has(link),false);
});
test('阿饼脱战ready保留，重新接敌强化普攻仍可正常击杀并获EXP',()=>{
 const {sim,link,wallet}=setup('abing',true);link.skill.cooldownElapsed=12000;
 run(sim,20);assert.equal(link.skill.phase,'ready');const target=enemy(sim,1),before=wallet.money;
 run(sim,20);assert.equal(sim.statuses.allies.has(link),true);
 run(sim,1300);assert.equal(target.hp,0);assert.equal(link.currentExp,heroGrowth.rewards.kill);
 assert.equal(wallet.money,before+sim.config.enemy.killReward);
});

test('小六完整CD获得7层；无目标不消耗、不推进下轮CD；七次AOE各只扣一层并恢复普通攻速',()=>{
 const {sim,link}=setup('xiaoliu',true);const cd=getSkillStats('xiaoliu_haste',1).cooldown;
 enemy(sim,1e20,true); // 普攻目标使第一次CD正常累计。
 assert.equal(run(sim,cd-20).some(e=>e.kind==='skillStart'),false);
 const trigger=run(sim,40);
 assert.equal(trigger.filter(e=>e.kind==='skillStart').length,1);
 const triggerAttacks=trigger.filter(e=>e.kind==='heroAttack').length;
 sim.enemies=[];
 assert.equal(link.skill.remainingAttacks,7-triggerAttacks);run(sim,20000);
 assert.equal(link.skill.remainingAttacks,7-triggerAttacks);assert.equal(link.skill.cooldownElapsed,0);
 const a=enemy(sim,1e8),b=enemy(sim,1e8);a.distance=100;b.distance=130;
 let attacks=triggerAttacks;
 for(let ms=0;ms<5000&&attacks<7;ms+=10){
   const events=run(sim,10);attacks+=events.filter(e=>e.kind==='heroAttack').length;
   assert.equal(link.skill.remainingAttacks,7-attacks);
 }
 assert.equal(attacks,7);assert.equal(link.skill.phase,'charging');assert.equal(link.skill.cooldownElapsed,0);
 const remaining=7-triggerAttacks;
 const specialRatio=Math.max(0,remaining-1)*.04+(remaining>0?.10:0);
 assert.ok(Math.abs(a.hp-(1e8-remaining*getHeroStats(1,'xiaoliu').damage*1.2-1e8*specialRatio))<.01);
 assert.equal(b.hp,a.hp);
 assert.equal(heroAttackInterval(link,getHeroStats(1,'xiaoliu').attackInterval),1000/1.1);
 assert.equal(run(sim,850).filter(e=>e.kind==='heroAttack').length,0);
 assert.equal(run(sim,60).filter(e=>e.kind==='heroAttack').length,1);
 sim.enemies=[];
 const elapsed=link.skill.cooldownElapsed;
 assert.equal(run(sim,cd-elapsed-30).some(e=>e.kind==='skillStart'),false);
 assert.equal(link.skill.cooldownElapsed,elapsed);
 enemy(sim,1e20,true);
 assert.equal(run(sim,cd-elapsed+30).filter(e=>e.kind==='skillStart').length,1);
});

test('新增技能成长集中配置、CD和强化攻速均有安全下限',()=>{
 for(const id of ['abing_burst','xiaoliu_haste']){
   assert.ok(getSkillStats(id,2).cooldown<getSkillStats(id,1).cooldown);
   assert.ok(getSkillStats(id,5).cooldown>=getSkillStats(id,1).minCooldown);
 }
 const {link}=setup();link.skill.phase='empowered';
 const first=heroAttackInterval(link,1200);link.level=5;
 assert.ok(heroAttackInterval(link,1200)<first);link.level=100000;
 assert.equal(heroAttackInterval(link,1),hasteConfig.minAttackInterval);
});

for(const hero of ['abing','xiaoliu'])test(`${hero}结算停止技能，清理并新局无旧CD/强化状态`,()=>{
 const {sim,link,growth}=setup(hero);run(sim,15000);const target=enemy(sim);
 const progress=new WaveProgress(waveConfig);progress.status='defeat';sim.progress=progress;
 const saved=JSON.stringify(link.skill);assert.deepEqual(run(sim,30000),[]);
 assert.equal(JSON.stringify(link.skill),saved);assert.equal(target.hp,10000);
 growth.clear();assert.equal(link.skill,null);assert.equal(growth.links.size,0);
 const fresh=setup(hero);assert.equal(fresh.link.skill.cooldownElapsed,0);assert.equal(fresh.link.skill.remainingAttacks,0);
});

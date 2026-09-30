import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const { heroRegistry, heroRecipes, getHeroDefinition, getHeroStats, heroGrowth, heroExpRequired } = await import('../src/config/heroes.ts');
const { skillConfigs, getSkillStats } = await import('../src/config/skills.ts');
const { gameConfig, recruitmentCategoryScale, recruitmentCategories, GAME_VERSION } = await import('../src/config/game.ts');
const { recruitmentPool, createRecruitmentState } = await import('../src/systems/recruitment.ts');
const { createBoardState, applyDrop } = await import('../src/systems/board.ts');
const { getHeroProgression } = await import('../src/systems/heroProgression.ts');
const { CombatSimulation } = await import('../src/combat/CombatSimulation.ts');
const { testMap } = await import('./fixtures/combatMap.ts');
const letter = type => ({kind:'heroLetter',type,level:1});
function setup(hero='xiaomei') {
 const board=createBoardState(testMap), reserve=createRecruitmentState(), def=getHeroDefinition(hero);
 board.tiles[0].unit=letter(def.letters[0]);board.tiles[1].unit=letter(def.letters[1]);
 const progression=getHeroProgression(board);progression.sync();
 return {board,reserve,progression,link:[...progression.links.values()][0]};
}
function award(progression,link,exp){progression.recordDamage(99,link,1);progression.awardKill(99,link,{kill:exp,assist:.2});}

test('Registry has eight unique stable IDs, ordered letter pairs and names; all eight available',()=>{
 assert.equal(heroRegistry.length,8);
 for(const key of ['id','name'])assert.equal(new Set(heroRegistry.map(h=>h[key])).size,8);
 assert.equal(new Set(heroRegistry.map(h=>h.letters.join('|'))).size,8);
 assert.deepEqual(heroRecipes.map(h=>h.id),['xiaomei','abing','xiaoliu','houjiang','xiaozhan','yongqi','xiaoqian','abiao']);
 assert.equal(GAME_VERSION,'0.69-D');
 assert.throws(()=>getHeroDefinition('unknown'),/未注册/);
});
for(const hero of heroRegistry)test(`Registry resolves ${hero.id} with complete identity and presentation data`,()=>{
 assert.equal(getHeroDefinition(hero.id),hero);
 assert.equal(hero.letters.length,2);assert.equal(hero.name,hero.letters.join(''));
 assert.ok(hero.description);assert.equal(hero.cardColor,['abing','xiaoliu'].includes(hero.id)?'purple':'gold');
});
test('planned ranges explicit; Abing B runtime225; passive has no active cooldown',()=>{
 for(const [id,range] of [['houjiang',180],['xiaoqian',180],['abing',225],['abiao',300]])assert.equal(getHeroDefinition(id).plannedAttackRange,range);
 assert.equal(getHeroStats(1,'abing').range,225);
 const passive=getHeroDefinition('xiaoqian').skill;assert.equal(passive.kind,'passive');assert.equal('cooldownByLevel' in passive,false);
 assert.equal(getHeroDefinition('xiaozhan').baseAttackRange,230);
 assert.equal(getHeroDefinition('yongqi').baseAttackRange,230);
});
test('v0.69-B keeps explicit per-hero Lv1-Lv5 damage and attack-rate tables',()=>{
 const expected={
  xiaomei:{damage:[10,14,19,25,32],aps:[1.30,1.50,1.70,1.90,2.10]},
  abing:{damage:[8,11,15,20,26],aps:[1.25,1.45,1.65,1.85,2.05]},
  xiaoliu:{damage:[8,11,15,20,26],aps:[1.10,1.25,1.40,1.55,1.70]},
  houjiang:{damage:[9,13,18,24,31],aps:[1.05,1.20,1.35,1.50,1.65]},
  xiaozhan:{damage:[8,11,15,20,26],aps:[1.10,1.25,1.40,1.55,1.70]},
  yongqi:{damage:[9,13,18,24,31],aps:[1.10,1.25,1.40,1.55,1.70]},
  xiaoqian:{damage:[10,15,21,28,36],aps:[1.30,1.50,1.70,1.90,2.10]},
  abiao:{damage:[14,20,28,37,48],aps:[.95,1.05,1.15,1.25,1.35]},
 };
 for(const [id,table] of Object.entries(expected)){
  const hero=getHeroDefinition(id);
  assert.deepEqual([...hero.attackDamageByLevel],table.damage);
  assert.deepEqual([...hero.attacksPerSecondByLevel],table.aps);
  for(let level=1;level<=5;level++){
   const stats=getHeroStats(level,id);
   assert.equal(stats.damage,table.damage[level-1]);
   assert.ok(Math.abs(stats.attackInterval-1000/table.aps[level-1])<1e-10);
  }
 }
 assert.equal('damagePerLevel' in heroGrowth,false);
 assert.equal('speedPerLevel' in heroGrowth,false);
});
test('visual colors cannot change weights, progression or combat; all available letters enter live pool',()=>{
 const pool=recruitmentPool({active:[],passive:[]});
 assert.deepEqual(pool.map(p=>p.value),[...gameConfig.recruitmentPool]);
 assert.deepEqual(pool.map(p=>p.weight),[...Array(4).fill(910),780,...Array(13).fill(60)]);
 assert.equal(pool.reduce((sum,p)=>sum+p.weight,0),100*recruitmentCategoryScale);
 assert.equal(recruitmentCategories.default.heroLetter,15);
 const before=heroRegistry.filter(h=>h.available).map(h=>getHeroStats(3,h.id));
 const colors=heroRegistry.map(h=>h.cardColor);
 try{heroRegistry.forEach(h=>h.cardColor=h.cardColor==='gold'?'purple':'gold');
 assert.deepEqual(recruitmentPool({active:[],passive:[]}),pool);
 assert.deepEqual(heroRegistry.filter(h=>h.available).map(h=>getHeroStats(3,h.id)),before);
 assert.equal(heroGrowth.rewards.kill,1);assert.equal(heroExpRequired(1),10);
 }finally{heroRegistry.forEach((h,i)=>h.cardColor=colors[i]);}
 for(const def of heroRegistry){
  const board=createBoardState(testMap);board.tiles[0].unit=letter(def.letters[0]);board.tiles[1].unit=letter(def.letters[1]);
  const progression=getHeroProgression(board);progression.sync();assert.equal(progression.links.size,1);
  assert.equal(getHeroStats(1,def.id).damage,def.attackDamageByLevel[0]);
 }
});
for(const id of ['xiaomei','abing','xiaoliu'])for(const level of [1,2,3,4,5])test(`${id} Lv${level} registry supplies expected combat and skill values`,()=>{
 const hero=getHeroDefinition(id),stats=getHeroStats(level,id),skill=hero.skill;
 assert.equal(stats.damage,hero.attackDamageByLevel[level-1]);assert.equal(stats.range,id==='abing'?225:230);
 assert.equal(stats.attackInterval,1000/hero.attacksPerSecondByLevel[level-1]);
 assert.equal(skillConfigs[hero.skillId],skill);
 const actual=getSkillStats(hero.skillId,level);
 const base=id==='xiaomei'?10000:id==='abing'?14000:12000;
 const minimum=id==='xiaomei'?3000:id==='abing'?4000:3500;
 assert.equal(skill.cooldownByLevel.length,5);assert.equal(skill.effectByLevel.length,5);
 assert.equal(actual.cooldown,id==='abing'?12000-(level-1)*500:Math.max(minimum,base/(1+.08*(level-1))));
 assert.equal(actual.damage,id==='xiaomei'?Math.round(100*(1+.5*(level-1))):0);
 if(id==='xiaoliu'){assert.equal(skill.effectByLevel[level-1].attacks,7);assert.equal(skill.effectByLevel[level-1].speedMultiplier,3+.2*(level-1));}
});
test('independent skill table can express non-formula growth without changing other heroes',()=>{
 const skill=getHeroDefinition('xiaomei').skill,descriptor=Object.getOwnPropertyDescriptor(skill,'cooldownByLevel');
 try{Object.defineProperty(skill,'cooldownByLevel',{value:[9000,8800,8500,8100,7800],configurable:true});
 assert.equal(getSkillStats(skill.id,3).cooldown,8500);assert.equal(getSkillStats('abing_burst',3).cooldown,11000);
 }finally{Object.defineProperty(skill,'cooldownByLevel',descriptor);}
});
for(const [level,required] of [[1,10],[2,20],[3,30],[4,40]])test(`Lv${level} EXP boundary ${required}, upgrade writes both letters with overflow`,()=>{
 const {board,progression,link}=setup();link.left.level=link.right.level=level;progression.sync();
 assert.equal(heroExpRequired(level),required);award(progression,link,required-1);assert.equal(link.level,level);
 award(progression,link,2);assert.equal(link.level,level+1);assert.equal(link.left.level,level+1);assert.equal(link.right.level,level+1);
 assert.equal(link.currentExp,level===4?0:1);assert.equal(board.tiles[0].unit.level,link.level);
});
test('cumulative EXP100; multi-upgrade caps at5 without accumulating max-level EXP',()=>{
 assert.deepEqual(heroGrowth.expByLevel,[10,20,30,40]);assert.equal(heroGrowth.expByLevel.reduce((a,b)=>a+b),100);
 const {progression,link}=setup();award(progression,link,99);assert.equal(link.level,4);assert.equal(link.currentExp,39);
 award(progression,link,1000);assert.equal(link.level,5);assert.equal(link.currentExp,0);assert.equal(heroExpRequired(5),Infinity);
 award(progression,link,1000);assert.equal(link.level,5);assert.equal(link.currentExp,0);
});
test('split discards EXP and old participation; new link starts CD0/EXP0; normal kill earns1EXP',()=>{
 const {board,reserve,progression,link}=setup();award(progression,link,4);progression.recordDamage(1,link,1);
 applyDrop(board,reserve,{kind:'tile',index:1},{kind:'slot',index:0});
 applyDrop(board,reserve,{kind:'slot',index:0},{kind:'tile',index:1});const fresh=[...progression.links.values()][0];
 progression.awardKill(1,null);assert.equal(fresh.level,1);assert.equal(fresh.currentExp,0);assert.equal(fresh.skill.cooldownElapsed,0);
 const sim=new CombatSimulation(testMap,board,reserve);const enemy=sim.spawnEnemy();enemy.moveSpeed=0;enemy.hp=1;
 for(let i=0;i<125;i++)sim.update(10);
 assert.equal(fresh.currentExp,1);assert.equal(fresh.level,1);
});

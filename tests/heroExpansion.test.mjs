import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const { PlayerSide }=await import('../src/systems/PlayerSide.ts');
const { heroRegistry,getHeroDefinition,getHeroStats,heroGrowth }=await import('../src/config/heroes.ts');
const { getSkillStats,skillConfigs }=await import('../src/config/skills.ts');
const { StatusEffects }=await import('../src/combat/statusEffects.ts');
const { getCombatStats }=await import('../src/config/combat.ts');

const { testMap }=await import('../src/config/maps.ts');
const letter=(type,level=1)=>({kind:'heroLetter',type,level});
function setup(id='xiaomei',level=1){
 const map={...testMap,cellSize:75,path:[{x:0,y:0},{x:2000,y:0}],cells:Array.from({length:10},(_,i)=>({x:100+i*75,y:60,unlocked:true}))};
 const side=new PlayerSide('test',map,undefined,{automaticWaves:false});
 const sim=side.combat;
 function place(id,index=0,level=1){const def=getHeroDefinition(id);side.board.tiles[index].unit=letter(def.letters[0],level);side.board.tiles[index+1].unit=letter(def.letters[1],level);sim.update(0);return sim.heroLinks.find(l=>l.heroId===id);}
 const link=place(id,0,level);
 const run=ms=>{let events=[];for(let t=0;t<ms-1e-7;t+=sim.config.stepMs)events.push(...side.updateCombat(sim.config.stepMs,null));return events;};
 const enemy=(x=150,hp=10000)=>{const e=sim.spawnEnemy();e.distance=x;e.x=x;e.y=0;e.moveSpeed=0;e.hp=e.maxHp=hp;return e;};
 const ready=(l=link)=>{l.skill.cooldownElapsed=l.skill.cooldownDuration;return run(sim.config.stepMs);};
 return {side,sim,link,place,run,enemy,ready};
}
for(const def of heroRegistry)test(`${def.id} live horizontal pair, unique activation and skill/passive ownership`,()=>{
 const p=setup(def.id);assert.equal(p.link.heroId,def.id);assert.equal(p.sim.heroLinks.length,1);
 p.place(def.id,2);assert.equal(p.sim.heroLinks.length,1);
 assert.equal(p.link.skill===null,def.skill.kind==='passive');
 assert.equal(getHeroStats(5,def.id).range,def.baseAttackRange);
 p.side.drop({kind:'tile',index:1},{kind:'slot',index:0});p.sim.update(0);
 assert.equal(p.sim.heroLinks.length,1);assert.notEqual(p.sim.heroLinks[0],p.link);
});
test('Abing225, execution removed, self buff affects only basic attacks and expires',()=>{
 const p=setup('abing');const enemy=p.enemy(150,1e9);const other=p.place('xiaomei',2);
 assert.equal(getHeroStats(1,'abing').range,225);assert.equal(skillConfigs.abing_execute,undefined);
 p.ready();assert.ok(enemy.hp>0);assert.equal(p.sim.statuses.allies.has(other),false);
 const events=p.run(1000),hits=events.filter(e=>e.kind==='hit'&&e.heroId==='abing');
 assert.ok(hits.length);assert.equal(hits[0].source,'basic');assert.equal(hits[0].damage,13);
 p.run(3100);assert.equal(p.sim.statuses.allies.has(p.link),false);
 assert.equal(p.sim.statuses.basicStats(p.link,getHeroStats(1,'abing')).damage,10);
});
test('Xiaoliu seven successful boosted attacks; no target consumes nothing, eighth normal',()=>{
 const p=setup('xiaoliu'),target=p.enemy();p.ready();assert.equal(p.link.skill.remainingAttacks,7);
 p.sim.enemies=[];p.run(1000);assert.equal(p.link.skill.remainingAttacks,7);
 p.sim.enemies=[target];let hits=[];
 while(hits.length<8)hits.push(...p.run(20).filter(e=>e.kind==='hit'&&e.heroId==='xiaoliu'));
 assert.deepEqual(hits.slice(0,7).map(e=>e.damage),Array(7).fill(12));assert.equal(hits[7].damage,10);
 assert.equal(p.link.skill.remainingAttacks,0);assert.equal(p.link.skill.phase,'charging');
});
test('Houjiang180 self-centred AOE includes multiple enemies, rejects outside range',()=>{
 const p=setup('houjiang'),a=p.enemy(50),b=p.enemy(230),far=p.enemy(500);
 p.run(1200);assert.equal(a.hp,9990);assert.equal(b.hp,9990);assert.equal(far.hp,10000);
});
test('Shout stuns all in range; movement resumes without changing base speed',()=>{
 const p=setup('houjiang'),a=p.enemy(100),b=p.enemy(200);p.ready();a.moveSpeed=b.moveSpeed=55;
 const before=a.distance;p.run(1000);assert.equal(a.distance,before);assert.equal(a.moveSpeed,55);
 p.run(500);assert.ok(a.distance>before);assert.equal(p.sim.statuses.enemies.has(a),false);
});
test('Stun cannot freeze poison/slow clocks, poison ticks four times, slowing stacks with25% floor',()=>{
 const effects=new StatusEffects(),a={hp:100},source={},source2={};let total=0;
 effects.addEnemy(a,{kind:'stun',source,remaining:2000,amount:0,interval:0});
 effects.addEnemy(a,{kind:'poison',source,remaining:4000,amount:6,interval:1000});
 effects.addEnemy(a,{kind:'slow',source,remaining:1000,amount:.5,interval:0});
 assert.equal(effects.tickEnemy(a,1000,n=>total+=n),0);assert.equal(total,6);
 assert.equal(effects.enemies.get(a).some(e=>e.kind==='slow'),false);
 effects.tickEnemy(a,1000,n=>total+=n);assert.equal(total,12);
 assert.equal(effects.tickEnemy(a,2000,n=>total+=n),2);assert.equal(total,24);assert.equal(effects.enemies.size,0);
 for(const source of [{},source2])effects.addEnemy(a,{kind:'slow',source,remaining:1000,amount:.8,interval:0});
 assert.equal(effects.tickEnemy(a,500,()=>{}),.125);assert.equal(effects.tickEnemy(a,1000,()=>{}),.625);
});
test('Xiaozhan buffs ordinary and heroes including self; reapply does not multiply twice; expires',()=>{
 const p=setup('xiaozhan'),ally=p.place('xiaomei',2),unit={type:'刀',level:1};
 p.sim.map.cells[4].x=325;p.sim.map.cells[4].y=160;p.side.board.tiles[4].unit=unit;p.sim.update(0);p.enemy();p.ready();
 for(const recipient of [unit,ally,p.link])assert.equal(p.sim.statuses.allies.has(recipient),true);
 const base={damage:10,attackInterval:1000};let enhanced=p.sim.statuses.basicStats(ally,base);
 assert.equal(enhanced.damage,11.5);assert.equal(enhanced.attackInterval,1000/1.15);
 p.sim.statuses.buff(ally,p.link,5000,.15,.15);assert.deepEqual(p.sim.statuses.basicStats(ally,base),enhanced);
 p.run(5100);assert.deepEqual(p.sim.statuses.basicStats(ally,base),base);
});
test('Yongqi primary full damage, surrounding70%, smoke directly applies poison andslow',()=>{
 const p=setup('yongqi'),a=p.enemy(160),b=p.enemy(180);p.run(1200);
 assert.equal(b.hp,9990);assert.equal(a.hp,9993);
 p.ready();assert.equal(p.sim.statuses.enemies.get(a).length,2);
 const events=p.run(4000);assert.equal(events.filter(e=>e.kind==='hit'&&e.source==='dot'&&e.enemyId===a.id).length,4);
 assert.ok(events.filter(e=>e.kind==='hit'&&e.source==='dot').every(e=>e.damage===6));
 assert.equal(p.sim.statuses.enemies.size,0);
});
test('Ally buff never scales Xiaomei skill, sword or DOT',()=>{
 for(const id of ['xiaomei','abiao','yongqi']){
 const p=setup(id),ally=p.place('xiaozhan',2);p.enemy(150);p.sim.statuses.buff(p.link,ally,5000,.2,.2);
 p.ready();const events=p.run(1100),source=id==='yongqi'?'dot':'skill';
 const hits=events.filter(e=>e.kind==='hit'&&e.source===source);
 if(id==='xiaomei'){// first hit occurs in ready() itself; add a second locked target next cast separately below
  assert.equal(p.link.skill.castDamage,100);
 }else{assert.ok(hits.length);assert.ok(hits.every(h=>Math.abs(h.damage-(id==='abiao'?12:6))<1e-6));}
 }
});
test('Xiaoqian no CD, consecutive attacks accelerate to6, keep stacks on ordinary frame, reset target/death/out-of-range',()=>{
 const p=setup('xiaoqian'),a=p.enemy(150);assert.equal(p.link.skill,null);
 let times=[],elapsed=0;while(times.length<7){if(p.run(p.sim.config.stepMs).some(e=>e.kind==='heroAttack'))times.push(elapsed);elapsed+=p.sim.config.stepMs;}
 assert.equal(p.link.focus.stacks,6);assert.ok(times[2]-times[1]<times[1]-times[0]);p.run(20);assert.equal(p.link.focus.stacks,6);
 const b=p.enemy(200);p.run(20);assert.equal(p.link.focus.stacks,0);assert.equal(p.link.focus.targetId,b.id);
 b.hp=0;p.run(20);assert.equal(p.link.focus.targetId,a.id);assert.equal(p.link.focus.stacks,0);
 a.distance=1500;p.run(20);assert.equal(p.link.focus.stacks,0);assert.equal(p.link.focus.targetId,null);
});
test('Sword charge requires300 range; landing reads new live whole-path enemies, no start lock or basic event',()=>{
 const p=setup('abiao'),far=p.enemy(1400);p.run(2000);assert.equal(p.link.skill.cooldownElapsed,0);
 const near=p.enemy(150);p.ready();assert.equal(p.link.skill.phase,'casting');assert.equal(far.hp,10000);
 near.hp=0;const newcomer=p.enemy(1800);const events=p.run(400);
 assert.equal(far.hp,9988);assert.equal(newcomer.hp,9988);assert.equal(near.hp,0);
 const hits=events.filter(e=>e.kind==='hit');assert.deepEqual(hits.map(h=>h.source),['skill','skill']);
 assert.equal(events.some(e=>e.kind==='heroAttack'),false);
});
for(const id of ['abing','xiaoliu','houjiang','xiaozhan','yongqi','abiao'])test(`${id} five levels modest growth, independent CDs`,()=>{
 const skill=getHeroDefinition(id).skill;for(let level=1;level<=5;level++){
 const stats=getSkillStats(skill.id,level);assert.ok(Number.isFinite(stats.cooldown));
 if(level>1)assert.ok(stats.cooldown<getSkillStats(skill.id,level-1).cooldown);
 }
 if(id==='xiaoliu')assert.ok(skill.effectByLevel.every(e=>e.attacks===7));
});
test('Pause/result freeze state timers and CD; destroy/new side contains no effects',()=>{
 const p=setup('yongqi'),target=p.enemy();p.ready();p.side.pause();const before=JSON.stringify([...p.sim.statuses.enemies.values()]);
 p.run(8000);assert.equal(JSON.stringify([...p.sim.statuses.enemies.values()]),before);assert.equal(target.hp,10000);
 p.side.resume();p.run(1000);assert.equal(target.hp,9994);p.side.stop();const hp=target.hp;p.run(10000);assert.equal(target.hp,hp);
 p.side.destroy();assert.equal(p.sim.statuses.enemies.size,0);assert.equal(p.sim.statuses.allies.size,0);assert.equal(p.side.heroes.links.size,0);
 assert.equal(setup('yongqi').sim.statuses.enemies.size,0);
});
test('Split cancels old source effects, no ghost DOT/temporary buff or old EXP',()=>{
 const p=setup('yongqi'),target=p.enemy();p.ready();p.side.drop({kind:'tile',index:1},{kind:'slot',index:0});
 p.run(4000);assert.equal(target.hp,10000);assert.equal(p.sim.statuses.enemies.size,0);
});
test('8 heroes share EXP10/20/30/40 while ordinary combat stats remain unchanged',()=>{
 assert.deepEqual(heroGrowth.expByLevel,[10,20,30,40]);assert.equal(heroGrowth.rewards.kill,1);
 for(const h of heroRegistry)assert.deepEqual([1,2,3,4,5].map(l=>getHeroStats(l,h.id).damage),[10,15,20,25,30]);
});

test('Poison final tick earns killer1 EXP, emits no ordinary attack',()=>{
 const p=setup('yongqi'),enemy=p.enemy(150,5);p.ready();
 const events=p.run(1000);assert.equal(enemy.hp,0);assert.equal(p.link.currentExp,1);
 assert.equal(events.filter(e=>e.kind==='hit'&&e.source==='dot').length,1);
 assert.equal(events.some(e=>e.kind==='heroAttack'||e.kind==='attack'),false);
});
test('Status sources and same numeric enemy IDs remain isolated between two simulations',()=>{
 const a=setup('yongqi'),b=setup('yongqi');const first=a.enemy(),second=b.enemy();
 assert.equal(first.id,second.id);a.ready();a.run(1000);b.run(1000);
 assert.equal(first.hp,9994);assert.equal(second.hp,10000);assert.equal(b.sim.statuses.enemies.size,0);
});
test('Xiaozhan actual normal attacks speed up and deal bonus damage, excludes Farmer and dormant letters',()=>{
 const p=setup('xiaozhan'),unit={type:'刀',level:1};
 p.sim.map.cells[4].x=150;p.sim.map.cells[4].y=80;p.side.board.tiles[4].unit=unit;
 p.side.board.tiles[5].unit={kind:'farmer',type:'农',level:1};
 p.side.board.tiles[6].unit=letter('侯');p.sim.update(0);p.enemy();
 p.ready();assert.equal(p.sim.statuses.allies.has(unit),true);
 assert.equal(p.sim.statuses.allies.has(p.side.board.tiles[5].unit),false);
 assert.equal(p.sim.statuses.allies.has(p.side.board.tiles[6].unit),false);
 const base=getCombatStats(unit);
 const events=p.run(2000),hits=events.filter(e=>e.kind==='hit'&&!e.heroId);
 assert.ok(hits.length>0);assert.ok(hits.every(e=>e.source==='basic'&&Math.abs(e.damage-base.damage*1.15)<1e-8));
 assert.ok(events.filter(e=>e.kind==='attack').length>=Math.floor(2000/(base.attackInterval/1.15)));
 const normal=p.sim.statuses.basicStats(unit,{damage:10,attackInterval:1000});
 assert.equal(normal.damage,11.5);assert.equal(normal.attackInterval,1000/1.15);
});
for(const def of heroRegistry.filter(h=>h.skill.kind==='active'&&h.id!=='xiaomei'))
test(`${def.id} full-CD ready survives no target and re-entry triggers exactly once`,()=>{
 const p=setup(def.id);p.link.skill.cooldownElapsed=p.link.skill.cooldownDuration;
 assert.equal(p.run(2000).some(e=>e.kind==='skillStart'),false);assert.equal(p.link.skill.phase,'ready');
 p.enemy();assert.equal(p.run(20).filter(e=>e.kind==='skillStart').length,1);
 assert.equal(p.run(20).filter(e=>e.kind==='skillStart').length,0);
});

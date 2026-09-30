import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const { MatchTimeline }=await import('../src/match/MatchTimeline.ts');
const { pressureConfig, validatePressureConfig, enemyHpForWave, enemyCountForWave,
 spawnIntervalForWave, waveStartForWave }=await import('../src/config/pressure.ts');
const { combatConfig }=await import('../src/config/combat.ts');
const overlap={...pressureConfig,firstEnemyDelay:100,waveStartInterval:200,
 waves:[{hp:10,count:4}],spawnInterval:100};

test('first enemy at exactly 9500ms, within-wave interval and cadence are independent',()=>{
 const t=new MatchTimeline();assert.deepEqual(t.advance(9499),[]);assert.equal(t.elapsedMs,9499);
 assert.deepEqual(t.advance(1),[{id:1,atMs:9500,wave:1,hpMultiplier:enemyHpForWave(1)/combatConfig.enemy.maxHp}]);
 assert.deepEqual(t.advance(pressureConfig.spawnInterval-1),[]);assert.equal(t.advance(1)[0].atMs,9500+pressureConfig.spawnInterval);
 const c={...pressureConfig,spawnInterval:321};const other=new MatchTimeline(c);
 assert.equal(other.advance(9500)[0].atMs,9500);assert.equal(other.advance(321)[0].atMs,9821);
 assert.equal(waveStartForWave(2,c),9500+10*321);
});

test('new wave starts while previous wave still spawning; chronological ties stable',()=>{
 const t=new MatchTimeline(overlap);const first=t.advance(300);
 assert.deepEqual(first.map(e=>[e.wave,e.atMs]),[[1,100],[1,200],[1,300],[2,300]]);
 assert.equal(t.wave,2);const next=t.advance(100);
 assert.deepEqual(next.map(e=>[e.wave,e.atMs]),[[1,400],[2,400]]);
 assert.equal(t.elapsedMs,400);assert.equal(t.wave,2);
});

test('large delta emits every due spawn once, identical to fine and uneven increments',()=>{
 const a=new MatchTimeline(overlap),b=new MatchTimeline(overlap),c=new MatchTimeline(overlap);
 const expected=a.advance(10000),fine=[],uneven=[];
 for(let n=0;n<10000;n+=10)fine.push(...b.advance(10));
 for(const dt of [1,98,1,777,2222,6901])uneven.push(...c.advance(dt));
 assert.deepEqual(fine,expected);assert.deepEqual(uneven,expected);
 assert.equal(new Set(expected.map(e=>e.id)).size,expected.length);
 assert.ok(expected.every((e,i)=>!i||e.atMs>=expected[i-1].atMs));
 assert.deepEqual(a.advance(0),[]);assert.deepEqual(a.advance(-1),[]);assert.deepEqual(a.advance(NaN),[]);
 assert.equal(a.elapsedMs,10000);
});

test('first20 waves match the pressure HP table; enemy counts and cadence remain unchanged',()=>{
 assert.deepEqual(Array.from({length:20},(_,i)=>enemyHpForWave(i+1)),[10,18,28,40,54,70,88,125,175,240,320,420,540,680,840,1020,1220,1440,1680,1940]);
 assert.deepEqual(Array.from({length:20},(_,i)=>enemyCountForWave(i+1)),[10,11,12,13,15,16,18,19,20,21,22,23,24,25,26,27,28,29,30,31]);
 assert.equal(enemyCountForWave(16),27);assert.equal(enemyCountForWave(20),31);
 assert.equal(combatConfig.enemy.moveSpeed,45);assert.equal(combatConfig.enemy.killReward,1);
 assert.equal(pressureConfig.baseHealth,3);assert.equal(pressureConfig.firstEnemyDelay,9500);assert.equal(pressureConfig.spawnInterval,1500);
 for(let w=1;w<=100;w++){
  assert.equal(spawnIntervalForWave(w),1500);
  assert.equal(waveStartForWave(w+1)-waveStartForWave(w),enemyCountForWave(w)*1500);
  if(w>20){assert.ok(enemyHpForWave(w)>enemyHpForWave(w-1));assert.equal(enemyCountForWave(w)-enemyCountForWave(w-1),1);}
 }
 for(const [wave,hp] of [[21,2231],[22,2566],[25,3903],[30,7849]])assert.equal(enemyHpForWave(wave),hp);
 for(const wave of [8,20,21,22]){
  const t=new MatchTimeline(),spawn=t.advance(waveStartForWave(wave)).find(event=>event.wave===wave);
  assert.equal(Math.round(combatConfig.enemy.maxHp*spawn.hpMultiplier),enemyHpForWave(wave));
 }
 const t=new MatchTimeline();const events=t.advance(waveStartForWave(2));
 assert.equal(events.filter(e=>e.wave===1).length,10);assert.equal(events.filter(e=>e.wave===2).length,1);
 assert.equal(events.at(-1).atMs,24500);assert.equal(events.at(-2).atMs,23000);
});

test('wave100 generates normally, no finite completion or accumulated history',()=>{
 const t=new MatchTimeline();assert.equal('events' in t,false);assert.equal('waveStarts' in t,false);
 assert.equal('finished' in t,false);const end=waveStartForWave(100),events=t.advance(end);
 assert.equal(t.wave,100);assert.ok(events.some(e=>e.wave===100&&e.atMs===end));
 assert.ok(events.some(e=>e.wave>20));
 assert.ok(t.spawning.length<=3); // only live cursors, not the 100 past waves
 const before=events.at(-1).id,next=t.advance(enemyCountForWave(100)*1500);
 assert.ok(next.every(e=>e.id>before));assert.equal(t.wave,101);
 assert.ok(next.some(e=>e.wave===101));
});

for(const w of [100,1000])test(`wave${w} pressure is deterministic, finite and positive`,()=>{
 const hp=enemyHpForWave(w),count=enemyCountForWave(w),interval=spawnIntervalForWave(w),start=waveStartForWave(w);
 assert.ok(Number.isFinite(hp)&&Number.isInteger(hp)&&hp>0);assert.ok(Number.isInteger(count)&&count>=1);
 assert.ok(Number.isFinite(interval)&&interval>0);assert.ok(Number.isFinite(start)&&start>=9500);
 assert.equal(hp,enemyHpForWave(w));assert.equal(count,enemyCountForWave(w));
 assert.equal(interval,spawnIntervalForWave(w));assert.equal(start,waveStartForWave(w));
});

test('wave1000000 pressure has no artificial HP ceiling beyond JavaScript Number range',()=>{
 assert.equal(enemyHpForWave(1000000),Infinity);
 assert.equal(enemyCountForWave(1000000),1000011);
});

test('wave1000 can also be generated without losing or duplicating events',()=>{
 const t=new MatchTimeline(),events=t.advance(waveStartForWave(1000));
 assert.equal(t.wave,1000);assert.equal(events.at(-1).wave,1000);
 assert.equal(new Set(events.map(e=>e.id)).size,events.length);assert.ok(t.spawning.length<=3);
});

test('unsafe parameters and JS clock bounds fail explicitly, never simulate a final wave',()=>{
 for(const patch of [{waveStartInterval:0},{spawnInterval:0},{waves:[]},{waves:[{hp:0,count:1}]},
  {waves:[{hp:1,count:0}]},{extension:{hpGrowthMultiplier:1,countPerWave:1}}]){
  assert.throws(()=>new MatchTimeline({...pressureConfig,...patch}),RangeError);
 }
 for(const w of [0,-1,1.5,Infinity,NaN])assert.throws(()=>enemyCountForWave(w),RangeError);
 assert.throws(()=>waveStartForWave(Number.MAX_SAFE_INTEGER),RangeError);
 assert.equal(enemyHpForWave(Number.MAX_SAFE_INTEGER),Infinity);
 assert.ok(spawnIntervalForWave(Number.MAX_SAFE_INTEGER)>0);
 const t=new MatchTimeline();assert.throws(()=>t.advance(Number.MAX_SAFE_INTEGER+1),RangeError);
 assert.equal(t.elapsedMs,0);assert.equal(t.advance(9500)[0].id,1);
});

test('timeline owns a configuration snapshot and returns no shared event objects',()=>{
 const config=structuredClone(pressureConfig),a=new MatchTimeline(config),b=new MatchTimeline(config);
 config.firstEnemyDelay=1;config.waves[0].hp=1;
 const ea=a.advance(9500)[0],eb=b.advance(9500)[0];assert.deepEqual(ea,eb);assert.notEqual(ea,eb);
 ea.hpMultiplier=100;assert.equal(eb.hpMultiplier,enemyHpForWave(1)/combatConfig.enemy.maxHp);
 assert.equal(Math.round(eb.hpMultiplier*combatConfig.enemy.maxHp),enemyHpForWave(1));
 validatePressureConfig(pressureConfig);
});

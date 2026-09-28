import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({
 resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);},
 load(url,c,next){return url.endsWith('.ts')?{format:'module',shortCircuit:true,
  source:stripTypeScriptTypes(readFileSync(new URL(url),'utf8'),{mode:'transform'})}:next(url,c);},
});
const { AIController }=await import('../src/controllers/AIController.ts');
const { createDevelopmentAILoadout }=await import('../src/controllers/developmentLoadout.ts');
const { aiConfig }=await import('../src/config/ai.ts');
const { PlayerSide }=await import('../src/systems/PlayerSide.ts');
const { Match }=await import('../src/match/Match.ts');
const { testMap }=await import('../src/config/maps.ts');
const { waveConfig }=await import('../src/config/waves.ts');
const { createInventory,setEquipped,createLoadout }=await import('../src/systems/equipment.ts');
const { recruitmentPool }=await import('../src/systems/recruitment.ts');
const { tileBonusConfig }=await import('../src/config/tileBonuses.ts');
const { currentStateSnapshot, currentStateScore, emptyActionValue, placementValue }=await import('../src/controllers/aiEvaluation.ts');
const { getCombatStats }=await import('../src/config/combat.ts');
const slot=index=>({kind:'slot',index}),tile=index=>({kind:'tile',index});
const letter=(type,level=1)=>({kind:'heroLetter',type,level});
function kit(...ids){const inventory=createInventory();ids.forEach(id=>assert.equal(setEquipped(inventory,id,true),true));return createLoadout(inventory);}
function side(...ids){return new PlayerSide('top',testMap,kit(...ids),{automaticWaves:false});}
function run(ai,ms){for(let left=ms;left>0;left-=10)ai.update(Math.min(10,left));}
function advance(m,ms){for(let left=ms;left>0;left-=10)m.update(Math.min(10,left));}
const aiFor=side=>new AIController(side,()=>0);
function spy(s){const calls=[];for(const name of ['recruit','drop','useActiveItem','collectFarmerReward']){
 const actual=s[name].bind(s);s[name]=(...args)=>{const result=actual(...args);calls.push({name,args,result});return result;};}return calls;}
function hero(s){s.recruitment.slots[0]=letter('小');s.recruitment.slots[1]=letter('美');s.drop(slot(0),tile(0));s.drop(slot(1),tile(1));return [...s.heroes.links.values()][0];}
function quiet(loadout){return new Match(testMap,undefined,loadout,{...waveConfig,spawnInterval:1e9});}

test('live AI creation is a legal empty $20 / five slots / six ordinary open cells',()=>{
 const m=new Match(testMap,undefined,createDevelopmentAILoadout(()=>0));const ai=new AIController(m.topSide);m.bindController('top',ai);
 const s=m.topSide;assert.equal(s.recruitment.money,20);assert.deepEqual(s.recruitment.slots,Array(5).fill(null));
 assert.equal(s.board.tiles.filter(t=>t.unlocked).length,6);assert.equal(s.board.tiles.filter(t=>!t.unlocked).length,22);
 assert.ok(s.board.tiles.every(t=>!t.unit&&t.bonusType==='none'));assert.equal(s.heroes.links.size,0);assert.equal(s.farmers.states.size,0);
 assert.equal(s.combat.enemies.length,0);assert.equal(s.recruitment.successfulRecruits,0);
});
test('temporary loadout uses existing frozen equipment limits and varies without gifting units',()=>{
 const a=createDevelopmentAILoadout(()=>0),b=createDevelopmentAILoadout(()=>.999);
 assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.active)&&Object.isFrozen(a.passive));
 assert.equal(a.active.length,2);assert.equal(a.passive.length,3);assert.ok(a.passive.some(i=>i.id==='farmer'));assert.notDeepEqual(a,b);
 assert.equal(new Set(a.active.map(i=>i.id)).size,2);assert.equal(new Set(a.passive.map(i=>i.id)).size,3);
});
test('AI recruits only after delay with normal price, five replacements and no extra income',()=>{
 const s=side(),ai=aiFor(s),calls=spy(s),random=Math.random;
 try{Math.random=()=>0;run(ai,aiConfig.timing.initialReactionMs.min-1);assert.equal(calls.length,0);run(ai,1);
  assert.equal(calls[0].name,'recruit');assert.equal(s.recruitment.money,10);assert.equal(s.recruitment.nextCost,12);
  assert.equal(s.recruitment.successfulRecruits,1);assert.ok(s.recruitment.slots.every(i=>i.type==='刀'));
  s.recruitment.money=0;run(ai,12000);assert.equal(s.recruitment.successfulRecruits,1);assert.equal(s.recruitment.money,0);
 }finally{Math.random=random;}
});
test('AI recruitment preserves opening/frugal passives and full holding overwrite when no useful action',()=>{
 const s=side('opening_bonus','frugal_home'),ai=aiFor(s);
 s.board.tiles.forEach(t=>{if(t.unlocked)t.unit={type:'刀',level:5};});
 s.recruitment.slots=Array.from({length:5},()=>({type:'刀',level:5}));const old=[...s.recruitment.slots];
 s.board.tiles.forEach(t=>{t.unlocked=true;t.unit={type:'刀',level:5};}); // 满地测试布置，不是AI赠送。
 const random=Math.random;try{Math.random=()=>0;run(ai,aiConfig.timing.initialReactionMs.min);
  assert.equal(s.recruitment.money,20);assert.equal(s.recruitment.nextCost,12);assert.equal(s.recruitment.successfulRecruits,1);
  assert.ok(s.recruitment.slots.every((i,n)=>i!==old[n]));
 }finally{Math.random=random;}
});
test('AI deploys and merges through bound drop, then can improve a distant ordinary unit position',()=>{
 const s=side(),ai=aiFor(s),calls=spy(s);s.recruitment.money=0;
 s.recruitment.slots[0]={type:'刀',level:1};s.recruitment.slots[1]={type:'刀',level:1};
 run(ai,2000);assert.ok(calls.some(c=>c.name==='drop'&&c.result==='merge'));assert.ok(calls.some(c=>c.result==='move'));
 assert.ok(s.board.tiles.some(t=>t.unit?.level===2));
 const far=s.board.tiles.findIndex((_,i)=>i===14);s.board.tiles[far].unlocked=true;
 const unit={type:'骑',level:1};s.board.tiles[far].unit=unit;run(ai,aiConfig.timing.ordinaryActionMs.min);
 assert.equal(s.board.tiles[far].unit,null);assert.ok(s.board.tiles.some(t=>t.unit===unit));
});
test('AI forms logical left-to-right hero from holding without changing activation rules',()=>{
 const s=side(),ai=aiFor(s);s.recruitment.money=0;
 s.recruitment.slots[0]=letter('美');s.recruitment.slots[1]=letter('小');run(ai,2400);
 const link=[...s.heroes.links.values()][0];assert.equal(link.heroId,'xiaomei');assert.equal(link.left.type,'小');assert.equal(link.right.type,'美');
 assert.equal(link.origin.y,testMap.cells[link.leftIndex].y);assert.equal(testMap.cells[link.rightIndex].x-testMap.cells[link.leftIndex].x,testMap.cellSize);
});
test('AI necessary swap can complete a hero via shared rules',()=>{
 const s=side(),ai=aiFor(s);s.recruitment.money=0;
 s.recruitment.slots[0]=letter('小');s.drop(slot(0),tile(0));s.recruitment.slots[0]={type:'刀',level:1};s.drop(slot(0),tile(1));
 s.recruitment.slots[0]=letter('美');const calls=spy(s);run(ai,aiConfig.timing.initialReactionMs.min);
 assert.equal(calls[0].result,'swap');assert.equal(s.recruitment.slots[0].type,'刀');assert.equal(s.heroes.links.size,1);
});
test('AI protects both active letters from move, swap, merge-source and selling; same-letter upgrade remains legal',()=>{
 const s=side('golden_hand'),link=hero(s),ai=aiFor(s);s.recruitment.money=0;
 s.recruitment.slots[0]=letter('小');const calls=spy(s);run(ai,aiConfig.timing.initialReactionMs.min);
 assert.equal(link.left.level,2);assert.equal(link.right.level,2);assert.equal([...s.heroes.links.values()][0],link);
 s.recruitment.slots.fill({type:'骑',level:5});s.board.tiles.forEach((t,i)=>{t.unlocked=true;if(i!==0&&i!==1)t.unit={type:'刀',level:5};});
 run(ai,100);assert.equal([...s.heroes.links.values()][0],link);
 assert.ok(calls.filter(c=>c.name==='drop').every(c=>c.args[0].kind!=='tile'||![0,1].includes(c.args[0].index)));
 assert.ok(calls.filter(c=>c.name==='useActiveItem').every(c=>c.args[1].kind!=='tile'||![0,1].includes(c.args[1].index)));
});
test('AI level-five material is never swallowed by an illegal merge',()=>{
 const s=side(),ai=aiFor(s);s.recruitment.money=0;
 const a={type:'刀',level:5},b={type:'刀',level:5};s.recruitment.slots[0]=a;s.recruitment.slots[1]=b;
 run(ai,aiConfig.timing.initialReactionMs.min);assert.ok([...s.recruitment.slots,...s.board.tiles.map(t=>t.unit)].includes(a));
 assert.ok([...s.recruitment.slots,...s.board.tiles.map(t=>t.unit)].includes(b));assert.ok(s.board.tiles.every(t=>!t.unit||t.unit.level<=5));
});
test('AI shovel consumes only successful unlock and uses existing controllable golden-shovel RNG',()=>{
 const s=side('golden_shovel'),ai=aiFor(s);s.recruitment.money=0;s.recruitment.slots[0]='铲';
 const random=Math.random;try{Math.random=()=>0;const calls=spy(s);run(ai,aiConfig.timing.initialReactionMs.min);
  const call=calls.find(c=>c.result==='unlock');assert.ok(call);assert.equal(s.recruitment.slots[0],null);
  assert.equal(s.board.tiles.filter(t=>t.unlocked).length,7);assert.equal(s.board.tiles[call.args[1].index].bonusType,tileBonusConfig.types[0]);
  s.recruitment.slots[0]='铲';assert.equal(s.drop(slot(0),tile(0)),'invalid');assert.equal(s.recruitment.slots[0],'铲');
 }finally{Math.random=random;}
});
test('AI Farmer comes only from equipped recruitment pool and follows deploy / merge / collect',()=>{
 assert.equal(recruitmentPool(kit()).some(i=>i.value==='农'),false);assert.ok(recruitmentPool(kit('farmer')).some(i=>i.value==='农'));
 const s=side('farmer'),ai=aiFor(s);const random=Math.random;
 try{Math.random=()=>.999;run(ai,aiConfig.timing.initialReactionMs.min);assert.ok(s.recruitment.slots.every(i=>i.kind==='farmer'));
  s.drop(slot(0),tile(0));s.updateItems(12000);const calls=spy(s);const before=s.recruitment.money;
  run(ai,aiConfig.timing.initialReactionMs.min);assert.equal(calls[0].name,'collectFarmerReward');assert.ok(s.recruitment.money>before);
 }finally{Math.random=random;}
});
test('expired Farmer pending cannot be collected by delayed AI and does not become ghost income',()=>{
 const s=side('farmer'),ai=aiFor(s);s.recruitment.money=0;s.recruitment.slots[0]={kind:'farmer',type:'农',level:1};s.drop(slot(0),tile(0));
 s.updateItems(12000);const farmer=s.board.tiles[0].unit,id=s.farmers.states.get(farmer).reward.id;
 ai.update(1);s.updateItems(5000);run(ai,aiConfig.timing.initialReactionMs.min);assert.equal(s.recruitment.money,0);assert.equal(s.collectFarmerReward(farmer,id),false);
});
for(const id of ['upgrade_talisman','haste_edict','golden_hand'])test('AI uses equipped '+id+' via shared canUse/use and normal CD',()=>{
 const s=side(id),ai=aiFor(s);s.recruitment.money=0;
 s.recruitment.slots[0]={type:'刀',level:1};s.drop(slot(0),tile(0));
 if(id==='golden_hand'){
  s.board.tiles.forEach(t=>{t.unlocked=true;if(!t.unit)t.unit={type:'刀',level:5};});
  s.recruitment.slots=Array.from({length:5},()=>({kind:'heroLetter',type:'美',level:5}));
 }
 const calls=spy(s);if(id!=='golden_hand'){ai.update(1);assert.equal(calls.some(c=>c.name==='useActiveItem'),false);s.activeItems.update(20000);}
 run(ai,aiConfig.timing.initialReactionMs.min);assert.ok(calls.some(c=>c.name==='useActiveItem'&&c.result));
 if(id==='upgrade_talisman')assert.equal(s.board.tiles[0].unit.level,2);
 if(id==='haste_edict')assert.equal(s.board.tiles[0].unit.hasteEnhanced,true);
 if(id==='golden_hand')assert.equal(s.recruitment.money,1);
 assert.equal(s.activeItems.slots[0].remainingMs,id==='golden_hand'?0:20000);
});
test('canUse is side-effect-free including HeroLink, skill, EXP, participation, haste and cooldown',()=>{
 const s=side('haste_edict','upgrade_talisman'),link=hero(s);link.currentExp=10;s.heroes.recordDamage(1,link,1);s.activeItems.update(20000);
 const before=JSON.stringify({board:s.board,state:s.recruitment,slots:s.activeItems.slots,link}),skill=link.skill;
 for(let i=0;i<10;i++){assert.equal(s.canUseActiveItem(0,tile(0)),true);assert.equal(s.canUseActiveItem(1,tile(1)),true);}
 assert.equal(JSON.stringify({board:s.board,state:s.recruitment,slots:s.activeItems.slots,link}),before);
 assert.equal(link.skill,skill);assert.equal(s.heroes.hasHaste('xiaomei'),false);
 const hasteIndex=s.activeItems.slots.findIndex(i=>i.id==='haste_edict');
 assert.equal(s.useActiveItem(hasteIndex,tile(0)),true);assert.equal(s.canUseActiveItem(hasteIndex,tile(0)),false);
 s.heroes.awardKill(1,1);assert.equal(link.currentExp,11);
});
test('canUse never creates a Link or synchronizes levels during a query',()=>{
 const s=side('haste_edict');s.board.tiles[0].unit=letter('小',3);s.board.tiles[1].unit=letter('美');s.activeItems.update(20000);
 assert.equal(s.canUseActiveItem(0,tile(0)),false);assert.equal(s.heroes.links.size,0);assert.equal(s.board.tiles[1].unit.level,1);
});
test('delayed source replacement cancels rather than moving the new occupant',()=>{
 const s=side(),ai=aiFor(s);s.recruitment.money=0;s.recruitment.slots[0]={type:'刀',level:1};ai.update(1);
 const replacement={type:'弓',level:1};s.recruitment.slots[0]=replacement;run(ai,aiConfig.timing.initialReactionMs.min);assert.equal(s.recruitment.slots[0],replacement);
 assert.ok(s.board.tiles.every(t=>!t.unit));
});
test('delayed target becoming level five cancels item without consuming ready',()=>{
 const s=side('upgrade_talisman'),ai=aiFor(s);s.recruitment.money=0;
 s.recruitment.slots[0]={type:'刀',level:4};s.drop(slot(0),tile(0));s.activeItems.update(20000);ai.update(1);
 s.board.tiles[0].unit.level=5;run(ai,aiConfig.timing.initialReactionMs.min);assert.equal(s.board.tiles[0].unit.level,5);assert.equal(s.activeItems.slots[0].remainingMs,0);
});
test('Match logical delay is frame-independent and pause/resume preserves remaining delay',()=>{
 const a=quiet(),b=quiet();a.bindController('top',aiFor(a.topSide));b.bindController('top',aiFor(b.topSide));
 advance(a,300);a.pause();advance(a,10000);assert.equal(a.topSide.recruitment.successfulRecruits,0);
 a.resume();advance(a,900);advance(b,1200);
 assert.equal(a.topSide.recruitment.successfulRecruits,1);assert.equal(b.topSide.recruitment.successfulRecruits,1);
 assert.equal(a.timeline.elapsedMs,b.timeline.elapsedMs);
});
test('result stops pending actions at same logical step, never granting final-frame recruitment',()=>{
 const m=quiet(),ai=aiFor(m.topSide);m.bindController('top',ai);advance(m,50);
 for(let i=0;i<3;i++){const e=m.bottomSide.combat.spawnEnemy();e.distance=m.bottomSide.combat.path.totalLength-.001;}
 advance(m,20);assert.equal(m.status,'ended');ai.update(10000);assert.equal(m.topSide.recruitment.successfulRecruits,0);
 assert.equal(ai.pending,null);
});
test('destroy/restart invalidates old AI pending and creates clean new AI; no timers',()=>{
 const m=quiet(),old=new AIController(m.topSide);m.bindController('top',old);advance(m,300);m.destroy();
 const fresh=quiet(),ai=aiFor(fresh.topSide);fresh.bindController('top',ai);
 old.update(10000);m.update(10000);assert.equal(fresh.topSide.recruitment.money,20);assert.equal(fresh.topSide.recruitment.successfulRecruits,0);
 assert.equal(old.pending,null);advance(fresh,aiConfig.timing.initialReactionMs.min-10);assert.equal(fresh.topSide.recruitment.successfulRecruits,0);
 advance(fresh,10);assert.equal(fresh.topSide.recruitment.successfulRecruits,1);
});
test('AI operations cannot change bottom wallet/holding/board/Farmer/EXP/item runtime',()=>{
 const m=quiet(kit('farmer','upgrade_talisman'));hero(m.bottomSide);
 const snapshot=()=>JSON.stringify({state:m.bottomSide.recruitment,board:m.bottomSide.board,links:[...m.bottomSide.heroes.links.values()],items:m.bottomSide.activeItems.slots,farmers:[...m.bottomSide.farmers.states]});
 const before=snapshot(),ai=aiFor(m.topSide);run(ai,2000);assert.equal(snapshot(),before);
});
test('AI has no bottom/Match/timeline access, future RNG probes, direct state writes or independent timers',()=>{
 const source=readFileSync(new URL('../src/controllers/AIController.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.bottomSide|\.timeline|Math\.random\s*\(|setTimeout|addEvent|\.money\s*\+=|\.money\s*=|\.unit\s*=/);
 const s=side();let reads=0,timingReads=0;const random=Math.random;
 try{Math.random=()=>{reads++;return 0;};const ai=new AIController(s,()=>{timingReads++;return 0;});run(ai,aiConfig.timing.initialReactionMs.min-1);assert.equal(reads,0);
  run(ai,1);assert.equal(reads,5);assert.equal(timingReads,1);
 }finally{Math.random=random;}
});

test('AI timing ranges are centralized and replace the former fixed 600ms delay',()=>{
 assert.equal('actionDelayMs' in aiConfig,false);
 assert.deepEqual(aiConfig.timing,{
  initialReactionMs:{min:900,max:1600},ordinaryActionMs:{min:800,max:1600},
  recruitObservationMs:{min:800,max:1500},shovelActionMs:{min:1000,max:1900},
 });
 assert.deepEqual(aiConfig.scores,{collect:140,merge:120,hero:110,item:95,unlock:80,
  deploy:60,letter:35,preparePair:15,improvePosition:25,sell:20,recruit:10,proximity:5});
});

test('initial reaction delay samples the inclusive configured range before first action',()=>{
 for(const [sample,expected] of [[0,900],[.9999,1600]]){
  const s=side(),calls=spy(s),ai=new AIController(s,()=>sample);
  ai.update(1);assert.equal(ai.pending.remainingMs,expected-1);assert.equal(calls.length,0);
  run(ai,expected-2);assert.equal(calls.length,0);run(ai,1);
  assert.equal(calls[0].name,'recruit');assert.equal(s.recruitment.successfulRecruits,1);
 }
});

test('ordinary action delays are resampled and timing RNG changes timing without changing selected action',()=>{
 const results=[];
 for(const sample of [0,.9999]){
  const s=side(),ai=new AIController(s,(()=>{const values=[0,sample];return()=>values.shift()??sample;})());
  s.recruitment.money=0;s.recruitment.slots[0]={type:'刀',level:1};s.recruitment.slots[1]={type:'刀',level:1};
  ai.update(1);const initial=ai.pending.candidate.action;assert.equal(initial.action,'merge');
  run(ai,aiConfig.timing.initialReactionMs.min-1);ai.update(1);
  assert.equal(ai.pending.candidate.action.kind,'drop');assert.equal(ai.pending.candidate.action.action,'move');
  results.push(ai.pending.remainingMs);
 }
 assert.deepEqual(results,[aiConfig.timing.ordinaryActionMs.min-1,aiConfig.timing.ordinaryActionMs.max-1]);
});

test('successful recruit schedules the next action from the recruit observation range only',()=>{
 const s=side(),values=[0,.5],ai=new AIController(s,()=>values.shift()??0);
 ai.update(1);run(ai,aiConfig.timing.initialReactionMs.min-1);
 assert.equal(s.recruitment.successfulRecruits,1);
 ai.update(1);
 const sampled=aiConfig.timing.recruitObservationMs.min
  +Math.floor(.5*(aiConfig.timing.recruitObservationMs.max-aiConfig.timing.recruitObservationMs.min+1));
 assert.equal(ai.pending.remainingMs,sampled-1);
});

test('shovel candidate receives the dedicated slower timing range',()=>{
 const s=side(),values=[0,.25],ai=new AIController(s,()=>values.shift()??0);s.recruitment.money=0;
 s.recruitment.slots[0]={type:'刀',level:1};s.recruitment.slots[1]={type:'刀',level:1};s.recruitment.slots[2]='铲';
 ai.update(1);run(ai,aiConfig.timing.initialReactionMs.min-1);assert.equal(s.recruitment.slots[2],'铲');
 // 已处理普通兵并填满开放土地，铲地现在有实际空间价值。
 s.board.tiles.forEach(t=>{if(t.unlocked)t.unit={type:'弓',level:5};});s.recruitment.slots[1]=null;
 ai.update(1);assert.equal(ai.pending.candidate.action.action,'unlock');
 assert.equal(ai.pending.remainingMs,aiConfig.timing.shovelActionMs.min
  +Math.floor(.25*(aiConfig.timing.shovelActionMs.max-aiConfig.timing.shovelActionMs.min+1))-1);
});

test('pause freezes the exact pending remainder; resume continues without a new sample',()=>{
 const s=side(),samples=[0,.8],ai=new AIController(s,()=>samples.shift()??.8),calls=spy(s);
 ai.update(1);run(ai,399);const remaining=ai.pending.remainingMs;assert.equal(remaining,aiConfig.timing.initialReactionMs.min-400);
 s.pause();ai.update(30000);assert.equal(ai.pending.remainingMs,remaining);assert.equal(calls.length,0);
 s.resume();run(ai,remaining-1);assert.equal(calls.length,0);ai.update(1);
 assert.equal(calls[0].name,'recruit');assert.equal(samples.length,1);
});

test('timing RNG is independent of recruit RNG and each new pending action takes a fresh sample',()=>{
 const s=side(),samples=[0,0,.999],calls=spy(s);let timingDraws=0,ruleDraws=0;
 const ruleRandom=Math.random;Math.random=()=>{ruleDraws++;return 0;};
 try{
  const ai=new AIController(s,()=>{timingDraws++;return samples.shift()??.999;});
  run(ai,aiConfig.timing.initialReactionMs.min);assert.equal(calls[0].name,'recruit');
  assert.equal(ruleDraws,5);assert.equal(timingDraws,1);
  ai.update(1);assert.equal(timingDraws,2);
  const firstObservation=ai.pending.remainingMs;
  assert.equal(firstObservation,aiConfig.timing.recruitObservationMs.min-1);
  // 观察后先处理当前牌，下一张新 pending 再独立抽样。
  run(ai,firstObservation);assert.equal(s.recruitment.successfulRecruits,1);
  ai.update(1);assert.equal(timingDraws,3);
  assert.ok(ai.pending.remainingMs>=aiConfig.timing.ordinaryActionMs.min-1);
 }finally{Math.random=ruleRandom;}
});

const candidates=s=>aiFor(s).candidates();
const best=s=>candidates(s).sort((a,b)=>b.score-a.score)[0];
function pressure(s,progress=0){const e=s.combat.spawnEnemy();e.distance=s.combat.path.totalLength*progress;return e;}
const farmer=()=>({kind:'farmer',type:'农',level:1});

test('current-state snapshot reads living enemies, progress, own defense, holding and free space without mutation',()=>{
 const s=side();pressure(s,.8);const dead=pressure(s,.95);dead.hp=0;
 s.recruitment.slots[0]={type:'刀',level:1};s.recruitment.slots[1]=farmer();
 const before=JSON.stringify({board:s.board,state:s.recruitment,enemies:s.combat.enemies});
 const raw=candidates(s),state=currentStateSnapshot(s,raw.map(c=>c.value),false);
 assert.equal(state.livingEnemyCount,1);assert.equal(state.enemyProgress,.8);
 assert.equal(state.deployedAttackers,0);assert.equal(state.activeHeroes,0);assert.equal(state.readiness,'LOW');
 assert.equal(state.occupiedHolding,2);assert.equal(state.emptyTiles,6);assert.equal(state.hasCombatDeployment,true);
 assert.notEqual(state.holding,s.recruitment.slots);assert.equal(JSON.stringify({board:s.board,state:s.recruitment,enemies:s.combat.enemies}),before);
});

test('empty defense with enemies prioritizes immediate ordinary deployment over Farmer, sleeping letter and shovel',()=>{
 const s=side('farmer');s.recruitment.money=0;pressure(s);
 s.recruitment.slots=[farmer(),farmer(),letter('小'),letter('六'),{type:'刀',level:1}];
 const chosen=best(s);assert.equal(chosen.action.kind,'drop');assert.equal(chosen.action.source.index,4);
 assert.equal(chosen.value.combat,'deploy');
 const calls=spy(s);run(aiFor(s),aiConfig.timing.initialReactionMs.min);
 assert.equal(calls[0].result,'move');assert.equal(calls[0].args[0].index,4);
 assert.ok(s.board.tiles.some(t=>t.unit?.type==='刀'));
});

test('completing a currently legal hero competes as immediate combat rather than sleeping-letter deployment',()=>{
 const s=side();s.recruitment.money=0;pressure(s);
 s.recruitment.slots[0]=letter('小');s.drop(slot(0),tile(0));
 s.recruitment.slots=[letter('美'),farmer(),{type:'刀',level:1},null,null];
 const chosen=best(s);assert.equal(chosen.value.combat,'hero');assert.equal(chosen.action.source.index,0);
 run(aiFor(s),aiConfig.timing.initialReactionMs.min);assert.equal(s.heroes.links.size,1);
 assert.equal([...s.heroes.links.values()][0].heroId,'xiaomei');
});

test('a lone sleeping letter does not count as an attacker or outrank a combat unit under current pressure',()=>{
 const s=side();pressure(s,.7);s.recruitment.slots=[letter('阿'),{type:'弓',level:1},null,null,null];
 s.drop(slot(0),tile(0));s.recruitment.slots[0]=letter('六');
 const raw=candidates(s),state=currentStateSnapshot(s,raw.map(c=>c.value),false);
 assert.equal(state.deployedAttackers,0);assert.equal(state.activeHeroes,0);
 assert.equal(best(s).action.source.index,1);
});

test('established defense restores normal construction value instead of permanently suppressing Farmer or hero preparation',()=>{
 const s=side();pressure(s);s.recruitment.money=0;
 s.recruitment.slots=[{type:'刀',level:2},{type:'弓',level:2},null,null,null];s.drop(slot(0),tile(0));s.drop(slot(1),tile(2));
 s.recruitment.slots=[farmer(),letter('阿'),null,null,null];
 const raw=candidates(s),state=currentStateSnapshot(s,raw.map(c=>c.value),false);
 assert.equal(state.readiness,'OK');assert.equal(best(s).action.source.index,0);
 const construction={...emptyActionValue(),construction:true};
 const calmScore=currentStateScore(60,'drop',construction,state);
 assert.equal(calmScore,60);assert.ok(calmScore>currentStateScore(60,'drop',construction,{...state,readiness:'LOW'}));
});

test('shovel loses to immediate deployment with free land, but gains value when open land is scarce',()=>{
 const s=side();s.recruitment.money=0;pressure(s);s.recruitment.slots=['铲',{type:'刀',level:1},null,null,null];
 assert.equal(best(s).value.combat,'deploy');
 const early=candidates(s).find(c=>c.value.unlock).score;
 s.board.tiles.forEach(t=>{if(t.unlocked)t.unit=farmer();});
 const chosen=best(s);assert.equal(chosen.action.action,'unlock');assert.ok(chosen.score>early);
});

test('a deployed combat merge gains more immediate value than a holding-only or Farmer merge',()=>{
 const s=side();s.recruitment.money=0;pressure(s);
 s.recruitment.slots=[{type:'刀',level:1},{type:'刀',level:1},farmer(),farmer(),null];s.drop(slot(0),tile(0));
 const raw=candidates(s),battle=raw.find(c=>c.value.combat==='merge'),economy=raw.find(c=>c.action.action==='merge'&&!c.value.combat);
 assert.ok(battle.score>economy.score);assert.equal(best(s).value.combat,'merge');
 run(aiFor(s),aiConfig.timing.initialReactionMs.min);assert.equal(s.board.tiles[0].unit.level,2);
});

test('holding combat merge remains worthwhile without classifying it as a deployed attacker',()=>{
 const s=side();pressure(s);s.recruitment.slots=[{type:'枪',level:1},{type:'枪',level:1},null,null,null];
 const raw=candidates(s);assert.ok(raw.some(c=>c.value.combat==='holdingMerge'));
 const state=currentStateSnapshot(s,raw.map(c=>c.value),true);assert.equal(state.deployedAttackers,0);assert.equal(state.hasImmediateMerge,true);
});

test('near-full holding rewards legal space release using current contents only',()=>{
 const s=side();s.recruitment.money=0;s.recruitment.slots=[{type:'刀',level:1},letter('阿'),farmer(),null,null];
 const low=candidates(s).find(c=>c.action.source?.index===0&&c.action.target?.index===0&&c.action.target?.kind==='tile');
 s.recruitment.slots[3]='铲';const high=candidates(s).find(c=>c.action.source?.index===0&&c.action.target?.index===0&&c.action.target?.kind==='tile');
 assert.ok(Math.abs(high.score-low.score-aiConfig.evaluation.space.release)<1e-8);
});

test('useful current merge is processed before recruit; empty or exhausted holding can refresh with real money',()=>{
 const s=side();s.recruitment.money=100;s.recruitment.slots=[{type:'刀',level:1},{type:'刀',level:1},null,null,null];
 assert.equal(best(s).action.action,'merge');
 const empty=side();assert.equal(best(empty).action.kind,'recruit');
 empty.board.tiles.forEach(t=>{t.unlocked=true;t.unit={type:'弓',level:5};});
 empty.recruitment.slots=Array.from({length:5},()=>({type:'弓',level:5}));
 assert.equal(best(empty).action.kind,'recruit');
 const calls=spy(empty);run(aiFor(empty),aiConfig.timing.initialReactionMs.min);assert.equal(calls[0].name,'recruit');
 assert.equal(empty.recruitment.money,10);assert.equal(empty.recruitment.nextCost,12);
});

test('current enemy progress and count increase pressure without changing action timing or game stats',()=>{
 const s=side();s.recruitment.slots[0]={type:'刀',level:1};pressure(s);
 const score=best(s).score;s.combat.enemies[0].distance=s.combat.path.totalLength*.8;
 assert.ok(best(s).score>score);
 for(let i=0;i<4;i++)pressure(s,.8);
 const raw=candidates(s),state=currentStateSnapshot(s,raw.map(c=>c.value),false);
 assert.equal(state.livingEnemyCount,5);assert.equal(state.readiness,'LOW');
 const ai=aiFor(s);ai.update(1);assert.equal(ai.pending.remainingMs,aiConfig.timing.initialReactionMs.min-1);
 assert.equal(s.combat.enemies[0].maxHp,90);
});

test('Farmer pending reward stays ahead of current combat construction and is collected via shared operation',()=>{
 const s=side('farmer');s.recruitment.money=0;s.recruitment.slots[0]=farmer();s.drop(slot(0),tile(2));s.updateItems(12000);
 pressure(s,.8);s.recruitment.slots=[{type:'刀',level:1},letter('小'),letter('美'),null,null];
 assert.equal(best(s).action.kind,'collect');const calls=spy(s);run(aiFor(s),aiConfig.timing.initialReactionMs.min);
 assert.equal(calls[0].name,'collectFarmerReward');assert.equal(s.recruitment.money,1);
});

test('placement preferences are small, range-aware and do not override immediate combat urgency',()=>{
 for(const type of ['刀','枪','弓','骑']){
  const stats=getCombatStats({type,level:1});
  const near=placementValue(testMap,testMap.cells[0],stats.range,type,[]);
  const far=placementValue(testMap,{x:10000,y:10000},stats.range,type,[]);
  assert.ok(near>far);assert.ok(near<=aiConfig.evaluation.placement.maximumBonus);assert.equal(far,0);
 }
});

test('ordinary relocation requires monotonic path improvement so it cannot bounce A to B then B to A',()=>{
 const s=side();s.recruitment.money=0;s.board.tiles[14].unlocked=true;
 s.recruitment.slots[0]={type:'刀',level:1};s.drop(slot(0),tile(14));const ai=aiFor(s),calls=spy(s);
 run(ai,aiConfig.timing.initialReactionMs.min);
 const moves=calls.filter(c=>c.result==='move');assert.equal(moves.length,1);
 assert.notEqual(moves[0].args[1].index,14);assert.ok(!candidates(s).some(c=>c.action.target?.kind==='tile'&&c.action.target.index===14));
});

test('current-state evaluation never reads other side or future state, and all successful choices use bound operations',()=>{
 const source=readFileSync(new URL('../src/controllers/aiEvaluation.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.bottomSide|\.timeline|Math\.random\s*\(|spawnEnemy\s*\(|\.money\s*=|\.unit\s*=/);
 const m=quiet();m.topSide.recruitment.slots=[farmer(),letter('阿'),{type:'枪',level:1},null,null];pressure(m.topSide,.6);
 const before=JSON.stringify({state:m.bottomSide.recruitment,board:m.bottomSide.board,enemies:m.bottomSide.combat.enemies});
 const calls=spy(m.topSide);run(aiFor(m.topSide),aiConfig.timing.initialReactionMs.min);
 assert.equal(calls[0].name,'drop');assert.equal(calls[0].args[0].index,2);
 assert.equal(JSON.stringify({state:m.bottomSide.recruitment,board:m.bottomSide.board,enemies:m.bottomSide.combat.enemies}),before);
});

test('ordinary units outside all path coverage do not falsely count as an established defense',()=>{
 const s=side();pressure(s);
 const far=testMap.cells.map((point,index)=>({point,index})).filter(({point})=>
  placementValue(testMap,point,getCombatStats({type:'刀',level:1}).range,'刀',[])===0).slice(0,2);
 assert.equal(far.length,2);
 far.forEach(({index})=>{s.board.tiles[index].unlocked=true;s.board.tiles[index].unit={type:'刀',level:1};});
 const state=currentStateSnapshot(s,[],false);
 assert.equal(state.deployedAttackers,2);assert.equal(state.effectiveAttackers,0);assert.equal(state.readiness,'LOW');
});

test('a deployment unable to reach the path does not receive the immediate-defense bonus',()=>{
 const s=side();pressure(s);s.recruitment.slots[0]={type:'刀',level:1};
 const far=testMap.cells.findIndex(point=>placementValue(testMap,point,getCombatStats({type:'刀',level:1}).range,'刀',[])===0);
 s.board.tiles[far].unlocked=true;
 const chosen=candidates(s).find(c=>c.action.source?.kind==='slot'&&c.action.source.index===0
  &&c.action.target?.kind==='tile'&&c.action.target.index===far);
 assert.equal(chosen.value.combat,null);assert.ok(chosen.score<best(s).score);
 assert.equal(best(s).value.combat,'deploy');
});

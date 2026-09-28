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
const slot=index=>({kind:'slot',index}),tile=index=>({kind:'tile',index});
const letter=(type,level=1)=>({kind:'heroLetter',type,level});
function kit(...ids){const inventory=createInventory();ids.forEach(id=>assert.equal(setEquipped(inventory,id,true),true));return createLoadout(inventory);}
function side(...ids){return new PlayerSide('top',testMap,kit(...ids),{automaticWaves:false});}
function run(ai,ms){for(let left=ms;left>0;left-=10)ai.update(Math.min(10,left));}
function advance(m,ms){for(let left=ms;left>0;left-=10)m.update(Math.min(10,left));}
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
 const s=side(),ai=new AIController(s),calls=spy(s),random=Math.random;
 try{Math.random=()=>0;run(ai,aiConfig.actionDelayMs-10);assert.equal(calls.length,0);run(ai,10);
  assert.equal(calls[0].name,'recruit');assert.equal(s.recruitment.money,10);assert.equal(s.recruitment.nextCost,12);
  assert.equal(s.recruitment.successfulRecruits,1);assert.ok(s.recruitment.slots.every(i=>i.type==='刀'));
  s.recruitment.money=0;run(ai,12000);assert.equal(s.recruitment.successfulRecruits,1);assert.equal(s.recruitment.money,0);
 }finally{Math.random=random;}
});
test('AI recruitment preserves opening/frugal passives and full holding overwrite when no useful action',()=>{
 const s=side('opening_bonus','frugal_home'),ai=new AIController(s,10);
 s.board.tiles.forEach(t=>{if(t.unlocked)t.unit={type:'刀',level:5};});
 s.recruitment.slots=Array.from({length:5},()=>({type:'刀',level:5}));const old=[...s.recruitment.slots];
 s.board.tiles.forEach(t=>{t.unlocked=true;t.unit={type:'刀',level:5};}); // 满地测试布置，不是AI赠送。
 const random=Math.random;try{Math.random=()=>0;ai.update(10);
  assert.equal(s.recruitment.money,20);assert.equal(s.recruitment.nextCost,12);assert.equal(s.recruitment.successfulRecruits,1);
  assert.ok(s.recruitment.slots.every((i,n)=>i!==old[n]));
 }finally{Math.random=random;}
});
test('AI deploys and merges through bound drop, then can improve a distant ordinary unit position',()=>{
 const s=side(),ai=new AIController(s,10),calls=spy(s);s.recruitment.money=0;
 s.recruitment.slots[0]={type:'刀',level:1};s.recruitment.slots[1]={type:'刀',level:1};
 run(ai,20);assert.ok(calls.some(c=>c.name==='drop'&&c.result==='merge'));assert.ok(calls.some(c=>c.result==='move'));
 assert.ok(s.board.tiles.some(t=>t.unit?.level===2));
 const far=s.board.tiles.findIndex((_,i)=>i===14);s.board.tiles[far].unlocked=true;
 const unit={type:'骑',level:1};s.board.tiles[far].unit=unit;run(ai,100);
 assert.equal(s.board.tiles[far].unit,null);assert.ok(s.board.tiles.some(t=>t.unit===unit));
});
test('AI forms logical left-to-right hero from holding without changing activation rules',()=>{
 const s=side(),ai=new AIController(s,10);s.recruitment.money=0;
 s.recruitment.slots[0]=letter('美');s.recruitment.slots[1]=letter('小');run(ai,40);
 const link=[...s.heroes.links.values()][0];assert.equal(link.heroId,'xiaomei');assert.equal(link.left.type,'小');assert.equal(link.right.type,'美');
 assert.equal(link.origin.y,testMap.cells[link.leftIndex].y);assert.equal(testMap.cells[link.rightIndex].x-testMap.cells[link.leftIndex].x,testMap.cellSize);
});
test('AI necessary swap can complete a hero via shared rules',()=>{
 const s=side(),ai=new AIController(s,10);s.recruitment.money=0;
 s.recruitment.slots[0]=letter('小');s.drop(slot(0),tile(0));s.recruitment.slots[0]={type:'刀',level:1};s.drop(slot(0),tile(1));
 s.recruitment.slots[0]=letter('美');const calls=spy(s);ai.update(10);
 assert.equal(calls[0].result,'swap');assert.equal(s.recruitment.slots[0].type,'刀');assert.equal(s.heroes.links.size,1);
});
test('AI protects both active letters from move, swap, merge-source and selling; same-letter upgrade remains legal',()=>{
 const s=side('golden_hand'),link=hero(s),ai=new AIController(s,10);s.recruitment.money=0;
 s.recruitment.slots[0]=letter('小');const calls=spy(s);ai.update(10);
 assert.equal(link.left.level,2);assert.equal(link.right.level,2);assert.equal([...s.heroes.links.values()][0],link);
 s.recruitment.slots.fill({type:'骑',level:5});s.board.tiles.forEach((t,i)=>{t.unlocked=true;if(i!==0&&i!==1)t.unit={type:'刀',level:5};});
 run(ai,100);assert.equal([...s.heroes.links.values()][0],link);
 assert.ok(calls.filter(c=>c.name==='drop').every(c=>c.args[0].kind!=='tile'||![0,1].includes(c.args[0].index)));
 assert.ok(calls.filter(c=>c.name==='useActiveItem').every(c=>c.args[1].kind!=='tile'||![0,1].includes(c.args[1].index)));
});
test('AI level-five material is never swallowed by an illegal merge',()=>{
 const s=side(),ai=new AIController(s,10);s.recruitment.money=0;
 const a={type:'刀',level:5},b={type:'刀',level:5};s.recruitment.slots[0]=a;s.recruitment.slots[1]=b;
 run(ai,100);assert.ok([...s.recruitment.slots,...s.board.tiles.map(t=>t.unit)].includes(a));
 assert.ok([...s.recruitment.slots,...s.board.tiles.map(t=>t.unit)].includes(b));assert.ok(s.board.tiles.every(t=>!t.unit||t.unit.level<=5));
});
test('AI shovel consumes only successful unlock and uses existing controllable golden-shovel RNG',()=>{
 const s=side('golden_shovel'),ai=new AIController(s,10);s.recruitment.money=0;s.recruitment.slots[0]='铲';
 const random=Math.random;try{Math.random=()=>0;const calls=spy(s);ai.update(10);
  const call=calls.find(c=>c.result==='unlock');assert.ok(call);assert.equal(s.recruitment.slots[0],null);
  assert.equal(s.board.tiles.filter(t=>t.unlocked).length,7);assert.equal(s.board.tiles[call.args[1].index].bonusType,tileBonusConfig.types[0]);
  s.recruitment.slots[0]='铲';assert.equal(s.drop(slot(0),tile(0)),'invalid');assert.equal(s.recruitment.slots[0],'铲');
 }finally{Math.random=random;}
});
test('AI Farmer comes only from equipped recruitment pool and follows deploy / merge / collect',()=>{
 assert.equal(recruitmentPool(kit()).some(i=>i.value==='农'),false);assert.ok(recruitmentPool(kit('farmer')).some(i=>i.value==='农'));
 const s=side('farmer'),ai=new AIController(s,10);const random=Math.random;
 try{Math.random=()=>.999;ai.update(10);assert.ok(s.recruitment.slots.every(i=>i.kind==='farmer'));run(ai,100);
  assert.ok([...s.farmers.states.keys()].length);s.updateItems(12000);const calls=spy(s);const before=s.recruitment.money;
  ai.update(10);assert.equal(calls[0].name,'collectFarmerReward');assert.ok(s.recruitment.money>before);
 }finally{Math.random=random;}
});
test('expired Farmer pending cannot be collected by delayed AI and does not become ghost income',()=>{
 const s=side('farmer'),ai=new AIController(s,100);s.recruitment.money=0;s.recruitment.slots[0]={kind:'farmer',type:'农',level:1};s.drop(slot(0),tile(0));
 s.updateItems(12000);const farmer=s.board.tiles[0].unit,id=s.farmers.states.get(farmer).reward.id;
 ai.update(10);s.updateItems(5000);run(ai,90);assert.equal(s.recruitment.money,0);assert.equal(s.collectFarmerReward(farmer,id),false);
});
for(const id of ['upgrade_talisman','haste_edict','golden_hand'])test('AI uses equipped '+id+' via shared canUse/use and normal CD',()=>{
 const s=side(id),ai=new AIController(s,10);s.recruitment.money=0;
 s.recruitment.slots[0]={type:'刀',level:1};s.drop(slot(0),tile(0));
 if(id==='golden_hand'){
  s.board.tiles.forEach(t=>{t.unlocked=true;if(!t.unit)t.unit={type:'刀',level:5};});
  s.recruitment.slots=Array.from({length:5},()=>({kind:'heroLetter',type:'美',level:5}));
 }
 const calls=spy(s);if(id!=='golden_hand'){ai.update(10);assert.equal(calls.some(c=>c.name==='useActiveItem'),false);s.activeItems.update(20000);}
 ai.update(10);assert.ok(calls.some(c=>c.name==='useActiveItem'&&c.result));
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
 const s=side(),ai=new AIController(s,100);s.recruitment.money=0;s.recruitment.slots[0]={type:'刀',level:1};ai.update(10);
 const replacement={type:'弓',level:1};s.recruitment.slots[0]=replacement;run(ai,90);assert.equal(s.recruitment.slots[0],replacement);
 assert.ok(s.board.tiles.every(t=>!t.unit));
});
test('delayed target becoming level five cancels item without consuming ready',()=>{
 const s=side('upgrade_talisman'),ai=new AIController(s,100);s.recruitment.money=0;
 s.recruitment.slots[0]={type:'刀',level:4};s.drop(slot(0),tile(0));s.activeItems.update(20000);ai.update(10);
 s.board.tiles[0].unit.level=5;run(ai,90);assert.equal(s.board.tiles[0].unit.level,5);assert.equal(s.activeItems.slots[0].remainingMs,0);
});
test('Match logical delay is frame-independent and pause/resume preserves remaining delay',()=>{
 const a=quiet(),b=quiet();a.bindController('top',new AIController(a.topSide));b.bindController('top',new AIController(b.topSide));
 advance(a,300);a.pause();advance(a,10000);assert.equal(a.topSide.recruitment.successfulRecruits,0);
 a.resume();advance(a,300);for(let i=0;i<3;i++)b.update(200);
 assert.equal(a.topSide.recruitment.successfulRecruits,1);assert.equal(b.topSide.recruitment.successfulRecruits,1);
 assert.equal(a.timeline.elapsedMs,b.timeline.elapsedMs);
});
test('result stops pending actions at same logical step, never granting final-frame recruitment',()=>{
 const m=quiet(),ai=new AIController(m.topSide,100);m.bindController('top',ai);advance(m,50);
 for(let i=0;i<3;i++){const e=m.bottomSide.combat.spawnEnemy();e.distance=m.bottomSide.combat.path.totalLength-.001;}
 advance(m,20);assert.equal(m.status,'ended');ai.update(10000);assert.equal(m.topSide.recruitment.successfulRecruits,0);
 assert.equal(ai.pending,null);
});
test('destroy/restart invalidates old AI pending and creates clean new AI; no timers',()=>{
 const m=quiet(),old=new AIController(m.topSide);m.bindController('top',old);advance(m,300);m.destroy();
 const fresh=quiet(),ai=new AIController(fresh.topSide);fresh.bindController('top',ai);
 old.update(10000);m.update(10000);assert.equal(fresh.topSide.recruitment.money,20);assert.equal(fresh.topSide.recruitment.successfulRecruits,0);
 assert.equal(old.pending,null);advance(fresh,300);assert.equal(fresh.topSide.recruitment.successfulRecruits,0);
 advance(fresh,300);assert.equal(fresh.topSide.recruitment.successfulRecruits,1);
});
test('AI operations cannot change bottom wallet/holding/board/Farmer/EXP/item runtime',()=>{
 const m=quiet(kit('farmer','upgrade_talisman'));hero(m.bottomSide);
 const snapshot=()=>JSON.stringify({state:m.bottomSide.recruitment,board:m.bottomSide.board,links:[...m.bottomSide.heroes.links.values()],items:m.bottomSide.activeItems.slots,farmers:[...m.bottomSide.farmers.states]});
 const before=snapshot(),ai=new AIController(m.topSide,10);run(ai,2000);assert.equal(snapshot(),before);
});
test('AI has no bottom/Match/timeline access, future RNG probes, direct state writes or independent timers',()=>{
 const source=readFileSync(new URL('../src/controllers/AIController.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.bottomSide|\.timeline|Math\.random|setTimeout|addEvent|\.money\s*\+=|\.money\s*=|\.unit\s*=/);
 const s=side();let reads=0;const random=Math.random;
 try{Math.random=()=>{reads++;return 0;};const ai=new AIController(s);run(ai,aiConfig.actionDelayMs-10);assert.equal(reads,0);
  run(ai,10);assert.equal(reads,5);
 }finally{Math.random=random;}
});

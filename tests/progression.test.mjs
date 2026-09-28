import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);},
 load(url,c,next){if(!url.endsWith('.ts'))return next(url,c);return {format:'module',shortCircuit:true,
 source:stripTypeScriptTypes(readFileSync(new URL(url),'utf8'),{mode:'transform'})};}});
const {PlayerProgress,matchCoinReward}=await import('../src/progression/PlayerProgress.ts');
const {defaultPlayerSave,sanitizeSave,migrateSave,SAVE_VERSION,SAVE_KEY,WELCOME_EVENT}=await import('../src/progression/PlayerSave.ts');
const {itemDefinitions}=await import('../src/config/equipment.ts');
function storage(value=null){let raw=value,writes=0;return {getItem:key=>{assert.equal(key,SAVE_KEY);return raw;},setItem:(key,v)=>{assert.equal(key,SAVE_KEY);raw=v;writes++;},get raw(){return raw;},get writes(){return writes;}};}
function assertDefault(save){const {shop,...rest}=save;const {shop:empty,...defaults}=defaultPlayerSave();assert.deepEqual(rest,defaults);assert.equal(shop.matchesTowardRefresh,0);assert.equal(shop.shelfItemIds.length,3);}
function result(id='match-1',result='lose',waveReached=10,playerKills=12){return Object.freeze({matchId:id,result,waveReached,playerKills,
 playerSuccessfulRecruits:3,playerRemainingMoney:4,playerRemainingHp:result==='win'?2:0,opponentRemainingHp:result==='lose'?1:0});}

test('new save is current version, zero coins/stats, only frugal owned/equipped; persisted under stable project key',()=>{
 const s=storage(),p=new PlayerProgress(s);assertDefault(p.save);assert.equal(SAVE_VERSION,2);
 assert.equal(p.save.coins,0);assert.deepEqual(p.save.ownedItemIds,['frugal_home']);assert.deepEqual(p.save.equippedPassiveItemIds,['frugal_home']);
 assert.deepEqual(p.save.stats,{matchesPlayed:0,wins:0,highestWave:0,totalKills:0});assert.equal(s.writes,1);
 assert.equal(p.inventory().filter(i=>i.owned).length,1);assert.ok(p.inventory().find(i=>i.id==='frugal_home').equipped);
});
for(const raw of ['{broken','null','[]','42',JSON.stringify({oldDevLoadout:['farmer']})])test('bad/non-versioned old development save safely resets: '+raw,()=>{
 assertDefault(new PlayerProgress(storage(raw)).save);
});
test('missing fields restore safe defaults; invalid numeric fields cannot enter progression',()=>{
 const s=sanitizeSave({saveVersion:1,coins:-2,stats:{matchesPlayed:1.5,wins:9,highestWave:'4',totalKills:Number.MAX_SAFE_INTEGER+1}});
 assert.equal(s.coins,0);assert.deepEqual(s.stats,defaultPlayerSave().stats);assert.deepEqual(s.ownedItemIds,['frugal_home']);
 for(const value of [NaN,Infinity,2.1,'2',null,-1])assert.equal(sanitizeSave({coins:value}).coins,0);
 assert.deepEqual(migrateSave({saveVersion:2}),defaultPlayerSave());
});
test('ownership removes duplicates/unknown ids; equipment removes unowned, wrong category and caps 2/6',()=>{
 const s=sanitizeSave({ownedItemIds:['frugal_home','frugal_home','gone'],equippedActiveItemIds:['frugal_home','golden_hand'],equippedPassiveItemIds:['farmer','frugal_home','gone','frugal_home']});
 assert.deepEqual(s.ownedItemIds,['frugal_home']);assert.deepEqual(s.equippedActiveItemIds,[]);assert.deepEqual(s.equippedPassiveItemIds,['frugal_home']);
 const all=itemDefinitions.map(d=>d.id),full=sanitizeSave({ownedItemIds:all,equippedActiveItemIds:all,equippedPassiveItemIds:all});
 assert.equal(full.equippedActiveItemIds.length,2);assert.equal(full.equippedPassiveItemIds.length,6);
 assert.ok(full.equippedActiveItemIds.every(id=>itemDefinitions.find(d=>d.id===id).category==='active'));
});
test('new definition uses the same ID arrays/schema without ownership switch or dedicated save field',()=>{
 const def={id:'future_item',name:'未来道具',category:'passive',description:'测试'},defs=[...itemDefinitions,def];
 const save=sanitizeSave({ownedItemIds:[def.id],equippedPassiveItemIds:[def.id]},defs);
 assert.deepEqual(save.ownedItemIds,[def.id]);assert.deepEqual(save.equippedPassiveItemIds,[def.id]);
});
test('equipment changes persist immediately; cannot forge ownership; refresh restores equipment',()=>{
 const s=storage(),p=new PlayerProgress(s);assert.equal(p.equip('farmer',true),false);
 const before=s.writes;assert.ok(p.equip('frugal_home',false));assert.ok(s.writes>before);
 assert.deepEqual(new PlayerProgress(s).save.equippedPassiveItemIds,[]);
 p.saveEquipment([{id:'farmer',level:1,owned:true,equipped:true}]);assert.deepEqual(p.save.equippedPassiveItemIds,[]);
 assert.ok(p.equip('frugal_home',true));assert.deepEqual(new PlayerProgress(s).save.equippedPassiveItemIds,['frugal_home']);
});
for(const [wave,result,expected]of [[4,'lose',1],[5,'lose',2],[9,'lose',2],[10,'lose',3],[10,'win',5],[15,'win',6],[10,'draw',3],[9999,'win',8],[9999,'lose',8]])
 test('small coin formula '+wave+' '+result+' = '+expected,()=>assert.equal(matchCoinReward({waveReached:wave,result}),expected));
test('result settlement persists once by Match ID, including cloned snapshots/reload/rematch/home re-entry',()=>{
 const s=storage(),p=new PlayerProgress(s),a=result();assert.equal(p.commitMatchResult(a),3);
 const expected=p.save,writes=s.writes;p.commitMatchResult(a);p.commitMatchResult({...a});assert.deepEqual(p.save,expected);assert.equal(s.writes,writes);
 const reloaded=new PlayerProgress(s);reloaded.commitMatchResult({...a});assert.deepEqual(reloaded.save,expected);
 assert.equal(reloaded.commitMatchResult(result('match-2','win',15,20)),6);
 assert.equal(reloaded.commitMatchResult(result('match-3','draw',5,3)),2);
 assert.equal(reloaded.save.coins,11);assert.deepEqual(reloaded.save.stats,{matchesPlayed:3,wins:1,highestWave:15,totalKills:35});
});
test('load restores all permanent values, but returned snapshots cannot mutate store',()=>{
 const s=storage(),p=new PlayerProgress(s);p.markWelcomeSeen();p.commitMatchResult(result());p.equip('frugal_home',false);
 assert.deepEqual(new PlayerProgress(s).save,p.save);const copy=p.save;copy.coins=999;copy.ownedItemIds.push('farmer');assert.equal(p.save.coins,3);assert.equal(p.save.ownedItemIds.includes('farmer'),false);
});
test('welcome stable event is saved once, changes no coins/ownership/equipment',()=>{
 const s=storage(),p=new PlayerProgress(s),before=p.save;p.markWelcomeSeen();p.markWelcomeSeen();
 assert.deepEqual(p.save,{...before,seenOneTimeEventIds:[WELCOME_EVENT]});assert.equal(new PlayerProgress(s).hasSeenWelcome(),true);
});
test('reset restores full default save and re-enables welcome event',()=>{
 const s=storage(),p=new PlayerProgress(s);p.commitMatchResult(result());p.markWelcomeSeen();p.equip('frugal_home',false);p.reset();
 assertDefault(p.save);assert.equal(p.hasSeenWelcome(),false);assertDefault(new PlayerProgress(s).save);
});
test('explicit migrate preserves allowed progress and seen events; explicit reset discards everything',()=>{
 const old={...defaultPlayerSave(),saveVersion:0,coins:42,stats:{matchesPlayed:5,wins:2,highestWave:8,totalKills:60},ownedItemIds:['frugal_home','farmer'],
 equippedPassiveItemIds:['farmer'],seenOneTimeEventIds:[WELCOME_EVENT],settledMatchIds:['old-match']};
 const migrate={0:{kind:'migrate',migrate:old=>old}},reset={0:{kind:'reset'}};
 assert.deepEqual(migrateSave(old,migrate),{...old,saveVersion:2});assert.deepEqual(migrateSave(old,reset),defaultPlayerSave());
 const migrated=new PlayerProgress(storage(JSON.stringify(old)),migrate).save;assert.deepEqual({...migrated,shop:old.shop},{...old,saveVersion:2});
 assertDefault(new PlayerProgress(storage(JSON.stringify(old)),reset).save);
 assert.deepEqual(migrateSave({...old,saveVersion:2},reset),{...old,saveVersion:2});
});
test('storage denied/read failure/write failure keeps a working memory session without duplicate rewards',()=>{
 const warn=console.warn;let warnings=0;console.warn=()=>warnings++;
 try{
  const p=new PlayerProgress({getItem(){throw Error('denied');},setItem(){throw Error('quota');}});
  p.commitMatchResult(result());p.commitMatchResult(result());p.markWelcomeSeen();assert.equal(p.save.coins,3);assert.equal(p.save.stats.matchesPlayed,1);
  assert.ok(p.hasSeenWelcome());assert.ok(warnings>0);p.reset();assertDefault(p.save);
 }finally{console.warn=warn;}
});

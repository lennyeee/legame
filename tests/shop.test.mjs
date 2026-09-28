import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);},load(url,c,next){if(!url.endsWith('.ts'))return next(url,c);return {format:'module',shortCircuit:true,source:stripTypeScriptTypes(readFileSync(new URL(url),'utf8'),{mode:'transform'})};}});
const {PlayerProgress}=await import('../src/progression/PlayerProgress.ts');
const {defaultPlayerSave,sanitizeSave,migrateSave,WELCOME_EVENT}=await import('../src/progression/PlayerSave.ts');
const {createShelf}=await import('../src/progression/shop.ts');
const {itemDefinitions}=await import('../src/config/equipment.ts');
function store(seed=defaultPlayerSave(),random=()=>0){let raw=JSON.stringify(seed);let calls=0;
 const storage={getItem:()=>raw,setItem:(_k,v)=>raw=v};const p=new PlayerProgress(storage,undefined,()=>{calls++;return random();});return {p,storage,get calls(){return calls;}};}
function result(id,result='lose'){return {matchId:id,result,waveReached:5,playerKills:2,playerSuccessfulRecruits:1,playerRemainingMoney:0,playerRemainingHp:0,opponentRemainingHp:1};}

test('shop registry has exact ten small prices; frugal is not eligible',()=>{
 const expected={practice_pays:6,upgrade_talisman:7,iron_rice_bowl:8,hero_recruitment:9,opening_bonus:10,golden_hand:11,farmer:12,veteran:14,haste_edict:16,golden_shovel:18};
 assert.equal(itemDefinitions.length,11);for(const def of itemDefinitions){assert.equal(def.shopEligible,def.id!=='frugal_home');assert.equal(def.shopPrice,expected[def.id]??null);}
});
for(const random of [()=>0,()=>.9999,()=>.5])test('shelf has three unique unowned eligible IDs and excludes frugal ('+random()+')',()=>{
 const shelf=createShelf(['frugal_home','farmer'],random);assert.equal(shelf.length,3);assert.equal(new Set(shelf).size,3);
 assert.ok(shelf.every(id=>id!=='frugal_home'&&id!=='farmer'));
});
test('less than three and complete collection have no fake goods',()=>{
 const all=itemDefinitions.map(d=>d.id);assert.deepEqual(createShelf(all),[]);
 assert.deepEqual(createShelf(all.filter(id=>id!=='farmer'),()=>0),['farmer']);
});
test('shop RNG never uses Math.random/gameplay, supports injected reproducible selection',()=>{
 const random=Math.random;try{Math.random=()=>{throw Error('gameplay RNG');};assert.equal(createShelf(['frugal_home']).length,3);
 assert.deepEqual(createShelf(['frugal_home'],()=>0),['farmer','hero_recruitment','upgrade_talisman']);}finally{Math.random=random;}
});
test('opening/reloading never changes shelf or progress or consumes more RNG',()=>{
 const s=store(),initial=s.p.save;assert.equal(s.calls,3);s.p.inventory();s.p.inventory();assert.equal(s.calls,3);
 const reloaded=new PlayerProgress(s.storage,undefined,()=>{throw Error('no resampling');});assert.deepEqual(reloaded.save,initial);
});
for(const outcome of ['win','lose','draw'])test('only two unique formal '+outcome+' results refresh shelf as one persistent commit',()=>{
 const s=store(),old=s.p.save.shop.shelfItemIds;s.p.commitMatchResult(result('1',outcome));assert.equal(s.calls,3);
 assert.deepEqual(s.p.save.shop,{shelfItemIds:old,matchesTowardRefresh:1});s.p.commitMatchResult(result('1',outcome));assert.equal(s.calls,3);
 s.p.commitMatchResult(result('2',outcome));assert.equal(s.calls,6);assert.equal(s.p.save.shop.matchesTowardRefresh,0);
 const fresh=s.p.save;s.p.commitMatchResult(result('2',outcome));assert.deepEqual(s.p.save,fresh);
 assert.deepEqual(new PlayerProgress(s.storage,undefined,()=>{throw Error('no reload refresh');}).save,fresh);
});
test('purchase is one safe transaction, permanent ownership, no auto equip, no replacement/re-randomization',()=>{
 const s=store({...defaultPlayerSave(),coins:30}),before=s.p.save.shop;s.p.buyItem('farmer');
 assert.equal(s.p.save.coins,18);assert.ok(s.p.save.ownedItemIds.includes('farmer'));assert.deepEqual(s.p.save.equippedPassiveItemIds,['frugal_home']);
 assert.deepEqual(s.p.save.shop,before);assert.equal(s.calls,3);assert.equal(s.p.buyItem('farmer'),false);assert.equal(s.p.save.coins,18);
 assert.deepEqual(new PlayerProgress(s.storage).save,s.p.save);
 s.p.commitMatchResult(result('1'));s.p.commitMatchResult(result('2'));assert.equal(s.p.save.shop.shelfItemIds.includes('farmer'),false);
});
for(const id of ['farmer','golden_shovel','frugal_home','unknown'])test('cannot purchase unaffordable/out-of-shelf/gift/unknown item: '+id,()=>{
 const {p}=store();const before=p.save;assert.equal(p.buyItem(id),false);assert.deepEqual(p.save,before);
});
test('equipment fills first available position without replacing full active/passive slots',()=>{
 const all=itemDefinitions.map(d=>d.id),{p}=store({...defaultPlayerSave(),ownedItemIds:all,equippedPassiveItemIds:[]});
 p.equip('haste_edict',true);p.equip('golden_hand',true);const before=p.save;assert.equal(p.equip('upgrade_talisman',true),false);assert.deepEqual(p.save,before);
 p.equip('haste_edict',false);p.equip('upgrade_talisman',true);assert.deepEqual(p.save.equippedActiveItemIds,['golden_hand','upgrade_talisman']);
 for(const id of itemDefinitions.filter(d=>d.category==='passive').slice(0,6).map(d=>d.id))assert.ok(p.equip(id,true));
 const full=p.save;assert.equal(p.equip('veteran',true),false);assert.deepEqual(p.save,full);
});
test('v1 migration preserves v0.64 data/events/ledger and initializes one fresh shop without reset',()=>{
 const old={...defaultPlayerSave(),saveVersion:1,coins:19,ownedItemIds:['frugal_home','farmer'],equippedPassiveItemIds:['farmer'],
 stats:{matchesPlayed:7,wins:2,highestWave:12,totalKills:45},seenOneTimeEventIds:[WELCOME_EVENT],settledMatchIds:['past']};delete old.shop;
 const {p}=store(old);assert.equal(p.save.saveVersion,2);for(const key of ['coins','ownedItemIds','equippedPassiveItemIds','stats','seenOneTimeEventIds','settledMatchIds'])assert.deepEqual(p.save[key],old[key]);
 assert.equal(p.save.shop.shelfItemIds.includes('farmer'),false);assert.equal(p.save.shop.matchesTowardRefresh,0);
});
test('shop sanitize filters unknown/duplicate/ineligible but preserves purchased shelf positions, clamps progress',()=>{
 const s=sanitizeSave({...defaultPlayerSave(),ownedItemIds:['frugal_home','farmer'],shop:{shelfItemIds:['farmer','farmer','gone','frugal_home','upgrade_talisman'],matchesTowardRefresh:99}});
 assert.deepEqual(s.shop,{shelfItemIds:['farmer','upgrade_talisman'],matchesTowardRefresh:1});
 for(const value of [-2,'1',.5])assert.equal(sanitizeSave({shop:{matchesTowardRefresh:value}}).shop.matchesTowardRefresh,0);
});
test('explicit old-version force reset remains available; ordinary v1 migration keeps welcome event',()=>{
 const old={...defaultPlayerSave(),saveVersion:1,coins:99,seenOneTimeEventIds:[WELCOME_EVENT]};
 assert.equal(migrateSave(old).coins,99);assert.deepEqual(migrateSave(old).seenOneTimeEventIds,[WELCOME_EVENT]);
 assert.deepEqual(migrateSave(old,{1:{kind:'reset'}}),defaultPlayerSave());
});

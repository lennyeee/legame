import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);},load(url,c,next){return url.endsWith('.ts')?{format:'module',shortCircuit:true,source:stripTypeScriptTypes(readFileSync(new URL(url),'utf8'),{mode:'transform'})}:next(url,c);}});
const {changeRank,defaultRank,sanitizeRank,rankDisplay,nearbyRank}=await import('../src/progression/rank.ts');
const {defaultProfile,avatars,avatarSymbol,validNickname,sanitizeProfile,opponentNickname,opponentNames}=await import('../src/progression/profile.ts');
const {PlayerProgress}=await import('../src/progression/PlayerProgress.ts');
const {defaultPlayerSave,migrateSave,SAVE_KEY,WELCOME_EVENT}=await import('../src/progression/PlayerSave.ts');
const {createBattleSetup,flowConfig}=await import('../src/flow/battleSetup.ts');
const {createLoadout}=await import('../src/systems/equipment.ts');
const {Match}=await import('../src/match/Match.ts');
const {AIController}=await import('../src/controllers/AIController.ts');
const {aiConfig}=await import('../src/config/ai.ts');
const {testMap}=await import('../src/config/maps.ts');
const stars=(divisionIndex,stars)=>({kind:'stars',divisionIndex,stars});
const points=points=>({kind:'points',points});
const cases=[
 ['minimum loss',stars(0,0),'lose',stars(0,0)],['first win',stars(0,0),'win',stars(0,1)],
 ['four to five',stars(0,4),'win',stars(0,5)],['five to III',stars(0,5),'win',stars(1,0)],
 ['III to II',stars(1,5),'win',stars(2,0)],['II to I',stars(2,5),'win',stars(3,0)],
 ['gold II to I',stars(14,5),'win',stars(15,0)],['gold to platinum',stars(15,5),'win',stars(16,0)],
 ['gold I zero downgrade',stars(15,0),'lose',stars(14,4)],['one to zero',stars(15,1),'lose',stars(15,0)],
 ['draw stars',stars(14,4),'draw',stars(14,4)],['diamond to master',stars(27,5),'win',points(0)],
 ['master to diamond',points(0),'lose',stars(27,4)],['master ten',points(0),'win',points(10)],
 ['master to grandmaster',points(90),'win',points(100)],['grandmaster to master',points(100),'lose',points(90)],
 ['grandmaster to king',points(190),'win',points(200)],['king to grandmaster',points(200),'lose',points(190)],
 ['king unlimited',points(1280),'win',points(1290)],['draw points',points(140),'draw',points(140)],
 ['safe integer ceiling',points(Number.MAX_SAFE_INTEGER),'win',points(Number.MAX_SAFE_INTEGER)],
];
for(const [name,before,result,after]of cases)test('rank '+name,()=>{
 const change=changeRank(before,result);assert.deepEqual(change.beforeRank,before);assert.deepEqual(change.afterRank,after);
 assert.ok(Object.isFrozen(change)&&Object.isFrozen(change.beforeRank)&&Object.isFrozen(change.afterRank));
});
test('rank promotion/demotion flags and no promotion at five stars',()=>{
 assert.equal(changeRank(stars(14,4),'win').promoted,false);assert.equal(changeRank(stars(14,5),'win').promoted,true);
 assert.equal(changeRank(stars(14,0),'lose').demoted,true);assert.equal(changeRank(points(190),'win').promoted,true);
 assert.equal(changeRank(stars(0,0),'lose').delta,0);
});
for(const [raw,expected]of [[null,defaultRank()],[{kind:'unknown'},defaultRank()],[stars(-3,99),stars(0,5)],[stars(90,-4),stars(27,0)],[stars(2.9,1.9),stars(2,1)],[points(-10),points(0)],[points(Infinity),points(0)]])
 test('rank sanitize '+JSON.stringify(raw),()=>assert.deepEqual(sanitizeRank(raw),expected));
test('rank display separates divisions/stars and high-rank points',()=>{
 assert.equal(rankDisplay(stars(14,4)),'黄金 II ★★★★☆');assert.equal(rankDisplay(points(140)),'宗师 140分');assert.equal(rankDisplay(points(200)),'王者 200分');
});
function store(seed=defaultPlayerSave()){let raw=JSON.stringify(seed);const writes=[];const storage={getItem:key=>{assert.equal(key,SAVE_KEY);return raw;},setItem:(key,value)=>{assert.equal(key,SAVE_KEY);writes.push(key);raw=value;}};return {progress:new PlayerProgress(storage,undefined,()=>0),storage,writes};}
const result=(id,outcome='win')=>({matchId:id,result:outcome,waveReached:10,playerKills:2,playerSuccessfulRecruits:1,playerRemainingMoney:20,playerRemainingHp:2,opponentRemainingHp:0});
test('new save rank/profile stable defaults and current version3',()=>{
 const {progress}=store();assert.equal(progress.save.saveVersion,3);assert.deepEqual(progress.save.rank,defaultRank());assert.deepEqual(progress.save.profile,defaultProfile());
});
test('single permanent settlement combines coins/stats/shop/rank and duplicate cloned/reloaded result is inert',()=>{
 const {progress,storage}=store();progress.commitMatchResult(result('a'));const change=progress.rankChangeFor('a');
 assert.deepEqual(change.afterRank,stars(0,1));const before=progress.save;
 progress.commitMatchResult({...result('a')});assert.deepEqual(progress.save,before);assert.equal(progress.rankChangeFor('a'),change);
 const reloaded=new PlayerProgress(storage);reloaded.commitMatchResult(result('a'));assert.deepEqual(reloaded.save,before);
 progress.commitMatchResult(result('b','lose'));assert.deepEqual(progress.save.rank,stars(0,0));
 assert.equal(progress.save.stats.matchesPlayed,2);assert.equal(progress.save.shop.matchesTowardRefresh,0);assert.equal(progress.save.coins,8);
});
test('v2 migration retains all v0.65 fields and adds default rank/profile without reset',()=>{
 const old={...defaultPlayerSave(),saveVersion:2,coins:22,stats:{matchesPlayed:7,wins:3,highestWave:9,totalKills:20},ownedItemIds:['frugal_home','farmer'],equippedPassiveItemIds:['farmer'],shop:{shelfItemIds:['farmer','upgrade_talisman'],matchesTowardRefresh:1},seenOneTimeEventIds:[WELCOME_EVENT],settledMatchIds:['previous']};delete old.rank;delete old.profile;
 const migrated=migrateSave(old);for(const key of Object.keys(old).filter(k=>k!=='saveVersion'))assert.deepEqual(migrated[key],old[key]);
 assert.deepEqual(migrated.rank,defaultRank());assert.deepEqual(migrated.profile,defaultProfile());
});
test('migration preserves valid existing rank/profile; explicit reset clears all progress and welcome',()=>{
 const old={...defaultPlayerSave(),saveVersion:2,coins:10,rank:points(150),profile:{nickname:'  小猫玩家  ',avatarId:'cat'},seenOneTimeEventIds:[WELCOME_EVENT]};
 assert.deepEqual(migrateSave(old).rank,points(150));assert.equal(migrateSave(old).profile.nickname,'小猫玩家');
 const reset=migrateSave(old,{2:{kind:'reset'}});assert.deepEqual(reset,defaultPlayerSave());
 const {progress}=store(old);progress.commitMatchResult(result('old'));progress.reset();assert.deepEqual(progress.save.rank,defaultRank());assert.deepEqual(progress.save.profile,defaultProfile());
 assert.equal(progress.rankChangeFor('old'),undefined);assert.equal(progress.hasSeenWelcome(),false);assert.equal(progress.save.shop.matchesTowardRefresh,0);
});
for(const name of ['', ' ', 'a','一','abcdefghijk','昵称\n两行'])test('invalid nickname rejected '+JSON.stringify(name),()=>{
 const {progress}=store();const before=progress.save;assert.equal(progress.updateProfile({nickname:name,avatarId:'cat'}),false);assert.deepEqual(progress.save,before);
});
test('profile trim, Unicode, avatar registry stable IDs and persisted reload',()=>{
 assert.equal(avatars.length,12);assert.ok(opponentNames.length>=40);
 const {progress,storage}=store();assert.equal(progress.updateProfile({nickname:'  小猫🐱  ',avatarId:'cat'}),true);
 assert.deepEqual(new PlayerProgress(storage).save.profile,{nickname:'小猫🐱',avatarId:'cat'});
 assert.equal(avatarSymbol('cat'),'🐱');assert.notEqual(avatars[0].id,avatars[0].symbol);
 assert.equal(progress.updateProfile({nickname:'小猫',avatarId:'missing'}),false);
 assert.deepEqual(sanitizeProfile({nickname:'',avatarId:'missing'}),defaultProfile());
 assert.equal(validNickname('名字123'),true);
});
test('opponent nickname generator both full and combined paths use independent injected RNG',()=>{
 const samples=[.9,.1,.2];assert.equal(opponentNickname(()=>samples.shift()),'暴躁的农民');assert.equal(opponentNickname(()=>0),opponentNames[0]);
 const old=Math.random;try{Math.random=()=>{throw Error('no gameplay RNG');};assert.ok(opponentNames.includes(opponentNickname(()=>.5)));}finally{Math.random=old;}
});
test('opponent nearby division majority and minority offset paths clamp safely',()=>{
 const a=[0,0,0],b=[.9,0,0,0],c=[.9,.9,.9,.99];
 assert.deepEqual(nearbyRank(stars(14,4),()=>a.shift()),stars(12,0));
 assert.deepEqual(nearbyRank(stars(14,4),()=>b.shift()),stars(11,0));
 assert.deepEqual(nearbyRank(stars(27,4),()=>c.shift()),stars(27,5));
 assert.equal(nearbyRank(stars(0,0),()=>0).divisionIndex,0);assert.deepEqual(nearbyRank(points(20),()=>0),points(0));
});
test('setup copies immutable current player identity and rematch creates new opponent ID',()=>{
 const player={nickname:'测试玩家',avatarId:'fox',rank:points(140)},kit=createLoadout([]);
 const a=createBattleSetup(kit,()=>0,()=>kit,player),b=createBattleSetup(kit,()=>0,()=>kit,player);
 assert.notEqual(a.opponentProfile.id,b.opponentProfile.id);assert.equal(a.playerProfile.nickname,player.nickname);
 assert.ok(Object.isFrozen(a.playerProfile.rank));player.rank.points=999;assert.equal(a.playerProfile.rank.points,140);
 assert.ok(avatars.some(avatar=>avatar.id===a.opponentProfile.avatarId));assert.equal(flowConfig.vsEnterMs,400);assert.equal(flowConfig.vsHoldMs,1400);assert.equal(flowConfig.vsExitMs,500);
});
test('changing only presentation rank leaves AI configuration/resources/timing/actions identical',()=>{
 const kit=createLoadout([]),base=createBattleSetup(kit,()=>0,()=>kit),state=JSON.stringify(aiConfig);
 const sample=profile=>{
  const setup={...base,opponentProfile:{...base.opponentProfile,rank:profile}};
  const match=new Match(testMap,setup.playerLoadout,setup.opponentLoadout),ai=new AIController(match.topSide,()=>0,()=>0);
  const old=Math.random;try{Math.random=()=>0;for(let ms=0;ms<3000;ms+=10)ai.update(10);}finally{Math.random=old;}
  const output={board:match.topSide.board,reserve:match.topSide.recruitment.slots,money:match.topSide.recruitment.money,pending:ai.pending};
  const data=JSON.stringify(output);ai.destroy();match.destroy();return data;
 };
 assert.equal(sample(defaultRank()),sample(points(500)));assert.equal(JSON.stringify(aiConfig),state);
});

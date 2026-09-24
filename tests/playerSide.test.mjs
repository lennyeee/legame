import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,next) { if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)) s+='.ts'; return next(s,c); } });
const { PlayerSide } = await import('../src/systems/PlayerSide.ts');
const { testMap } = await import('../src/config/maps.ts');
const { createInventory, setEquipped, createLoadout } = await import('../src/systems/equipment.ts');
const { combatConfig } = await import('../src/config/combat.ts');
const { heroGrowth } = await import('../src/config/heroes.ts');
const slot=index=>({kind:'slot',index}), tile=index=>({kind:'tile',index});
function loadout(...ids) {
 const inventory=createInventory();
 for(const id of ids) assert.equal(setEquipped(inventory,id,true),true);
 return createLoadout(inventory);
}
function pair(...ids) {
 const equipped=loadout(...ids);
 return [new PlayerSide('bottom',testMap,equipped),new PlayerSide('top',testMap,equipped)];
}
function hero(side) {
 side.recruitment.slots[0]={kind:'heroLetter',type:'小',level:1};
 side.recruitment.slots[1]={kind:'heroLetter',type:'美',level:1};
 assert.equal(side.drop(slot(0),tile(0)),'move');
 assert.equal(side.drop(slot(1),tile(1)),'move');
 return [...side.heroes.links.values()][0];
}
function farmer(side) {
 const unit={kind:'farmer',type:'农',level:1};
 side.recruitment.slots[0]=unit;
 assert.equal(side.drop(slot(0),tile(0)),'move');
 return unit;
}

test('PlayerSide independently owns recruitment, frozen loadout, tiles and all runtime instances',()=>{
 const [a,b]=pair('upgrade_talisman','farmer');
 assert.equal(a.id,'bottom');assert.equal(b.id,'top');
 for(const key of ['recruitment','board','heroes','combat','farmers','activeItems','progress','passives']) assert.notEqual(a[key],b[key],key);
 assert.notEqual(a.recruitment.slots,b.recruitment.slots);
 assert.notEqual(a.recruitment.loadout,b.recruitment.loadout);
 assert.ok(Object.isFrozen(a.recruitment.loadout));
 assert.notEqual(a.board.tiles,b.board.tiles);
 a.board.tiles.forEach((t,i)=>assert.notEqual(t,b.board.tiles[i]));
 assert.notEqual(a.combat.enemies,b.combat.enemies);
 assert.notEqual(a.heroes.links,b.heroes.links);
 assert.notEqual(a.activeItems.slots,b.activeItems.slots);
 assert.notEqual(a.farmers.states,b.farmers.states);
 assert.equal(a.combat.board,a.board);assert.equal(a.combat.progress,a.progress);
});

test('bound recruitment changes only its own money, reserve, price and successful count',()=>{
 const [a,b]=pair('opening_bonus','frugal_home','veteran');
 const before=structuredClone(b.recruitment);
 a.recruitment.money=100;
 assert.equal(a.recruit(()=>0),true);
 assert.equal(a.recruitment.slots[0].level,2);
 assert.equal(a.recruitment.successfulRecruits,1);
 assert.equal(a.recruitment.nextCost,12);
 assert.deepEqual(b.recruitment,before);
 a.recruitment.money=0;const failed=structuredClone(a.recruitment);
 assert.equal(a.recruit(()=>0),false);assert.deepEqual(a.recruitment,failed);
});

test('bound moves, swaps, merges and successful shovel bonus never mutate the other board',()=>{
 const [a,b]=pair('golden_shovel','practice_pays');
 const before=structuredClone(b.board);
 a.recruitment.slots[0]={type:'刀',level:1};a.recruitment.slots[1]={type:'刀',level:1};
 assert.equal(a.drop(slot(0),tile(0)),'move');
 assert.equal(a.drop(slot(1),tile(0)),'merge');
 assert.equal(a.board.tiles[0].unit.level,2);assert.equal(a.recruitment.money,22);
 a.recruitment.slots[0]={type:'弓',level:1};
 assert.equal(a.drop(slot(0),tile(0)),'swap');
 assert.equal(a.recruitment.slots[0].type,'刀');
 a.recruitment.slots[1]='铲';
 const locked=a.board.tiles.findIndex(t=>!t.unlocked);
 assert.equal(a.drop(slot(1),tile(locked),()=>0),'unlock');
 assert.equal(a.board.tiles[locked].bonusType,'attack');
 assert.deepEqual(b.board,before);assert.equal(b.recruitment.money,20);
});

test('same heroId activates on both sides; haste ownership and EXP participants remain local',()=>{
 const [a,b]=pair('haste_edict');const left=hero(a),right=hero(b);
 assert.equal(left.heroId,right.heroId);assert.notEqual(left,right);
 a.updateItems(20_000);
 assert.equal(a.useActiveItem(0,tile(0)),true);
 assert.equal(left.hasteEnhanced,true);assert.equal(right.hasteEnhanced,undefined);
 a.heroes.recordDamage(1,left,1);b.heroes.recordDamage(1,right,1);
 a.heroes.awardKill(1,5);
 assert.equal(left.currentExp,5);assert.equal(right.currentExp,0);
 b.updateItems(20_000);assert.equal(b.useActiveItem(0,tile(1)),true);
 assert.equal(right.hasteEnhanced,true);
});

test('drag suspension removes only its own link; cancel recreates a fresh cycle and clears old participation',()=>{
 const [a,b]=pair();const old=hero(a),other=hero(b);
 old.currentExp=5;a.heroes.recordDamage(1,old,1);
 a.syncDeployment(0);
 assert.equal(a.heroes.links.size,0);assert.equal(b.heroes.links.size,1);
 a.syncDeployment(null);
 const fresh=[...a.heroes.links.values()][0];
 assert.notEqual(fresh,old);assert.equal(fresh.currentExp,0);
 a.heroes.awardKill(1,10);assert.equal(fresh.currentExp,0);
 assert.equal([...b.heroes.links.values()][0],other);
});

test('same numeric enemy id stays simulation-local; real kill rewards and EXP reach only owning side',()=>{
 const [a,b]=pair();const left=hero(a),right=hero(b);
 const ea=a.combat.spawnEnemy(),eb=b.combat.spawnEnemy();
 assert.equal(ea.id,eb.id);assert.notEqual(ea,eb);
 ea.hp=1;ea.moveSpeed=0;eb.moveSpeed=0;
 const before=eb.hp;const events=[];
 for(let n=0;n<100 && ea.hp>0;n++) events.push(...a.updateCombat(50,null));
 assert.ok(events.some(e=>e.kind==='kill'&&e.enemyId===ea.id));
 assert.equal(a.recruitment.money,20+combatConfig.enemy.killReward);
 assert.equal(left.currentExp,heroGrowth.enemyExp);
 assert.equal(eb.hp,before);assert.equal(b.recruitment.money,20);assert.equal(right.currentExp,0);
 assert.ok(b.combat.enemies.includes(eb));
});

test('active cooldown and upgrade operate on bound board/reserve only',()=>{
 const [a,b]=pair('upgrade_talisman');
 a.recruitment.slots[0]={type:'刀',level:1};b.recruitment.slots[0]={type:'刀',level:1};
 a.updateItems(20_000);
 assert.equal(a.activeItems.ready(0),true);assert.equal(b.activeItems.ready(0),false);
 assert.equal(a.useActiveItem(0,slot(0)),true);
 assert.equal(a.recruitment.slots[0].level,2);assert.equal(b.recruitment.slots[0].level,1);
 assert.equal(a.activeItems.slots[0].remainingMs,20_000);
});

test('farmers, pending rewards and wallet are local, even when reward ids match',()=>{
 const [a,b]=pair('farmer');const fa=farmer(a),fb=farmer(b);
 a.updateItems(12_000);b.updateItems(12_000);
 const ra=a.farmers.states.get(fa).reward,rb=b.farmers.states.get(fb).reward;
 assert.equal(ra.id,rb.id);assert.notEqual(ra,rb);
 assert.equal(a.collectFarmerReward(fb,rb.id),false);
 assert.equal(a.collectFarmerReward(fa,ra.id),true);
 assert.equal(a.recruitment.money,21);assert.equal(b.recruitment.money,20);
 assert.equal(b.farmers.states.get(fb).reward,rb);
 assert.equal(a.drop(tile(0),slot(0)),'move');assert.equal(a.farmers.states.size,0);
 assert.equal(b.farmers.states.size,1);
});

test('iron rice counter is side-local and pause freezes runtime and bound actions',()=>{
 const [a,b]=pair('iron_rice_bowl','upgrade_talisman');
 for(let i=0;i<9;i++) a.tickPassiveSecond();
 a.pause();
 const remaining=a.activeItems.slots[0].remainingMs;
 for(let i=0;i<20;i++)a.tickPassiveSecond();
 a.updateItems(10_000);assert.deepEqual(a.updateCombat(1000,null),[]);
 assert.equal(a.recruit(()=>0),false);assert.equal(a.drop(slot(0),tile(0)),'invalid');
 assert.equal(a.useActiveItem(0,tile(0)),false);
 assert.equal(a.passives.ironRiceSeconds,9);assert.equal(a.activeItems.slots[0].remainingMs,remaining);
 assert.equal(a.combat.enemies.length,0);
 a.resume();assert.equal(a.tickPassiveSecond(),true);assert.equal(a.recruitment.money,22);
 assert.equal(b.passives.ironRiceSeconds,0);assert.equal(b.recruitment.money,20);
 const plain=new PlayerSide('plain',testMap);for(let i=0;i<100;i++)plain.tickPassiveSecond();
 assert.equal(plain.recruitment.money,20);
});

test('single-side health/progression adapters do not share lifecycle',()=>{
 const [a,b]=pair();
 a.progress.escape();assert.equal(a.progress.health,2);assert.equal(b.progress.health,3);
 a.progress.escape();a.progress.escape();
 assert.equal(a.progress.status,'defeat');assert.equal(a.running,false);assert.equal(b.running,true);
 assert.equal(a.recruit(()=>0),false);assert.deepEqual(a.updateCombat(1000,null),[]);
 assert.equal(b.recruit(()=>0),true);
});

test('stop/destroy and fresh match reset only the owning runtime, retaining immutable loadout',()=>{
 const [a,b]=pair('haste_edict','farmer','iron_rice_bowl');const old=hero(a),other=hero(b);
 a.updateItems(20_000);assert.equal(a.useActiveItem(0,tile(0)),true);
 a.combat.spawnEnemy();const eb=b.combat.spawnEnemy();
 a.tickPassiveSecond();a.stop();
 assert.equal(a.recruit(()=>0),false);assert.equal(a.tickPassiveSecond(),false);
 a.destroy();a.destroy();a.resume();
 assert.equal(a.running,false);assert.equal(a.heroes.links.size,0);assert.equal(old.skill,null);
 assert.equal(a.activeItems.slots.length,0);assert.equal(a.farmers.states.size,0);
 assert.equal(a.combat.enemies.length,0);assert.equal(b.combat.enemies[0],eb);
 assert.equal([...b.heroes.links.values()][0],other);
 const fresh=new PlayerSide('bottom',testMap,a.recruitment.loadout);
 assert.equal(fresh.recruitment.money,20);assert.equal(fresh.progress.wave,1);assert.equal(fresh.progress.health,3);
 assert.ok(fresh.recruitment.slots.every(x=>x===null));assert.ok(fresh.board.tiles.every(t=>t.unit===null&&t.bonusType==='none'));
 assert.equal(fresh.board.tiles.filter(t=>t.unlocked).length,6);
 assert.equal(fresh.passives.ironRiceSeconds,0);assert.equal(fresh.activeItems.slots[0].remainingMs,20_000);
 assert.equal(hero(fresh).hasteEnhanced,undefined);
 assert.deepEqual(fresh.recruitment.loadout,a.recruitment.loadout);
});

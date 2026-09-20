import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const {ActiveItems}=await import('../src/systems/ActiveItems.ts');
const {createInventory,setEquipped,createLoadout}=await import('../src/systems/equipment.ts');
const {createRecruitmentState}=await import('../src/systems/recruitment.ts');
const {createBoardState,applyDrop}=await import('../src/systems/board.ts');
const {getHeroProgression}=await import('../src/systems/heroProgression.ts');
const {FarmerProduction}=await import('../src/systems/FarmerProduction.ts');
const {CombatSimulation}=await import('../src/combat/CombatSimulation.ts');
const {combatConfig,getCombatStats}=await import('../src/config/combat.ts');
const {itemEffects}=await import('../src/config/itemEffects.ts');
const {testMap}=await import('../src/config/maps.ts');
const pos=(kind,index)=>({kind,index});
const letter=(type,level=1)=>({kind:'heroLetter',type,level});
function setup(map=testMap){const inventory=createInventory();for(const id of ['golden_hand','haste_edict'])assert.ok(setEquipped(inventory,id,true));
 assert.equal(setEquipped(inventory,'upgrade_talisman',true),false);
 const gear=createLoadout(inventory),board=createBoardState(map),wallet=createRecruitmentState(gear),active=new ActiveItems(gear);
 return {board,wallet,active,gear,progression:getHeroProgression(board)};
}
for(const kind of ['slot','tile'])test('点金手'+kind+'所有可部署种类和等级固定$1，无CD可连续出售',()=>{
 const {board,wallet,active}=setup();assert.ok(active.ready(0));
 for(let level=1;level<=5;level++)for(const unit of [{type:'刀',level},{type:'枪',level},{type:'弓',level},{type:'骑',level},{kind:'farmer',type:'农',level},...['小','美','阿','饼','六'].map(t=>letter(t,level))]){
  if(kind==='slot')wallet.slots[0]=unit;else board.tiles[0].unit=unit;
  const before=wallet.money;assert.ok(active.use(0,board,wallet,pos(kind,0)));assert.equal(wallet.money,before+1);
  assert.equal(kind==='slot'?wallet.slots[0]:board.tiles[0].unit,null);assert.ok(active.ready(0));
  assert.equal(active.use(0,board,wallet,pos(kind,0)),false);assert.equal(wallet.money,before+1);
 }
});
test('点金手拒绝铲子/空位/道路/锁定地皮，不增加钱、不删除内容',()=>{
 const {board,wallet,active}=setup();wallet.slots[0]='铲';const locked=board.tiles.findIndex(t=>!t.unlocked);
 board.tiles[locked].unit={type:'刀',level:1};
 for(const p of [null,pos('slot',0),pos('slot',1),pos('tile',locked),pos('tile',999)])assert.equal(active.use(0,board,wallet,p),false);
 assert.equal(wallet.money,100);assert.equal(wallet.slots[0],'铲');assert.ok(board.tiles[locked].unit);
});
test('卖掉武将字解除Link、技能和参战；搭档休眠且等级保留',()=>{
 const {board,wallet,active,progression}=setup();board.tiles[0].unit=letter('小',3);board.tiles[1].unit=letter('美');progression.sync();
 const link=[...progression.links.values()][0];progression.recordDamage(1,link,10);link.currentExp=10;
 assert.ok(active.use(0,board,wallet,pos('tile',0)));assert.equal(progression.links.size,0);assert.equal(link.skill,null);
 progression.awardKill(1,1000);assert.equal(board.tiles[1].unit.level,3);
});
test('出售农民清除生产与待领取钱；出售普通兵清除旧攻击和弹道',()=>{
 const {board,wallet,active}=setup();const farmer={kind:'farmer',type:'农',level:2};board.tiles[0].unit=farmer;
 const farm=new FarmerProduction(board,wallet);farm.update(8000);const reward=farm.states.get(farmer).reward.id;
 active.use(0,board,wallet,pos('tile',0));farm.sync();assert.equal(farm.states.size,0);assert.equal(farm.collect(farmer,reward),false);
 const sim=new CombatSimulation(testMap,board,wallet);const unit={type:'弓',level:1};board.tiles[0].unit=unit;sim.syncBoard();
 sim.projectiles.push({id:1,tileIndex:0,unit,level:1,targetId:1,damage:30,range:200,x:0,y:0});
 active.use(0,board,wallet,pos('tile',0));sim.syncBoard();assert.equal(sim.projectiles.length,0);assert.equal(sim.isAttackerValid(0,unit,1),false);
});
test('如律令完整CD、合法普通兵+一层，重复失败不消耗CD，伤害射程保持不变',()=>{
 for(const type of ['刀','枪','弓','骑']){
 const {board,wallet,active}=setup();const unit={type,level:5};wallet.slots[0]=unit;
 assert.equal(active.use(1,board,wallet,pos('slot',0)),false);active.update(itemEffects.hasteCooldownMs-1);assert.equal(active.ready(1),false);active.update(1);
 const before=getCombatStats(unit);assert.ok(active.use(1,board,wallet,pos('slot',0)));const after=getCombatStats(unit);
 assert.equal(after.attackInterval,before.attackInterval/itemEffects.hasteAttackSpeedMultiplier);assert.equal(after.damage,before.damage);assert.equal(after.range,before.range);
 assert.equal(unit.level,5);assert.equal(active.ready(1),false);active.update(itemEffects.hasteCooldownMs);
 assert.equal(active.use(1,board,wallet,pos('slot',0)),false);assert.ok(active.ready(1));assert.deepEqual(getCombatStats(unit),after);
 }
});
test('强化跟随普通兵移动、交换、回备战区与再次部署',()=>{
 const {board,wallet,active}=setup();const unit={type:'刀',level:1};wallet.slots[0]=unit;active.update(20000);active.use(1,board,wallet,pos('slot',0));
 for(const [from,to] of [[pos('slot',0),pos('tile',0)],[pos('tile',0),pos('tile',1)],[pos('tile',1),pos('slot',2)],[pos('slot',2),pos('tile',0)]]){
  assert.equal(applyDrop(board,wallet,from,to),'move');assert.equal(unit.hasteEnhanced,true);
 }
 board.tiles[1].unit={type:'枪',level:1};assert.equal(applyDrop(board,wallet,pos('tile',0),pos('tile',1)),'swap');assert.equal(board.tiles[1].unit,unit);assert.equal(unit.hasteEnhanced,true);
});
for(const fromKind of ['slot','tile'])for(const toKind of ['slot','tile'])test('合成'+fromKind+'→'+toKind+'强化OR继承，不叠加、不改变封顶',()=>{
 for(const a of [false,true])for(const b of [false,true]){
  const {board,wallet}=setup(),source={type:'刀',level:2,...(a?{hasteEnhanced:true}:{})},target={type:'刀',level:2,...(b?{hasteEnhanced:true}:{})};
  if(fromKind==='slot')wallet.slots[0]=source;else board.tiles[0].unit=source;
  if(toKind==='slot')wallet.slots[1]=target;else board.tiles[1].unit=target;
  assert.equal(applyDrop(board,wallet,pos(fromKind,0),pos(toKind,1)),'merge');const merged=toKind==='slot'?wallet.slots[1]:board.tiles[1].unit;
  assert.equal(merged.level,3);assert.equal(!!merged.hasteEnhanced,a||b);
  assert.equal(getCombatStats(merged).attackInterval,getCombatStats({type:'刀',level:3}).attackInterval/(a||b?1.5:1));
 }
});
test('农民、铲子、休眠字和备战字不是如律令目标，失败保留ready',()=>{
 const {board,wallet,active}=setup();active.update(20000);
 for(const unit of [{kind:'farmer',type:'农',level:1},letter('小'),'铲']){
  wallet.slots[0]=unit;assert.equal(active.use(1,board,wallet,pos('slot',0)),false);
  if(unit!=='铲'){board.tiles[0].unit=unit;assert.equal(active.use(1,board,wallet,pos('tile',0)),false);}
 }
 assert.equal(active.use(1,board,wallet,null),false);assert.ok(active.ready(1));
});
for(const index of [0,1])test('武将任一字强化整个Link，另一字重复不可叠加，拆解/共享字不继承 '+index,()=>{
 const {board,wallet,active,progression}=setup();board.tiles[0].unit=letter('小');board.tiles[1].unit=letter('美');progression.sync();
 const old=[...progression.links.values()][0];active.update(20000);assert.ok(active.use(1,board,wallet,pos('tile',index)));assert.equal(old.hasteEnhanced,true);
 assert.equal(old.left.hasteEnhanced,undefined);assert.equal(old.right.hasteEnhanced,undefined);active.update(20000);
 assert.equal(active.use(1,board,wallet,pos('tile',1-index)),false);assert.ok(active.ready(1));
 applyDrop(board,wallet,pos('tile',1),pos('slot',0));assert.equal(progression.links.size,0);
 applyDrop(board,wallet,pos('slot',0),pos('tile',1));const fresh=[...progression.links.values()][0];assert.notEqual(fresh,old);assert.equal(fresh.hasteEnhanced,undefined);
 applyDrop(board,wallet,pos('tile',1),pos('slot',0));wallet.slots[1]=letter('六');applyDrop(board,wallet,pos('slot',1),pos('tile',1));
 assert.equal([...progression.links.values()][0].heroId,'xiaoliu');assert.equal([...progression.links.values()][0].hasteEnhanced,undefined);
});
test('强化实际提高普通兵和武将普攻次数，不改变武将技能CD',()=>{
 const map={name:'测试',mirrorY:-500,cellSize:60,path:[{x:0,y:0},{x:1000,y:0}],cells:[{x:60,y:50,unlocked:true},{x:120,y:50,unlocked:true}]};
 function count(hero,boost){const {board,wallet,active,progression}=setup(map);board.tiles[0].unit=hero?letter('小'):{type:'刀',level:1};if(hero)board.tiles[1].unit=letter('美');progression.sync();
  if(boost){active.update(20000);assert.ok(active.use(1,board,wallet,pos('tile',0)));}
  const sim=new CombatSimulation(map,board,wallet,{...combatConfig,enemy:{...combatConfig.enemy,maxHp:100000,moveSpeed:0}});sim.spawnEnemy();let hits=0;
  for(let time=0;time<6000;time+=10)hits+=sim.update(10).filter(e=>e.kind===(hero?'heroAttack':'attack')).length;
  return {hits,skill:hero?[...progression.links.values()][0].skill:null};
 }
 for(const hero of [false,true]){const normal=count(hero,false),boosted=count(hero,true);assert.ok(boosted.hits>normal.hits);if(hero)assert.deepEqual(boosted.skill,normal.skill);}
});
test('停止/销毁禁止两种道具生效，新局没有强化且CD重新初始化',()=>{
 const {board,wallet,active,gear}=setup();wallet.slots[0]={type:'刀',level:1};active.update(20000);active.stop();
 for(const index of [0,1])assert.equal(active.use(index,board,wallet,pos('slot',0)),false);assert.equal(wallet.money,100);
 active.destroy();active.update(50000);assert.equal(active.slots.length,0);const next=new ActiveItems(gear);assert.ok(next.ready(0));assert.equal(next.ready(1),false);
 assert.equal(createRecruitmentState(gear).slots.every(x=>x===null),true);
});

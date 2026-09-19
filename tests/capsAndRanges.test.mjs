import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const {MAX_LEVEL}=await import('../src/config/levels.ts');
const {CELL_SIZE,boardDisplay}=await import('../src/config/layout.ts');
const {getCombatStats}=await import('../src/config/combat.ts');
const {getHeroStats,heroRecipes}=await import('../src/config/heroes.ts');
const {testMap}=await import('../src/config/maps.ts');
const {createBoardState,applyDrop}=await import('../src/systems/board.ts');
const {createRecruitmentState}=await import('../src/systems/recruitment.ts');
const {getHeroProgression}=await import('../src/systems/heroProgression.ts');
const {mergeItems}=await import('../src/systems/items.ts');
const {selectTarget}=await import('../src/combat/targeting.ts');
const letter=(type,level)=>({kind:'heroLetter',type,level});

test('射程以75逻辑格为基准，枪固定2格、弓仅1到2增距、其他单位不增距',()=>{
 assert.equal(MAX_LEVEL,5);
 for(let level=1;level<=MAX_LEVEL;level++){
   assert.equal(getCombatStats({type:'枪',level}).range,2*CELL_SIZE);
   assert.equal(getCombatStats({type:'弓',level}).range,(level===1?2.5:3)*CELL_SIZE);
   assert.equal(getCombatStats({type:'刀',level}).range,115);
   assert.equal(getCombatStats({type:'骑',level}).range,145);
   for(const hero of heroRecipes)assert.equal(getHeroStats(level).range,230,hero.id);
 }
 assert.equal(getCombatStats({type:'枪',level:5}).range*boardDisplay.scale,168.75);
});
test('枪弓在新射程边界内可索敌，边界外不可索敌',()=>{
 for(const [type,level]of [['枪',1],['枪',5],['弓',1],['弓',2],['弓',5]]){
  const {range}=getCombatStats({type,level});
  const inside={id:1,x:range,y:0,hp:1,distance:1},outside={id:2,x:range+0.01,y:0,hp:1,distance:2};
  assert.equal(selectTarget([inside,outside],{x:0,y:0},range),inside);
 }
});
for(const kind of ['刀','枪','弓','骑','小','美','阿','饼','六'])test(`${kind}升级入口封顶，Lv.5不生成Lv.6`,()=>{
 const item=level=>['刀','枪','弓','骑'].includes(kind)?{type:kind,level}:letter(kind,level);
 for(let level=1;level<MAX_LEVEL;level++)assert.equal(mergeItems(item(level),item(level)).level,level+1);
 assert.equal(mergeItems(item(5),item(5)),null);assert.equal(mergeItems(item(1),item(5)),null);
});
for(const sourceKind of ['slot','tile'])for(const targetKind of ['slot','tile'])test(`${sourceKind}→${targetKind}封顶失败不吞普通兵或武将字材料`,()=>{
 for(const [source,target]of [[{type:'刀',level:5},{type:'刀',level:5}],[letter('小',1),letter('小',5)],[letter('小',5),letter('小',5)]]){
  const board=createBoardState(testMap),reserve=createRecruitmentState();
  if(sourceKind==='slot')reserve.slots[0]=source;else board.tiles[0].unit=source;
  if(targetKind==='slot')reserve.slots[1]=target;else board.tiles[1].unit=target;
  const before=structuredClone({board,reserve});
  assert.equal(applyDrop(board,reserve,{kind:sourceKind,index:0},{kind:targetKind,index:1}),'invalid');
  assert.deepEqual({board,reserve},before);
 }
});
test('EXP溢出最多到Lv.5并归零，重复奖励不累计；同步传播上限5且不重置技能',()=>{
 const board=createBoardState(testMap);board.tiles[0].unit=letter('小',4);board.tiles[1].unit=letter('美',1);
 const progression=getHeroProgression(board);progression.sync();const link=[...progression.links.values()][0],skill=link.skill;
 progression.recordDamage(1,link,10);progression.awardKill(1,1e9);
 assert.equal(link.level,5);assert.equal(link.currentExp,0);assert.equal(link.skill,skill);
 assert.deepEqual([link.left.level,link.right.level],[5,5]);
 progression.recordDamage(2,link,1);progression.awardKill(2,100);assert.equal(link.currentExp,0);
 board.tiles[0].unit.level=99;progression.sync();assert.equal(link.level,5);assert.equal(link.left.level,5);
});
test('新加入的12块锁定地皮都可用铲子解锁并部署，路径及9块开放地皮保持',()=>{
 assert.deepEqual(testMap.path,[{x:112.5,y:602.5},{x:112.5,y:677.5},{x:337.5,y:677.5},{x:337.5,y:902.5},{x:637.5,y:902.5}]);
 const board=createBoardState(testMap),reserve=createRecruitmentState();
 assert.equal(board.tiles.length,28);assert.equal(board.tiles.filter(t=>!t.unlocked).length,19);
 for(let index=16;index<28;index++){
  reserve.slots[0]='铲';assert.equal(applyDrop(board,reserve,{kind:'slot',index:0},{kind:'tile',index}),'unlock');
  reserve.slots[0]={type:'刀',level:1};assert.equal(applyDrop(board,reserve,{kind:'slot',index:0},{kind:'tile',index}),'move');
 }
});

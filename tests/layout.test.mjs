import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const {testMap,gridToWorld}=await import('../src/config/maps.ts');
const {CELL_SIZE,battleLayout,HALF_HEIGHT,controlsLayout,boardToScreen,boardDisplay}=await import('../src/config/layout.ts');
const {getBattlefieldLayout,transformBattlefieldPoint}=await import('../src/ui/boardLayout.ts');
const {createBoardState}=await import('../src/systems/board.ts');
const {CombatSimulation}=await import('../src/combat/CombatSimulation.ts');
const {buildPath,pointOnPath}=await import('../src/combat/path.ts');
const {heroRecipes}=await import('../src/config/heroes.ts');

test('当前地图8×5方格紧贴，16部署（9已解锁7锁定），道路及不可用位置互斥',()=>{
 assert.equal(CELL_SIZE,75);assert.equal(CELL_SIZE*8,battleLayout.width);assert.equal(HALF_HEIGHT,375);
 assert.equal(testMap.spaces.length,40);assert.equal(testMap.cells.length,16);
 assert.equal(testMap.cells.filter(c=>c.unlocked).length,9);
 assert.equal(new Set(testMap.spaces.map(p=>`${p.column}:${p.row}`)).size,40);
 for(const space of testMap.spaces){
   assert.deepEqual({x:space.x,y:space.y},gridToWorld(space));
   const cell=testMap.cells.find(c=>c.x===space.x&&c.y===space.y);
   assert.equal(!!cell,['deployment','locked'].includes(space.kind));
   assert.ok(space.x-CELL_SIZE/2>=75&&space.x+CELL_SIZE/2<=675);
   assert.ok(space.y-CELL_SIZE/2>=565&&space.y+CELL_SIZE/2<=940);
   if(space.column<7){const next=testMap.spaces.find(p=>p.column===space.column+1&&p.row===space.row);assert.equal(next.x-space.x,CELL_SIZE);}
 }
 const path=buildPath(testMap.path);
 for(let distance=0;distance<=path.totalLength;distance+=1){
   const p=pointOnPath(path,distance);
   assert.ok(testMap.spaces.some(s=>s.kind==='path'&&Math.abs(s.x-p.x)<=37.5&&Math.abs(s.y-p.y)<=37.5));
 }
 assert.ok(testMap.cells.filter(c=>testMap.cells.some(n=>n.y===c.y&&n.x===c.x+CELL_SIZE)).length>=8);
});
test('40个空间和入口/终点均使用相同180度变换，上下正好填满750高',()=>{
 const upper=getBattlefieldLayout(testMap,750,true);
 assert.deepEqual(upper.path[0],{x:637.5,y:527.5});assert.deepEqual(upper.path.at(-1),{x:112.5,y:227.5});
 for(const space of testMap.spaces){
   const p=transformBattlefieldPoint(testMap,750,true,space);
   assert.ok(p.y-37.5>=190&&p.y+37.5<=565);
   assert.deepEqual(transformBattlefieldPoint(testMap,750,true,p),{x:space.x,y:space.y});
 }
});
test('显示放大不改变逻辑棋盘，HUD间距及圆形被动槽边界',()=>{
 assert.deepEqual(boardToScreen(75,190),{x:37.5,y:110});
 assert.deepEqual(boardToScreen(675,940),{x:712.5,y:953.75});
 assert.equal(600*boardDisplay.scale/750,0.9);assert.equal(CELL_SIZE*boardDisplay.scale,84.375);
 assert.equal(CELL_SIZE,75);assert.equal(controlsLayout.top,953.75);
 assert.ok(controlsLayout.reserveY-42>controlsLayout.top);
 assert.ok(controlsLayout.reserveY+42<controlsLayout.recruitY-controlsLayout.recruitHeight/2);
 assert.ok(controlsLayout.recruitY+controlsLayout.recruitHeight/2<controlsLayout.feedbackY-10);
 assert.ok(controlsLayout.passiveY+2*controlsLayout.passiveStep+controlsLayout.passiveRadius<controlsLayout.feedbackY);
});
for(const type of ['刀','枪','弓','骑',...heroRecipes.map(r=>r.id)])test(`新地图${type}正常索敌攻击且路径可完整漏怪`,()=>{
 const board=createBoardState(testMap),wallet={money:0};
 const recipe=heroRecipes.find(r=>r.id===type);
 if(recipe)recipe.letters.forEach((char,i)=>board.tiles[i].unit={kind:'heroLetter',type:char,level:1});
 else board.tiles[0].unit={type,level:1};
 const sim=new CombatSimulation(testMap,board,wallet);const enemy=sim.spawnEnemy();enemy.hp=enemy.maxHp=10000;enemy.moveSpeed=0;
 for(let i=0;i<300;i++)sim.update(10);
 assert.ok(enemy.hp<10000);
 board.tiles.forEach(tile=>tile.unit=null);enemy.moveSpeed=55;
 let escaped=false;for(let i=0;i<1600;i++)escaped ||= sim.update(10).some(e=>e.kind==='escape');
 assert.equal(escaped,true);assert.equal(wallet.money,0);
});

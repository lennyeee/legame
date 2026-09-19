import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);}});
const {createInventory,setEquipped,createLoadout,copyLoadout}=await import('../src/systems/equipment.ts');
const {itemDefinitions,equipmentLimits}=await import('../src/config/equipment.ts');
const {gameConfig}=await import('../src/config/game.ts');

test('农民是已拥有未装备的Lv.1被动道具，未知/未拥有不可装备，装备卸下幂等',()=>{
 const inventory=createInventory();assert.deepEqual(inventory,itemDefinitions.map(({id})=>({id,level:1,owned:true,equipped:false})));assert.equal(inventory.length,3);
 assert.equal(itemDefinitions[0].category,'passive');assert.equal(itemDefinitions[0].name,'农民');
 assert.equal(setEquipped(inventory,'missing',true),false);
 inventory[0].owned=false;assert.equal(setEquipped(inventory,'farmer',true),false);inventory[0].owned=true;
 for(let n=0;n<3;n++)assert.equal(setEquipped(inventory,'farmer',true),true);
 assert.deepEqual(createLoadout(inventory).passive,[{id:'farmer',level:1}]);
 for(let n=0;n<3;n++)assert.equal(setEquipped(inventory,'farmer',false),true);
 assert.deepEqual(createLoadout(inventory),{active:[],passive:[]});
});
for(const category of ['active','passive'])test(`${category}逻辑层强制上限，卸下释放槽位，快照再次防止超额`,()=>{
 const limit=equipmentLimits[category];assert.equal(limit,category==='active'?2:6);
 const definitions=Array.from({length:limit+1},(_,i)=>({id:`test-${i}`,name:'测试',category,description:''}));
 const inventory=definitions.map(def=>({id:def.id,level:1,owned:true,equipped:false}));
 for(let i=0;i<limit;i++)assert.equal(setEquipped(inventory,definitions[i].id,true,definitions),true);
 assert.equal(setEquipped(inventory,definitions[limit].id,true,definitions),false);
 setEquipped(inventory,definitions[0].id,false,definitions);
 assert.equal(setEquipped(inventory,definitions[limit].id,true,definitions),true);
 inventory.forEach(item=>item.equipped=true);assert.equal(createLoadout(inventory,definitions)[category].length,limit);
});
test('主动被动独立计数，快照与背包隔离、去重并保留等级',()=>{
 const definitions=['active','passive'].flatMap(category=>Array.from({length:equipmentLimits[category]},(_,i)=>({id:`${category}-${i}`,name:'测试',category,description:''})));
 const inventory=definitions.map(def=>({id:def.id,level:2,owned:true,equipped:false}));
 inventory.forEach(item=>assert.equal(setEquipped(inventory,item.id,true,definitions),true));
 const loadout=createLoadout([...inventory,inventory[0]],definitions);
 assert.equal(loadout.active.length,2);assert.equal(loadout.passive.length,6);
 inventory[0].level=10;inventory[0].equipped=false;assert.equal(loadout.active[0].level,2);
 assert.equal(Object.isFrozen(loadout),true);assert.equal(Object.isFrozen(loadout.active[0]),true);
});
test('重开loadout复制，新背包重置，征兵池没有农民',()=>{
 const inventory=createInventory();setEquipped(inventory,'farmer',true);
 const original=createLoadout(inventory),fresh=copyLoadout(original);
 assert.deepEqual(fresh,original);assert.notEqual(fresh,original);assert.notEqual(fresh.passive[0],original.passive[0]);
 assert.deepEqual(createLoadout(createInventory()).passive,[]);
 assert.deepEqual(gameConfig.recruitmentPool,['刀','枪','弓','骑','铲','小','美','阿','饼','六']);
});

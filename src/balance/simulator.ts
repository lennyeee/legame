import { Match } from '../match/Match';
import { testMap, gridToWorld } from '../config/maps';
import { combatConfig, unitCombatStats, unitLevelStats } from '../config/combat';
import { pressureConfig, enemyCountForWave } from '../config/pressure';
import type { PressureConfig } from '../config/pressure';
import { heroGrowth, heroCombat } from '../config/heroes';
import { itemEffects } from '../config/itemEffects';
import { skillConfigs } from '../config/skills';
import { createInventory, setEquipped, createLoadout } from '../systems/equipment';
import { recruitmentPrice, recruit as recruitState } from '../systems/recruitment';
import type { PlayerSide } from '../systems/PlayerSide';
import type { Enemy } from '../combat/enemies';
import { analysisConfig } from './scenarios';
import type { CalibrationScenario } from './scenarios';

interface Moment { timeMs: number; wave: number }
interface TrackedEnemy { enemy: Enemy; bornMs: number; wave: number }
interface WaveObservation {
  wave: number; spawned: number; killed: number; leaked: number; lifeMs: number;
  maxProgress: number; firstSpawnMs: number; lastResolutionMs: number;
}
interface Sample extends Moment {
  spawned: number; killed: number; alive: number; money: number; killIncome: number;
  recruitSpending: number; health: number; meanKilledLifeMs: number; maxProgress: number;
  recruitAffordable: boolean; successfulRecruits: number;
  budgetRecruitments: number;
}
export interface SimulationOptions {
  pressure?: PressureConfig;
  maxElapsedMs?: number;
  random?: () => number;
  // Optional legal operation script. The simulator never implements recruitment/merge/item rules.
  operate?: (side: PlayerSide, timeMs: number, random: () => number) => void;
}

export function simulateBalance(scenario: CalibrationScenario, options: SimulationOptions = {}) {
  const inventory = createInventory();
  for (const id of scenario.loadoutIds ?? []) {
    if (!setEquipped(inventory,id,true)) throw new Error(`Invalid analysis loadout: ${id}`);
  }
  const loadout = createLoadout(inventory);
  const config = {...(options.pressure ?? pressureConfig)};
  const match = new Match(testMap,loadout,loadout,config);
  // Mirror the same fixed fixture on both independent sides so opponent survival cannot prematurely stop observation.
  for (const side of Object.values(match.sides)) {
    for (const placement of scenario.formation) {
      const point = gridToWorld(placement);
      const index = testMap.cells.findIndex(cell=>cell.x===point.x&&cell.y===point.y);
      if (index < 0 || side.board.tiles[index]!.unit) throw new Error('Analysis placement is not distinct legal land');
      side.board.tiles[index]!.unlocked = true;
      side.recruitment.slots[0] = {...placement.unit};
      if (side.drop({kind:'slot',index:0},{kind:'tile',index})!=='move') throw new Error('Analysis deployment failed');
    }
    side.syncDeployment(null);
  }
  const side=match.bottomSide, tracked=new Map<number,TrackedEnemy>(), waves=new Map<number,WaveObservation>();
  let spawned=0,killed=0,killIncome=0,lifeMs=0,maxProgress=0,recruitSpending=0,affordableMs=0;
  let firstLeak:Moment|null=null,firstBacklog:Moment|null=null,backlogSince:Moment|null=null;
  const heroMilestones:Record<string,Record<number,Moment>>={},samples:Sample[]=[];
  const initialHeroLevels = Object.fromEntries([...side.heroes.links.values()].map(link=>[link.heroId,link.level]));
  for(const [id,level] of Object.entries(initialHeroLevels))heroMilestones[id]={[level]:{timeMs:0,wave:1}};
  const step=combatConfig.stepMs,maxTime=options.maxElapsedMs??analysisConfig.maxElapsedMs;
  if (!Number.isFinite(maxTime)||maxTime<0) throw new RangeError('Invalid simulation duration');
  const spawn=side.combat.spawnEnemy.bind(side.combat);
  // Observation only: all entities and all attacks are still created/resolved by the production systems.
  side.combat.spawnEnemy=(multiplier=1)=>{
    const enemy=spawn(multiplier),timeMs=match.timeline.elapsedMs,wave=match.timeline.wave;
    // During overlap the event's origin wave need not equal the HUD wave: observe the existing event boundary.
    const event=pendingSpawns.shift();
    const originWave=event?.wave??wave;
    tracked.set(enemy.id,{enemy,bornMs:timeMs,wave:originWave});spawned++;
    const cohort=waves.get(originWave)??{wave:originWave,spawned:0,killed:0,leaked:0,lifeMs:0,maxProgress:0,
      firstSpawnMs:timeMs,lastResolutionMs:timeMs};
    cohort.spawned++;waves.set(originWave,cohort);
    return enemy;
  };
  const pendingSpawns:{wave:number}[]=[];
  const advance=match.timeline.advance.bind(match.timeline);
  match.timeline.advance=delta=>{const events=advance(delta);pendingSpawns.push(...events);return events;};
  const recruit=side.recruit.bind(side);
  side.recruit=random=>{
    const price=recruitmentPrice(side.recruitment),success=recruit(random);
    if(success)recruitSpending+=price;
    return success;
  };
  let nextSample=0;
  let maxBudgetRecruitments=0;
  for(let time=0;time+step<=maxTime+1e-8&&match.running;time+=step){
    for(const player of Object.values(match.sides))options.operate?.(player,match.timeline.elapsedMs,options.random??(()=>0));
    if(side.canRecruit())affordableMs+=step;
    const events=match.update(step).bottom,now=match.timeline.elapsedMs;
    for(const record of tracked.values()){
      const progress=record.enemy.distance/side.combat.path.totalLength;
      maxProgress=Math.max(maxProgress,progress);
      const cohort=waves.get(record.wave)!;cohort.maxProgress=Math.max(cohort.maxProgress,progress);
    }
    for(const event of events){
      if(event.kind!=='kill'&&event.kind!=='escape')continue;
      const record=tracked.get(event.enemyId);
      if(!record)throw new Error('Unobserved analysis enemy');
      const cohort=waves.get(record.wave)!;cohort.lastResolutionMs=now;
      if(event.kind==='kill'){
        killed++;killIncome+=event.reward;lifeMs+=now-record.bornMs;
        cohort.killed++;cohort.lifeMs+=now-record.bornMs;
      }else{cohort.leaked++;firstLeak??={timeMs:now,wave:match.timeline.wave};}
      tracked.delete(event.enemyId);
    }
    const alive=side.combat.enemies.length;
    const pressing=alive>=analysisConfig.backlogCount&&side.combat.enemies.some(e=>
      e.distance/side.combat.path.totalLength>=analysisConfig.backlogProgress);
    if(pressing){
      backlogSince??={timeMs:now,wave:match.timeline.wave};
      if(now-backlogSince.timeMs>=analysisConfig.backlogDurationMs)firstBacklog??={...backlogSince};
    }else backlogSince=null;
    for(const link of side.heroes.links.values()){
      const milestones=heroMilestones[link.heroId]??={};
      for(let level=initialHeroLevels[link.heroId]??1;level<=link.level;level++)milestones[level]??={timeMs:now,wave:match.timeline.wave};
    }
    if(now+1e-8>=nextSample||!match.running){
      // Counterfactual budget only; use the real recruitment rules on an isolated state copy.
      // No RNG peeking and no mutations/benefits for the live analysis side.
      const budget={...side.recruitment,slots:[...side.recruitment.slots]};
      let budgetRecruitments=0;
      while(recruitState(budget,()=>0))budgetRecruitments++;
      maxBudgetRecruitments=Math.max(maxBudgetRecruitments,budgetRecruitments);
      samples.push({timeMs:now,wave:match.timeline.wave,spawned,killed,alive,money:side.recruitment.money,
        killIncome,recruitSpending,health:match.health.bottom,meanKilledLifeMs:killed?lifeMs/killed:0,
        maxProgress,recruitAffordable:side.canRecruit(),successfulRecruits:side.recruitment.successfulRecruits,
        budgetRecruitments});
      nextSample=now+analysisConfig.sampleIntervalMs;
    }
  }
  let lockStart:number|null=null,maxEntranceLockMs=0;
  for(const cohort of waves.values()){
    // Require a fully resolved scheduled cohort; a partial wave cannot masquerade as entrance lock.
    const complete=cohort.spawned===enemyCountForWave(cohort.wave,config)&&cohort.killed===cohort.spawned;
    const locked=complete&&cohort.lifeMs/cohort.killed<=analysisConfig.entranceLifeMs
      &&cohort.maxProgress<=analysisConfig.entranceProgress;
    if(locked){lockStart??=cohort.firstSpawnMs;maxEntranceLockMs=Math.max(maxEntranceLockMs,cohort.lastResolutionMs-lockStart);}
    else lockStart=null;
  }
  const result={scenario:scenario.id,name:scenario.name,formation:scenario.formation,loadout,
    pressure:config,combat:{ordinaryLevelStats:structuredClone(unitLevelStats),heroCombat:{...heroCombat},heroGrowth:{...heroGrowth},
      ordinaryStats:structuredClone(unitCombatStats),skills:structuredClone(skillConfigs),
      enemy:{...combatConfig.enemy},visualRadius:combatConfig.visuals.enemyRadius,
      upgradeCooldownMs:itemEffects.upgradeCooldownMs},metrics:{...analysisConfig},
    elapsedMs:match.timeline.elapsedMs,wave:match.timeline.wave,spawned,killed,alive:side.combat.enemies.length,
    firstBacklog,firstLeak,defeat:match.result?{timeMs:match.timeline.elapsedMs,wave:match.timeline.wave}:null,
    health:match.health.bottom,killIncome,recruitSpending,money:side.recruitment.money,
    recruitAffordableMs:affordableMs,successfulRecruits:side.recruitment.successfulRecruits,
    maxBudgetRecruitments,
    meanKilledLifeMs:killed?lifeMs/killed:0,maxPathProgress:maxProgress,maxEntranceLockMs,
    initialHeroLevels,heroMilestones,heroes:[...side.heroes.links.values()].map(link=>({id:link.heroId,level:link.level,exp:link.currentExp})),
    finalComposition:side.board.tiles.flatMap((tile,index)=>tile.unit?[{index,...tile.unit}]:[]),
    waves:[...waves.values()],samples};
  match.destroy();
  return result;
}

import { registerHooks,stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
registerHooks({
  resolve(s,c,next){if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s))s+='.ts';return next(s,c);},
  load(url,c,next){return url.endsWith('.ts')?{format:'module',shortCircuit:true,
    source:stripTypeScriptTypes(readFileSync(new URL(url),'utf8'),{mode:'transform'})}:next(url,c);},
});
const { simulateBalance }=await import('../src/balance/simulator.ts');
const { calibrationScenarios,referencePressure }=await import('../src/balance/scenarios.ts');
const args=process.argv.slice(2),selected=args.find(a=>a.startsWith('--scenario='))?.split('=')[1];
const scenarios=selected?calibrationScenarios.filter(s=>s.id===selected):calibrationScenarios;
if(!scenarios.length)throw new Error('Unknown scenario');
const results=scenarios.map(s=>simulateBalance(s,{pressure:args.includes('--reference-pressure')?referencePressure:undefined}));
if(args.includes('--json'))console.log(JSON.stringify(results,null,2));
else {
  const moment=m=>m?`${m.wave} / ${(m.timeMs/1000).toFixed(1)}s`:'—';
  console.table(results.map(r=>({Scenario:r.scenario,Formation:r.formation.map(p=>`${p.unit.type}${p.unit.level}`).join(' '),
    Backlog:moment(r.firstBacklog),Leak:moment(r.firstLeak),Defeat:moment(r.defeat),
    LockSeconds:(r.maxEntranceLockMs/1000).toFixed(1),Kills:r.killed,KillIncome:r.killIncome,
    Money:r.money,RecruitSpending:r.recruitSpending,SuccessfulRecruits:r.successfulRecruits,
    BudgetRecruits:r.maxBudgetRecruitments,MeanLifeSeconds:(r.meanKilledLifeMs/1000).toFixed(1),
    Heroes:r.heroes.map(h=>`${h.id} Lv${h.level}`).join(' ')})));
  for(const r of results)if(r.heroes.length)console.log(r.scenario,'level milestones',r.heroMilestones);
  console.log('Fixed formation analysis; not a live player or a declaration of completed balance. Use --json for samples/economy/cohorts.');
}

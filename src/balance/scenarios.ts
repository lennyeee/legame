import { pressureConfig } from '../config/pressure';
import type { PressureConfig } from '../config/pressure';
import type { Deployable } from '../systems/items';
import type { HeroId } from '../config/heroes';

export interface Placement { column: number; row: number; unit: Deployable }
export interface CalibrationScenario {
  id: string;
  name: string;
  formation: Placement[];
  loadoutIds?: string[];
}
const soldier = (column: number, row: number, type: '刀' | '枪' | '弓' | '骑', level: number): Placement =>
  ({ column, row, unit: { type, level } });
const early = [soldier(1,0,'刀',2), soldier(2,0,'弓',3), soldier(4,1,'骑',2),
  soldier(4,2,'枪',2), soldier(1,2,'弓',1), soldier(2,2,'刀',1)];
const mid = [...early.map((p,i) => ({...p,unit:{...p.unit,level:i===1||i===3?4:3}})),
  soldier(5,0,'弓',2), soldier(5,1,'枪',2), soldier(5,2,'骑',2), soldier(2,4,'刀',2)];
const strong = [...mid.map(p=>({...p,unit:{...p.unit,level:4}})),
  soldier(4,3,'骑',4), soldier(2,3,'枪',4), soldier(6,3,'弓',4), soldier(7,3,'弓',4)];
function heroScenario(id: HeroId, letters: readonly ['小'|'阿', '美'|'饼'|'六'], supported = false): CalibrationScenario {
  const defenders = supported ? strong.filter(p=>!(p.column===2&&p.row===0))
    : [soldier(1,0,'刀',2),soldier(4,1,'骑',2),soldier(4,2,'枪',2),soldier(1,2,'弓',3)];
  return {id:supported?`supported-${id}`:id,name:supported?`G Supported ${id}`:id,formation:[...defenders,
    ...letters.map((type,i):Placement=>({column:2+i,row:0,unit:{kind:'heroLetter',type,level:1}}))]};
}
// Explicit analysis fixtures, not live-player/AI gifts. Locked cells are opened only for fixed formation analysis.
export const calibrationScenarios: CalibrationScenario[] = [
  {id:'weak',name:'A One Lv1 knife',formation:[soldier(1,0,'刀',1)]},
  {id:'two-knives',name:'A2 Two Lv1 knives',formation:[soldier(1,0,'刀',1),soldier(1,2,'刀',1)]},
  {id:'early',name:'B Natural early',formation:early},
  {id:'mid',name:'C Mid ordinary',formation:mid},
  {id:'two-cores',name:'D Two Lv5 cores',formation:[soldier(2,0,'弓',5),soldier(4,2,'枪',5),
    soldier(1,0,'刀',1),soldier(4,1,'骑',1)]},
  {id:'strong',name:'E Strong mixed',formation:strong},
  {id:'high-end',name:'F High-end Lv5',formation:strong.map(p=>({...p,unit:{...p.unit,level:5}}))},
  {id:'high-end-heroes',name:'F2 High-end plus three Lv5 heroes',formation:[
    ...strong.filter(p=>![[2,0],[5,0],[1,2],[2,2]].some(([x,y])=>p.column===x&&p.row===y))
      .map(p=>({...p,unit:{...p.unit,level:5}})),
    ...(['小','美','阿','饼','小','六'] as const).map((type,i):Placement=>({column:[2,3,4,5,1,2][i]!,row:i<4?0:2,
      unit:{kind:'heroLetter',type,level:5}}))]},
  heroScenario('xiaomei',['小','美']),heroScenario('abing',['阿','饼']),heroScenario('xiaoliu',['小','六']),
  heroScenario('xiaomei',['小','美'],true),heroScenario('abing',['阿','饼'],true),heroScenario('xiaoliu',['小','六'],true),
];

// Frozen v0.62-A pressure for controlled comparisons using the same current Combat/body rules.
export const referencePressure: PressureConfig = {...pressureConfig,firstEnemyDelay:9500,waveStartInterval:20000,
  // 保留历史压力快照；100波覆盖900秒分析窗口，不参与正式对局配置。
  waves:Array.from({length:100},(_,i)=>({
    hp:Math.round(90*(1+.35*Math.floor(i/5)+.05*(i%5))),
    count:Math.min(80,5+2*Math.floor(i/5)+Math.floor((i%5)/2)+((i+1)%5===0?2:0)),
    spawnInterval:Math.max(500,2000-150*Math.floor(i/5)),
  })),spawnInterval:500};

export const analysisConfig = {
  maxElapsedMs: 900000, sampleIntervalMs: 5000,
  backlogCount: 6, backlogProgress: .3, backlogDurationMs: 3000,
  entranceLifeMs: 1500, entranceProgress: .15,
};

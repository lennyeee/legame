import { battleLayout, CELL_SIZE, MIRROR_Y } from './layout';

export interface MapPoint {
  x: number;
  y: number;
}

export interface DeploymentCell extends MapPoint {
  unlocked: boolean;
}

export interface BoardMap {
  name: string;
  spaces?: readonly MapSpace[];
  mirrorY: number;
  cellSize: number;
  path: readonly MapPoint[];
  cells: readonly DeploymentCell[];
}

export interface GridPoint { column: number; row: number }
export interface MapSpace extends MapPoint, GridPoint { kind: 'path' | 'deployment' | 'locked' }
export function gridToWorld(point: GridPoint): MapPoint {
  return { x: battleLayout.left + (point.column + 0.5) * CELL_SIZE,
    y: MIRROR_Y + (point.row + 0.5) * CELL_SIZE };
}
// 唯一下半场地图数据。道路沿格心移动，上半场仅由180°变换生成。
const pathGrid: readonly GridPoint[] = [
  {column:0,row:0},{column:0,row:1},{column:3,row:1},{column:3,row:4},{column:7,row:4},
];
const deploymentGrid = [
  [1,0,true],[2,0,true],[4,1,true],[5,1,false],
  [1,2,true],[2,2,false],[4,2,true],[5,2,false],
  [1,4,false],[2,4,false],[3,0,true],[4,0,false],
  [5,0,true],[6,0,false],[6,1,true],[7,1,true],
] as const;
const spaces: MapSpace[] = Array.from({length:battleLayout.columns * battleLayout.rows}, (_,index) => {
  const point={column:index % battleLayout.columns,row:Math.floor(index / battleLayout.columns)};
  const road=pathGrid.slice(1).some((end,i)=>{
    const start=pathGrid[i]!;
    return point.column>=Math.min(start.column,end.column)&&point.column<=Math.max(start.column,end.column)
      &&point.row>=Math.min(start.row,end.row)&&point.row<=Math.max(start.row,end.row);
  });
  const cell=deploymentGrid.find(([column,row])=>column===point.column&&row===point.row);
  return {...point,...gridToWorld(point),kind:road?'path':cell?.[2]?'deployment':'locked'};
});
export const testMap: BoardMap = {
  name:'训练场', mirrorY:MIRROR_Y, cellSize:CELL_SIZE, spaces,
  path:pathGrid.map(gridToWorld),
  cells:[...deploymentGrid.map(([column,row,unlocked])=>({...gridToWorld({column,row}),unlocked})),
    ...spaces.filter(space=>space.kind==='locked'&&!deploymentGrid.some(([column,row])=>column===space.column&&row===space.row))
      .map(space=>({x:space.x,y:space.y,unlocked:false}))],
};

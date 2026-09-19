import { CELL_SIZE } from './layout';
// 逻辑格尺度；显示层等比缩放实际射程和预览圆，不改变索敌判断。
export const attackRangeCells = { 刀: 115 / CELL_SIZE, 枪: 2, 弓: 2.5, 弓进阶: 3, 骑: 145 / CELL_SIZE, hero: 230 / CELL_SIZE };
export const rangePixels = (cells: number): number => Math.round(cells * CELL_SIZE * 1e6) / 1e6;

import type { Recruit } from '../config/game';

export interface Unit {
  type: Exclude<Recruit, '铲'>;
  level: number;
}

export type ReserveItem = Unit | '铲';

// 只保存值，不持有Match或PlayerSide引用；结算UI在旧局销毁后仍可安全读取。
export interface ResultSnapshot {
  readonly matchId: string;
  readonly result: 'win' | 'lose' | 'draw';
  readonly waveReached: number;
  readonly playerKills: number;
  readonly playerSuccessfulRecruits: number;
  readonly playerRemainingMoney: number;
  readonly playerRemainingHp: number;
  readonly opponentRemainingHp: number;
}

export const resultPresentation = { delayMs: 400 } as const;

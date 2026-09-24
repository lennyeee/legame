import type { ReserveItem } from '../systems/items';
import type { PlayerSide } from '../systems/PlayerSide';

// 开发场景脚本只准备对手防守棋盘；刷怪完全由MatchTimeline驱动。
export function setupDevTopSide(side: PlayerSide) {
  const place = (item: ReserveItem, index: number): void => {
    side.recruitment.slots[0] = item;
    if (side.drop({ kind: 'slot', index: 0 }, { kind: 'tile', index }) !== 'move') {
      throw new Error(`开发对手部署格 ${index} 不可用`);
    }
  };
  place({ kind: 'heroLetter', type: '小', level: 2 }, 0);
  place({ kind: 'heroLetter', type: '美', level: 2 }, 1);
  place({ type: '刀', level: 3 }, 2);
  place({ kind: 'farmer', type: '农', level: 2 }, 6);
  place({ kind: 'heroLetter', type: '六', level: 1 }, 10);
  place({ type: '弓', level: 1 }, 12);
  side.recruitment.slots[0] = '铲';
  side.drop({ kind: 'slot', index: 0 }, { kind: 'tile', index: 3 });
  side.board.tiles[3]!.bonusType = 'attack';

}

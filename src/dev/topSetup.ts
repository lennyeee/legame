import type { ReserveItem } from '../systems/items';
import type { PlayerSide } from '../systems/PlayerSide';
import { advanceEnemy } from '../combat/enemies';

// v0.60-B 开发场景脚本：只准备可观察的对手棋盘和测试敌人；后续由 AIController 替换。
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

  const first = side.combat.spawnEnemy();
  const second = side.combat.spawnEnemy();
  advanceEnemy(second, side.combat.path, 2.5);
  let elapsed = 0;
  return {
    update(delta: number): void {
      if (!side.running) return;
      elapsed += delta;
      while (elapsed >= 8_000) {
        elapsed -= 8_000;
        side.combat.spawnEnemy();
      }
    },
    initialEnemyIds: [first.id, second.id],
  };
}

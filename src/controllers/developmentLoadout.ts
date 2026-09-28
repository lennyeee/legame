import { developmentAILoadout } from '../config/ai';
import { createInventory, createLoadout, setEquipped } from '../systems/equipment';
import { drawRandom } from '../utils/random';

// 每局生成一次并由createLoadout校验/冻结；以后替换此策略，不影响AI规则入口。
export function createDevelopmentAILoadout(random?: () => number) {
  const inventory = createInventory();
  const choose = (pool: readonly string[], count: number) => {
    const remaining = [...pool];
    for (let i = 0; i < count && remaining.length; i++) {
      const id = drawRandom(remaining, 1, random)[0]!;
      setEquipped(inventory, id, true);
      remaining.splice(remaining.indexOf(id), 1);
    }
  };
  setEquipped(inventory, developmentAILoadout.requiredPassive, true);
  choose(developmentAILoadout.activePool, developmentAILoadout.activeCount);
  choose(developmentAILoadout.passivePool, developmentAILoadout.extraPassiveCount);
  return createLoadout(inventory);
}

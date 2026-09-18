import type Phaser from 'phaser';
import { boardDisplay, boardToScreen } from '../config/layout';

// 仅包装战场绘图工厂：路径、特效、文字使用同一显示变换，规则仍读取原地图。
export function boardDisplayScene(scene: Phaser.Scene): Phaser.Scene {
  const add = new Proxy(scene.add, {
    get(factory, key, receiver) {
      const value = Reflect.get(factory, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const object = Reflect.apply(value, factory, args) as Phaser.GameObjects.Graphics;
        const point = boardToScreen(object.x, object.y);
        object.setPosition(point.x, point.y).setScale(boardDisplay.scale);
        return object;
      };
    },
  });
  return new Proxy(scene, { get(target, key, receiver) { return key === 'add' ? add : Reflect.get(target, key, receiver); } });
}

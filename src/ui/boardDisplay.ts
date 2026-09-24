import type Phaser from 'phaser';
import type { BoardMap, MapPoint } from '../config/maps';
import { boardDisplay, boardToScreen } from '../config/layout';
import { transformBattlefieldPoint } from './boardLayout';

export type DisplaySide = 'bottom' | 'top';
export const BATTLEFIELD_DIVIDER_PX = 6;

// 地图坐标始终属于同一份逻辑地图；镜像和分界带间距只在这里投影到屏幕。
export function boardProjection(map: BoardMap, screenWidth: number, side: DisplaySide) {
  const upper = side === 'top';
  const shiftY = upper ? -BATTLEFIELD_DIVIDER_PX / 2 : BATTLEFIELD_DIVIDER_PX / 2;
  return {
    point(point: MapPoint): MapPoint {
      const world = transformBattlefieldPoint(map, screenWidth, upper, point);
      const screen = boardToScreen(world.x, world.y);
      return { x: screen.x, y: screen.y + shiftY };
    },
    angle(radians: number): number { return upper ? radians + Math.PI : radians; },
    aboveRectY(y: number, radius: number, gap: number, height: number): number {
      return upper ? y + radius + gap : y - radius - gap - height;
    },
    // Graphics 使用逻辑坐标画路径、射程和特效；仅几何图形反向缩放，文字始终正向。
    graphicsTransform() {
      return upper
        ? { x: boardDisplay.x + screenWidth * boardDisplay.scale,
          y: boardDisplay.y + 2 * map.mirrorY * boardDisplay.scale + shiftY,
          scale: -boardDisplay.scale }
        : { x: boardDisplay.x, y: boardDisplay.y + shiftY, scale: boardDisplay.scale };
    },
  };
}

export function boardGraphics(scene: Phaser.Scene, map: BoardMap, side: DisplaySide): Phaser.GameObjects.Graphics {
  const transform = boardProjection(map, scene.scale?.width ?? 750, side).graphicsTransform();
  return scene.add.graphics().setPosition(transform.x, transform.y).setScale(transform.scale);
}

export function boardDisplayScene(scene: Phaser.Scene, map: BoardMap, side: DisplaySide): Phaser.Scene {
  const projection = boardProjection(map, scene.scale?.width ?? 750, side);
  const add = new Proxy(scene.add, {
    get(factory, key, receiver) {
      const value = Reflect.get(factory, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        if (key === 'graphics') return boardGraphics(scene, map, side);
        const object = Reflect.apply(value, factory, args) as Phaser.GameObjects.Graphics;
        const point = projection.point(object);
        object.setPosition(point.x, point.y).setScale(boardDisplay.scale);
        return object;
      };
    },
  });
  return new Proxy(scene, { get(target, key, receiver) { return key === 'add' ? add : Reflect.get(target, key, receiver); } });
}

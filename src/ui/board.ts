import Phaser from 'phaser';
import type { BoardMap } from '../config/maps';
import { label } from './text';
import { battleLayout, boardDisplay, boardToScreen, HALF_HEIGHT } from '../config/layout';
import { BATTLEFIELD_DIVIDER_PX, boardDisplayScene, boardProjection } from './boardDisplay';
import type { DisplaySide } from './boardDisplay';

export function drawBoard(scene: Phaser.Scene, map: BoardMap): void {
  const center = boardToScreen(scene.scale.width / 2, map.mirrorY);
  scene.add.rectangle(center.x, center.y, battleLayout.width * boardDisplay.scale,
    HALF_HEIGHT * 2 * boardDisplay.scale + BATTLEFIELD_DIVIDER_PX, 0xeee9dc).setStrokeStyle(2, 0xd9d1c0);
  // 两半场分别让出3屏幕像素，此带填满真实空隙，不覆盖部署格。
  scene.add.rectangle(center.x, center.y, battleLayout.width * boardDisplay.scale,
    BATTLEFIELD_DIVIDER_PX, 0x899184);

  const drawHalf = (side: DisplaySide): void => {
    const field = boardDisplayScene(scene, map, side);
    const projection = boardProjection(map, scene.scale.width, side);
    const nodes = map.path;
    for (const space of map.spaces ?? []) {
      field.add.rectangle(space.x, space.y, map.cellSize, map.cellSize, space.kind === 'path' ? 0xd1b98f : 0xe7e2d6)
        .setStrokeStyle(1, 0xd0c7b5);
    }
    const path = field.add.graphics();
    path.lineStyle(map.cellSize * 0.45, 0xd1b98f, 1);
    path.beginPath();
    nodes.forEach((point, index) => {
      if (index === 0) path.moveTo(point.x, point.y);
      else path.lineTo(point.x, point.y);
    });
    path.strokePath();

    // 每段路径绘制一个指向下一节点的箭头。
    nodes.slice(1).forEach((end, index) => {
      const start = nodes[index]!;
      const angle = Phaser.Math.Angle.Between(start.x, start.y, end.x, end.y);
      field.add.triangle(
        (start.x + end.x) / 2, (start.y + end.y) / 2,
        0, 0, 0, 16, 14, 8, 0x8b724b,
      ).setRotation(projection.angle(angle));
    });

    const entry = nodes[0]!;
    const goal = nodes[nodes.length - 1]!;
    label(field, entry.x, entry.y, '入口', 20, '#6b583c');
    field.add.circle(goal.x, goal.y, 30, 0x697e67);
    label(field, goal.x, goal.y, '乐', 32, '#fffaf0');
  };

  drawHalf('top');
  drawHalf('bottom');
}

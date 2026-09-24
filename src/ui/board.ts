import Phaser from 'phaser';
import type { BoardMap } from '../config/maps';
import { label } from './text';
import { getBattlefieldLayout, transformBattlefieldPoint } from './boardLayout';
import { battleLayout, HALF_HEIGHT } from '../config/layout';

export function drawBoard(scene: Phaser.Scene, map: BoardMap): void {
  scene.add.rectangle(375, map.mirrorY, battleLayout.width, HALF_HEIGHT * 2, 0xeee9dc).setStrokeStyle(2, 0xd9d1c0);

  const drawHalf = (mirrored: boolean): void => {
    const { path: nodes, cells } = getBattlefieldLayout(map, scene.scale.width, mirrored);
    for (const space of map.spaces ?? []) {
      const { x, y } = transformBattlefieldPoint(map, scene.scale.width, mirrored, space);
      scene.add.rectangle(x, y, map.cellSize, map.cellSize, space.kind === 'path' ? 0xd1b98f : 0xe7e2d6)
        .setStrokeStyle(1, 0xd0c7b5);
    }
    const path = scene.add.graphics();
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
      scene.add.triangle(
        (start.x + end.x) / 2, (start.y + end.y) / 2,
        0, 0, 0, 16, 14, 8, 0x8b724b,
      ).setRotation(angle);
    });

    if (mirrored) cells.forEach((cell) => {
      scene.add.rectangle(cell.x, cell.y, map.cellSize, map.cellSize,
        cell.unlocked ? 0xfffcf4 : 0xc8c0af,
      ).setStrokeStyle(2, cell.unlocked ? 0x87937d : 0xc2bcae);
      label(scene, cell.x, cell.y, cell.unlocked ? '+' : '锁',
        cell.unlocked ? 32 : 21, cell.unlocked ? '#798970' : '#999284',
      );
    });

    const entry = nodes[0]!;
    const goal = nodes[nodes.length - 1]!;
    label(scene, entry.x, entry.y, '入口', 20, '#6b583c');
    scene.add.circle(goal.x, goal.y, 30, 0x697e67);
    label(scene, goal.x, goal.y, '乐', 32, '#fffaf0');
  };

  drawHalf(true);
  drawHalf(false);
  const divider = scene.add.graphics();
  divider.lineStyle(3, 0x899184, 1).beginPath();
  divider.moveTo(0, map.mirrorY).lineTo(battleLayout.width, map.mirrorY).strokePath();
}

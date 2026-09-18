import Phaser from 'phaser';
import type { BoardMap } from '../config/maps';
import { label } from './text';
import { getBattlefieldLayout } from './boardLayout';

export function drawBoard(scene: Phaser.Scene, map: BoardMap): void {
  scene.add.rectangle(375, 593, 686, 786, 0xeee9dc).setStrokeStyle(2, 0xd9d1c0);

  const drawHalf = (mirrored: boolean): void => {
    const { path: nodes, cells } = getBattlefieldLayout(map, scene.scale.width, mirrored);
    const alpha = mirrored ? 0.4 : 1;
    const path = scene.add.graphics().setAlpha(alpha);
    path.lineStyle(38, 0xd1b98f, 1);
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
      ).setRotation(angle).setAlpha(alpha);
    });

    if (mirrored) cells.forEach((cell) => {
      scene.add.rectangle(cell.x, cell.y, map.cellSize, map.cellSize,
        cell.unlocked ? 0xfffcf4 : 0xdcd7ca,
      ).setStrokeStyle(2, cell.unlocked ? 0x87937d : 0xc2bcae).setAlpha(alpha);
      label(scene, cell.x, cell.y, cell.unlocked ? '+' : '锁',
        cell.unlocked ? 32 : 21, cell.unlocked ? '#798970' : '#999284',
      ).setAlpha(alpha);
    });

    const entry = nodes[0]!;
    const goal = nodes[nodes.length - 1]!;
    label(scene, entry.x, entry.y, '入口', 20, '#6b583c').setAlpha(alpha);
    scene.add.circle(goal.x, goal.y, 30, 0x697e67).setAlpha(alpha);
    label(scene, goal.x, goal.y, '乐', 32, '#fffaf0').setAlpha(alpha);
  };

  drawHalf(true);
  drawHalf(false);
  scene.add.rectangle(375, map.mirrorY, 622, 2, 0xc8beaa);
}

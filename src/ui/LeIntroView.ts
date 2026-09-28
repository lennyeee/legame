import type Phaser from 'phaser';
import type { BoardMap } from '../config/maps';
import { buildPath, pointOnPath } from '../combat/path';
import { flowConfig } from '../flow/battleSetup';
import { boardDisplayScene, boardProjection } from './boardDisplay';
import type { DisplaySide } from './boardDisplay';
import { label } from './text';

// 纯表现：没有敌人、HP、伤害或独立时钟。到位后继续使用同一对对象。
export class LeIntroView {
  private readonly path;
  private readonly tokens;

  constructor(scene: Phaser.Scene, map: BoardMap) {
    this.path = buildPath(map.path);
    this.tokens = (['bottom', 'top'] as const).map((side: DisplaySide) => {
      const field = boardDisplayScene(scene, map, side);
      const entry = map.path[0]!;
      return {
        projection: boardProjection(map, scene.scale.width, side),
        circle: field.add.circle(entry.x, entry.y, 30, 0x697e67),
        text: label(field, entry.x, entry.y, '乐', 32, '#fffaf0'),
      };
    });
    this.update(0);
  }

  update(matchElapsedMs: number): void {
    const progress = Math.min(1, Math.max(0, matchElapsedMs / flowConfig.leIntroMs));
    const point = pointOnPath(this.path, this.path.totalLength * progress);
    for (const token of this.tokens) {
      const screen = token.projection.point(point);
      token.circle.setPosition(screen.x, screen.y);
      token.text.setPosition(screen.x, screen.y);
    }
  }

  destroy(): void {
    for (const token of this.tokens) { token.circle.destroy(); token.text.destroy(); }
  }
}

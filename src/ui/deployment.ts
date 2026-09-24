import { controlsLayout, boardDisplay } from '../config/layout';
import Phaser from 'phaser';
import type { BoardMap } from '../config/maps';
import type { BoardState, UnitPosition } from '../systems/board';
import { getDragItem, getDropAction } from '../systems/board';
import type { RecruitmentState } from '../systems/recruitment';
import { label } from './text';
import { UnitView } from './unit';
import { getHeroLinks } from '../systems/heroActivation';
import { getHeroProgression } from '../systems/heroProgression';
import { isHeroLetter } from '../systems/items';
import { heroVisuals } from '../config/heroes';
import { tileBonusVisuals } from '../config/tileBonuses';
import { boardGraphics, boardProjection } from './boardDisplay';
import type { DisplaySide } from './boardDisplay';

// 同一套棋盘显示服务两方；只有 bottom 会创建待放置栏和绑定输入控制器。
export class DeploymentView {
  private readonly tiles;
  private readonly slots;
  private readonly highlights: Phaser.GameObjects.Graphics;
  private readonly links: Phaser.GameObjects.Graphics;
  private readonly map: BoardMap;
  readonly ghost: UnitView;

  constructor(scene: Phaser.Scene, map: BoardMap, slotCount: number, side: DisplaySide = 'bottom') {
    this.map = map;
    const projection = boardProjection(map, scene.scale.width, side);
    this.links = boardGraphics(scene, map, side);
    this.tiles = map.cells.map(cell => {
      const point = projection.point(cell);
      const box = scene.add.rectangle(point.x, point.y, map.cellSize * boardDisplay.scale, map.cellSize * boardDisplay.scale);
      const text = label(scene, point.x, point.y, '', 24 * boardDisplay.scale);
      const unit = new UnitView(scene, point.x, point.y, map.cellSize - 4);
      unit.root.setScale(boardDisplay.scale);
      return {
        box, text, unit,
        bonus: label(scene, point.x, point.y - 25 * boardDisplay.scale, '', 15 * boardDisplay.scale),
        sleep: label(scene, point.x, point.y - 19 * boardDisplay.scale, '', 12 * boardDisplay.scale, heroVisuals.sleepColor),
      };
    });
    this.slots = Array.from({ length: slotCount }, (_, index) => {
      const x = 375 + (index - (slotCount - 1) / 2) * controlsLayout.reserveStep;
      return {
        box: scene.add.rectangle(x, controlsLayout.reserveY, controlsLayout.reserveWidth, controlsLayout.reserveHeight, 0xfffcf4).setStrokeStyle(2, 0xd3caba),
        text: label(scene, x, controlsLayout.reserveY, '—', 38, '#b6ae9f'),
        unit: new UnitView(scene, x, controlsLayout.reserveY, controlsLayout.reserveWidth - 8),
      };
    });
    this.highlights = scene.add.graphics().setDepth(20);
    this.ghost = new UnitView(scene, 0, 0, map.cellSize * boardDisplay.scale);
    this.ghost.root.setDepth(100).setAlpha(0.9);
  }

  refresh(board: BoardState, recruitment: RecruitmentState, source?: UnitPosition): void {
    const links = getHeroLinks(this.map, board, source?.kind === 'tile' ? source.index : null,
      [...getHeroProgression(board).links.values()]);
    const linked = new Set(links.flatMap(link => [link.leftIndex, link.rightIndex]));
    this.links.clear();
    for (const link of links) {
      const size = this.map.cellSize;
      this.links.fillStyle(heroVisuals.fill);
      this.links.fillRect(link.origin.x - size, link.origin.y - size / 2, size * 2, size);
      this.links.lineStyle(3, heroVisuals.color);
      this.links.strokeRect(link.origin.x - size, link.origin.y - size / 2, size * 2, size);
    }
    this.tiles.forEach((view, index) => {
      const tile = board.tiles[index]!;
      view.box.setFillStyle(tile.unlocked ? tileBonusVisuals[tile.bonusType].fill : 0xc8c0af)
        .setStrokeStyle(2, tile.unlocked ? 0x87937d : 0xc2bcae);
      view.box.setVisible(!linked.has(index));
      view.bonus.setText(tileBonusVisuals[tile.bonusType].label);
      view.text.setText(tile.unit ? '' : tile.unlocked ? '+' : '锁')
        .setColor(tile.unlocked ? '#798970' : '#999284');
      const sleeping = isHeroLetter(tile.unit) && !linked.has(index)
        && !(source?.kind === 'tile' && source.index === index);
      view.unit.show(tile.unit, linked.has(index), sleeping);
      view.sleep.setText(sleeping ? 'Zz' : '');
    });
    this.slots.forEach((view, index) => {
      const item = getDragItem(board, recruitment, { kind: 'slot', index });
      view.text.setVisible(item === null);
      view.unit.show(item);
    });
    if (source) {
      const view = source.kind === 'slot' ? this.slots[source.index] : this.tiles[source.index];
      view?.unit.root.setVisible(false);
    }
  }

  tileAt(x: number, y: number): number {
    return this.tiles.findIndex(view => view.box.getBounds().contains(x, y));
  }

  positionAt(x: number, y: number): UnitPosition | null {
    const slot = this.slots.findIndex(view => view.box.getBounds().contains(x, y));
    if (slot >= 0) return { kind: 'slot', index: slot };
    const tile = this.tileAt(x, y);
    return tile >= 0 ? { kind: 'tile', index: tile } : null;
  }

  highlight(board: BoardState, recruitment: RecruitmentState, source: UnitPosition, hovered: UnitPosition | null): void {
    this.highlights.clear();
    const draw = (box: Phaser.GameObjects.Rectangle, target: UnitPosition): void => {
      if (getDropAction(board, recruitment, source, target) === 'invalid') return;
      const active = target.kind === hovered?.kind && target.index === hovered.index;
      this.highlights.lineStyle(active ? 5 : 2, active ? 0x45865a : 0x99b17d);
      const bounds = box.getBounds();
      this.highlights.strokeRect(bounds.x - 3, bounds.y - 3, bounds.width + 6, bounds.height + 6);
    };
    this.tiles.forEach((view, index) => draw(view.box, { kind: 'tile', index }));
    this.slots.forEach((view, index) => draw(view.box, { kind: 'slot', index }));
  }

  clearDrag(): void {
    this.ghost.show(null);
    this.highlights.clear();
  }
}

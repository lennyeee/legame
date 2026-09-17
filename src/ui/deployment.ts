import Phaser from 'phaser';
import type { BoardMap } from '../config/maps';
import type { BoardState, DragSource } from '../systems/board';
import { getDragItem, getDropAction } from '../systems/board';
import type { RecruitmentState } from '../systems/recruitment';
import { label } from './text';
import { UnitView } from './unit';

// 只负责下半区和待放置栏；上半场没有可命中的交互格。
export class DeploymentView {
  private readonly tiles;
  private readonly slots;
  private readonly highlights: Phaser.GameObjects.Graphics;
  readonly ghost: UnitView;

  constructor(scene: Phaser.Scene, private readonly map: BoardMap, slotCount: number) {
    this.tiles = map.cells.map(cell => ({
      box: scene.add.rectangle(cell.x, cell.y, map.cellSize, map.cellSize),
      text: label(scene, cell.x, cell.y, '', 24),
      unit: new UnitView(scene, cell.x, cell.y, map.cellSize - 4),
    }));
    label(scene, 375, 1022, '待放置', 24);
    this.slots = Array.from({ length: slotCount }, (_, index) => {
      const x = 375 + (index - (slotCount - 1) / 2) * 128;
      return {
        box: scene.add.rectangle(x, 1092, 108, 100, 0xfffcf4).setStrokeStyle(2, 0xd3caba),
        text: label(scene, x, 1092, '—', 38, '#b6ae9f'),
        unit: new UnitView(scene, x, 1092, 84),
      };
    });
    this.highlights = scene.add.graphics().setDepth(20);
    this.ghost = new UnitView(scene, 0, 0, map.cellSize);
    this.ghost.root.setDepth(100).setAlpha(0.9);
  }

  refresh(board: BoardState, recruitment: RecruitmentState, source?: DragSource): void {
    this.tiles.forEach((view, index) => {
      const tile = board.tiles[index]!;
      view.box.setFillStyle(tile.unlocked ? 0xfffcf4 : 0xdcd7ca)
        .setStrokeStyle(2, tile.unlocked ? 0x87937d : 0xc2bcae);
      view.text.setText(tile.unit ? '' : tile.unlocked ? '+' : '锁')
        .setColor(tile.unlocked ? '#798970' : '#999284');
      view.unit.show(tile.unit);
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

  sourceAt(x: number, y: number): DragSource | null {
    const slot = this.slots.findIndex(view => view.box.getBounds().contains(x, y));
    if (slot >= 0) return { kind: 'slot', index: slot };
    const tile = this.tileAt(x, y);
    return tile >= 0 ? { kind: 'tile', index: tile } : null;
  }

  highlight(board: BoardState, recruitment: RecruitmentState, source: DragSource, hovered: number): void {
    this.highlights.clear();
    this.map.cells.forEach((cell, index) => {
      if (getDropAction(board, recruitment, source, index) === 'invalid') return;
      const size = this.map.cellSize + 6;
      this.highlights.lineStyle(index === hovered ? 5 : 2, index === hovered ? 0x45865a : 0x99b17d);
      this.highlights.strokeRect(cell.x - size / 2, cell.y - size / 2, size, size);
    });
  }

  clearDrag(): void {
    this.ghost.show(null);
    this.highlights.clear();
  }
}

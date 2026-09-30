import Phaser from 'phaser';
import type { UnitCombatSnapshot } from '../combat/CombatSimulation';
import type { BoardMap } from '../config/maps';
import { boardProjection } from './boardDisplay';

const PANEL_WIDTH = 258;
const PANEL_HEIGHT = { soldier: 180, hero: 286 } as const;
const PANEL_MARGIN = 12;

export function formatUnitCombatSnapshot(snapshot: UnitCombatSnapshot): string {
  const number = (value: number): string => Number(value.toFixed(2)).toString();
  const lines = [
    `${snapshot.name}  Lv.${snapshot.level}`,
    ...(snapshot.exp ? [`经验：${snapshot.exp.required === Infinity ? 'MAX' :
      `${number(snapshot.exp.current)} / ${snapshot.exp.required}`}`] : []),
    `攻击力：${number(snapshot.damage)}`,
    `攻速：${number(snapshot.attacksPerSecond)} 次/秒`,
    `射程：${number(snapshot.rangeCells)} 格`,
    `攻击类型：${snapshot.attackType}`,
  ];
  if (snapshot.skill) lines.push(`技能：${snapshot.skill.name}`, snapshot.skill.status,
    snapshot.skill.description);
  return lines.join('\n');
}

// 纯表现：战斗属性由CombatSimulation生成，只在内容变化时更新文本。
export class UnitStatsPanel {
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private currentText = '';
  private visible = false;
  private currentTile: number | null = null;
  private currentKind: UnitCombatSnapshot['kind'] | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly map: BoardMap) {
    this.background = scene.add.graphics().setDepth(70);
    this.text = scene.add.text(0, 0, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '17px', color: '#343d32',
      lineSpacing: 4, wordWrap: { width: PANEL_WIDTH - 28, useAdvancedWrap: true },
    }).setDepth(71).setVisible(false);
  }

  show(tileIndex: number, snapshot: UnitCombatSnapshot): void {
    if (!this.visible || tileIndex !== this.currentTile || snapshot.kind !== this.currentKind) {
      const projection = boardProjection(this.map, this.scene.scale?.width ?? 750, 'bottom');
      const point = projection.point(this.map.cells[tileIndex]!);
      const battlefieldTop = projection.point({ x: 0, y: this.map.mirrorY }).y;
      const width = this.scene.scale?.width ?? 750;
      const height = this.scene.scale?.height ?? 1334;
      const panelHeight = PANEL_HEIGHT[snapshot.kind];
      const x = point.x + PANEL_WIDTH + 30 <= width - PANEL_MARGIN
        ? point.x + 30 : Math.max(PANEL_MARGIN, point.x - PANEL_WIDTH - 30);
      const y = Math.max(battlefieldTop + PANEL_MARGIN, Math.min(point.y - panelHeight / 2,
        Math.min(height - PANEL_MARGIN - panelHeight, 950 - panelHeight)));
      this.background.clear();
      this.background.fillStyle(0xf8f5ea, 0.97).fillRoundedRect(x, y, PANEL_WIDTH, panelHeight, 12);
      this.background.lineStyle(2, 0x768875, 0.92).strokeRoundedRect(x, y, PANEL_WIDTH, panelHeight, 12);
      this.text.setPosition(x + 14, y + 12).setVisible(true);
      this.currentTile = tileIndex;
      this.currentKind = snapshot.kind;
    }
    const formatted = formatUnitCombatSnapshot(snapshot);
    if (formatted !== this.currentText) this.text.setText(formatted);
    this.currentText = formatted;
    this.visible = true;
  }

  hide(): void {
    if (!this.visible) return;
    this.background.clear();
    this.text.setVisible(false);
    this.currentText = '';
    this.visible = false;
    this.currentTile = null;
    this.currentKind = null;
  }

  destroy(): void {
    this.background.destroy();
    this.text.destroy();
  }
}

import Phaser from 'phaser';
import { Territory } from '../game/Territory';
import { GameState } from '../game/GameState';
import { CELL_SIZE, MAP_OFFSET_X, MAP_OFFSET_Y, hexCellToPixel } from '../game/MapGenerator';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';

export class TerritoryEffects {
  private scene: Phaser.Scene;

  // Attack highlight
  private attackLine: Phaser.GameObjects.Graphics | null = null;
  private attackLineTween: Phaser.Tweens.Tween | null = null;

  // Low dice warning
  private warningGraphics: Phaser.GameObjects.Graphics | null = null;
  private warningTween: Phaser.Tweens.Tween | null = null;

  // Hover tooltip
  private tooltip: Phaser.GameObjects.Container;
  private tooltipBg: Phaser.GameObjects.Graphics;
  private tooltipText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.tooltipBg = scene.add.graphics();
    this.tooltipText = scene.add.text(0, 0, '', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    this.tooltip = scene.add.container(0, 0, [this.tooltipBg, this.tooltipText]);
    this.tooltip.setDepth(100);
    this.tooltip.setVisible(false);
  }

  // ─── Attack Highlight ──────────────────────────────────────

  showAttackLine(fromX: number, fromY: number, toX: number, toY: number): void {
    this.hideAttackLine();

    this.attackLine = this.scene.add.graphics();
    this.attackLine.setDepth(50);

    this.attackLine.lineStyle(3, 0xffff00, 1);
    this.attackLine.lineBetween(fromX, fromY, toX, toY);

    // Arrowhead
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const size = 12;
    this.attackLine.fillStyle(0xffff00, 1);
    this.attackLine.fillTriangle(
      toX, toY,
      toX - size * Math.cos(angle - Math.PI / 6),
      toY - size * Math.sin(angle - Math.PI / 6),
      toX - size * Math.cos(angle + Math.PI / 6),
      toY - size * Math.sin(angle + Math.PI / 6)
    );

    this.attackLineTween = this.scene.tweens.add({
      targets: this.attackLine,
      alpha: { from: 1, to: 0.3 },
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  hideAttackLine(): void {
    if (this.attackLineTween) {
      this.attackLineTween.destroy();
      this.attackLineTween = null;
    }
    if (this.attackLine) {
      this.attackLine.destroy();
      this.attackLine = null;
    }
  }

  // ─── Capture Pulse ─────────────────────────────────────────

  showCapturePulse(territory: Territory): void {
    const overlay = this.scene.add.graphics();
    overlay.setDepth(40);
    overlay.fillStyle(0xffffff, 1);

    if (territory.gridType === 'hex') {
      const radius = CELL_SIZE / 2;
      for (const cell of territory.cells) {
        const { x: cx, y: cy } = hexCellToPixel(cell.x, cell.y);
        this.fillHex(overlay, cx, cy, radius);
      }
    } else {
      for (const cell of territory.cells) {
        overlay.fillRect(
          MAP_OFFSET_X + cell.x * CELL_SIZE,
          MAP_OFFSET_Y + cell.y * CELL_SIZE,
          CELL_SIZE,
          CELL_SIZE
        );
      }
    }

    this.scene.tweens.add({
      targets: overlay,
      alpha: { from: 1, to: 0 },
      duration: 300,
      onComplete: () => overlay.destroy(),
    });
  }

  // ─── Low Dice Warning ──────────────────────────────────────

  updateLowDiceWarnings(state: GameState): void {
    if (this.warningTween) {
      this.warningTween.destroy();
      this.warningTween = null;
    }
    if (this.warningGraphics) {
      this.warningGraphics.destroy();
      this.warningGraphics = null;
    }

    const humanIdx = state.players.findIndex((p) => p.isHuman);
    if (humanIdx < 0) return;

    const warned = state.territories.filter((t) => {
      if (t.dice !== 1 || t.owner !== humanIdx) return false;
      return t.neighbors.some((nId) => {
        const n = state.territories[nId];
        return n && n.owner !== t.owner;
      });
    });

    if (warned.length === 0) return;

    this.warningGraphics = this.scene.add.graphics();
    this.warningGraphics.setDepth(30);
    this.warningGraphics.lineStyle(2, 0xff3333, 1);

    for (const territory of warned) {
      if (territory.gridType === 'hex') {
        const radius = CELL_SIZE / 2;
        for (const cell of territory.cells) {
          const { x: cx, y: cy } = hexCellToPixel(cell.x, cell.y);
          this.strokeHex(this.warningGraphics, cx, cy, radius);
        }
      } else {
        for (const cell of territory.cells) {
          this.warningGraphics.strokeRect(
            MAP_OFFSET_X + cell.x * CELL_SIZE,
            MAP_OFFSET_Y + cell.y * CELL_SIZE,
            CELL_SIZE,
            CELL_SIZE
          );
        }
      }
    }

    this.warningTween = this.scene.tweens.add({
      targets: this.warningGraphics,
      alpha: { from: 0.2, to: 0.8 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ─── Hover Tooltip ─────────────────────────────────────────

  showTooltip(territory: Territory, x: number, y: number, playerName: string): void {
    const text = `Territory ${territory.id} \u2022 ${playerName} \u2022 ${territory.dice} dice`;
    this.tooltipText.setText(text);

    const padding = 6;
    const width = this.tooltipText.width + padding * 2;
    const height = this.tooltipText.height + padding * 2;

    this.tooltipBg.clear();
    this.tooltipBg.fillStyle(0x111122, 0.9);
    this.tooltipBg.fillRoundedRect(0, 0, width, height, 4);

    this.tooltipText.setPosition(padding, padding);

    let tx = x + 15;
    let ty = y - 10;
    if (tx + width > GAME_WIDTH) tx = x - width - 5;
    if (ty + height > GAME_HEIGHT) ty = y - height - 5;
    if (ty < 0) ty = 5;

    this.tooltip.setPosition(tx, ty);
    this.tooltip.setVisible(true);
  }

  hideTooltip(): void {
    this.tooltip.setVisible(false);
  }

  // ─── Helpers ───────────────────────────────────────────────

  private fillHex(g: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number): void {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 90);
      const vx = cx + radius * Math.cos(a);
      const vy = cy + radius * Math.sin(a);
      if (i === 0) g.moveTo(vx, vy);
      else g.lineTo(vx, vy);
    }
    g.closePath();
    g.fillPath();
  }

  private strokeHex(g: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number): void {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 90);
      const vx = cx + radius * Math.cos(a);
      const vy = cy + radius * Math.sin(a);
      if (i === 0) g.moveTo(vx, vy);
      else g.lineTo(vx, vy);
    }
    g.closePath();
    g.strokePath();
  }

  // ─── Cleanup ───────────────────────────────────────────────

  destroy(): void {
    this.hideAttackLine();
    if (this.warningTween) this.warningTween.destroy();
    if (this.warningGraphics) this.warningGraphics.destroy();
    this.tooltip.destroy();
  }
}

import Phaser from 'phaser';
import { Territory } from '../game/Territory';
import { GameState } from '../game/GameState';
import { CELL_SIZE, MAP_OFFSET_X, MAP_OFFSET_Y, GRID_COLS, GRID_ROWS, hexCellToPixel } from '../game/MapGenerator';
import { PLAYER_COLORS } from '../config';

export class MapRenderer {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private territoryZones: Map<number, Phaser.GameObjects.Zone> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
  }

  /**
   * Draw the full territory map.
   */
  drawMap(
    state: GameState,
    selectedId: number | null,
    validTargets: number[],
    attackableTerritories: number[]
  ): void {
    this.graphics.clear();

    // Draw territory fills
    for (const territory of state.territories) {
      this.drawTerritory(territory, state, selectedId, validTargets, attackableTerritories);
    }

    // Draw borders between territories
    this.drawBorders(state);
  }

  private drawTerritory(
    territory: Territory,
    state: GameState,
    selectedId: number | null,
    validTargets: number[],
    attackableTerritories: number[]
  ): void {
    const baseColor = PLAYER_COLORS[territory.owner] ?? 0x666666;
    let fillColor = baseColor;
    let alpha = 1.0;

    if (selectedId === territory.id) {
      // Selected territory: brighter
      fillColor = Phaser.Display.Color.ValueToColor(baseColor).lighten(30).color;
      alpha = 1.0;
    } else if (validTargets.includes(territory.id)) {
      // Valid target: pulsing highlight
      fillColor = Phaser.Display.Color.ValueToColor(baseColor).lighten(15).color;
      alpha = 0.9;
    } else if (attackableTerritories.includes(territory.id)) {
      alpha = 1.0;
    } else if (territory.owner === state.currentPlayerIndex) {
      alpha = 0.8;
    } else {
      alpha = 0.7;
    }

    this.graphics.fillStyle(fillColor, alpha);

    if (territory.gridType === 'hex') {
      const radius = CELL_SIZE / 2;
      for (const cell of territory.cells) {
        const { x: cx, y: cy } = hexCellToPixel(cell.x, cell.y);
        this.fillHex(cx, cy, radius);
      }
    } else {
      // Draw each cell as a filled rectangle
      for (const cell of territory.cells) {
        const x = MAP_OFFSET_X + cell.x * CELL_SIZE;
        const y = MAP_OFFSET_Y + cell.y * CELL_SIZE;
        this.graphics.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  private fillHex(cx: number, cy: number, radius: number): void {
    this.graphics.beginPath();
    for (let i = 0; i < 6; i++) {
      const angleRad = (Math.PI / 180) * (60 * i - 90);
      const vx = cx + radius * Math.cos(angleRad);
      const vy = cy + radius * Math.sin(angleRad);
      if (i === 0) this.graphics.moveTo(vx, vy);
      else this.graphics.lineTo(vx, vy);
    }
    this.graphics.closePath();
    this.graphics.fillPath();
  }

  private drawBorders(state: GameState): void {
    const isHex = state.territories.length > 0 && state.territories[0].gridType === 'hex';
    if (isHex) {
      this.drawHexBorders(state);
    } else {
      this.drawSquareBorders(state);
    }
  }

  private drawHexBorders(state: GameState): void {
    this.graphics.lineStyle(2, 0x111122, 1);
    const radius = CELL_SIZE / 2;

    const cellToTerritory = new Map<string, number>();
    for (const t of state.territories) {
      for (const c of t.cells) {
        cellToTerritory.set(`${c.x},${c.y}`, t.id);
      }
    }

    const hexDirsEven = [[-1, 0], [1, 0], [-1, -1], [1, -1], [0, -1], [0, 1]];
    const hexDirsOdd = [[-1, 0], [1, 0], [-1, 1], [1, 1], [0, -1], [0, 1]];

    for (const territory of state.territories) {
      for (const cell of territory.cells) {
        const dirs = cell.x % 2 === 0 ? hexDirsEven : hexDirsOdd;
        let isBoundary = false;
        for (const [dc, dr] of dirs) {
          const nc = cell.x + dc;
          const nr = cell.y + dr;
          if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) {
            isBoundary = true;
            break;
          }
          const nid = cellToTerritory.get(`${nc},${nr}`);
          if (nid !== undefined && nid !== territory.id) {
            isBoundary = true;
            break;
          }
        }

        if (isBoundary) {
          const { x: cx, y: cy } = hexCellToPixel(cell.x, cell.y);
          this.graphics.beginPath();
          for (let i = 0; i < 6; i++) {
            const angleRad = (Math.PI / 180) * (60 * i - 90);
            const vx = cx + radius * Math.cos(angleRad);
            const vy = cy + radius * Math.sin(angleRad);
            if (i === 0) this.graphics.moveTo(vx, vy);
            else this.graphics.lineTo(vx, vy);
          }
          this.graphics.closePath();
          this.graphics.strokePath();
        }
      }
    }
  }

  private drawSquareBorders(state: GameState): void {
    this.graphics.lineStyle(2, 0x111122, 1);

    for (const territory of state.territories) {
      for (const cell of territory.cells) {
        const x = MAP_OFFSET_X + cell.x * CELL_SIZE;
        const y = MAP_OFFSET_Y + cell.y * CELL_SIZE;

        // Check each edge — draw border if neighbor cell belongs to different territory
        const dirs = [
          { dx: 0, dy: -1, sx: x, sy: y, ex: x + CELL_SIZE, ey: y },           // top
          { dx: 0, dy: 1, sx: x, sy: y + CELL_SIZE, ex: x + CELL_SIZE, ey: y + CELL_SIZE }, // bottom
          { dx: -1, dy: 0, sx: x, sy: y, ex: x, ey: y + CELL_SIZE },           // left
          { dx: 1, dy: 0, sx: x + CELL_SIZE, sy: y, ex: x + CELL_SIZE, ey: y + CELL_SIZE }, // right
        ];

        for (const { dx, dy, sx, sy, ex, ey } of dirs) {
          const nc = cell.x + dx;
          const nr = cell.y + dy;
          const neighborTerritory = state.territories.find((t) =>
            t.id !== territory.id && t.cells.some((c) => c.x === nc && c.y === nr)
          );

          if (neighborTerritory || nc < 0 || nr < 0) {
            this.graphics.lineBetween(sx, sy, ex, ey);
          }
        }
      }
    }
  }

  /**
   * Create interactive zones for each territory.
   */
  createInteractiveZones(
    state: GameState,
    onClick: (territoryId: number) => void
  ): void {
    this.clearZones();

    for (const territory of state.territories) {
      const zone = this.scene.add.zone(
        territory.center.x,
        territory.center.y,
        CELL_SIZE * 2.5,
        CELL_SIZE * 2.5
      ).setInteractive({ useHandCursor: true });

      zone.on('pointerdown', () => onClick(territory.id));
      this.territoryZones.set(territory.id, zone);
    }
  }

  clearZones(): void {
    for (const zone of this.territoryZones.values()) {
      zone.destroy();
    }
    this.territoryZones.clear();
  }

  destroy(): void {
    this.graphics.destroy();
    this.clearZones();
  }
}

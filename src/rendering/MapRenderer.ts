import Phaser from 'phaser';
import { Territory } from '../game/Territory';
import { GameState } from '../game/GameState';
import { CELL_SIZE, MAP_OFFSET_X, MAP_OFFSET_Y, GRID_COLS, GRID_ROWS, hexCellToPixel } from '../game/MapGenerator';
import { PLAYER_COLORS } from '../config';
import { areAllied } from '../game/Alliance';

export class MapRenderer {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private highlightGraphics: Phaser.GameObjects.Graphics;
  private territoryZones: Map<number, Phaser.GameObjects.Zone> = new Map();
  private powerUpLabels: Phaser.GameObjects.Container[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.highlightGraphics = scene.add.graphics().setDepth(50);
  }

  /**
   * Draw the full territory map.
   */
  drawMap(
    state: GameState,
    selectedId: number | null,
    validTargets: number[],
    attackableTerritories: number[],
    visibleSet?: Set<number>
  ): void {
    this.graphics.clear();

    // Draw territory fills
    for (const territory of state.territories) {
      this.drawTerritory(territory, state, selectedId, validTargets, attackableTerritories);
    }

    // Draw fog overlay on hidden territories
    if (visibleSet) {
      for (const territory of state.territories) {
        if (!visibleSet.has(territory.id)) {
          this.drawFogOverlay(territory);
        }
      }
    }

    // Draw borders between territories
    this.drawBorders(state);

    // Draw alliance indicators
    this.drawAllianceIndicators(state);

    // Draw power-up icons
    this.drawPowerUpIcons(state);
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

  private drawFogOverlay(territory: Territory): void {
    this.graphics.fillStyle(0x000000, 0.55);

    if (territory.gridType === 'hex') {
      const radius = CELL_SIZE / 2;
      for (const cell of territory.cells) {
        const { x: cx, y: cy } = hexCellToPixel(cell.x, cell.y);
        this.fillHex(cx, cy, radius);
      }
    } else {
      for (const cell of territory.cells) {
        const x = MAP_OFFSET_X + cell.x * CELL_SIZE;
        const y = MAP_OFFSET_Y + cell.y * CELL_SIZE;
        this.graphics.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }
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

  private static readonly POWER_UP_COLORS: Record<string, number> = {
    shield: 0x4488ff,
    charge: 0xff4444,
    fortify: 0x44cc44,
    reinforce: 0xffcc00,
  };

  private static readonly POWER_UP_SYMBOLS: Record<string, string> = {
    shield: '🛡',
    charge: '⚡',
    fortify: '🏰',
    reinforce: '➕',
  };

  private drawPowerUpIcons(state: GameState): void {
    // Destroy previous labels
    for (const label of this.powerUpLabels) label.destroy();
    this.powerUpLabels = [];

    for (const territory of state.territories) {
      if (!territory.powerUp) continue;
      const color = MapRenderer.POWER_UP_COLORS[territory.powerUp] ?? 0xffffff;
      const symbol = MapRenderer.POWER_UP_SYMBOLS[territory.powerUp] ?? '?';
      const cx = territory.center.x;
      const cy = territory.center.y + 24;

      const container = this.scene.add.container(cx, cy).setDepth(25);

      const bg = this.scene.add.graphics();
      bg.fillStyle(color, 0.9);
      bg.fillRoundedRect(-10, -8, 20, 16, 4);
      bg.lineStyle(1, 0x000000, 0.5);
      bg.strokeRoundedRect(-10, -8, 20, 16, 4);
      container.add(bg);

      const text = this.scene.add.text(0, 0, symbol, {
        fontSize: '11px',
        fontFamily: 'monospace',
      }).setOrigin(0.5);
      container.add(text);

      this.powerUpLabels.push(container);
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

  setZoneHoverCallbacks(
    onOver: (territoryId: number, pointer: Phaser.Input.Pointer) => void,
    onOut: (territoryId: number) => void,
    onMove: (territoryId: number, pointer: Phaser.Input.Pointer) => void
  ): void {
    for (const [id, zone] of this.territoryZones) {
      zone.on('pointerover', (pointer: Phaser.Input.Pointer) => onOver(id, pointer));
      zone.on('pointerout', () => onOut(id));
      zone.on('pointermove', (pointer: Phaser.Input.Pointer) => onMove(id, pointer));
    }
  }

  clearZones(): void {
    for (const zone of this.territoryZones.values()) {
      zone.destroy();
    }
    this.territoryZones.clear();
  }

  /**
   * Flash-highlight a territory with a bright overlay and colored border.
   */
  highlightTerritory(territory: Territory, color: number): void {
    this.highlightGraphics.clear();
    this.highlightGraphics.fillStyle(0xffffff, 0.3);
    this.highlightGraphics.lineStyle(3, color, 0.9);

    if (territory.gridType === 'hex') {
      const radius = CELL_SIZE / 2;
      for (const cell of territory.cells) {
        const { x: cx, y: cy } = hexCellToPixel(cell.x, cell.y);
        this.highlightGraphics.beginPath();
        for (let i = 0; i < 6; i++) {
          const angleRad = (Math.PI / 180) * (60 * i - 90);
          const vx = cx + radius * Math.cos(angleRad);
          const vy = cy + radius * Math.sin(angleRad);
          if (i === 0) this.highlightGraphics.moveTo(vx, vy);
          else this.highlightGraphics.lineTo(vx, vy);
        }
        this.highlightGraphics.closePath();
        this.highlightGraphics.fillPath();
        this.highlightGraphics.strokePath();
      }
    } else {
      for (const cell of territory.cells) {
        const x = MAP_OFFSET_X + cell.x * CELL_SIZE;
        const y = MAP_OFFSET_Y + cell.y * CELL_SIZE;
        this.highlightGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        this.highlightGraphics.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  clearHighlight(): void {
    this.highlightGraphics.clear();
  }

  private drawAllianceIndicators(state: GameState): void {
    if (!state.allianceState) return;

    const currentPlayer = state.currentPlayerIndex;
    const allianceState = state.allianceState;

    for (const territory of state.territories) {
      if (territory.owner !== currentPlayer && areAllied(allianceState, currentPlayer, territory.owner)) {
        this.graphics.lineStyle(3, 0x44ddff, 0.7);

        if (territory.gridType === 'hex') {
          const radius = CELL_SIZE / 2;
          for (const cell of territory.cells) {
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
        } else {
          for (const cell of territory.cells) {
            const x = MAP_OFFSET_X + cell.x * CELL_SIZE;
            const y = MAP_OFFSET_Y + cell.y * CELL_SIZE;
            this.graphics.strokeRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
          }
        }
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.highlightGraphics.destroy();
    for (const label of this.powerUpLabels) label.destroy();
    this.powerUpLabels = [];
    this.clearZones();
  }
}

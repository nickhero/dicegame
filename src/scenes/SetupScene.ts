import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, PLAYER_COLORS, PLAYER_COLOR_STRINGS } from '../config';
import {
  GameSetupConfig,
  loadPreferences,
  savePreferences,
  TERRITORY_PRESETS,
  DEFAULT_SETUP,
} from '../game/GameConfig';
import { ALL_PERSONALITY_TYPES, PersonalityType } from '../game/AIPersonality';
import { generateMap, assignTerritories, GRID_COLS, GRID_ROWS } from '../game/MapGenerator';
import { SeededRandom } from '../utils/random';
import { MapShape } from '../game/MapShapes';

type SpeedOption = GameSetupConfig['speed'];

const PERSONALITY_OPTIONS: (PersonalityType | 'random')[] = [...ALL_PERSONALITY_TYPES, 'random'];

const MAP_SIZE_LABELS: { label: string; key: keyof typeof TERRITORY_PRESETS }[] = [
  { label: 'S', key: 'small' },
  { label: 'M', key: 'medium' },
  { label: 'L', key: 'standard' },
  { label: 'XL', key: 'large' },
];

const SPEED_OPTIONS: { label: string; value: SpeedOption }[] = [
  { label: 'Normal', value: 'normal' },
  { label: 'Fast', value: 'fast' },
  { label: 'Instant', value: 'instant' },
];

const MAP_SHAPE_OPTIONS: { label: string; value: MapShape }[] = [
  { label: 'Rect', value: 'rectangle' },
  { label: 'Diamond', value: 'diamond' },
  { label: 'Ring', value: 'ring' },
  { label: 'Continent', value: 'continent' },
];

const PANEL_WIDTH = 750;
const PREVIEW_WIDTH = 230;
const PREVIEW_HEIGHT = 180;
const PANEL_HEIGHT = 640;
const BTN_COLOR = 0x334466;
const BTN_ACTIVE = 0x4a90d9;
const BTN_HOVER = 0x5588bb;
const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '16px',
  color: '#cccccc',
  fontFamily: 'monospace',
};

export class SetupScene extends Phaser.Scene {
  private config!: GameSetupConfig;

  // UI groups that need refreshing
  private playerBtns: ButtonGroup[] = [];
  private mapBtns: ButtonGroup[] = [];
  private speedBtns: ButtonGroup[] = [];
  private shapeBtns: ButtonGroup[] = [];
  private fogOfWarBtn!: { bg: Phaser.GameObjects.Graphics; zone: Phaser.GameObjects.Zone; text: Phaser.GameObjects.Text; redraw: (active: boolean) => void };
  private powerUpsBtn!: { bg: Phaser.GameObjects.Graphics; zone: Phaser.GameObjects.Zone; text: Phaser.GameObjects.Text; redraw: (active: boolean) => void };
  private aiRows: AIRow[] = [];
  private aiContainer!: Phaser.GameObjects.Container;
  private previewGraphics!: Phaser.GameObjects.Graphics;
  private previewSeed: number = Math.floor(Math.random() * 2147483646) + 1;
  private previewX = 0;
  private previewY = 0;

  constructor() {
    super('SetupScene');
  }

  create(): void {
    this.config = loadPreferences();

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const left = cx - PANEL_WIDTH / 2;
    const top = cy - PANEL_HEIGHT / 2;

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(0x16213e, 0.95);
    bg.fillRoundedRect(left, top, PANEL_WIDTH, PANEL_HEIGHT, 12);
    bg.lineStyle(2, 0x4a90d9, 1);
    bg.strokeRoundedRect(left, top, PANEL_WIDTH, PANEL_HEIGHT, 12);

    // Title
    this.add.text(cx, top + 30, 'GAME SETUP', {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    let rowY = top + 75;

    // --- Players row ---
    this.add.text(left + 30, rowY, 'Players:', LABEL_STYLE);
    const playerValues = [2, 3, 4, 5, 6];
    this.playerBtns = playerValues.map((n, i) => {
      const btn = this.createButton(
        left + 160 + i * 55, rowY - 5, 40, 30, `${n}`,
        () => {
          this.config.playerCount = n;
          this.refreshPlayerBtns();
          this.rebuildAIRows();
          this.updatePreview();
        },
      );
      return { value: n, ...btn };
    });
    this.refreshPlayerBtns();

    rowY += 50;

    // --- Map Size row ---
    this.add.text(left + 30, rowY, 'Map Size:', LABEL_STYLE);
    this.mapBtns = MAP_SIZE_LABELS.map((opt, i) => {
      const count = TERRITORY_PRESETS[opt.key];
      const btn = this.createButton(
        left + 160 + i * 70, rowY - 5, 50, 30, opt.label,
        () => {
          this.config.territoryCount = count;
          this.refreshMapBtns();
          this.updatePreview();
        },
      );
      return { value: count, ...btn };
    });
    this.refreshMapBtns();

    rowY += 55;

    // --- AI Personality rows ---
    this.aiContainer = this.add.container(0, 0);
    this.rebuildAIRows(left, rowY);

    rowY += 5 * 38 + 10; // reserve max 5 rows

    // --- Speed row ---
    this.add.text(left + 30, rowY, 'Speed:', LABEL_STYLE);
    this.speedBtns = SPEED_OPTIONS.map((opt, i) => {
      const btn = this.createButton(
        left + 160 + i * 100, rowY - 5, 80, 30, opt.label,
        () => {
          this.config.speed = opt.value;
          this.refreshSpeedBtns();
        },
      );
      return { value: opt.value, ...btn };
    });
    this.refreshSpeedBtns();

    rowY += 55;

    // --- Map Shape row ---
    this.add.text(left + 30, rowY, 'Shape:', LABEL_STYLE);
    this.shapeBtns = MAP_SHAPE_OPTIONS.map((opt, i) => {
      const btn = this.createButton(
        left + 160 + i * 100, rowY - 5, 85, 30, opt.label,
        () => {
          this.config.mapShape = opt.value;
          this.refreshShapeBtns();
          this.updatePreview();
        },
      );
      return { value: opt.value, ...btn };
    });
    this.refreshShapeBtns();

    rowY += 45;

    // --- Options row (toggles) ---
    this.add.text(left + 30, rowY, 'Options:', LABEL_STYLE);
    this.fogOfWarBtn = this.createButton(
      left + 160, rowY - 5, 110, 30, 'Fog of War',
      () => {
        this.config.fogOfWar = !this.config.fogOfWar;
        this.fogOfWarBtn.redraw(this.config.fogOfWar);
      },
    );
    this.fogOfWarBtn.redraw(this.config.fogOfWar);

    this.powerUpsBtn = this.createButton(
      left + 285, rowY - 5, 110, 30, 'Power-Ups',
      () => {
        this.config.powerUps = !this.config.powerUps;
        this.powerUpsBtn.redraw(this.config.powerUps);
      },
    );
    this.powerUpsBtn.redraw(this.config.powerUps);

    rowY += 55;

    // --- START GAME button ---
    this.createLargeButton(cx, rowY, 200, 44, 'START GAME', 0x338833, 0x44aa44, () => {
      this.startGame();
    });

    // --- BACK button ---
    this.createLargeButton(cx, rowY + 55, 200, 44, 'BACK', 0x555555, 0x777777, () => {
      this.scene.start('MenuScene');
    });

    // --- Map preview area (right side) ---
    this.previewX = left + PANEL_WIDTH - PREVIEW_WIDTH - 30;
    this.previewY = top + 80;

    this.add.text(this.previewX + PREVIEW_WIDTH / 2, this.previewY - 18, 'Map Preview', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const previewBorder = this.add.graphics();
    previewBorder.lineStyle(1, 0x4a90d9, 0.6);
    previewBorder.strokeRect(
      this.previewX - 2, this.previewY - 2,
      PREVIEW_WIDTH + 4, PREVIEW_HEIGHT + 4,
    );

    this.previewGraphics = this.add.graphics();

    this.createButton(
      this.previewX + PREVIEW_WIDTH / 2 - 60,
      this.previewY + PREVIEW_HEIGHT + 10,
      120, 28, '🔄 New Map',
      () => {
        this.previewSeed = Math.floor(Math.random() * 2147483646) + 1;
        this.updatePreview();
      },
    );

    this.updatePreview();
  }

  /* ------------------------------------------------------------------ */
  /*  Button factory helpers                                             */
  /* ------------------------------------------------------------------ */

  private createButton(
    x: number, y: number, w: number, h: number, label: string,
    onClick: () => void,
  ): { bg: Phaser.GameObjects.Graphics; zone: Phaser.GameObjects.Zone; text: Phaser.GameObjects.Text; redraw: (active: boolean) => void } {
    const gfx = this.add.graphics();
    const txt = this.add.text(x + w / 2, y + h / 2, label, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const zone = this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true });

    let isActive = false;

    const draw = (color: number) => {
      gfx.clear();
      gfx.fillStyle(color, 1);
      gfx.fillRoundedRect(x, y, w, h, 5);
      if (isActive) {
        gfx.lineStyle(2, 0xffffff, 0.8);
        gfx.strokeRoundedRect(x, y, w, h, 5);
      }
    };

    const redraw = (active: boolean) => {
      isActive = active;
      draw(active ? BTN_ACTIVE : BTN_COLOR);
    };

    zone.on('pointerover', () => { if (!isActive) draw(BTN_HOVER); });
    zone.on('pointerout', () => draw(isActive ? BTN_ACTIVE : BTN_COLOR));
    zone.on('pointerdown', onClick);

    draw(BTN_COLOR);
    return { bg: gfx, zone, text: txt, redraw };
  }

  private createLargeButton(
    cx: number, cy: number, w: number, h: number,
    label: string, color: number, hoverColor: number,
    onClick: () => void,
  ): void {
    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);

    this.add.text(cx, cy, label, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const zone = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    });
    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    });
    zone.on('pointerdown', onClick);
  }

  /* ------------------------------------------------------------------ */
  /*  Refresh helpers                                                    */
  /* ------------------------------------------------------------------ */

  private refreshPlayerBtns(): void {
    for (const b of this.playerBtns) {
      b.redraw(b.value === this.config.playerCount);
    }
  }

  private refreshMapBtns(): void {
    for (const b of this.mapBtns) {
      b.redraw(b.value === this.config.territoryCount);
    }
  }

  private refreshSpeedBtns(): void {
    for (const b of this.speedBtns) {
      b.redraw(b.value === this.config.speed);
    }
  }

  private refreshShapeBtns(): void {
    for (const b of this.shapeBtns) {
      b.redraw(b.value === this.config.mapShape);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  AI personality rows                                                */
  /* ------------------------------------------------------------------ */

  private rebuildAIRows(
    leftOverride?: number,
    topOverride?: number,
  ): void {
    // Determine position — use override on first call, cached afterwards
    const left = leftOverride ?? this.aiRows[0]?.left ?? 0;
    const baseY = topOverride ?? this.aiRows[0]?.baseY ?? 0;

    // Destroy old rows
    this.aiContainer.removeAll(true);
    this.aiRows = [];

    const slotCount = this.config.playerCount - 1;

    // Ensure the aiPersonalities array has enough entries
    while (this.config.aiPersonalities.length < slotCount) {
      this.config.aiPersonalities.push('random');
    }

    for (let i = 0; i < slotCount; i++) {
      const y = baseY + i * 38;
      this.aiRows.push(this.createAIRow(left, y, i));
    }
  }

  private createAIRow(left: number, y: number, index: number): AIRow {
    const label = this.add.text(left + 30, y, `AI ${index + 1}:`, {
      ...LABEL_STYLE,
      color: PLAYER_COLOR_STRINGS[index + 1],
    });
    this.aiContainer.add(label);

    const personalityText = this.add.text(left + 240, y, '', {
      fontSize: '15px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.aiContainer.add(personalityText);

    // Left arrow
    const leftArrow = this.add.text(left + 155, y, '◄', {
      fontSize: '18px',
      color: '#88aadd',
      fontFamily: 'monospace',
    }).setInteractive({ useHandCursor: true });
    leftArrow.on('pointerdown', () => this.cyclePersonality(index, -1));
    leftArrow.on('pointerover', () => leftArrow.setColor('#ffffff'));
    leftArrow.on('pointerout', () => leftArrow.setColor('#88aadd'));
    this.aiContainer.add(leftArrow);

    // Right arrow
    const rightArrow = this.add.text(left + 320, y, '►', {
      fontSize: '18px',
      color: '#88aadd',
      fontFamily: 'monospace',
    }).setInteractive({ useHandCursor: true });
    rightArrow.on('pointerdown', () => this.cyclePersonality(index, 1));
    rightArrow.on('pointerover', () => rightArrow.setColor('#ffffff'));
    rightArrow.on('pointerout', () => rightArrow.setColor('#88aadd'));
    this.aiContainer.add(rightArrow);

    // Set initial text
    const current = this.config.aiPersonalities[index] ?? 'random';
    const displayName = current === 'random' ? 'Random' : current.charAt(0).toUpperCase() + current.slice(1);
    personalityText.setText(displayName);

    return { left, baseY: y, label, personalityText, leftArrow, rightArrow };
  }

  private cyclePersonality(index: number, direction: number): void {
    const current = this.config.aiPersonalities[index] ?? 'random';
    const currentIdx = PERSONALITY_OPTIONS.indexOf(current as PersonalityType | 'random');
    const nextIdx = (currentIdx + direction + PERSONALITY_OPTIONS.length) % PERSONALITY_OPTIONS.length;
    const next = PERSONALITY_OPTIONS[nextIdx];
    this.config.aiPersonalities[index] = next;

    const displayName = next === 'random' ? 'Random' : next.charAt(0).toUpperCase() + next.slice(1);
    this.aiRows[index].personalityText.setText(displayName);
  }

  /* ------------------------------------------------------------------ */
  /*  Map preview                                                        */
  /* ------------------------------------------------------------------ */

  private updatePreview(): void {
    this.previewGraphics.clear();

    const seed = this.config.mapSeed
      ? hashSeedString(this.config.mapSeed)
      : this.previewSeed;

    const rng = new SeededRandom(seed);
    const { territories } = generateMap(this.config.territoryCount, rng, 'square', this.config.mapShape);
    assignTerritories(territories, this.config.playerCount, new SeededRandom(seed + 1));

    const scaleX = PREVIEW_WIDTH / GRID_COLS;
    const scaleY = PREVIEW_HEIGHT / GRID_ROWS;
    const cellScale = Math.min(scaleX, scaleY);

    const drawW = GRID_COLS * cellScale;
    const drawH = GRID_ROWS * cellScale;
    const offsetX = this.previewX + (PREVIEW_WIDTH - drawW) / 2;
    const offsetY = this.previewY + (PREVIEW_HEIGHT - drawH) / 2;

    // Background fill
    this.previewGraphics.fillStyle(0x0e1628, 1);
    this.previewGraphics.fillRect(this.previewX, this.previewY, PREVIEW_WIDTH, PREVIEW_HEIGHT);

    for (const territory of territories) {
      const color = PLAYER_COLORS[territory.owner % PLAYER_COLORS.length];
      this.previewGraphics.fillStyle(color, 0.85);
      for (const cell of territory.cells) {
        this.previewGraphics.fillRect(
          offsetX + cell.x * cellScale,
          offsetY + cell.y * cellScale,
          cellScale - 0.5,
          cellScale - 0.5,
        );
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Start game                                                         */
  /* ------------------------------------------------------------------ */

  private startGame(): void {
    // Trim personalities to match player count
    const slotCount = this.config.playerCount - 1;
    this.config.aiPersonalities = this.config.aiPersonalities.slice(0, slotCount);

    // Pass the preview seed so the game generates the same map the player saw
    if (!this.config.mapSeed) {
      this.config.mapSeed = String(this.previewSeed);
    }

    savePreferences(this.config);
    this.scene.start('GameScene', this.config);
  }
}

/* ------------------------------------------------------------------ */
/*  Internal types                                                     */
/* ------------------------------------------------------------------ */

interface ButtonGroup {
  value: number | string;
  bg: Phaser.GameObjects.Graphics;
  zone: Phaser.GameObjects.Zone;
  text: Phaser.GameObjects.Text;
  redraw: (active: boolean) => void;
}

function hashSeedString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

interface AIRow {
  left: number;
  baseY: number;
  label: Phaser.GameObjects.Text;
  personalityText: Phaser.GameObjects.Text;
  leftArrow: Phaser.GameObjects.Text;
  rightArrow: Phaser.GameObjects.Text;
}

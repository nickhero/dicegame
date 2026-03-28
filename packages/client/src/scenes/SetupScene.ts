import Phaser from 'phaser';
import {
  GameSetupConfig, loadPreferences, savePreferences, TERRITORY_PRESETS, DEFAULT_SETUP,
  ALL_PERSONALITY_TYPES, PersonalityType, CustomAIPreset,
  loadCustomPresets, saveCustomPreset, deleteCustomPreset, customPresetToPersonality,
  generateMap, assignTerritories, GRID_COLS, GRID_ROWS,
  SeededRandom,
  GAME_WIDTH, GAME_HEIGHT, PLAYER_COLORS, PLAYER_COLOR_STRINGS,
  MapShape,
} from '@dicewars/shared';
import type { AuthClient } from '../network/AuthClient';
import { AuthExpiredError } from '../network/LobbyClient';
import type { LobbyClient } from '../network/LobbyClient';

type SpeedOption = GameSetupConfig['speed'];
type PersonalityOption = PersonalityType | 'random' | 'custom' | 'open';

const PERSONALITY_OPTIONS: PersonalityOption[] = [...ALL_PERSONALITY_TYPES, 'random', 'custom'];
const MULTIPLAYER_PERSONALITY_OPTIONS: PersonalityOption[] = ['open', ...ALL_PERSONALITY_TYPES, 'random', 'custom'];

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
  private spectatorBtn!: { bg: Phaser.GameObjects.Graphics; zone: Phaser.GameObjects.Zone; text: Phaser.GameObjects.Text; redraw: (active: boolean) => void };
  private undoEnabledBtn!: { bg: Phaser.GameObjects.Graphics; zone: Phaser.GameObjects.Zone; text: Phaser.GameObjects.Text; redraw: (active: boolean) => void };
  private aiRows: AIRow[] = [];
  private aiContainer!: Phaser.GameObjects.Container;
  private previewGraphics!: Phaser.GameObjects.Graphics;
  private previewSeed: number = Math.floor(Math.random() * 2147483646) + 1;
  private previewX = 0;
  private previewY = 0;
  private customAIConfigs: (CustomAIPreset | null)[] = [null, null, null, null, null];
  private customEditorContainer: Phaser.GameObjects.Container | null = null;
  private editingAIIndex = -1;
  private multiplayer = false;
  private authClient?: AuthClient;
  private lobbyClient?: LobbyClient;

  constructor() {
    super('SetupScene');
  }

  init(data?: { multiplayer?: boolean; authClient?: AuthClient; lobbyClient?: LobbyClient }): void {
    this.multiplayer = data?.multiplayer ?? false;
    this.authClient = data?.authClient;
    this.lobbyClient = data?.lobbyClient;
  }

  create(): void {
    this.config = loadPreferences();
    this.previewSeed = Math.floor(Math.random() * 2147483646) + 1;

    // Restore per-slot custom configs from saved preferences
    if (this.config.customAIConfigs) {
      for (let i = 0; i < this.config.customAIConfigs.length && i < 5; i++) {
        this.customAIConfigs[i] = this.config.customAIConfigs[i] ?? null;
      }
    }

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

    rowY += 6 * 34 + 10; // reserve max 6 rows (spectator mode)

    // --- Speed row (local games only) ---
    if (!this.multiplayer) {
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
    } else {
      // Online games always use normal speed
      this.config.speed = 'normal';
    }

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

    rowY += 55;

    // --- Options row (toggles) ---
    this.add.text(left + 30, rowY, 'Options:', LABEL_STYLE);
    let optX = left + 160;

    this.fogOfWarBtn = this.createButton(
      optX, rowY - 5, 110, 30, 'Fog of War',
      () => {
        this.config.fogOfWar = !this.config.fogOfWar;
        this.fogOfWarBtn.redraw(this.config.fogOfWar);
      },
    );
    this.fogOfWarBtn.redraw(this.config.fogOfWar);
    optX += 125;

    this.powerUpsBtn = this.createButton(
      optX, rowY - 5, 110, 30, 'Power-Ups',
      () => {
        this.config.powerUps = !this.config.powerUps;
        this.powerUpsBtn.redraw(this.config.powerUps);
      },
    );
    this.powerUpsBtn.redraw(this.config.powerUps);
    optX += 125;

    if (!this.multiplayer) {
      this.spectatorBtn = this.createButton(
        optX, rowY - 5, 110, 30, 'Spectator',
        () => {
          this.config.spectatorMode = !this.config.spectatorMode;
          this.spectatorBtn.redraw(this.config.spectatorMode);
          this.rebuildAIRows();
        },
      );
      this.spectatorBtn.redraw(this.config.spectatorMode);
      optX += 125;

      this.undoEnabledBtn = this.createButton(
        optX, rowY - 5, 110, 30, 'Undo',
        () => {
          this.config.undoEnabled = !this.config.undoEnabled;
          this.undoEnabledBtn.redraw(this.config.undoEnabled);
        },
      );
      this.undoEnabledBtn.redraw(this.config.undoEnabled);
    } else {
      this.config.spectatorMode = false;
      this.config.undoEnabled = false;
    }

    rowY += 65;

    // --- BACK & START GAME buttons (side by side) ---
    this.createLargeButton(cx - 115, rowY, 200, 44, 'BACK', 0x555555, 0x777777, () => {
      this.scene.start('MenuScene');
    });

    this.createLargeButton(cx + 115, rowY, 200, 44, 'START GAME', 0x338833, 0x44aa44, () => {
      this.startGame();
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

    const slotCount = this.config.spectatorMode
      ? this.config.playerCount
      : this.config.playerCount - 1;

    // Ensure the aiPersonalities array has enough entries
    const defaultPersonality = this.multiplayer ? 'open' : 'random';
    while (this.config.aiPersonalities.length < slotCount) {
      this.config.aiPersonalities.push(defaultPersonality as PersonalityType);
    }
    // In multiplayer, reset all slots to 'open' by default
    if (this.multiplayer) {
      for (let i = 0; i < slotCount; i++) {
        this.config.aiPersonalities[i] = 'open' as PersonalityType;
      }
    }

    for (let i = 0; i < slotCount; i++) {
      const y = baseY + i * 34;
      this.aiRows.push(this.createAIRow(left, y, i));
    }
  }

  private createAIRow(left: number, y: number, index: number): AIRow {
    const playerIdx = this.config.spectatorMode ? index : index + 1;
    const slotLabel = this.multiplayer ? `Slot ${playerIdx + 1}:` : `AI ${index + 1}:`;
    const label = this.add.text(left + 30, y, slotLabel, {
      ...LABEL_STYLE,
      color: PLAYER_COLOR_STRINGS[playerIdx],
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

    // Gear button for custom editing
    const gearBtn = this.add.text(left + 350, y, '⚙', {
      fontSize: '16px',
      color: '#88aadd',
      fontFamily: 'monospace',
    }).setInteractive({ useHandCursor: true }).setVisible(false);
    gearBtn.on('pointerdown', () => this.openCustomEditor(index));
    gearBtn.on('pointerover', () => gearBtn.setColor('#ffffff'));
    gearBtn.on('pointerout', () => gearBtn.setColor('#88aadd'));
    this.aiContainer.add(gearBtn);

    // Set initial text
    const current: string = this.config.aiPersonalities[index] ?? 'random';
    if (current === 'open') {
      personalityText.setText('👤 Open');
      personalityText.setColor('#44ff88');
    } else if (current === 'custom') {
      personalityText.setText(this.customAIConfigs[index]?.name ?? 'Custom ⚙');
      gearBtn.setVisible(true);
    } else {
      const displayName = current === 'random' ? 'Random' : current.charAt(0).toUpperCase() + current.slice(1);
      personalityText.setText(displayName);
    }

    return { left, baseY: y, label, personalityText, leftArrow, rightArrow, gearBtn };
  }

  private cyclePersonality(index: number, direction: number): void {
    const options = this.multiplayer ? MULTIPLAYER_PERSONALITY_OPTIONS : PERSONALITY_OPTIONS;
    const current = this.config.aiPersonalities[index] ?? (this.multiplayer ? 'open' : 'random');
    const currentIdx = options.indexOf(current as PersonalityOption);
    const nextIdx = (currentIdx + direction + options.length) % options.length;
    const next = options[nextIdx];
    this.config.aiPersonalities[index] = next as PersonalityType;

    if (next === 'open') {
      this.aiRows[index].personalityText.setText('👤 Open');
      this.aiRows[index].personalityText.setColor('#44ff88');
      this.aiRows[index].gearBtn.setVisible(false);
    } else if (next === 'custom') {
      // Ensure a default custom config exists for this slot
      if (!this.customAIConfigs[index]) {
        this.customAIConfigs[index] = { name: 'Custom', minAdvantage: 1, maxAttacksPerTurn: Infinity, connectivityBonus: 0 };
      }
      this.aiRows[index].personalityText.setText('Custom ⚙');
      this.aiRows[index].gearBtn.setVisible(true);
      // Open the editor popup
      this.openCustomEditor(index);
    } else {
      const displayName = next === 'random' ? 'Random' : next.charAt(0).toUpperCase() + next.slice(1);
      this.aiRows[index].personalityText.setText(displayName);
      this.aiRows[index].personalityText.setColor('#88aadd');
      this.aiRows[index].gearBtn.setVisible(false);
      this.customAIConfigs[index] = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Custom AI editor popup                                             */
  /* ------------------------------------------------------------------ */

  private openCustomEditor(index: number): void {
    if (this.customEditorContainer) {
      this.customEditorContainer.destroy();
    }
    this.editingAIIndex = index;
    const preset = this.customAIConfigs[index] ?? { name: 'Custom', minAdvantage: 1, maxAttacksPerTurn: Infinity, connectivityBonus: 0 };

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const popW = 420;
    const popH = 380;
    const popLeft = cx - popW / 2;
    const popTop = cy - popH / 2;

    const container = this.add.container(0, 0);
    this.customEditorContainer = container;

    // Dimmed background
    const dimBg = this.add.graphics();
    dimBg.fillStyle(0x000000, 0.6);
    dimBg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    dimBg.setInteractive(new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT), Phaser.Geom.Rectangle.Contains);
    container.add(dimBg);

    // Panel background
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x16213e, 0.98);
    panelBg.fillRoundedRect(popLeft, popTop, popW, popH, 12);
    panelBg.lineStyle(2, 0x4a90d9, 1);
    panelBg.strokeRoundedRect(popLeft, popTop, popW, popH, 12);
    container.add(panelBg);

    // Title
    const title = this.add.text(cx, popTop + 25, `CUSTOM AI ${index + 1}`, {
      fontSize: '20px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(title);

    let sliderY = popTop + 65;
    const sliderX = popLeft + 30;
    const sliderW = popW - 60;

    // Current mutable values
    const values = {
      minAdvantage: preset.minAdvantage,
      maxAttacksPerTurn: preset.maxAttacksPerTurn,
      connectivityBonus: preset.connectivityBonus,
    };

    // --- Min Advantage slider (-2 to 4) ---
    const advSlider = this.createSlider(
      container, sliderX, sliderY, sliderW,
      'Min Advantage', -2, 4, values.minAdvantage,
      (v) => { values.minAdvantage = v; },
      (v) => `${v >= 0 ? '+' : ''}${v}`,
    );
    sliderY += 60;

    // --- Max Attacks slider (1 to 11, where 11 = ∞) ---
    const maxAtkRaw = values.maxAttacksPerTurn === Infinity ? 11 : values.maxAttacksPerTurn;
    const atkSlider = this.createSlider(
      container, sliderX, sliderY, sliderW,
      'Max Attacks', 1, 11, maxAtkRaw,
      (v) => { values.maxAttacksPerTurn = v >= 11 ? Infinity : v; },
      (v) => v >= 11 ? '∞' : `${v}`,
    );
    sliderY += 60;

    // --- Connectivity Bonus slider (0 to 5) ---
    const connSlider = this.createSlider(
      container, sliderX, sliderY, sliderW,
      'Connectivity Bonus', 0, 5, values.connectivityBonus,
      (v) => { values.connectivityBonus = v; },
      (v) => `${v}`,
    );
    sliderY += 70;

    // --- Saved presets section ---
    const presetsLabel = this.add.text(sliderX, sliderY, 'Load Preset:', {
      fontSize: '13px', color: '#aaaaaa', fontFamily: 'monospace',
    });
    container.add(presetsLabel);
    sliderY += 22;

    const presets = loadCustomPresets();
    const presetListContainer = this.add.container(0, 0);
    container.add(presetListContainer);

    const renderPresetList = () => {
      presetListContainer.removeAll(true);
      const freshPresets = loadCustomPresets();
      const maxVisible = 3;
      const visible = freshPresets.slice(0, maxVisible);

      visible.forEach((p, pi) => {
        const py = sliderY + pi * 24;

        const presetName = this.add.text(sliderX + 10, py, `▸ ${p.name}`, {
          fontSize: '13px', color: '#88ccff', fontFamily: 'monospace',
        }).setInteractive({ useHandCursor: true });
        presetName.on('pointerover', () => presetName.setColor('#ffffff'));
        presetName.on('pointerout', () => presetName.setColor('#88ccff'));
        presetName.on('pointerdown', () => {
          values.minAdvantage = p.minAdvantage;
          values.maxAttacksPerTurn = p.maxAttacksPerTurn;
          values.connectivityBonus = p.connectivityBonus;
          advSlider.update(p.minAdvantage);
          atkSlider.update(p.maxAttacksPerTurn === Infinity ? 11 : p.maxAttacksPerTurn);
          connSlider.update(p.connectivityBonus);
        });
        presetListContainer.add(presetName);

        // Delete button
        const delBtn = this.add.text(sliderX + sliderW - 20, py, '✕', {
          fontSize: '13px', color: '#aa4444', fontFamily: 'monospace',
        }).setInteractive({ useHandCursor: true });
        delBtn.on('pointerover', () => delBtn.setColor('#ff6666'));
        delBtn.on('pointerout', () => delBtn.setColor('#aa4444'));
        delBtn.on('pointerdown', () => {
          deleteCustomPreset(p.name);
          renderPresetList();
        });
        presetListContainer.add(delBtn);
      });

      if (freshPresets.length === 0) {
        const noPresets = this.add.text(sliderX + 10, sliderY, 'No saved presets', {
          fontSize: '12px', color: '#666666', fontFamily: 'monospace', fontStyle: 'italic',
        });
        presetListContainer.add(noPresets);
      }
    };
    renderPresetList();

    // --- Buttons row ---
    const btnY = popTop + popH - 45;

    // Save Preset button
    this.createPopupButton(container, popLeft + 30, btnY, 120, 30, 'Save Preset', 0x335588, () => {
      const name = window.prompt('Preset name:');
      if (name && name.trim()) {
        saveCustomPreset({
          name: name.trim(),
          minAdvantage: values.minAdvantage,
          maxAttacksPerTurn: values.maxAttacksPerTurn,
          connectivityBonus: values.connectivityBonus,
        });
        renderPresetList();
      }
    });

    // Done button
    this.createPopupButton(container, popLeft + popW - 150, btnY, 120, 30, 'Done', 0x338833, () => {
      this.customAIConfigs[index] = {
        name: 'Custom',
        minAdvantage: values.minAdvantage,
        maxAttacksPerTurn: values.maxAttacksPerTurn,
        connectivityBonus: values.connectivityBonus,
      };
      const maxLabel = values.maxAttacksPerTurn === Infinity ? '∞' : String(values.maxAttacksPerTurn);
      this.aiRows[index].personalityText.setText(`Custom ⚙`);
      this.aiRows[index].gearBtn.setVisible(true);
      this.customEditorContainer?.destroy();
      this.customEditorContainer = null;
    });
  }

  private createSlider(
    container: Phaser.GameObjects.Container,
    x: number, y: number, width: number,
    label: string, min: number, max: number, initial: number,
    onChange: (value: number) => void,
    formatValue: (value: number) => string,
  ): { update: (value: number) => void } {
    const labelText = this.add.text(x, y, label + ':', {
      fontSize: '14px', color: '#cccccc', fontFamily: 'monospace',
    });
    container.add(labelText);

    const trackY = y + 28;
    const trackLeft = x + 10;
    const trackRight = x + width - 50;
    const trackW = trackRight - trackLeft;

    // Track
    const track = this.add.graphics();
    track.fillStyle(0x222244, 1);
    track.fillRoundedRect(trackLeft, trackY - 3, trackW, 6, 3);
    container.add(track);

    // Tick marks
    const tickGfx = this.add.graphics();
    const steps = max - min;
    for (let i = 0; i <= steps; i++) {
      const tx = trackLeft + (i / steps) * trackW;
      tickGfx.fillStyle(0x445577, 1);
      tickGfx.fillRect(tx - 0.5, trackY - 6, 1, 12);
    }
    container.add(tickGfx);

    // Value display
    const valueText = this.add.text(x + width - 35, trackY - 8, formatValue(initial), {
      fontSize: '16px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    container.add(valueText);

    // Handle
    const handleSize = 14;
    const handle = this.add.graphics();
    container.add(handle);
    let currentValue = initial;

    const positionFromValue = (v: number) => trackLeft + ((v - min) / (max - min)) * trackW;
    const valueFromPosition = (px: number) => {
      const ratio = Phaser.Math.Clamp((px - trackLeft) / trackW, 0, 1);
      return Math.round(ratio * (max - min) + min);
    };

    const drawHandle = (hx: number, color: number) => {
      handle.clear();
      handle.fillStyle(color, 1);
      handle.fillCircle(hx, trackY, handleSize / 2);
      handle.lineStyle(2, 0xffffff, 0.8);
      handle.strokeCircle(hx, trackY, handleSize / 2);
    };

    let handleX = positionFromValue(initial);
    drawHandle(handleX, BTN_ACTIVE);

    // Drag zone
    const dragZone = this.add.zone(trackLeft + trackW / 2, trackY, trackW + handleSize, handleSize + 12)
      .setInteractive({ useHandCursor: true, draggable: true });
    container.add(dragZone);

    dragZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const newVal = valueFromPosition(pointer.x);
      currentValue = newVal;
      handleX = positionFromValue(newVal);
      drawHandle(handleX, BTN_ACTIVE);
      valueText.setText(formatValue(newVal));
      onChange(newVal);
    });

    dragZone.on('drag', (pointer: Phaser.Input.Pointer) => {
      const newVal = valueFromPosition(pointer.x);
      if (newVal !== currentValue) {
        currentValue = newVal;
        handleX = positionFromValue(newVal);
        drawHandle(handleX, BTN_ACTIVE);
        valueText.setText(formatValue(newVal));
        onChange(newVal);
      }
    });

    const update = (newVal: number) => {
      currentValue = newVal;
      handleX = positionFromValue(newVal);
      drawHandle(handleX, BTN_ACTIVE);
      valueText.setText(formatValue(newVal));
      onChange(newVal);
    };

    return { update };
  }

  private createPopupButton(
    container: Phaser.GameObjects.Container,
    x: number, y: number, w: number, h: number,
    label: string, color: number, onClick: () => void,
  ): void {
    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(x, y, w, h, 5);
    container.add(bg);

    const txt = this.add.text(x + w / 2, y + h / 2, label, {
      fontSize: '13px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(txt);

    const zone = this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(Phaser.Display.Color.ValueToColor(color).lighten(20).color, 1);
      bg.fillRoundedRect(x, y, w, h, 5);
    });
    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(x, y, w, h, 5);
    });
    zone.on('pointerdown', onClick);
    container.add(zone);
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
    const slotCount = this.config.spectatorMode
      ? this.config.playerCount
      : this.config.playerCount - 1;
    this.config.aiPersonalities = this.config.aiPersonalities.slice(0, slotCount);
    this.config.customAIConfigs = this.customAIConfigs.slice(0, slotCount);

    // Pass the preview seed so the game generates the same map the player saw
    if (!this.config.mapSeed) {
      this.config.mapSeed = String(this.previewSeed);
    }

    // Save preferences WITHOUT the auto-generated seed (so next game gets a fresh one)
    const prefsToSave = { ...this.config };
    if (String(this.previewSeed) === prefsToSave.mapSeed) {
      prefsToSave.mapSeed = null;
    }
    savePreferences(prefsToSave);

    if (this.multiplayer && this.lobbyClient && this.authClient) {
      this.startOnlineGame();
    } else {
      this.scene.start('GameScene', this.config);
    }
  }

  private async startOnlineGame(): Promise<void> {
    try {
      // Build aiSlots with proper slot indices (slot 0 = creator)
      const aiSlots: Array<{ slot: number; personality: string }> = [];
      for (let i = 0; i < this.config.aiPersonalities.length; i++) {
        const p = this.config.aiPersonalities[i];
        if (p && p !== ('open' as PersonalityType)) {
          aiSlots.push({ slot: i + 1, personality: p });
        }
      }

      const game = await this.lobbyClient!.createGame({
        name: `Game ${Date.now().toString(36).slice(-4)}`,
        maxPlayers: this.config.playerCount,
        aiSlots,
        config: {
          playerCount: this.config.playerCount,
          territoryCount: this.config.territoryCount,
          mapShape: this.config.mapShape ?? 'rectangle',
          gridType: 'square',
          speed: this.config.speed ?? 'normal',
          powerUps: this.config.powerUps ?? false,
          fogOfWar: this.config.fogOfWar ?? false,
          alliances: false,
        },
      });

      this.scene.start('WaitingRoomScene', {
        gameId: game.id,
        authClient: this.authClient!,
        lobbyClient: this.lobbyClient!,
        gameName: game.name,
        isCreator: true,
        maxPlayers: this.config.playerCount,
      });
    } catch (err) {
      console.error('Failed to create online game:', err);
      if (err instanceof AuthExpiredError) {
        this.authClient?.logout();
        this.scene.start('LoginScene');
      } else {
        this.scene.start('LobbyScene', { authClient: this.authClient, lobbyClient: this.lobbyClient });
      }
    }
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
  gearBtn: Phaser.GameObjects.Text;
}

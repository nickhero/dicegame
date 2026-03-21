import Phaser from 'phaser';
import { GameState, createInitialGameState } from '../game/GameState';
import { createPlayer } from '../game/Player';
import { generateMap, assignTerritories } from '../game/MapGenerator';
import {
  canAttackFrom,
  isValidAttack,
  executeAttack,
  endTurn,
  getAttackableTerritories,
  getValidTargets,
  shouldAISurrender,
  distributeSurrenderedTerritories,
} from '../game/GameRules';
import { selectBestMove, useAIPowerUps } from '../game/AIPlayer';
import { PersonalityType, getRandomPersonality, PERSONALITIES } from '../game/AIPersonality';
import { SPEED_CONFIGS, GameSetupConfig, DEFAULT_SETUP } from '../game/GameConfig';
import { getVisibleTerritories } from '../game/FogOfWar';
import { useFortify, useReinforce, POWER_UPS } from '../game/PowerUps';
import { estimateWinProbability } from '../game/DiceBattle';
import { GameRecorder } from '../game/GameRecorder';
import { saveMatch } from '../game/MatchHistory';
import { createSnapshot, restoreSnapshot, StateSnapshot } from '../game/GameStateSnapshot';
import { SeededRandom } from '../utils/random';
import { MapRenderer } from '../rendering/MapRenderer';
import { DiceRenderer, createDiceTextures } from '../rendering/DiceRenderer';
import { UIRenderer } from '../rendering/UIRenderer';
import { BattleAnimator } from '../rendering/BattleAnimator';
import { EventLog } from '../rendering/EventLog';
import { TerritoryEffects } from '../rendering/TerritoryEffects';
import { SoundManager } from '../rendering/SoundManager';
import { GameStats } from '../game/GameStats';
import { PLAYER_COLORS, DEFAULT_TERRITORY_COUNT, DEFAULT_PLAYER_COUNT, GAME_WIDTH, GAME_HEIGHT } from '../config';

export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private rng!: SeededRandom;
  private mapRenderer!: MapRenderer;
  private diceRenderer!: DiceRenderer;
  private uiRenderer!: UIRenderer;
  private battleAnimator!: BattleAnimator;
  private eventLog!: EventLog;
  private territoryEffects!: TerritoryEffects;
  private soundManager!: SoundManager;
  private gameStats!: GameStats;
  private isProcessing = false;
  private hoveredTerritoryId: number | null = null;
  private helpOverlay: Phaser.GameObjects.Container | null = null;
  private confirmDialog: Phaser.GameObjects.Container | null = null;
  private surrenderDialog: Phaser.GameObjects.Container | null = null;
  private isDialogOpen = false;
  private speed: GameSetupConfig['speed'] = 'normal';
  private fogOfWarEnabled = false;
  private setupConfig!: GameSetupConfig;
  private powerUpPopup: Phaser.GameObjects.Container | null = null;
  private fortifyMode = false;
  private fortifySourceId: number | null = null;
  private spectatorMode = false;
  private spectatorPaused = false;
  private spectatorLabel: Phaser.GameObjects.Text | null = null;
  private gameRecorder!: GameRecorder;
  private undoSnapshot: StateSnapshot | null = null;
  private undoUsedThisTurn = false;
  private gameSeed = 0;

  constructor() {
    super('GameScene');
  }

  init(data?: Partial<GameSetupConfig>): void {
    if (data && typeof data.playerCount === 'number') {
      this.setupConfig = {
        playerCount: data.playerCount ?? DEFAULT_SETUP.playerCount,
        territoryCount: data.territoryCount ?? DEFAULT_SETUP.territoryCount,
        mapSeed: data.mapSeed ?? DEFAULT_SETUP.mapSeed,
        speed: data.speed ?? DEFAULT_SETUP.speed,
        aiPersonalities: data.aiPersonalities ?? [...DEFAULT_SETUP.aiPersonalities],
        mapShape: data.mapShape ?? DEFAULT_SETUP.mapShape,
        fogOfWar: data.fogOfWar ?? DEFAULT_SETUP.fogOfWar,
        powerUps: data.powerUps ?? DEFAULT_SETUP.powerUps,
        spectatorMode: data.spectatorMode ?? DEFAULT_SETUP.spectatorMode,
      };
    } else {
      this.setupConfig = { ...DEFAULT_SETUP, aiPersonalities: [...DEFAULT_SETUP.aiPersonalities] };
    }
    this.speed = this.setupConfig.speed;
  }

  create(): void {
    // Generate dice textures
    createDiceTextures(this);

    // Initialize RNG — numeric seeds are used directly, string seeds are hashed
    const rawSeed = this.setupConfig.mapSeed;
    let seed: number;
    if (rawSeed) {
      const parsed = Number(rawSeed);
      seed = Number.isFinite(parsed) && parsed > 0 ? parsed : hashString(rawSeed);
    } else {
      seed = Date.now();
    }
    this.gameSeed = seed;
    this.rng = new SeededRandom(seed);

    const playerCount = this.setupConfig.playerCount;
    const territoryCount = this.setupConfig.territoryCount;

    // Generate map
    const { territories, adjacency } = generateMap(
      territoryCount, this.rng,
      'square',
      this.setupConfig.mapShape
    );

    // Create players
    this.spectatorMode = this.setupConfig.spectatorMode ?? false;
    const allAINames = ['AI Blue', 'AI Red', 'AI Green', 'AI Yellow', 'AI Purple', 'AI Cyan'];
    const humanNames = ['AI Red', 'AI Green', 'AI Yellow', 'AI Purple', 'AI Cyan'];
    const players = [];
    if (this.spectatorMode) {
      for (let i = 0; i < playerCount; i++) {
        const personalitySetting = this.setupConfig.aiPersonalities[i] ?? 'random';
        const personality: PersonalityType =
          personalitySetting === 'random'
            ? getRandomPersonality(this.rng)
            : personalitySetting;
        players.push(createPlayer(i, allAINames[i], false, PLAYER_COLORS[i], personality));
      }
    } else {
      players.push(createPlayer(0, 'Player', true, PLAYER_COLORS[0]));
      for (let i = 1; i < playerCount; i++) {
        const personalitySetting = this.setupConfig.aiPersonalities[i - 1] ?? 'random';
        const personality: PersonalityType =
          personalitySetting === 'random'
            ? getRandomPersonality(this.rng)
            : personalitySetting;
        players.push(createPlayer(i, humanNames[i - 1], false, PLAYER_COLORS[i], personality));
      }
    }

    // Assign territories and dice
    assignTerritories(territories, playerCount, this.rng);

    // Create game state
    this.gameState = createInitialGameState(territories, players, adjacency);

    this.fogOfWarEnabled = this.setupConfig.fogOfWar;
    if (this.setupConfig.powerUps) {
      this.gameState.powerUpsEnabled = true;
    }

    // Create renderers
    this.mapRenderer = new MapRenderer(this);
    this.diceRenderer = new DiceRenderer(this);
    this.uiRenderer = new UIRenderer(this);
    this.battleAnimator = new BattleAnimator(this);
    this.eventLog = new EventLog(this);
    this.territoryEffects = new TerritoryEffects(this);
    this.soundManager = new SoundManager();
    this.gameStats = new GameStats();
    this.gameRecorder = new GameRecorder();

    // Capture initial state for replay
    this.gameRecorder.setInitialState(
      this.gameState.territories,
      this.gameState.players,
      this.gameState.adjacency,
      !!this.gameState.powerUpsEnabled,
    );

    // Record initial turn
    this.gameStats.recordTurnStart(this.gameState);
    this.gameRecorder.startTurn(this.gameState.turnNumber, this.gameState.currentPlayerIndex);

    // Setup UI callbacks
    this.uiRenderer.setEndTurnCallback(() => this.onEndTurn());
    this.uiRenderer.setUndoCallback(() => this.undoLastAttack());
    if (this.spectatorMode) {
      this.uiRenderer.setSpectatorMode(true);
    }

    // Setup territory click handler
    this.mapRenderer.createInteractiveZones(this.gameState, (id) =>
      this.onTerritoryClick(id)
    );

    // Setup hover callbacks on territory zones
    this.mapRenderer.setZoneHoverCallbacks(
      (id, pointer) => {
        this.hoveredTerritoryId = id;
        this.updateHoverEffects(id, pointer);
      },
      (id) => {
        if (this.hoveredTerritoryId === id) {
          this.hoveredTerritoryId = null;
          this.territoryEffects.hideTooltip();
          if (!this.isProcessing && this.gameState.phase === 'selectingDefender') {
            this.territoryEffects.hideAttackLine();
          }
        }
      },
      (_id, pointer) => {
        if (this.hoveredTerritoryId !== null) {
          this.updateHoverEffects(this.hoveredTerritoryId, pointer);
        }
      }
    );

    // Setup keyboard shortcuts
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      this.handleKeyDown(event);
    });

    // Initial render
    this.refreshDisplay();

    // Seed display below HUD panel
    this.add.text(GAME_WIDTH - 200, 318, `Seed: ${this.gameSeed}`, {
      fontSize: '10px',
      color: '#555566',
      fontFamily: 'monospace',
    }).setDepth(100);

    if (this.spectatorMode) {
      // Instant spectate: run entire simulation with no UI, jump to results
      if (this.speed === 'instant') {
        this.runInstantSimulation();
        return;
      }

      this.spectatorLabel = this.add.text(GAME_WIDTH / 2, 15, '👁 SPECTATING (Space to pause)', {
        fontSize: '14px',
        color: '#ffcc00',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(200);

      this.uiRenderer.setStatus('Spectator mode — watching AI battle');
      this.isProcessing = true;
      this.time.delayedCall(500, () => this.processAITurns());
    } else {
      this.uiRenderer.setStatus('Select a territory to attack from');
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const key = event.key.toUpperCase();

    // H / ? always toggles help overlay (even when it's open)
    if (key === 'H' || event.key === '?') {
      this.toggleHelpOverlay();
      return;
    }

    // 1/2/3 — change speed (always works, even during AI processing)
    if (key === '1') { this.setSpeed('normal'); return; }
    if (key === '2') { this.setSpeed('fast'); return; }
    if (key === '3') { this.setSpeed('instant'); return; }

    // Space — pause/resume in spectator mode
    if (key === ' ' && this.spectatorMode) {
      event.preventDefault();
      this.toggleSpectatorPause();
      return;
    }

    // Block all other shortcuts while a dialog is open
    if (this.isDialogOpen) return;

    // M — toggle mute
    if (key === 'M') {
      this.soundManager.setMuted(!this.soundManager.isMuted());
      return;
    }

    // R — restart with confirmation
    if (key === 'R') {
      this.showConfirmDialog();
      return;
    }

    // S — surrender with confirmation (not in spectator mode)
    if (key === 'S' && !this.spectatorMode) {
      this.showSurrenderDialog();
      return;
    }

    // Block gameplay shortcuts while processing
    if (this.isProcessing) return;
    if (this.gameState.phase === 'gameOver') return;

    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    if (!currentPlayer.isHuman) return;

    // Z — undo last attack
    if (key === 'Z') {
      this.undoLastAttack();
      return;
    }

    // E / Space — end turn
    if (key === 'E' || key === ' ') {
      event.preventDefault();
      this.onEndTurn();
      return;
    }

    // Escape — deselect territory / cancel fortify / dismiss popup
    if (key === 'ESCAPE') {
      if (this.fortifyMode) {
        this.cancelFortify();
        return;
      }
      this.dismissPowerUpPopup();
      if (this.gameState.phase === 'selectingDefender') {
        this.gameState.phase = 'selectingAttacker';
        this.gameState.selectedTerritoryId = null;
        this.refreshDisplay();
        this.uiRenderer.setStatus('Selection cancelled. Pick a territory to attack from.');
      }
      return;
    }
  }

  private toggleHelpOverlay(): void {
    if (this.helpOverlay) {
      this.helpOverlay.destroy();
      this.helpOverlay = null;
      this.isDialogOpen = false;
      return;
    }

    this.isDialogOpen = true;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const w = 350;
    const h = 370;

    this.helpOverlay = this.add.container(cx, cy).setDepth(1000);

    const bg = this.add.graphics();
    bg.fillStyle(0x111122, 0.9);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    bg.lineStyle(2, 0x6688cc, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    this.helpOverlay.add(bg);

    const title = this.add.text(0, -h / 2 + 25, 'KEYBOARD SHORTCUTS', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.helpOverlay.add(title);

    const shortcuts = [
      ['E / Space', 'End turn'],
      ['Z', 'Undo last attack'],
      ['Escape', 'Deselect territory'],
      ['1 / 2 / 3', 'Speed: Normal/Fast/Instant'],
      ['S', 'Surrender'],
      ['R', 'Restart game'],
      ['M', 'Toggle sound'],
      ['H / ?', 'Toggle this help'],
    ];

    shortcuts.forEach(([key, desc], i) => {
      const y = -h / 2 + 75 + i * 36;
      const keyText = this.add.text(-w / 2 + 30, y, key!, {
        fontSize: '14px',
        color: '#88bbff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      });
      const descText = this.add.text(-w / 2 + 150, y, desc!, {
        fontSize: '14px',
        color: '#cccccc',
        fontFamily: 'monospace',
      });
      this.helpOverlay!.add([keyText, descText]);
    });

    const footer = this.add.text(0, h / 2 - 30, 'Press H to close', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.helpOverlay.add(footer);
  }

  private showConfirmDialog(): void {
    if (this.confirmDialog) return;

    this.isDialogOpen = true;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const w = 260;
    const h = 130;

    this.confirmDialog = this.add.container(cx, cy).setDepth(1000);

    const bg = this.add.graphics();
    bg.fillStyle(0x111122, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(2, 0xcc6666, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.confirmDialog.add(bg);

    const label = this.add.text(0, -h / 2 + 30, 'Restart game?', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.confirmDialog.add(label);

    // YES button
    const yesBtnContainer = this.createDialogButton(-55, 25, 'YES', 0x338833, 0x44aa44, () => {
      this.dismissConfirmDialog();
      this.scene.restart();
    });
    this.confirmDialog.add(yesBtnContainer);

    // NO button
    const noBtnContainer = this.createDialogButton(55, 25, 'NO', 0x883333, 0xaa4444, () => {
      this.dismissConfirmDialog();
    });
    this.confirmDialog.add(noBtnContainer);
  }

  private createDialogButton(
    x: number, y: number, text: string,
    color: number, hoverColor: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const btn = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-40, -15, 80, 30, 5);
    btn.add(bg);

    const label = this.add.text(0, 0, text, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add(label);

    const zone = this.add.zone(0, 0, 80, 30).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(-40, -15, 80, 30, 5);
    });
    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-40, -15, 80, 30, 5);
    });
    zone.on('pointerdown', onClick);
    btn.add(zone);

    return btn;
  }

  private dismissConfirmDialog(): void {
    if (this.confirmDialog) {
      this.confirmDialog.destroy();
      this.confirmDialog = null;
    }
    // Only clear isDialogOpen if help overlay isn't also open
    if (!this.helpOverlay) {
      this.isDialogOpen = false;
    }
  }

  private showSurrenderDialog(): void {
    if (this.surrenderDialog) return;
    if (this.isProcessing) return;
    if (this.gameState.phase === 'gameOver') return;
    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    if (!currentPlayer.isHuman) return;

    this.isDialogOpen = true;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const w = 280;
    const h = 130;

    this.surrenderDialog = this.add.container(cx, cy).setDepth(1000);

    const bg = this.add.graphics();
    bg.fillStyle(0x221111, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(2, 0xcc6666, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.surrenderDialog.add(bg);

    const label = this.add.text(0, -h / 2 + 30, 'Surrender?', {
      fontSize: '18px',
      color: '#ff6666',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.surrenderDialog.add(label);

    const yesBtnContainer = this.createDialogButton(-55, 25, 'YES', 0x883333, 0xaa4444, () => {
      this.dismissSurrenderDialog();
      this.executeHumanSurrender();
    });
    this.surrenderDialog.add(yesBtnContainer);

    const noBtnContainer = this.createDialogButton(55, 25, 'NO', 0x338833, 0x44aa44, () => {
      this.dismissSurrenderDialog();
    });
    this.surrenderDialog.add(noBtnContainer);
  }

  private dismissSurrenderDialog(): void {
    if (this.surrenderDialog) {
      this.surrenderDialog.destroy();
      this.surrenderDialog = null;
    }
    if (!this.helpOverlay && !this.confirmDialog) {
      this.isDialogOpen = false;
    }
  }

  private executeHumanSurrender(): void {
    const player = this.gameState.players[this.gameState.currentPlayerIndex];
    this.eventLog.addEvent(`${player.name} surrendered!`, 0xff4444);
    distributeSurrenderedTerritories(this.gameState, player.id);
    this.refreshDisplay();

    if (this.gameState.phase === 'gameOver') {
      this.time.delayedCall(this.getDelay(1000), () => this.handleGameOver());
      return;
    }

    // Advance to next player and process AI turns
    this.isProcessing = true;
    this.processAITurns();
  }

  private onTerritoryClick(territoryId: number): void {
    if (this.spectatorMode) return;
    if (this.isProcessing) return;
    if (this.gameState.phase === 'gameOver') return;

    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    if (!currentPlayer.isHuman) return;

    // Fortify mode: selecting target territory
    if (this.fortifyMode) {
      this.handleFortifyTarget(territoryId);
      return;
    }

    if (this.gameState.phase === 'selectingAttacker') {
      this.handleAttackerSelection(territoryId);
    } else if (this.gameState.phase === 'selectingDefender') {
      this.handleDefenderSelection(territoryId);
    }
  }

  private handleAttackerSelection(territoryId: number): void {
    const territory = this.gameState.territories[territoryId];

    if (territory.owner !== this.gameState.currentPlayerIndex) {
      this.uiRenderer.setStatus('That\'s not your territory!');
      return;
    }

    // If territory has a manual power-up, show popup
    if (territory.powerUp === 'reinforce' || territory.powerUp === 'fortify') {
      this.showPowerUpPopup(territory);
      return;
    }

    if (!canAttackFrom(territoryId, this.gameState)) {
      this.uiRenderer.setStatus('Can\'t attack from there (need >1 die and an enemy neighbor)');
      return;
    }

    this.gameState.selectedTerritoryId = territoryId;
    this.gameState.phase = 'selectingDefender';
    this.refreshDisplay();
    this.uiRenderer.setStatus('Select an enemy territory to attack');
  }

  private async handleDefenderSelection(territoryId: number): Promise<void> {
    const attackerId = this.gameState.selectedTerritoryId!;

    // Clicking own territory deselects
    if (this.gameState.territories[territoryId].owner === this.gameState.currentPlayerIndex) {
      if (canAttackFrom(territoryId, this.gameState)) {
        // Select this territory instead
        this.gameState.selectedTerritoryId = territoryId;
        this.refreshDisplay();
        return;
      }
      this.gameState.phase = 'selectingAttacker';
      this.gameState.selectedTerritoryId = null;
      this.refreshDisplay();
      this.uiRenderer.setStatus('Selection cancelled. Pick a territory to attack from.');
      return;
    }

    if (!isValidAttack(attackerId, territoryId, this.gameState)) {
      this.uiRenderer.setStatus('Invalid target! Must be an adjacent enemy territory.');
      return;
    }

    // Capture colors before state changes
    const attackerColor = PLAYER_COLORS[this.gameState.currentPlayerIndex];
    const defenderColor = PLAYER_COLORS[this.gameState.territories[territoryId].owner];

    // Show attack line
    const attacker = this.gameState.territories[attackerId];
    const defender = this.gameState.territories[territoryId];
    this.territoryEffects.showAttackLine(
      attacker.center.x, attacker.center.y,
      defender.center.x, defender.center.y
    );

    // Execute the attack
    this.isProcessing = true;

    // Save snapshot for undo (if not already used this turn)
    if (!this.undoUsedThisTurn) {
      this.undoSnapshot = createSnapshot(this.gameState);
    }

    const attackerPlayerId = this.gameState.currentPlayerIndex;
    const defenderPlayerId = this.gameState.territories[territoryId].owner;
    const result = executeAttack(attackerId, territoryId, this.gameState, this.rng);
    this.gameStats.recordAttack(attackerPlayerId, defenderPlayerId, result, this.gameState);
    this.gameRecorder.recordAction({
      type: 'attack', attackerId, defenderId: territoryId,
      attackerPlayerId, defenderPlayerId, result,
    });

    const outcome = result.attackerWins ? 'won' : 'lost';
    this.eventLog.addEvent(
      `Player attacked T${attackerId} → T${territoryId} (${outcome} ${result.attackerTotal} vs ${result.defenderTotal})`,
      PLAYER_COLORS[this.gameState.currentPlayerIndex]
    );

    // Check for eliminations after attack
    const eliminatedPlayers: number[] = [];
    for (const p of this.gameState.players) {
      if (!p.isHuman && !p.isAlive) {
        const hasTerritories = this.gameState.territories.some((t) => t.owner === p.id);
        if (!hasTerritories) {
          this.eventLog.addEvent(`${p.name} was eliminated!`, 0xff4444);
          this.gameRecorder.recordAction({ type: 'elimination', playerId: p.id, eliminatedBy: this.gameState.currentPlayerIndex });
          eliminatedPlayers.push(p.id);
        }
      }
    }

    // Show battle animation
    this.soundManager.playDiceRoll();
    await this.battleAnimator.showBattle(
      result.attackerRolls,
      result.defenderRolls,
      attackerColor,
      defenderColor,
      result.attackerWins,
      this.getBattleSpeed(1)
    );

    this.territoryEffects.hideAttackLine();

    if (result.attackerWins) {
      this.territoryEffects.showCapturePulse(defender);
      this.soundManager.playCapture();
      this.uiRenderer.setStatus(
        `Victory! ${result.attackerTotal} vs ${result.defenderTotal} — Territory captured!`
      );
    } else {
      this.soundManager.playAttackFail();
      this.uiRenderer.setStatus(
        `Defeat! ${result.attackerTotal} vs ${result.defenderTotal} — Attack failed!`
      );
    }

    for (const _ of eliminatedPlayers) {
      this.soundManager.playElimination();
    }

    // Check for game over
    if (this.gameState.phase === 'gameOver') {
      this.time.delayedCall(this.getDelay(1500), () => this.handleGameOver());
      this.isProcessing = false;
      this.refreshDisplay();
      return;
    }

    // Reset to attacker selection
    this.gameState.phase = 'selectingAttacker';
    this.gameState.selectedTerritoryId = null;
    this.isProcessing = false;
    this.refreshDisplay();
  }

  // ─── Power-Up Activation ──────────────────────────────────

  private showPowerUpPopup(territory: import('../game/Territory').Territory): void {
    this.dismissPowerUpPopup();

    const powerUp = POWER_UPS[territory.powerUp!];
    const cx = territory.center.x;
    const cy = territory.center.y - 45;
    const canAttack = canAttackFrom(territory.id, this.gameState);

    this.powerUpPopup = this.add.container(cx, cy).setDepth(200);

    const w = 160;
    const h = canAttack ? 80 : 55;
    const bg = this.add.graphics();
    bg.fillStyle(0x111133, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(2, 0x6688cc, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    this.powerUpPopup.add(bg);

    // Power-up use button
    const useLabel = `Use ${powerUp.label}`;
    const useY = canAttack ? -12 : 0;
    const useBtn = this.createDialogButton(0, useY, useLabel, 0x336633, 0x44aa44, () => {
      this.dismissPowerUpPopup();
      if (territory.powerUp === 'reinforce') {
        this.activateReinforce(territory.id);
      } else if (territory.powerUp === 'fortify') {
        this.activateFortify(territory.id);
      }
    });
    this.powerUpPopup.add(useBtn);

    // Attack button (if territory can also attack)
    if (canAttack) {
      const atkBtn = this.createDialogButton(0, 22, 'Attack', 0x663333, 0xaa4444, () => {
        this.dismissPowerUpPopup();
        this.gameState.selectedTerritoryId = territory.id;
        this.gameState.phase = 'selectingDefender';
        this.refreshDisplay();
        this.uiRenderer.setStatus('Select an enemy territory to attack');
      });
      this.powerUpPopup.add(atkBtn);
    }
  }

  private dismissPowerUpPopup(): void {
    if (this.powerUpPopup) {
      this.powerUpPopup.destroy();
      this.powerUpPopup = null;
    }
  }

  private activateReinforce(territoryId: number): void {
    const t = this.gameState.territories[territoryId];
    const before = t.dice;
    if (useReinforce(territoryId, this.gameState)) {
      this.gameRecorder.recordAction({ type: 'reinforce', territoryId, playerId: this.gameState.currentPlayerIndex });
      this.eventLog.addEvent(
        `Used Reinforce on T${territoryId} (${before}→${t.dice} dice)`,
        PLAYER_COLORS[this.gameState.currentPlayerIndex],
      );
      this.soundManager.playCapture();
    } else {
      this.uiRenderer.setStatus('Cannot reinforce (already at max dice)');
    }
    this.refreshDisplay();
  }

  private activateFortify(sourceId: number): void {
    this.fortifyMode = true;
    this.fortifySourceId = sourceId;
    this.mapRenderer.highlightTerritory(this.gameState.territories[sourceId], 0x44cc44);
    this.uiRenderer.setStatus('Select an adjacent territory to move dice to');
  }

  private handleFortifyTarget(targetId: number): void {
    const sourceId = this.fortifySourceId!;
    const source = this.gameState.territories[sourceId];
    const target = this.gameState.territories[targetId];

    // Cancel if clicking the source again or invalid
    if (targetId === sourceId || target.owner !== this.gameState.currentPlayerIndex) {
      this.cancelFortify();
      return;
    }

    const movable = Math.min(3, source.dice - 1, 8 - target.dice);
    if (movable <= 0 || !useFortify(sourceId, targetId, movable, this.gameState)) {
      this.uiRenderer.setStatus('Cannot fortify there');
      this.cancelFortify();
      return;
    }

    this.gameRecorder.recordAction({
      type: 'fortify', fromId: sourceId, toId: targetId, diceCount: movable,
      playerId: this.gameState.currentPlayerIndex,
    });
    this.eventLog.addEvent(
      `Fortified T${targetId} with ${movable} dice from T${sourceId}`,
      PLAYER_COLORS[this.gameState.currentPlayerIndex],
    );
    this.soundManager.playCapture();
    this.cancelFortify();
    this.refreshDisplay();
  }

  private cancelFortify(): void {
    this.fortifyMode = false;
    this.fortifySourceId = null;
    this.mapRenderer.clearHighlight();
    this.uiRenderer.setStatus('Select a territory to attack from');
  }

  // ─── Undo ────────────────────────────────────────────────

  private undoLastAttack(): void {
    if (!this.undoSnapshot || this.undoUsedThisTurn) {
      this.uiRenderer.setStatus('No attack to undo');
      return;
    }

    restoreSnapshot(this.gameState, this.undoSnapshot);
    this.gameState.phase = 'selectingAttacker';
    this.gameState.selectedTerritoryId = null;
    this.undoSnapshot = null;
    this.undoUsedThisTurn = true;
    this.eventLog.addEvent('Undid last attack', 0xaaaaaa);
    this.refreshDisplay();
    this.uiRenderer.setStatus('Attack undone. Select a territory to attack from.');
  }

  // ─── Spectator ───────────────────────────────────────────

  private toggleSpectatorPause(): void {
    this.spectatorPaused = !this.spectatorPaused;
    if (this.spectatorLabel) {
      this.spectatorLabel.setText(
        this.spectatorPaused
          ? '⏸ PAUSED (Space to resume)'
          : '👁 SPECTATING (Space to pause)',
      );
    }
    if (!this.spectatorPaused && !this.isProcessing && this.gameState.phase !== 'gameOver') {
      this.isProcessing = true;
      this.processAITurns();
    }
  }

  private snapshotDice(playerId: number): Map<number, number> {
    const snapshot = new Map<number, number>();
    for (const t of this.gameState.territories) {
      if (t.owner === playerId) {
        snapshot.set(t.id, t.dice);
      }
    }
    return snapshot;
  }

  private showDiceDistribution(
    before: Map<number, number>,
    after: Map<number, number>,
    playerColor: number
  ): void {
    if (this.speed === 'instant') return;

    const multiplier = SPEED_CONFIGS[this.speed].multiplier;
    const colorStr = '#' + playerColor.toString(16).padStart(6, '0');
    let staggerIndex = 0;

    after.forEach((diceAfter, territoryId) => {
      const diceBefore = before.get(territoryId) ?? 0;
      const gained = diceAfter - diceBefore;
      if (gained <= 0) return;

      const territory = this.gameState.territories[territoryId];
      const x = territory.center.x;
      const y = territory.center.y - 20;
      const delay = staggerIndex * 50 * multiplier;
      staggerIndex++;

      this.time.delayedCall(delay, () => {
        const text = this.add.text(x, y, `+${gained}`, {
          fontSize: '16px',
          fontFamily: 'monospace',
          fontStyle: 'bold',
          color: colorStr,
          stroke: '#000000',
          strokeThickness: 3,
        }).setOrigin(0.5).setDepth(100);

        this.tweens.add({
          targets: text,
          y: y - 30,
          alpha: 0,
          duration: 600 * multiplier,
          ease: 'Power1',
          onComplete: () => text.destroy(),
        });
      });
    });
  }

  private onEndTurn(): void {
    if (this.isProcessing) return;
    if (this.gameState.phase === 'gameOver') return;

    this.isProcessing = true;
    this.gameState.phase = 'selectingAttacker';
    this.gameState.selectedTerritoryId = null;
    this.dismissPowerUpPopup();

    // Clear undo state for new turn
    this.undoSnapshot = null;
    this.undoUsedThisTurn = false;

    const playerIdx = this.gameState.currentPlayerIndex;
    const player = this.gameState.players[playerIdx];
    const diceBefore = this.snapshotDice(player.id);

    // Execute end turn logic first to compute bonus
    endTurn(this.gameState, this.rng);

    const diceAfter = this.snapshotDice(player.id);
    let bonus = 0;
    diceAfter.forEach((count, id) => {
      bonus += count - (diceBefore.get(id) ?? 0);
    });

    // Record end turn with computed bonus, then finalize the turn
    this.gameRecorder.recordAction({ type: 'endTurn', playerId: playerIdx, bonusDice: bonus > 0 ? bonus : 0 });
    this.gameRecorder.endCurrentTurn();

    this.gameStats.recordTurnStart(this.gameState);
    this.gameRecorder.startTurn(this.gameState.turnNumber, this.gameState.currentPlayerIndex);
    if (bonus > 0) {
      this.eventLog.addEvent(
        `Player received ${bonus} bonus dice`,
        PLAYER_COLORS[playerIdx]
      );
      this.showDiceDistribution(diceBefore, diceAfter, PLAYER_COLORS[playerIdx]);
    }

    this.eventLog.addEvent(
      `Turn ${this.gameState.turnNumber} — ${this.gameState.players[this.gameState.currentPlayerIndex].name}'s turn`,
      0xffffff
    );

    this.refreshDisplay();

    if ((this.gameState.phase as string) === 'gameOver') {
      this.time.delayedCall(this.getDelay(1000), () => this.handleGameOver());
      this.isProcessing = false;
      return;
    }

    // Process AI turns
    this.processAITurns();
  }

  private async processAITurns(): Promise<void> {
    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];

    if (!currentPlayer.isHuman && currentPlayer.isAlive) {
      // Show thinking indicator with pulsing dots
      const playerColorHex = '#' + currentPlayer.color.toString(16).padStart(6, '0');
      const thinkingText = this.add.text(
        GAME_WIDTH / 2, 45,
        `${currentPlayer.name} is thinking.`,
        {
          fontSize: '16px',
          color: playerColorHex,
          fontFamily: 'monospace',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 3,
        }
      ).setOrigin(0.5).setDepth(150);

      let dotCount = 1;
      const thinkingTimer = this.time.addEvent({
        delay: 400,
        loop: true,
        callback: () => {
          dotCount = (dotCount % 3) + 1;
          thinkingText.setText(`${currentPlayer.name} is thinking${'.'.repeat(dotCount)}`);
        },
      });

      this.uiRenderer.setStatus(`${currentPlayer.name} is thinking...`);
      this.refreshDisplay();

      await this.delay(this.getDelay(800));

      // Check if AI should surrender before attacking
      if (shouldAISurrender(this.gameState, currentPlayer.id)) {
        thinkingTimer.destroy();
        thinkingText.destroy();
        this.eventLog.addEvent(`${currentPlayer.name} surrendered!`, 0xff4444);
        this.gameRecorder.recordAction({ type: 'surrender', playerId: currentPlayer.id });
        distributeSurrenderedTerritories(this.gameState, currentPlayer.id);
        this.refreshDisplay();

        if ((this.gameState.phase as string) === 'gameOver') {
          this.gameRecorder.endCurrentTurn();
          this.time.delayedCall(this.getDelay(1000), () => this.handleGameOver());
          this.isProcessing = false;
          return;
        }

        // Advance past the now-dead surrendered player
        this.gameRecorder.recordAction({ type: 'endTurn', playerId: currentPlayer.id, bonusDice: 0 });
        this.gameRecorder.endCurrentTurn();
        endTurn(this.gameState, this.rng);
        this.gameStats.recordTurnStart(this.gameState);
        this.gameRecorder.startTurn(this.gameState.turnNumber, this.gameState.currentPlayerIndex);

        if ((this.gameState.phase as string) === 'gameOver') {
          this.gameRecorder.endCurrentTurn();
          this.time.delayedCall(this.getDelay(1000), () => this.handleGameOver());
          this.isProcessing = false;
          return;
        }

        // Continue to next player
        await this.advanceToNextPlayer();
        return;
      }

      // Track state before AI attacks
      const aliveBeforeAI = new Set(
        this.gameState.players.filter((p) => p.isAlive).map((p) => p.id)
      );

      // Use manual power-ups before attacking
      if (this.gameState.powerUpsEnabled) {
        const powerUpResults = useAIPowerUps(this.gameState);
        for (const result of powerUpResults) {
          this.eventLog.addEvent(`${currentPlayer.name} ${result.description}`, currentPlayer.color);
          if (result.action) {
            this.gameRecorder.recordAction(result.action);
          }
        }
        if (powerUpResults.length > 0) {
          this.refreshDisplay();
          await this.delay(this.getDelay(400));
        }
      }

      // Do AI attacks one by one with battle animation
      const personality = PERSONALITIES[currentPlayer.personality ?? 'balanced'];
      const maxAttacks = Math.min(personality.maxAttacksPerTurn, 50);
      let attackCount = 0;
      let wins = 0;
      let losses = 0;

      // Compute AI fog of war visible set
      const aiVisibleSet = this.fogOfWarEnabled
        ? getVisibleTerritories(this.gameState, currentPlayer.id)
        : undefined;

      while (attackCount < maxAttacks) {
        const move = selectBestMove(this.gameState, this.rng, undefined, aiVisibleSet);
        if (!move) break;
        if (!isValidAttack(move.attackerId, move.defenderId, this.gameState)) break;

        const attackerColor = PLAYER_COLORS[this.gameState.currentPlayerIndex];
        const defenderColor = PLAYER_COLORS[this.gameState.territories[move.defenderId].owner];

        // Highlight attacker then defender territory before attack
        if (this.speed !== 'instant') {
          this.mapRenderer.highlightTerritory(
            this.gameState.territories[move.attackerId], attackerColor
          );
          await this.delay(this.getDelay(200));
          this.mapRenderer.clearHighlight();

          this.mapRenderer.highlightTerritory(
            this.gameState.territories[move.defenderId], defenderColor
          );
          await this.delay(this.getDelay(200));
          this.mapRenderer.clearHighlight();
        }

        const attackerT = this.gameState.territories[move.attackerId];
        const defenderT = this.gameState.territories[move.defenderId];
        this.territoryEffects.showAttackLine(
          attackerT.center.x, attackerT.center.y,
          defenderT.center.x, defenderT.center.y
        );

        const attackerPlayerId = this.gameState.currentPlayerIndex;
        const defenderPlayerId = this.gameState.territories[move.defenderId].owner;
        const result = executeAttack(move.attackerId, move.defenderId, this.gameState, this.rng);
        this.gameStats.recordAttack(attackerPlayerId, defenderPlayerId, result, this.gameState);
        this.gameRecorder.recordAction({
          type: 'attack', attackerId: move.attackerId, defenderId: move.defenderId,
          attackerPlayerId, defenderPlayerId, result,
        });
        this.refreshDisplay();
        attackCount++;

        if (result.attackerWins) {
          wins++;
        } else {
          losses++;
        }

        const outcome = result.attackerWins ? 'won' : 'lost';
        this.eventLog.addEvent(
          `${currentPlayer.name} attacked T${move.attackerId} → T${move.defenderId} (${outcome} ${result.attackerTotal} vs ${result.defenderTotal})`,
          currentPlayer.color
        );

        this.soundManager.playDiceRoll();
        await this.battleAnimator.showBattle(
          result.attackerRolls,
          result.defenderRolls,
          attackerColor,
          defenderColor,
          result.attackerWins,
          this.getBattleSpeed(2)
        );

        this.territoryEffects.hideAttackLine();
        if (result.attackerWins) {
          this.territoryEffects.showCapturePulse(defenderT);
        }

        if (this.gameState.phase === 'gameOver') break;

        // Brief pause between consecutive attacks
        await this.delay(this.getDelay(300));
      }

      // Remove thinking indicator
      thinkingTimer.destroy();
      thinkingText.destroy();

      // Turn summary
      if (attackCount > 0) {
        this.eventLog.addEvent(
          `${currentPlayer.name} made ${attackCount} attack${attackCount !== 1 ? 's' : ''} (won ${wins}, lost ${losses})`,
          currentPlayer.color
        );
      } else {
        this.eventLog.addEvent(
          `${currentPlayer.name} ended without attacking`,
          currentPlayer.color
        );
      }

      // Check for eliminations
      for (const p of this.gameState.players) {
        if (aliveBeforeAI.has(p.id) && !p.isAlive) {
          this.eventLog.addEvent(`${p.name} was eliminated!`, 0xff4444);
          this.gameRecorder.recordAction({ type: 'elimination', playerId: p.id, eliminatedBy: currentPlayer.id });
          this.soundManager.playElimination();
        }
      }

      if ((this.gameState.phase as string) === 'gameOver') {
        this.gameRecorder.endCurrentTurn();
        this.refreshDisplay();
        this.time.delayedCall(this.getDelay(1000), () => this.handleGameOver());
        this.isProcessing = false;
        return;
      }

      // Track dice before endTurn for AI bonus logging
      const aiDiceBefore = this.snapshotDice(currentPlayer.id);

      endTurn(this.gameState, this.rng);

      const aiDiceAfter = this.snapshotDice(currentPlayer.id);
      let aiBonus = 0;
      aiDiceAfter.forEach((count, id) => {
        aiBonus += count - (aiDiceBefore.get(id) ?? 0);
      });

      this.gameRecorder.recordAction({ type: 'endTurn', playerId: currentPlayer.id, bonusDice: aiBonus > 0 ? aiBonus : 0 });
      this.gameRecorder.endCurrentTurn();
      this.gameStats.recordTurnStart(this.gameState);
      this.gameRecorder.startTurn(this.gameState.turnNumber, this.gameState.currentPlayerIndex);

      if (aiBonus > 0) {
        this.eventLog.addEvent(
          `${currentPlayer.name} received ${aiBonus} bonus dice`,
          currentPlayer.color
        );
        this.showDiceDistribution(aiDiceBefore, aiDiceAfter, currentPlayer.color);
      }

      this.eventLog.addEvent(
        `Turn ${this.gameState.turnNumber} — ${this.gameState.players[this.gameState.currentPlayerIndex].name}'s turn`,
        0xffffff
      );

      this.refreshDisplay();

      if ((this.gameState.phase as string) === 'gameOver') {
        this.gameRecorder.endCurrentTurn();
        this.time.delayedCall(this.getDelay(1000), () => this.handleGameOver());
        this.isProcessing = false;
        return;
      }

      // Continue to next AI or back to human
      await this.advanceToNextPlayer();
    } else {
      // No alive AI to process — hand back control
      await this.advanceToNextPlayer();
    }
  }

  /** Advance to the next player — continue AI turns or hand control back to human */
  private async advanceToNextPlayer(): Promise<void> {
    const nextPlayer = this.gameState.players[this.gameState.currentPlayerIndex];

    if (this.spectatorMode) {
      // In spectator mode, all players are AI. Check for pause.
      if (this.spectatorPaused) {
        this.isProcessing = false;
        return;
      }
      await this.delay(this.getDelay(500));
      await this.processAITurns();
    } else if (!nextPlayer.isHuman && nextPlayer.isAlive) {
      await this.delay(this.getDelay(500));
      await this.processAITurns();
    } else {
      this.isProcessing = false;
      this.soundManager.playTurnStart();
      this.uiRenderer.setStatus('Your turn! Select a territory to attack from.');
      this.refreshDisplay();
    }
  }

  private delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  private getDelay(baseMs: number): number {
    return baseMs * SPEED_CONFIGS[this.speed].multiplier;
  }

  private getBattleSpeed(baseSpeed: number): number {
    const multiplier = SPEED_CONFIGS[this.speed].multiplier;
    if (multiplier === 0) return 0;
    return baseSpeed / multiplier;
  }

  private setSpeed(newSpeed: GameSetupConfig['speed']): void {
    if (this.speed === newSpeed) return;
    this.speed = newSpeed;
    const label = SPEED_CONFIGS[newSpeed].label;
    this.showSpeedNotification(`Speed: ${label}`);
  }

  private showSpeedNotification(text: string): void {
    const notification = this.add.text(GAME_WIDTH / 2, 80, text, {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(500);

    this.tweens.add({
      targets: notification,
      alpha: 0,
      duration: 1500,
      ease: 'Power1',
      onComplete: () => notification.destroy(),
    });
  }

  /**
   * Run the entire game with pure game logic — no rendering, no delays.
   * Used for instant spectate mode. Records everything for replay.
   */
  private runInstantSimulation(): void {
    const MAX_TURNS = 500;
    let turnCount = 0;

    while (this.gameState.phase !== 'gameOver' && turnCount < MAX_TURNS) {
      const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];

      if (!currentPlayer.isAlive) {
        endTurn(this.gameState, this.rng);
        this.gameRecorder.recordAction({ type: 'endTurn', playerId: currentPlayer.id, bonusDice: 0 });
        this.gameRecorder.endCurrentTurn();
        this.gameRecorder.startTurn(this.gameState.turnNumber, this.gameState.currentPlayerIndex);
        continue;
      }

      // Check surrender
      if (shouldAISurrender(this.gameState, currentPlayer.id)) {
        this.gameRecorder.recordAction({ type: 'surrender', playerId: currentPlayer.id });
        distributeSurrenderedTerritories(this.gameState, currentPlayer.id);
        if ((this.gameState.phase as string) === 'gameOver') break;
        this.gameRecorder.recordAction({ type: 'endTurn', playerId: currentPlayer.id, bonusDice: 0 });
        this.gameRecorder.endCurrentTurn();
        endTurn(this.gameState, this.rng);
        this.gameRecorder.startTurn(this.gameState.turnNumber, this.gameState.currentPlayerIndex);
        continue;
      }

      // Use AI power-ups
      if (this.gameState.powerUpsEnabled) {
        const powerUpResults = useAIPowerUps(this.gameState);
        for (const result of powerUpResults) {
          if (result.action) {
            this.gameRecorder.recordAction(result.action);
          }
        }
      }

      // Execute attacks
      const personality = PERSONALITIES[currentPlayer.personality ?? 'balanced'];
      const maxAttacks = Math.min(personality.maxAttacksPerTurn, 50);
      const aiVisibleSet = this.fogOfWarEnabled
        ? getVisibleTerritories(this.gameState, currentPlayer.id)
        : undefined;

      const aliveBeforeAttacks = new Set(
        this.gameState.players.filter((p) => p.isAlive).map((p) => p.id)
      );

      for (let i = 0; i < maxAttacks; i++) {
        const move = selectBestMove(this.gameState, this.rng, undefined, aiVisibleSet);
        if (!move) break;
        if (!isValidAttack(move.attackerId, move.defenderId, this.gameState)) break;

        const attackerPlayerId = this.gameState.currentPlayerIndex;
        const defenderPlayerId = this.gameState.territories[move.defenderId].owner;
        const result = executeAttack(move.attackerId, move.defenderId, this.gameState, this.rng);
        this.gameStats.recordAttack(attackerPlayerId, defenderPlayerId, result, this.gameState);
        this.gameRecorder.recordAction({
          type: 'attack', attackerId: move.attackerId, defenderId: move.defenderId,
          attackerPlayerId, defenderPlayerId, result,
        });

        if ((this.gameState.phase as string) === 'gameOver') break;
      }

      // Record eliminations
      for (const p of this.gameState.players) {
        if (aliveBeforeAttacks.has(p.id) && !p.isAlive) {
          this.gameRecorder.recordAction({
            type: 'elimination', playerId: p.id, eliminatedBy: currentPlayer.id,
          });
        }
      }

      if ((this.gameState.phase as string) === 'gameOver') break;

      // End turn & distribute bonus dice
      const diceBefore = this.snapshotDice(currentPlayer.id);
      endTurn(this.gameState, this.rng);
      const diceAfter = this.snapshotDice(currentPlayer.id);
      let bonus = 0;
      diceAfter.forEach((count, id) => {
        bonus += count - (diceBefore.get(id) ?? 0);
      });

      this.gameRecorder.recordAction({ type: 'endTurn', playerId: currentPlayer.id, bonusDice: Math.max(0, bonus) });
      this.gameRecorder.endCurrentTurn();
      this.gameStats.recordTurnStart(this.gameState);
      this.gameRecorder.startTurn(this.gameState.turnNumber, this.gameState.currentPlayerIndex);

      turnCount++;
    }

    this.handleGameOver();
  }

  private handleGameOver(): void {
    const winner = this.gameState.players.find(
      (p) => p.id === this.gameState.winner
    );
    if (winner?.isHuman) {
      this.soundManager.playVictory();
    } else {
      this.soundManager.playDefeat();
    }
    this.gameRecorder.endCurrentTurn();
    const recording = this.gameRecorder.getRecording(
      this.gameState.winner,
      winner?.name ?? 'Unknown',
    );
    const stats = this.gameStats.getSummary();
    saveMatch(recording, stats);
    this.scene.start('GameOverScene', {
      winnerName: winner?.name ?? 'Unknown',
      isVictory: winner?.isHuman ?? false,
      stats,
      playerNames: this.gameState.players.map((p) => p.name),
      recording,
    });
  }

  private refreshDisplay(): void {
    const selectedId = this.gameState.selectedTerritoryId;
    const validTargets = selectedId !== null
      ? getValidTargets(selectedId, this.gameState).map((t) => t.id)
      : [];
    const attackable = getAttackableTerritories(this.gameState).map((t) => t.id);

    // Compute fog of war visible set for the human player
    const visibleSet = this.fogOfWarEnabled
      ? getVisibleTerritories(this.gameState, 0)
      : undefined;

    this.mapRenderer.drawMap(this.gameState, selectedId, validTargets, attackable, visibleSet);
    this.diceRenderer.drawDiceStacks(this.gameState.territories, visibleSet);
    this.uiRenderer.update(this.gameState);
    this.uiRenderer.setUndoVisible(!!this.undoSnapshot && !this.undoUsedThisTurn);
    this.territoryEffects.updateLowDiceWarnings(this.gameState);
  }

  private updateHoverEffects(territoryId: number, pointer: Phaser.Input.Pointer): void {
    const territory = this.gameState.territories[territoryId];
    if (!territory) return;

    const playerName = this.gameState.players[territory.owner]?.name ?? 'Unknown';
    const powerUpLabel = territory.powerUp ? POWER_UPS[territory.powerUp].description : undefined;
    const neighborCount = territory.neighbors.length;

    // Calculate attack odds if hovering a valid target
    let attackOdds: number | undefined;
    if (!this.isProcessing && this.gameState.phase === 'selectingDefender') {
      const attackerId = this.gameState.selectedTerritoryId;
      if (attackerId !== null) {
        const targets = getValidTargets(attackerId, this.gameState).map((t) => t.id);
        if (targets.includes(territoryId)) {
          const atk = this.gameState.territories[attackerId];
          attackOdds = estimateWinProbability(atk.dice, territory.dice);
        }
      }
    }

    this.territoryEffects.showTooltip(territory, pointer.x, pointer.y, playerName, powerUpLabel, neighborCount, attackOdds);

    // Preview attack line when hovering a valid target during defender selection
    if (!this.isProcessing && this.gameState.phase === 'selectingDefender') {
      const attackerId = this.gameState.selectedTerritoryId;
      if (attackerId !== null) {
        const targets = getValidTargets(attackerId, this.gameState).map((t) => t.id);
        if (targets.includes(territoryId)) {
          const atk = this.gameState.territories[attackerId];
          this.territoryEffects.showAttackLine(
            atk.center.x, atk.center.y,
            territory.center.x, territory.center.y
          );
        } else {
          this.territoryEffects.hideAttackLine();
        }
      }
    }
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash) || 1;
}

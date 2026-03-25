import Phaser from 'phaser';
import {
  GameState, createInitialGameState, Territory,
  createPlayer,
  generateMap, assignTerritories,
  canAttackFrom, isValidAttack,
  getAttackableTerritories, getValidTargets,
  PersonalityType, getRandomPersonality, customPresetToPersonality,
  SPEED_CONFIGS, GameSetupConfig, DEFAULT_SETUP,
  getVisibleTerritories,
  POWER_UPS,
  estimateWinProbability,
  GameRecorder,
  saveMatch,
  checkAchievements, saveUnlocked, AchievementContext,
  SeededRandom,
  GameStats,
  createAllianceState, wouldBreakAlliance, AllianceProposal,
  PLAYER_COLORS, GAME_WIDTH, GAME_HEIGHT,
  GameErrorCode,
} from '@dicewars/shared';
import type {
  BattleResultPayload,
  TurnChangedPayload,
  AIActionPayload,
  InstantBatchPayload,
  GameOverPayload,
  PlayerConnectionPayload,
  WireGameState,
  WirePowerUp,
  GameError,
} from '@dicewars/shared';
import { SocketClient } from '../network/SocketClient';
import type { ConnectionState } from '../network/SocketClient';
import { AuthClient } from '../network/AuthClient';
import { deserializeWireState } from '../network/deserializeState';
import { MapRenderer } from '../rendering/MapRenderer';
import { DiceRenderer, createDiceTextures } from '../rendering/DiceRenderer';
import { UIRenderer } from '../rendering/UIRenderer';
import { BattleAnimator } from '../rendering/BattleAnimator';
import { EventLog } from '../rendering/EventLog';
import { TerritoryEffects } from '../rendering/TerritoryEffects';
import { SoundManager } from '../rendering/SoundManager';
import { ToastManager } from '../rendering/ToastManager';

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
  private undoEnabled = true;
  private gameSeed = 0;
  // Network client for server-based games
  private socketClient: SocketClient | null = null;
  private authClient: AuthClient | null = null;
  private isOnlineGame = false;
  private toastManager!: ToastManager;
  private disconnectOverlay: Phaser.GameObjects.Container | null = null;
  private disconnectTimer: Phaser.Time.TimerEvent | null = null;
  private connectionCleanup: (() => void) | null = null;
  private localPlayerIndex: number | undefined;

  constructor() {
    super('GameScene');
  }

  init(data?: Partial<GameSetupConfig> & { socketClient?: SocketClient; authClient?: AuthClient; initialState?: WireGameState }): void {
    if (data?.socketClient) {
      this.socketClient = data.socketClient;
      this.isOnlineGame = true;
    }
    if (data?.authClient) {
      this.authClient = data.authClient;
    }

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
        undoEnabled: data.undoEnabled ?? DEFAULT_SETUP.undoEnabled,
        customAIConfigs: data.customAIConfigs,
      };
    } else {
      this.setupConfig = { ...DEFAULT_SETUP, aiPersonalities: [...DEFAULT_SETUP.aiPersonalities] };
    }
    this.speed = this.setupConfig.speed;

    // If server sent initial state, deserialize it
    if (data?.initialState) {
      this.gameState = deserializeWireState(data.initialState);
    }
  }

  create(): void {
    // Generate dice textures
    createDiceTextures(this);

    // Online game: state comes from server
    if (this.isOnlineGame && this.gameState) {
      this.fogOfWarEnabled = this.setupConfig.fogOfWar;
      this.undoEnabled = this.setupConfig.undoEnabled ?? true;
      this.spectatorMode = this.setupConfig.spectatorMode ?? false;
    } else {
      // Offline/local game: generate map locally
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

      const { territories, adjacency } = generateMap(
        territoryCount, this.rng, 'square', this.setupConfig.mapShape
      );

      this.spectatorMode = this.setupConfig.spectatorMode ?? false;
      const allAINames = ['AI Blue', 'AI Red', 'AI Green', 'AI Yellow', 'AI Purple', 'AI Cyan'];
      const humanNames = ['AI Red', 'AI Green', 'AI Yellow', 'AI Purple', 'AI Cyan'];
      const players = [];
      if (this.spectatorMode) {
        for (let i = 0; i < playerCount; i++) {
          const personalitySetting = this.setupConfig.aiPersonalities[i] ?? 'random';
          const customConfig = this.setupConfig.customAIConfigs?.[i];
          if (personalitySetting === 'custom' && customConfig) {
            const customPersonality = customPresetToPersonality(customConfig);
            players.push(createPlayer(i, allAINames[i], false, PLAYER_COLORS[i], 'balanced', customPersonality));
          } else {
            const personality: PersonalityType =
              personalitySetting === 'random' || personalitySetting === 'custom'
                ? getRandomPersonality(this.rng)
                : personalitySetting;
            players.push(createPlayer(i, allAINames[i], false, PLAYER_COLORS[i], personality));
          }
        }
      } else {
        players.push(createPlayer(0, 'Player', true, PLAYER_COLORS[0]));
        for (let i = 1; i < playerCount; i++) {
          const personalitySetting = this.setupConfig.aiPersonalities[i - 1] ?? 'random';
          const customConfig = this.setupConfig.customAIConfigs?.[i - 1];
          if (personalitySetting === 'custom' && customConfig) {
            const customPersonality = customPresetToPersonality(customConfig);
            players.push(createPlayer(i, humanNames[i - 1], false, PLAYER_COLORS[i], 'balanced', customPersonality));
          } else {
            const personality: PersonalityType =
              personalitySetting === 'random' || personalitySetting === 'custom'
                ? getRandomPersonality(this.rng)
                : personalitySetting;
            players.push(createPlayer(i, humanNames[i - 1], false, PLAYER_COLORS[i], personality));
          }
        }
      }

      assignTerritories(territories, playerCount, this.rng);
      this.gameState = createInitialGameState(territories, players, adjacency);

      this.fogOfWarEnabled = this.setupConfig.fogOfWar;
      this.undoEnabled = this.setupConfig.undoEnabled ?? true;
      if (this.setupConfig.powerUps) {
        this.gameState.powerUpsEnabled = true;
      }
      this.gameState.allianceState = createAllianceState(playerCount);
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
    this.toastManager = new ToastManager(this);

    if (!this.isOnlineGame) {
      const gameRecorder = new GameRecorder();
      gameRecorder.setInitialState(
        this.gameState.territories,
        this.gameState.players,
        this.gameState.adjacency,
        !!this.gameState.powerUpsEnabled,
      );
      this.gameStats.recordTurnStart(this.gameState);
      gameRecorder.startTurn(this.gameState.turnNumber, this.gameState.currentPlayerIndex);
      // Store recorder on scene data for offline game-over
      this.data.set('gameRecorder', gameRecorder);
    }

    // Setup UI callbacks
    this.uiRenderer.setEndTurnCallback(() => this.onEndTurn());
    if (this.undoEnabled && !this.isOnlineGame) {
      this.uiRenderer.setUndoCallback(() => this.undoLastAttack());
    }
    if (this.isOnlineGame) {
      this.uiRenderer.setProposeAllianceCallback((targetIndex) => this.proposeAllianceToPlayer(targetIndex));
      // Determine local player index from state
      this.localPlayerIndex = this.gameState.players.findIndex((p) => p.isHuman);
    }
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

    // Setup WebSocket listeners for online games
    if (this.isOnlineGame) {
      this.setupSocketListeners();
      this.setupConnectionStateListener();
      this.uiRenderer.setConnectionState(this.socketClient!.state);
      this.uiRenderer.setStatus('Connected — waiting for game to start');
      return;
    }

    if (this.spectatorMode) {
      this.spectatorLabel = this.add.text(GAME_WIDTH / 2, 15, '👁 SPECTATING (Space to pause)', {
        fontSize: '14px',
        color: '#ffcc00',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(200);

      this.uiRenderer.setStatus('Spectator mode — watching AI battle');
    } else {
      this.uiRenderer.setStatus('Select a territory to attack from');
    }
  }

  // === WebSocket Event Listeners (Online Games) ===

  private setupSocketListeners(): void {
    if (!this.socketClient) return;

    this.socketClient.on('game:stateUpdate', (wireState: WireGameState) => {
      this.gameState = deserializeWireState(wireState);
      this.refreshDisplay();
    });

    this.socketClient.on('game:battleResult', (result: BattleResultPayload) => {
      const attackerTerritory = this.gameState.territories[result.attackerTerritoryId];
      const defenderTerritory = this.gameState.territories[result.defenderTerritoryId];
      if (attackerTerritory && defenderTerritory) {
        const attackerColor = PLAYER_COLORS[result.attackerPlayerIndex] ?? 0xffffff;
        const defenderColor = PLAYER_COLORS[result.defenderPlayerIndex] ?? 0xffffff;

        this.territoryEffects.showAttackLine(
          attackerTerritory.center.x, attackerTerritory.center.y,
          defenderTerritory.center.x, defenderTerritory.center.y
        );

        this.soundManager.playDiceRoll();
        this.battleAnimator.showBattle(
          result.attackerDice,
          result.defenderDice,
          attackerColor,
          defenderColor,
          result.attackerWins,
          this.getBattleSpeed(1)
        ).then(() => {
          this.territoryEffects.hideAttackLine();
          if (result.attackerWins) {
            this.territoryEffects.showCapturePulse(defenderTerritory);
            this.soundManager.playCapture();
          } else {
            this.soundManager.playAttackFail();
          }
          this.refreshDisplay();
        });
      }
    });

    this.socketClient.on('game:turnChanged', (data: TurnChangedPayload) => {
      if (data.bonusDice > 0) {
        const player = this.gameState.players[data.previousPlayerIndex];
        if (player) {
          this.eventLog.addEvent(
            `${player.name} received ${data.bonusDice} bonus dice`,
            PLAYER_COLORS[data.previousPlayerIndex]
          );
        }
      }
      if (data.powerUpSpawns) {
        for (const spawn of data.powerUpSpawns) {
          this.logSpawnFromWire(spawn);
        }
      }
      this.eventLog.addEvent(
        `Turn ${data.turnNumber} — ${this.gameState.players[data.currentPlayerIndex]?.name ?? 'Unknown'}'s turn`,
        0xffffff
      );
      this.refreshDisplay();
    });

    this.socketClient.on('game:aiAction', (action: AIActionPayload) => {
      const player = this.gameState.players[action.playerIndex];
      const name = player?.name ?? `Player ${action.playerIndex}`;
      switch (action.actionType) {
        case 'attack':
          this.eventLog.addEvent(`⚔️ ${name} attacks`, player?.color ?? 0xffffff);
          break;
        case 'endTurn':
          this.eventLog.addEvent(`⏭️ ${name} ends turn`, player?.color ?? 0xffffff);
          break;
        case 'powerUp':
          this.eventLog.addEvent(`✨ ${name} uses ${action.details.type ?? 'power-up'}`, player?.color ?? 0xffffff);
          break;
        case 'surrender':
          this.eventLog.addEvent(`🏳️ ${name} surrenders`, 0xff4444);
          this.soundManager.playElimination();
          break;
        case 'alliance':
          this.eventLog.addEvent(`🤝 ${name} alliance action`, 0x44ddff);
          break;
      }
    });

    this.socketClient.on('game:instantBatch', (batch: InstantBatchPayload) => {
      for (const action of batch.actions) {
        const player = this.gameState.players[action.playerIndex];
        const name = player?.name ?? `Player ${action.playerIndex}`;
        this.eventLog.addEvent(`⚡ ${name}: ${action.actionType}`, player?.color ?? 0xffffff);
      }
      this.gameState = deserializeWireState(batch.finalState);
      this.refreshDisplay();
    });

    this.socketClient.on('game:gameOver', (_data: GameOverPayload) => {
      this.handleGameOver();
    });

    this.socketClient.on('game:playerDisconnected', (data: PlayerConnectionPayload) => {
      const player = this.gameState.players[data.playerIndex];
      if (player) {
        this.eventLog.addEvent(`🔌 ${player.name} disconnected (${data.graceSeconds ?? 60}s grace)`, 0xff8844);
      }
    });

    this.socketClient.on('game:playerReconnected', (data: PlayerConnectionPayload) => {
      const player = this.gameState.players[data.playerIndex];
      if (player) {
        this.eventLog.addEvent(`🔌 ${player.name} reconnected`, 0x44ff88);
      }
    });

    this.socketClient.on('game:error', (error: GameError) => {
      switch (error.code) {
        case GameErrorCode.GAME_NOT_YOUR_TURN:
          this.toastManager.show('Not your turn!', 'warning');
          break;
        case GameErrorCode.GAME_INVALID_TERRITORY:
        case GameErrorCode.GAME_TERRITORY_NOT_ADJACENT:
        case GameErrorCode.GAME_TERRITORY_OWN:
          this.toastManager.show('Invalid target', 'error');
          break;
        case GameErrorCode.AUTH_TOKEN_EXPIRED:
          this.handleTokenRefresh();
          break;
        default:
          this.toastManager.show(error.message, 'error');
          break;
      }
    });
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
    if (key === 'Z' && this.undoEnabled) {
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
      ...(this.undoEnabled ? [['Z', 'Undo last attack']] : []),
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

  private async executeHumanSurrender(): Promise<void> {
    if (!this.socketClient) return;
    try {
      const ack = await this.socketClient.surrender();
      if (!ack.success) {
        this.toastManager.show(ack.error?.message || 'Surrender failed', 'error');
      }
    } catch {
      this.toastManager.show('Connection error', 'error');
    }
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

    // Check if attack would break an alliance — require confirmation
    if (this.gameState.allianceState && wouldBreakAlliance(this.gameState.allianceState, this.gameState.currentPlayerIndex, this.gameState.territories[territoryId].owner)) {
      const defenderName = this.gameState.players[this.gameState.territories[territoryId].owner].name;
      this.showAllianceBreakConfirmation(attackerId, territoryId, defenderName);
      return;
    }

    if (!this.socketClient) return;

    // Send attack intent to server
    this.isProcessing = true;
    try {
      const ack = await this.socketClient.attack(attackerId, territoryId);
      if (!ack.success) {
        this.toastManager.show(ack.error?.message || 'Attack failed', 'error');
      }
      // Battle result and state update will arrive via WebSocket events
    } catch {
      this.toastManager.show('Connection error', 'error');
    } finally {
      this.isProcessing = false;
      this.gameState.selectedTerritoryId = null;
      this.gameState.phase = 'selectingAttacker';
    }
  }

  // ─── Power-Up Activation ──────────────────────────────────

  private showPowerUpPopup(territory: Territory): void {
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

  private async activateReinforce(territoryId: number): Promise<void> {
    if (!this.socketClient) return;
    try {
      const ack = await this.socketClient.usePowerUp('reinforce', territoryId);
      if (!ack.success) {
        this.toastManager.show(ack.error?.message || 'Power-up failed', 'error');
      }
    } catch {
      this.toastManager.show('Connection error', 'error');
    }
    this.dismissPowerUpPopup();
  }

  private activateFortify(sourceId: number): void {
    this.fortifyMode = true;
    this.fortifySourceId = sourceId;
    this.mapRenderer.highlightTerritory(this.gameState.territories[sourceId], 0x44cc44);
    this.uiRenderer.setStatus('Select an adjacent territory to move dice to');
  }

  private async handleFortifyTarget(targetId: number): Promise<void> {
    const sourceId = this.fortifySourceId!;
    const target = this.gameState.territories[targetId];

    if (targetId === sourceId || target.owner !== this.gameState.currentPlayerIndex) {
      this.cancelFortify();
      return;
    }

    if (!this.socketClient) {
      this.cancelFortify();
      return;
    }

    try {
      const ack = await this.socketClient.usePowerUp('fortify', targetId, sourceId);
      if (!ack.success) {
        this.toastManager.show(ack.error?.message || 'Fortify failed', 'error');
      }
    } catch {
      this.toastManager.show('Connection error', 'error');
    }
    this.cancelFortify();
  }

  private cancelFortify(): void {
    this.fortifyMode = false;
    this.fortifySourceId = null;
    this.mapRenderer.clearHighlight();
    this.uiRenderer.setStatus('Select a territory to attack from');
  }

  // ─── Undo ────────────────────────────────────────────────

  private async undoLastAttack(): Promise<void> {
    if (!this.socketClient) return;
    try {
      const ack = await this.socketClient.undo();
      if (ack.success && ack.data) {
        this.gameState = deserializeWireState(ack.data);
        this.eventLog.addEvent('Undid last attack', 0xaaaaaa);
        this.refreshDisplay();
        this.uiRenderer.setStatus('Attack undone. Select a territory to attack from.');
      } else {
        this.toastManager.show(ack.error?.message || 'Undo failed', 'error');
      }
    } catch {
      this.toastManager.show('Connection error', 'error');
    }
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
  }

  private logSpawnFromWire(spawn: WirePowerUp): void {
    const territory = this.gameState.territories[spawn.territoryId];
    const ownerName = territory ? this.gameState.players[territory.owner]?.name ?? 'Unknown' : 'Unknown';
    this.eventLog.addEvent(
      `⚡ ${spawn.type} spawned on T${spawn.territoryId} (${ownerName})`,
      0xffcc00,
    );
  }

  // ─── Connection State ──────────────────────────────────────

  private setupConnectionStateListener(): void {
    if (!this.socketClient) return;

    this.connectionCleanup = this.socketClient.onConnectionStateChange((state: ConnectionState) => {
      this.uiRenderer.setConnectionState(state);

      if (state === 'disconnected' || state === 'connecting') {
        this.showDisconnectOverlay();
      } else if (state === 'connected') {
        this.clearDisconnectOverlay();
      }
    });
  }

  private showDisconnectOverlay(): void {
    if (this.disconnectOverlay) return;

    this.disconnectOverlay = this.add.container(0, 0).setDepth(800);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.5);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.disconnectOverlay.add(bg);

    const label = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10, 'Reconnecting...', {
      fontSize: '22px',
      color: '#ffcc44',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.disconnectOverlay.add(label);

    // After 10 seconds, show a retry button
    this.disconnectTimer = this.time.delayedCall(10_000, () => {
      if (!this.disconnectOverlay) return;

      label.setText('Connection Lost');

      const retryBg = this.add.graphics();
      retryBg.fillStyle(0xe94560, 1);
      retryBg.fillRoundedRect(GAME_WIDTH / 2 - 80, GAME_HEIGHT / 2 + 15, 160, 40, 8);
      this.disconnectOverlay!.add(retryBg);

      const retryText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 35, 'RETRY', {
        fontSize: '16px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.disconnectOverlay!.add(retryText);

      const retryZone = this.add.zone(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 35, 160, 40)
        .setInteractive({ useHandCursor: true })
        .setDepth(801);
      retryZone.on('pointerover', () => {
        retryBg.clear();
        retryBg.fillStyle(0xff6580, 1);
        retryBg.fillRoundedRect(GAME_WIDTH / 2 - 80, GAME_HEIGHT / 2 + 15, 160, 40, 8);
      });
      retryZone.on('pointerout', () => {
        retryBg.clear();
        retryBg.fillStyle(0xe94560, 1);
        retryBg.fillRoundedRect(GAME_WIDTH / 2 - 80, GAME_HEIGHT / 2 + 15, 160, 40, 8);
      });
      retryZone.on('pointerdown', () => {
        this.clearDisconnectOverlay();
        // Return to lobby to re-establish connection
        this.scene.start('LobbyScene', { authClient: this.authClient });
      });
      this.disconnectOverlay!.add(retryZone);
    });
  }

  private clearDisconnectOverlay(): void {
    if (this.disconnectTimer) {
      this.disconnectTimer.destroy();
      this.disconnectTimer = null;
    }
    if (this.disconnectOverlay) {
      this.disconnectOverlay.destroy();
      this.disconnectOverlay = null;
    }
  }

  // ─── Alliance Proposal ─────────────────────────────────────

  private async proposeAllianceToPlayer(targetIndex: number): Promise<void> {
    if (!this.socketClient) return;
    try {
      const ack = await this.socketClient.proposeAlliance(targetIndex);
      if (ack.success) {
        const targetName = this.gameState.players[targetIndex]?.name ?? 'Unknown';
        this.toastManager.show(`Alliance proposed to ${targetName}`, 'info');
      } else {
        this.toastManager.show(ack.error?.message || 'Alliance proposal failed', 'error');
      }
    } catch {
      this.toastManager.show('Connection error', 'error');
    }
  }

  // ─── Token Refresh ─────────────────────────────────────────

  private async handleTokenRefresh(): Promise<void> {
    if (!this.authClient) {
      this.toastManager.show('Session expired — please rejoin', 'error');
      return;
    }
    try {
      await this.authClient.refreshToken();
      this.toastManager.show('Session refreshed', 'info');
    } catch {
      this.toastManager.show('Session expired — please login again', 'error');
      this.time.delayedCall(2000, () => {
        this.scene.start('LoginScene');
      });
    }
  }

  private async onEndTurn(): Promise<void> {
    if (this.isProcessing) return;
    if (this.gameState.phase === 'gameOver') return;
    if (!this.socketClient) return;

    this.isProcessing = true;
    try {
      const ack = await this.socketClient.endTurn();
      if (!ack.success) {
        this.toastManager.show(ack.error?.message || 'End turn failed', 'error');
      }
      // Turn change, AI actions, and state updates arrive via WebSocket events
    } catch {
      this.toastManager.show('Connection error', 'error');
    } finally {
      this.isProcessing = false;
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

  private handleGameOver(): void {
    const winner = this.gameState.players.find(
      (p) => p.id === this.gameState.winner
    );
    if (winner?.isHuman) {
      this.soundManager.playVictory();
    } else {
      this.soundManager.playDefeat();
    }

    if (this.isOnlineGame) {
      // Online: server manages recording, just show results
      this.scene.start('GameOverScene', {
        winnerName: winner?.name ?? 'Unknown',
        isVictory: winner?.isHuman ?? false,
        spectatorMode: this.spectatorMode,
        stats: {},
        playerNames: this.gameState.players.map((p) => p.name),
        newAchievements: [],
      });
      return;
    }

    // Offline: save recording and check achievements
    const gameRecorder = this.data.get('gameRecorder') as GameRecorder | undefined;
    if (!gameRecorder) return;
    gameRecorder.endCurrentTurn();
    const recording = gameRecorder.getRecording(
      this.gameState.winner,
      winner?.name ?? 'Unknown',
    );
    recording.gameConfig = {
      seed: this.gameSeed,
      playerCount: this.setupConfig.playerCount,
      territoryCount: this.setupConfig.territoryCount,
      mapShape: this.setupConfig.mapShape ?? 'rectangle',
      speed: this.setupConfig.speed,
      powerUps: !!this.gameState.powerUpsEnabled,
      fogOfWar: this.setupConfig.fogOfWar ?? false,
      alliances: !!this.gameState.allianceState,
      spectatorMode: this.spectatorMode,
      undoEnabled: this.setupConfig.undoEnabled ?? true,
    };
    const stats = this.gameStats.getSummary();
    saveMatch(recording, stats);

    const achievementCtx: AchievementContext = {
      stats,
      recording,
      isVictory: winner?.isHuman ?? false,
      territoryCount: this.gameState.territories.length,
    };
    const newAchievements = checkAchievements(achievementCtx);
    if (newAchievements.length > 0) {
      saveUnlocked(newAchievements);
    }

    this.scene.start('GameOverScene', {
      winnerName: winner?.name ?? 'Unknown',
      isVictory: winner?.isHuman ?? false,
      spectatorMode: this.spectatorMode,
      stats,
      playerNames: this.gameState.players.map((p) => p.name),
      recording,
      newAchievements: newAchievements.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, description: a.description })),
    });
  }

  private showAllianceProposal(proposal: AllianceProposal): void {
    if (this.isDialogOpen) return;
    this.isDialogOpen = true;

    const fromPlayer = this.gameState.players[proposal.fromPlayer];
    const fromColor = '#' + fromPlayer.color.toString(16).padStart(6, '0');

    const container = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(600);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.95);
    bg.fillRoundedRect(-180, -80, 360, 160, 12);
    bg.lineStyle(2, 0x44ddff, 1);
    bg.strokeRoundedRect(-180, -80, 360, 160, 12);
    container.add(bg);

    const title = this.add.text(0, -55, '🤝 Alliance Proposal', {
      fontSize: '16px', color: '#44ddff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(title);

    const msg = this.add.text(0, -20, `${fromPlayer.name} proposes a\nnon-aggression pact (5 turns)`, {
      fontSize: '13px', color: fromColor, fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5);
    container.add(msg);

    const acceptBtn = this.add.text(-70, 35, '✓ Accept', {
      fontSize: '14px', color: '#000', fontFamily: 'monospace', fontStyle: 'bold',
      backgroundColor: '#44dd88', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(acceptBtn);

    const declineBtn = this.add.text(70, 35, '✗ Decline', {
      fontSize: '14px', color: '#000', fontFamily: 'monospace', fontStyle: 'bold',
      backgroundColor: '#dd4444', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(declineBtn);

    const cleanup = () => {
      container.destroy();
      this.isDialogOpen = false;
    };

    acceptBtn.on('pointerup', () => {
      if (this.socketClient) {
        this.socketClient.respondAlliance(String(proposal.fromPlayer), true);
        this.eventLog.addEvent(`🤝 You formed an alliance with ${fromPlayer.name}`, 0x44ddff);
      }
      cleanup();
      this.refreshDisplay();
    });

    declineBtn.on('pointerup', () => {
      if (this.socketClient) {
        this.socketClient.respondAlliance(String(proposal.fromPlayer), false);
      }
      this.eventLog.addEvent(
        `You declined ${fromPlayer.name}'s alliance proposal`,
        0xff6644
      );
      cleanup();
    });
  }

  private showAllianceBreakConfirmation(attackerId: number, defenderId: number, defenderName: string): void {
    if (this.isDialogOpen) return;
    this.isDialogOpen = true;

    const container = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(600);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.95);
    bg.fillRoundedRect(-180, -80, 360, 160, 12);
    bg.lineStyle(2, 0xff6644, 1);
    bg.strokeRoundedRect(-180, -80, 360, 160, 12);
    container.add(bg);

    const title = this.add.text(0, -55, '⚔️ Break Alliance?', {
      fontSize: '16px', color: '#ff6644', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(title);

    const msg = this.add.text(0, -20, `This attack will betray your\nalliance with ${defenderName}!`, {
      fontSize: '13px', color: '#ffffff', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5);
    container.add(msg);

    const confirmBtn = this.add.text(-70, 35, '⚔️ Betray', {
      fontSize: '14px', color: '#000', fontFamily: 'monospace', fontStyle: 'bold',
      backgroundColor: '#ff6644', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(confirmBtn);

    const cancelBtn = this.add.text(70, 35, '← Cancel', {
      fontSize: '14px', color: '#000', fontFamily: 'monospace', fontStyle: 'bold',
      backgroundColor: '#888888', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(cancelBtn);

    const cleanup = () => {
      container.destroy();
      this.isDialogOpen = false;
    };

    confirmBtn.on('pointerup', () => {
      // Server handles alliance break automatically when attacking an ally
      this.eventLog.addEvent(`⚔️ You betrayed ${defenderName}!`, 0xff6644);
      cleanup();
      this.handleDefenderSelection(defenderId);
    });

    cancelBtn.on('pointerup', () => {
      cleanup();
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
    this.uiRenderer.update(this.gameState, this.localPlayerIndex);
    this.uiRenderer.setUndoVisible(false); // Undo managed by server in online mode
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

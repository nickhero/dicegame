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
  createAllianceState, wouldBreakAlliance, breakAlliance, areAllied,
  AllianceProposal,
  PLAYER_COLORS, GAME_WIDTH,
  GameErrorCode,
} from '@dicewars/shared';
import type {
  AIActionPayload,
  InstantBatchPayload,
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
import { DialogManager } from '../rendering/DialogManager';
import { ChatManager } from '../rendering/ChatManager';
import type {
  IGameController,
  GameControllerEvents,
  DiceDistributionData,
  TurnChangedData,
  BattleAnimationData,
} from '../controllers/GameController';
import { LocalGameController } from '../controllers/LocalGameController';
import { OnlineGameController } from '../controllers/OnlineGameController';

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
  private toastManager!: ToastManager;
  private dialogManager!: DialogManager;
  private chatManager!: ChatManager;

  private isProcessing = false;
  private hoveredTerritoryId: number | null = null;
  private fortifyMode = false;
  private fortifySourceId: number | null = null;
  private spectatorMode = false;
  private spectatorLabel: Phaser.GameObjects.Text | null = null;
  private spectatorPaused = false;
  private gameSeed = 0;
  private seedText: Phaser.GameObjects.Text | null = null;
  private speed: GameSetupConfig['speed'] = 'normal';
  private setupConfig!: GameSetupConfig;
  private fogOfWarEnabled = false;
  private undoEnabled = true;
  private socketClient: SocketClient | null = null;
  private authClient: AuthClient | null = null;
  private isOnlineGame = false;
  private connectionCleanup: (() => void) | null = null;
  private localPlayerIndex: number | undefined;
  private onlineGameOverStats: Record<string, unknown> | null = null;
  private controller!: IGameController;

  constructor() {
    super('GameScene');
  }

  init(data?: Partial<GameSetupConfig> & { socketClient?: SocketClient; authClient?: AuthClient; initialState?: WireGameState }): void {
    this.isOnlineGame = !!data?.socketClient;
    this.socketClient = data?.socketClient ?? null;
    this.authClient = data?.authClient ?? null;
    this.localPlayerIndex = data?.initialState?.localPlayerIndex;
    this.onlineGameOverStats = null;
    this.isProcessing = false;
    this.seedText = null;
    this.connectionCleanup = null;
    this.fortifyMode = false;
    this.fortifySourceId = null;

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

    // Online games always use normal speed
    if (this.isOnlineGame) {
      this.speed = 'normal';
    }

    // If server sent initial state, deserialize it
    if (data?.initialState) {
      this.gameState = deserializeWireState(data.initialState);
      if (data.initialState.localPlayerIndex !== undefined) {
        this.localPlayerIndex = data.initialState.localPlayerIndex;
      }
    }
  }

  create(): void {
    createDiceTextures(this);

    if (this.isOnlineGame && this.gameState) {
      this.fogOfWarEnabled = this.setupConfig.fogOfWar;
      this.undoEnabled = false;
      this.spectatorMode = this.setupConfig.spectatorMode ?? false;
    } else {
      this.isOnlineGame = false;
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
      if (this.setupConfig.alliances ?? true) {
        this.gameState.allianceState = createAllianceState(playerCount);
      }
    }

    // Create renderers and UI managers
    this.mapRenderer = new MapRenderer(this);
    this.diceRenderer = new DiceRenderer(this);
    this.uiRenderer = new UIRenderer(this);
    this.battleAnimator = new BattleAnimator(this);
    this.eventLog = new EventLog(this);
    this.territoryEffects = new TerritoryEffects(this);
    this.soundManager = new SoundManager();
    this.gameStats = new GameStats();
    this.toastManager = new ToastManager(this);
    this.dialogManager = new DialogManager(this);
    this.chatManager = new ChatManager(this, {
      onSendMessage: (msg) => this.controller?.sendChat?.(msg),
    });

    // Setup UI callbacks
    this.uiRenderer.setEndTurnCallback(() => this.onEndTurn());
    this.uiRenderer.setBackCallback(() => this.handleBackClick());
    this.uiRenderer.setUndoCallback(() => this.undoLastAttack());
    this.uiRenderer.setProposeAllianceCallback((targetIndex) => this.proposeAllianceToPlayer(targetIndex));

    if (this.localPlayerIndex === undefined) {
      const humanIdx = this.gameState.players.findIndex((p) => p.isHuman);
      this.localPlayerIndex = humanIdx >= 0 ? humanIdx : 0;
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

    // Right click and background click deselects attacker
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (pointer.rightButtonDown() || (currentlyOver && currentlyOver.length === 0)) {
        if (this.gameState.phase === 'selectingDefender') {
          this.gameState.phase = 'selectingAttacker';
          this.gameState.selectedTerritoryId = null;
          this.territoryEffects.hideAttackLine();
          this.refreshDisplay();
          this.uiRenderer.setStatus('Selection cancelled. Pick a territory to attack from.');
        }
      }
    });

    // Setup keyboard shortcuts
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      this.handleKeyDown(event);
    });

    // Seed display below HUD panel (offline games only)
    if (!this.isOnlineGame && this.gameSeed > 0) {
      this.seedText = this.add.text(GAME_WIDTH - 195, 352, `Seed: ${this.gameSeed}`, {
        fontSize: '10px',
        color: '#555566',
        fontFamily: 'monospace',
      }).setDepth(100);
    }

    // Setup unified controller events
    const controllerEvents: GameControllerEvents = {
      onStateUpdate: (state) => {
        this.gameState = state;
        this.refreshDisplay();
      },
      onBattleResult: async (res) => {
        await this.handleControllerBattleResult(res);
      },
      onTurnChanged: (data) => {
        this.handleControllerTurnChanged(data);
      },
      onAIAction: (action) => {
        this.handleControllerAIAction(action);
      },
      onInstantBatch: (batch) => {
        this.handleControllerInstantBatch(batch);
      },
      onGameOver: (winner, stats) => {
        this.onlineGameOverStats = (stats as Record<string, unknown>) ?? null;
        this.handleGameOver();
      },
      onAllianceProposal: (proposal) => {
        this.showAllianceProposal(proposal);
      },
      onEventLog: (msg, color) => {
        this.eventLog.addEvent(msg, color);
      },
      onToast: (msg, type) => {
        this.toastManager.show(msg, type);
      },
      onChat: (data) => {
        const color = data.playerIndex >= 0 && data.playerIndex < PLAYER_COLORS.length
          ? PLAYER_COLORS[data.playerIndex]
          : 0x44ddff;
        this.eventLog.addEvent(`💬 [${data.senderName}]: ${data.message}`, color);
      },
      onError: (error) => {
        this.handleControllerError(error);
      },
      onPlayerDisconnected: (playerIndex, graceSeconds) => {
        const player = this.gameState.players[playerIndex];
        if (player) {
          this.eventLog.addEvent(`🔌 ${player.name} disconnected (${graceSeconds}s grace)`, 0xff8844);
        }
      },
      onPlayerReconnected: (playerIndex) => {
        const player = this.gameState.players[playerIndex];
        if (player) {
          this.eventLog.addEvent(`🔌 ${player.name} reconnected`, 0x44ff88);
        }
      },
    };

    if (this.isOnlineGame && this.socketClient) {
      this.controller = new OnlineGameController(
        this.socketClient,
        this.data.get('initialState') || {
          turnNumber: this.gameState.turnNumber,
          currentPlayerIndex: this.gameState.currentPlayerIndex,
          phase: this.gameState.phase as any,
          gameOver: false,
          winner: null,
          alliancesEnabled: !!this.gameState.allianceState,
          powerUpsEnabled: !!this.gameState.powerUpsEnabled,
          localPlayerIndex: this.localPlayerIndex,
          players: [],
          territories: [],
          alliances: [],
          powerUpLocations: [],
        },
        controllerEvents,
      );
      this.setupConnectionStateListener();
      this.uiRenderer.setConnectionState(this.socketClient.state);
      this.updateOnlineStatus();
      this.chatManager.create();
      this.eventLog.addEvent('🌐 Online game started', 0x44cc44);
      this.eventLog.addEvent(
        `Turn ${this.gameState.turnNumber} — ${this.gameState.players[this.gameState.currentPlayerIndex]?.name ?? 'Unknown'}'s turn`,
        0xffffff,
      );
    } else {
      const gameRecorder = new GameRecorder();
      gameRecorder.setInitialState(
        this.gameState.territories,
        this.gameState.players,
        this.gameState.adjacency,
        !!this.gameState.powerUpsEnabled,
      );
      this.gameStats.recordTurnStart(this.gameState);
      gameRecorder.startTurn(this.gameState.turnNumber, this.gameState.currentPlayerIndex);
      this.data.set('gameRecorder', gameRecorder);

      this.controller = new LocalGameController(
        this.gameState,
        this.localPlayerIndex ?? 0,
        this.rng,
        gameRecorder,
        this.gameStats,
        this.undoEnabled,
        controllerEvents,
        {
          speed: this.speed,
          fogOfWar: this.fogOfWarEnabled,
          spectatorMode: this.spectatorMode,
        },
      );

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

      this.eventLog.addEvent(
        `Turn ${this.gameState.turnNumber} — ${this.gameState.players[this.gameState.currentPlayerIndex].name}'s turn`,
        0xffffff,
      );
      this.controller.start?.();
    }

    // Initial render
    this.refreshDisplay();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.chatManager.handleKeyDown(event)) {
      return;
    }

    // Enter opens chat in online mode
    if (event.key === 'Enter' && this.isOnlineGame && !this.dialogManager.isDialogOpen()) {
      this.chatManager.open();
      return;
    }

    const key = event.key.toUpperCase();

    // Escape handles closing dialogs, fortify, deselecting, or showing exit dialog
    if (key === 'ESCAPE') {
      if (this.dialogManager.isDialogOpen()) {
        this.dialogManager.destroy();
        return;
      }
      if (this.fortifyMode) {
        this.cancelFortify();
        return;
      }
      if (this.dialogManager.hasPowerUpPopup()) {
        this.dialogManager.dismissPowerUpPopup();
        return;
      }
      if (this.gameState.phase === 'selectingDefender') {
        this.gameState.phase = 'selectingAttacker';
        this.gameState.selectedTerritoryId = null;
        this.territoryEffects.hideAttackLine();
        this.refreshDisplay();
        this.uiRenderer.setStatus('Selection cancelled. Pick a territory to attack from.');
        return;
      }
      this.showExitDialog();
      return;
    }

    // H / ? always toggles help overlay
    if (key === 'H' || event.key === '?') {
      this.dialogManager.toggleHelp(this.undoEnabled, this.isOnlineGame);
      return;
    }

    // 1/2/3 — change speed (local games only)
    if (!this.isOnlineGame) {
      if (key === '1') { this.setSpeed('normal'); return; }
      if (key === '2') { this.setSpeed('fast'); return; }
      if (key === '3') { this.setSpeed('instant'); return; }
    }

    // Space — pause/resume in spectator mode
    if (key === ' ' && this.spectatorMode) {
      event.preventDefault();
      this.toggleSpectatorPause();
      return;
    }

    if (this.dialogManager.isDialogOpen()) return;

    // M — toggle mute
    if (key === 'M') {
      this.soundManager.setMuted(!this.soundManager.isMuted());
      return;
    }

    // R — restart with confirmation
    if (key === 'R') {
      this.dialogManager.showConfirm('Restart game?', () => this.scene.restart());
      return;
    }

    // S — surrender with confirmation
    if (key === 'S' && !this.spectatorMode) {
      this.showSurrenderDialog();
      return;
    }

    if (this.isProcessing) return;
    if (this.gameState.phase === 'gameOver') return;

    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    if (!currentPlayer.isHuman) return;
    if (this.isOnlineGame && this.localPlayerIndex !== undefined
      && this.gameState.currentPlayerIndex !== this.localPlayerIndex) return;

    // Z — undo last attack
    if (key === 'Z' && this.undoEnabled) {
      this.undoLastAttack();
      return;
    }

    // E / Space — end turn
    if (key === 'E' || key === ' ') {
      event.preventDefault();
      this.onEndTurn();
    }
  }

  private handleBackClick(): void {
    if (this.gameState.phase === 'gameOver' || this.spectatorMode) {
      this.exitToMenu();
      return;
    }
    this.showExitDialog();
  }

  private showExitDialog(): void {
    this.dialogManager.showExit(this.isOnlineGame, () => this.exitToMenu());
  }

  private async exitToMenu(): Promise<void> {
    this.controller?.destroy();
    if (this.isOnlineGame) {
      this.socketClient?.disconnect();
      this.scene.start('LobbyScene', { authClient: this.authClient });
      return;
    }
    this.scene.start('MenuScene');
  }

  private showSurrenderDialog(): void {
    if (this.isProcessing) return;
    if (this.gameState.phase === 'gameOver') return;
    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    if (!currentPlayer.isHuman) return;
    if (this.isOnlineGame && this.localPlayerIndex !== undefined
      && this.gameState.currentPlayerIndex !== this.localPlayerIndex) return;

    this.dialogManager.showSurrender(() => this.executeHumanSurrender());
  }

  private async executeHumanSurrender(): Promise<void> {
    if (!this.controller) return;
    try {
      await this.controller.surrender();
      this.soundManager.playElimination();
      this.refreshDisplay();
    } catch {
      this.toastManager.show('Surrender failed', 'error');
    }
  }

  private onTerritoryClick(territoryId: number): void {
    if (this.spectatorMode) return;
    if (this.isProcessing) return;
    if (this.gameState.phase === 'gameOver') return;

    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    if (!currentPlayer.isHuman) return;
    if (this.isOnlineGame && this.localPlayerIndex !== undefined
      && this.gameState.currentPlayerIndex !== this.localPlayerIndex) return;

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

    if (territoryId === attackerId) {
      this.gameState.phase = 'selectingAttacker';
      this.gameState.selectedTerritoryId = null;
      this.territoryEffects.hideAttackLine();
      this.refreshDisplay();
      this.uiRenderer.setStatus('Attack cancelled. Pick a territory to attack from.');
      return;
    }

    if (this.gameState.territories[territoryId].owner === this.gameState.currentPlayerIndex) {
      if (canAttackFrom(territoryId, this.gameState)) {
        this.gameState.selectedTerritoryId = territoryId;
        this.territoryEffects.hideAttackLine();
        this.refreshDisplay();
        this.uiRenderer.setStatus('Select an enemy territory to attack');
        return;
      }
      this.gameState.phase = 'selectingAttacker';
      this.gameState.selectedTerritoryId = null;
      this.territoryEffects.hideAttackLine();
      this.refreshDisplay();
      this.uiRenderer.setStatus('Selection cancelled. Pick a territory to attack from.');
      return;
    }

    if (!isValidAttack(attackerId, territoryId, this.gameState)) {
      this.uiRenderer.setStatus('Invalid target! Must be an adjacent enemy territory.');
      return;
    }

    if (this.gameState.allianceState && wouldBreakAlliance(this.gameState.allianceState, this.gameState.currentPlayerIndex, this.gameState.territories[territoryId].owner)) {
      const defenderName = this.gameState.players[this.gameState.territories[territoryId].owner].name;
      this.showAllianceBreakConfirmation(attackerId, territoryId, defenderName);
      return;
    }

    await this.executeAttackAction(attackerId, territoryId);
  }

  private async executeAttackAction(attackerId: number, territoryId: number): Promise<void> {
    if (!this.controller) return;
    this.isProcessing = true;
    try {
      const success = await this.controller.attack(attackerId, territoryId);
      if (!success) {
        this.toastManager.show('Attack failed', 'error');
      }
    } catch {
      this.toastManager.show('Attack failed', 'error');
    } finally {
      this.isProcessing = false;
      this.gameState.selectedTerritoryId = null;
      this.gameState.phase = 'selectingAttacker';
      this.refreshDisplay();
    }
  }

  // ─── Power-Up Activation ──────────────────────────────────────────

  private showPowerUpPopup(territory: Territory): void {
    const canAttack = canAttackFrom(territory.id, this.gameState);
    this.dialogManager.showPowerUpPopup(
      territory,
      canAttack,
      () => this.activateReinforce(territory.id),
      () => this.activateFortify(territory.id),
      () => {
        this.gameState.selectedTerritoryId = territory.id;
        this.gameState.phase = 'selectingDefender';
        this.refreshDisplay();
        this.uiRenderer.setStatus('Select an enemy territory to attack');
      }
    );
  }

  private async activateReinforce(territoryId: number): Promise<void> {
    if (!this.controller) return;
    try {
      const success = await this.controller.usePowerUp('reinforce', territoryId);
      if (success) {
        this.soundManager.playCapture();
        this.refreshDisplay();
      } else {
        this.toastManager.show('Cannot use Reinforce here', 'error');
      }
    } catch {
      this.toastManager.show('Action failed', 'error');
    }
  }

  private activateFortify(sourceId: number): void {
    this.fortifyMode = true;
    this.fortifySourceId = sourceId;
    this.mapRenderer.highlightTerritory(this.gameState.territories[sourceId], 0x44cc44);
    this.uiRenderer.setStatus('Select an adjacent territory to move dice to');
  }

  private async handleFortifyTarget(targetId: number): Promise<void> {
    const sourceId = this.fortifySourceId;
    this.cancelFortify();
    if (sourceId === null || !this.controller) return;

    try {
      const success = await this.controller.usePowerUp('fortify', targetId, sourceId);
      if (success) {
        this.soundManager.playCapture();
        this.refreshDisplay();
      } else {
        this.toastManager.show('Fortify failed', 'error');
      }
    } catch {
      this.toastManager.show('Action failed', 'error');
    }
  }

  private cancelFortify(): void {
    this.fortifyMode = false;
    this.fortifySourceId = null;
    this.mapRenderer.clearHighlight();
    this.uiRenderer.setStatus('Select a territory to attack from');
  }

  private async undoLastAttack(): Promise<void> {
    if (!this.controller || !this.controller.canUndo()) {
      this.toastManager.show('Nothing to undo', 'info');
      return;
    }
    try {
      const success = await this.controller.undo();
      if (success) {
        this.uiRenderer.setStatus('Attack undone. Select a territory to attack from.');
        this.refreshDisplay();
      }
    } catch {
      this.toastManager.show('Undo failed', 'error');
    }
  }

  private async proposeAllianceToPlayer(targetIndex: number): Promise<void> {
    if (!this.controller) return;
    try {
      const targetName = this.gameState.players[targetIndex]?.name ?? 'Player';
      const success = await this.controller.proposeAlliance(targetIndex);
      if (success) {
        const isNowAllied = this.gameState.allianceState &&
          this.localPlayerIndex !== undefined &&
          areAllied(this.gameState.allianceState, this.localPlayerIndex, targetIndex);
        if (isNowAllied) {
          this.toastManager.show(`🤝 Alliance formed with ${targetName}!`, 'info');
          this.eventLog.addEvent(`🤝 Formed alliance with ${targetName} (5 turns)!`, 0x44ddff);
        } else if (this.isOnlineGame) {
          this.toastManager.show(`Alliance proposed to ${targetName}`, 'info');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to propose alliance';
      this.toastManager.show(message, 'error');
    }
  }

  // ─── Turn Management ──────────────────────────────────────────────

  private async onEndTurn(): Promise<void> {
    if (this.isProcessing) return;
    if (this.gameState.phase === 'gameOver') return;

    this.isProcessing = true;
    try {
      this.gameState.phase = 'selectingAttacker';
      this.gameState.selectedTerritoryId = null;
      this.dialogManager.dismissPowerUpPopup();
      await this.controller.endTurn();
    } catch {
      this.toastManager.show('End turn failed', 'error');
    } finally {
      this.isProcessing = false;
      this.refreshDisplay();
    }
  }

  // ─── Controller Event Handlers ────────────────────────────────────

  private handleControllerTurnChanged(data: TurnChangedData): void {
    const previousPlayer = this.gameState.players[data.previousPlayerIndex];
    if (data.bonusDice > 0 && previousPlayer) {
      this.eventLog.addEvent(
        `${previousPlayer.name} received ${data.bonusDice} bonus dice`,
        PLAYER_COLORS[data.previousPlayerIndex]
      );
    }
    if (data.distribution && previousPlayer) {
      this.showDiceDistribution(data.distribution, PLAYER_COLORS[data.previousPlayerIndex]);
    }
    if (data.powerUpSpawns) {
      for (const spawn of data.powerUpSpawns) {
        this.logSpawnFromWire(spawn);
      }
    }
    const currentPlayer = this.gameState.players[data.currentPlayerIndex];
    this.eventLog.addEvent(
      `Turn ${data.turnNumber} — ${currentPlayer?.name ?? 'Unknown'}'s turn`,
      0xffffff
    );

    if (currentPlayer) {
      if (this.spectatorMode) {
        this.uiRenderer.setStatus('Spectator mode — watching AI battle');
      } else if (!currentPlayer.isHuman) {
        this.uiRenderer.setStatus(`${currentPlayer.name} is thinking...`);
      } else {
        this.uiRenderer.setStatus('Select a territory to attack from');
      }
    }

    this.refreshDisplay();
  }

  private handleControllerAIAction(action: AIActionPayload): void {
    const player = this.gameState.players[action.playerIndex];
    const name = player?.name ?? `Player ${action.playerIndex}`;
    switch (action.actionType) {
      case 'attack':
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
  }

  private handleControllerInstantBatch(batch: InstantBatchPayload): void {
    for (const action of batch.actions) {
      const player = this.gameState.players[action.playerIndex];
      const name = player?.name ?? `Player ${action.playerIndex}`;
      this.eventLog.addEvent(`⚡ ${name}: ${action.actionType}`, player?.color ?? 0xffffff);
    }
    if (batch.finalState.localPlayerIndex !== undefined) {
      this.localPlayerIndex = batch.finalState.localPlayerIndex;
    }
    this.gameState = deserializeWireState(batch.finalState);
    this.refreshDisplay();
  }

  private handleControllerError(error: GameError): void {
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
        this.toastManager.show('Session expired. Please log in again.', 'error');
        break;
      default:
        this.toastManager.show(error.message, 'error');
        break;
    }
  }

  private showDiceDistribution(distribution: DiceDistributionData, color: number): void {
    distribution.deltas.forEach((count, id) => {
      if (count > 0) {
        const t = this.gameState.territories[id];
        if (t) {
          const label = this.add.text(t.center.x, t.center.y - 20, `+${count}`, {
            fontSize: '12px',
            color: '#' + color.toString(16).padStart(6, '0'),
            fontFamily: 'monospace',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2,
          }).setOrigin(0.5).setDepth(300);
          this.tweens.add({
            targets: label,
            y: label.y - 20,
            alpha: 0,
            duration: 1200,
            ease: 'Power1',
            onComplete: () => label.destroy(),
          });
        }
      }
    });
  }

  private logSpawnFromWire(spawn: WirePowerUp): void {
    const territory = this.gameState.territories[spawn.territoryId];
    const ownerName = territory ? this.gameState.players[territory.owner]?.name ?? 'Unknown' : 'Unknown';
    this.eventLog.addEvent(
      `⚡ ${spawn.type} spawned on T${spawn.territoryId} (${ownerName})`,
      0xffcc00,
    );
  }

  private toggleSpectatorPause(): void {
    this.spectatorPaused = !this.spectatorPaused;
    if (this.spectatorPaused) {
      this.controller?.pause?.();
    } else {
      this.controller?.resume?.();
    }
    if (this.spectatorLabel) {
      this.spectatorLabel.setText(
        this.spectatorPaused
          ? '⏸ PAUSED (Space to resume)'
          : '👁 SPECTATING (Space to pause)',
      );
    }
  }

  private setupConnectionStateListener(): void {
    if (!this.socketClient) return;

    this.connectionCleanup = this.socketClient.onConnectionStateChange((state: ConnectionState) => {
      this.uiRenderer.setConnectionState(state);

      if (state === 'disconnected' || state === 'connecting') {
        this.dialogManager.showDisconnectOverlay(() => {
          this.scene.start('LobbyScene', { authClient: this.authClient });
        });
      } else if (state === 'connected') {
        this.dialogManager.clearDisconnectOverlay();
      }
    });
  }

  private updateOnlineStatus(): void {
    if (!this.isOnlineGame) return;
    const isMyTurn = this.localPlayerIndex !== undefined
      && this.gameState.currentPlayerIndex === this.localPlayerIndex;
    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];

    if (this.spectatorMode) {
      this.uiRenderer.setStatus('Spectating online match');
    } else if (isMyTurn) {
      this.uiRenderer.setStatus('Your turn — select a territory to attack from');
    } else {
      this.uiRenderer.setStatus(`Waiting for ${currentPlayer?.name ?? 'opponent'}...`);
    }
  }

  private getBattleSpeed(baseMultiplier = 1): number {
    const multiplier = SPEED_CONFIGS[this.speed].multiplier;
    if (multiplier === 0) return 0;
    return baseMultiplier / multiplier;
  }

  private setSpeed(newSpeed: GameSetupConfig['speed']): void {
    if (this.speed === newSpeed) return;
    this.speed = newSpeed;
    this.controller?.setSpeed?.(newSpeed);
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
      const stats = this.onlineGameOverStats
        ? GameStats.deserializeStats(this.onlineGameOverStats)
        : null;
      const isVictory = this.localPlayerIndex !== undefined &&
        winner?.id === this.localPlayerIndex;
      this.socketClient?.disconnect();
      this.scene.start('GameOverScene', {
        winnerName: winner?.name ?? 'Unknown',
        isVictory,
        spectatorMode: this.spectatorMode,
        stats: stats ?? undefined,
        playerNames: this.gameState.players.map((p) => p.name),
        newAchievements: [],
      });
      return;
    }

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
    if (this.dialogManager.isDialogOpen()) return;

    const fromPlayer = this.gameState.players[proposal.fromPlayer];
    const fromColor = '#' + (fromPlayer?.color ?? 0xffffff).toString(16).padStart(6, '0');

    this.dialogManager.showAllianceProposal(
      fromPlayer?.name ?? 'Player',
      fromColor,
      async () => {
        await this.controller?.respondAlliance(proposal.proposalId || String(proposal.fromPlayer), true);
        this.refreshDisplay();
      },
      async () => {
        await this.controller?.respondAlliance(proposal.proposalId || String(proposal.fromPlayer), false);
        this.refreshDisplay();
      }
    );
  }

  private showAllianceBreakConfirmation(attackerId: number, defenderId: number, defenderName: string): void {
    if (this.dialogManager.isDialogOpen()) return;

    this.dialogManager.showAllianceBreakConfirmation(
      defenderName,
      async () => {
        if (this.gameState.allianceState) {
          breakAlliance(this.gameState.allianceState, this.gameState.currentPlayerIndex, this.gameState.territories[defenderId].owner);
        }
        this.eventLog.addEvent(`⚔️ You betrayed ${defenderName}!`, 0xff6644);
        await this.executeAttackAction(attackerId, defenderId);
      },
      () => {
        this.gameState.phase = 'selectingAttacker';
        this.gameState.selectedTerritoryId = null;
        this.territoryEffects.hideAttackLine();
        this.refreshDisplay();
        this.uiRenderer.setStatus('Attack cancelled.');
      }
    );
  }

  private refreshDisplay(): void {
    const selectedId = this.gameState.selectedTerritoryId;
    const validTargets = selectedId !== null
      ? getValidTargets(selectedId, this.gameState).map((t) => t.id)
      : [];
    const attackable = getAttackableTerritories(this.gameState).map((t) => t.id);

    const visibleSet = this.fogOfWarEnabled
      ? getVisibleTerritories(this.gameState, this.localPlayerIndex ?? 0)
      : undefined;

    this.mapRenderer.drawMap(this.gameState, selectedId, validTargets, attackable, visibleSet);
    this.diceRenderer.drawDiceStacks(this.gameState.territories, visibleSet);
    this.uiRenderer.update(this.gameState, this.localPlayerIndex);
    this.uiRenderer.setUndoVisible(this.controller?.canUndo() ?? false);
    this.territoryEffects.updateLowDiceWarnings(this.gameState);
  }

  private updateHoverEffects(territoryId: number, pointer: Phaser.Input.Pointer): void {
    const territory = this.gameState.territories[territoryId];
    if (!territory) return;

    const playerName = this.gameState.players[territory.owner]?.name ?? 'Unknown';
    const powerUpLabel = territory.powerUp ? POWER_UPS[territory.powerUp].description : undefined;
    const neighborCount = territory.neighbors.length;

    let attackOdds: number | undefined;
    if (!this.isProcessing && this.gameState.phase === 'selectingDefender') {
      const attackerId = this.gameState.selectedTerritoryId;
      if (attackerId !== null) {
        const targets = getValidTargets(attackerId, this.gameState).map((t) => t.id);
        if (targets.includes(territoryId)) {
          const atk = this.gameState.territories[attackerId];
          attackOdds = estimateWinProbability(atk.dice, territory.dice, atk.powerUp, territory.powerUp);
        }
      }
    }

    this.territoryEffects.showTooltip(territory, pointer.x, pointer.y, playerName, powerUpLabel, neighborCount, attackOdds);

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

  private async handleControllerBattleResult(result: BattleAnimationData): Promise<void> {
    const attackerTerritory = this.gameState.territories[result.attackerId];
    const defenderTerritory = this.gameState.territories[result.defenderId];
    if (!attackerTerritory || !defenderTerritory) return;

    const attackerPlayerIdx = result.attackerPlayerIndex ?? attackerTerritory.owner;
    const defenderPlayerIdx = result.defenderPlayerIndex ?? defenderTerritory.owner;
    const attackerColor = PLAYER_COLORS[attackerPlayerIdx] ?? 0xffffff;
    const defenderColor = PLAYER_COLORS[defenderPlayerIdx] ?? 0xffffff;
    const attackerName = this.gameState.players[attackerPlayerIdx]?.name ?? '?';
    const defenderName = this.gameState.players[defenderPlayerIdx]?.name ?? '?';
    const outcome = result.attackerWon ? 'won' : 'lost';
    const attackerTotal = result.attackerTotal ?? result.attackerDice.reduce((sum, d) => sum + d, 0);
    const defenderTotal = result.defenderTotal ?? result.defenderDice.reduce((sum, d) => sum + d, 0);
    const defRollSum = result.defenderDice.reduce((sum, d) => sum + d, 0);
    const atkRollSum = result.attackerDice.reduce((sum, d) => sum + d, 0);
    const shieldBonus = defenderTotal - defRollSum;
    const chargeBonus = attackerTotal - atkRollSum;
    const notes: string[] = [];
    if (chargeBonus > 0) notes.push(`⚡+${chargeBonus} Charge`);
    if (shieldBonus > 0) notes.push(`🛡️+${shieldBonus} Shield`);
    const noteSuffix = notes.length > 0 ? ` [${notes.join(', ')}]` : '';

    this.eventLog.addEvent(
      `⚔️ ${attackerName} → ${defenderName} (${outcome} ${attackerTotal} vs ${defenderTotal}${noteSuffix})`,
      attackerColor
    );

    this.territoryEffects.showAttackLine(
      attackerTerritory.center.x, attackerTerritory.center.y,
      defenderTerritory.center.x, defenderTerritory.center.y
    );

    this.soundManager.playDiceRoll();
    await this.battleAnimator.showBattle(
      result.attackerDice,
      result.defenderDice,
      attackerColor,
      defenderColor,
      result.attackerWon,
      this.getBattleSpeed(1),
      attackerTotal,
      defenderTotal,
    );

    this.territoryEffects.hideAttackLine();
    if (result.attackerWon) {
      this.territoryEffects.showCapturePulse(defenderTerritory);
      this.soundManager.playCapture();
    } else {
      this.soundManager.playAttackFail();
    }
    this.refreshDisplay();
  }

  shutdown(): void {
    if (this.connectionCleanup) {
      this.connectionCleanup();
      this.connectionCleanup = null;
    }
    this.socketClient?.disconnect();
    this.socketClient = null;
    this.isOnlineGame = false;
    this.localPlayerIndex = undefined;
    this.onlineGameOverStats = null;
    this.isProcessing = false;
    this.seedText?.destroy();
    this.seedText = null;
    this.dialogManager?.destroy();
    this.chatManager?.destroy();
    this.toastManager?.destroy();
    this.battleAnimator?.dismiss();
    this.input.keyboard?.removeAllListeners();
    this.controller?.destroy();
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

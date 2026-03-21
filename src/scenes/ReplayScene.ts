import Phaser from 'phaser';
import { GameState, createInitialGameState } from '../game/GameState';
import { createPlayer } from '../game/Player';
import { generateMap, assignTerritories } from '../game/MapGenerator';
import { executeAttack, endTurn, distributeSurrenderedTerritories } from '../game/GameRules';
import { getRandomPersonality, PERSONALITIES } from '../game/AIPersonality';
import { SPEED_CONFIGS, GameSetupConfig, DEFAULT_SETUP } from '../game/GameConfig';
import { TurnRecord, GameAction } from '../game/GameRecorder';
import { SeededRandom } from '../utils/random';
import { MapRenderer } from '../rendering/MapRenderer';
import { DiceRenderer, createDiceTextures } from '../rendering/DiceRenderer';
import { TerritoryEffects } from '../rendering/TerritoryEffects';
import { EventLog } from '../rendering/EventLog';
import {
  PLAYER_COLORS,
  DEFAULT_TERRITORY_COUNT,
  DEFAULT_PLAYER_COUNT,
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../config';

interface ReplayData {
  recording: TurnRecord[];
  setupConfig: GameSetupConfig;
}

export class ReplayScene extends Phaser.Scene {
  private gameState!: GameState;
  private rng!: SeededRandom;
  private mapRenderer!: MapRenderer;
  private diceRenderer!: DiceRenderer;
  private territoryEffects!: TerritoryEffects;
  private eventLog!: EventLog;

  private recording: TurnRecord[] = [];
  private setupConfig!: GameSetupConfig;

  private turnIndex = 0;
  private actionIndex = 0;
  private paused = false;
  private speed: 'normal' | 'fast' | 'instant' = 'normal';
  private isProcessing = false;

  private statusText!: Phaser.GameObjects.Text;
  private controlsText!: Phaser.GameObjects.Text;

  constructor() {
    super('ReplayScene');
  }

  init(data: ReplayData): void {
    this.recording = data.recording ?? [];
    this.setupConfig = data.setupConfig ?? { ...DEFAULT_SETUP };
    this.turnIndex = 0;
    this.actionIndex = 0;
    this.paused = false;
    this.speed = 'normal';
    this.isProcessing = false;
  }

  create(): void {
    // Recreate the game from the same seed
    const seed = this.setupConfig.mapSeed;
    const numSeed = typeof seed === 'number' ? seed : hashString(String(seed));
    this.rng = new SeededRandom(numSeed);

    const numTerritories = this.setupConfig.territoryCount ?? DEFAULT_TERRITORY_COUNT;
    const numPlayers = this.setupConfig.playerCount ?? DEFAULT_PLAYER_COUNT;
    const { territories, adjacency } = generateMap(numTerritories, this.rng);
    assignTerritories(territories, numPlayers, this.rng);

    // Create players (all AI for replay)
    const players = [];
    for (let i = 0; i < numPlayers; i++) {
      const personality = getRandomPersonality(this.rng);
      const p = createPlayer(i, `Player ${i + 1}`, false, PLAYER_COLORS[i], personality);
      players.push(p);
    }

    this.gameState = createInitialGameState(territories, players, adjacency);
    if (this.setupConfig.powerUps) {
      this.gameState.powerUpsEnabled = true;
    }

    // Create renderers
    this.mapRenderer = new MapRenderer(this);
    this.diceRenderer = new DiceRenderer(this);
    this.territoryEffects = new TerritoryEffects(this);
    this.eventLog = new EventLog(this);

    this.mapRenderer.createInteractiveZones(this.gameState, () => {});
    this.mapRenderer.setZoneHoverCallbacks(
      (id, pointer) => {
        const t = this.gameState.territories[id];
        if (t) {
          const name = this.gameState.players[t.owner]?.name ?? '?';
          this.territoryEffects.showTooltip(t, pointer.x, pointer.y, name);
        }
      },
      () => this.territoryEffects.hideTooltip(),
      () => {},
    );

    // Header
    this.add.text(GAME_WIDTH / 2, 15, '🎬 REPLAY', {
      fontSize: '16px',
      color: '#ffcc00',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(200);

    // Controls bar at bottom
    this.controlsText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 50, '', {
      fontSize: '12px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
      backgroundColor: '#111122cc',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(200);
    this.updateControlsText();

    // Status
    this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 25, '', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#111122cc',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(200);

    // Keyboard
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      this.handleKeyDown(event);
    });

    this.refreshDisplay();
    this.statusText.setText(`Turn 1 — ready to replay ${this.recording.length} turns`);

    // Start replay
    this.time.delayedCall(500, () => this.playNextAction());
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const key = event.key.toUpperCase();

    if (key === ' ') {
      event.preventDefault();
      this.paused = !this.paused;
      this.updateControlsText();
      if (!this.paused && !this.isProcessing) {
        this.playNextAction();
      }
      return;
    }

    if (key === '1') { this.speed = 'normal'; this.updateControlsText(); return; }
    if (key === '2') { this.speed = 'fast'; this.updateControlsText(); return; }
    if (key === '3') { this.speed = 'instant'; this.updateControlsText(); return; }

    // N — step one action (when paused)
    if (key === 'N' && this.paused) {
      this.stepOneAction();
      return;
    }

    // Escape — exit replay
    if (key === 'ESCAPE') {
      this.scene.start('MenuScene');
      return;
    }
  }

  private updateControlsText(): void {
    const pauseLabel = this.paused ? '▶ Play' : '⏸ Pause';
    this.controlsText.setText(
      `Space: ${pauseLabel}  |  N: Step  |  1/2/3: Speed (${this.speed})  |  Esc: Exit`
    );
  }

  private getDelay(baseMs: number): number {
    return baseMs * SPEED_CONFIGS[this.speed].multiplier;
  }

  private async playNextAction(): Promise<void> {
    if (this.paused || this.isProcessing) return;
    if (this.turnIndex >= this.recording.length) {
      this.statusText.setText('Replay complete!');
      return;
    }

    this.isProcessing = true;

    const turn = this.recording[this.turnIndex];
    if (this.actionIndex >= turn.actions.length) {
      // Move to next turn
      this.turnIndex++;
      this.actionIndex = 0;
      this.isProcessing = false;

      if (this.turnIndex >= this.recording.length) {
        this.statusText.setText('Replay complete!');
        return;
      }

      await this.delay(this.getDelay(300));
      this.playNextAction();
      return;
    }

    const action = turn.actions[this.actionIndex];
    await this.executeAction(action);
    this.actionIndex++;
    this.isProcessing = false;

    if (!this.paused) {
      await this.delay(this.getDelay(400));
      this.playNextAction();
    }
  }

  private stepOneAction(): void {
    if (this.turnIndex >= this.recording.length) return;

    const turn = this.recording[this.turnIndex];
    if (this.actionIndex >= turn.actions.length) {
      this.turnIndex++;
      this.actionIndex = 0;
      if (this.turnIndex >= this.recording.length) {
        this.statusText.setText('Replay complete!');
        return;
      }
    }

    const action = this.recording[this.turnIndex].actions[this.actionIndex];
    this.executeAction(action);
    this.actionIndex++;
  }

  private async executeAction(action: GameAction): Promise<void> {
    const playerName = this.gameState.players[this.gameState.currentPlayerIndex]?.name ?? '?';

    switch (action.type) {
      case 'attack': {
        const attackerT = this.gameState.territories[action.attackerId];
        const defenderT = this.gameState.territories[action.defenderId];

        if (this.speed !== 'instant') {
          this.territoryEffects.showAttackLine(
            attackerT.center.x, attackerT.center.y,
            defenderT.center.x, defenderT.center.y,
          );
          await this.delay(this.getDelay(200));
        }

        const result = executeAttack(action.attackerId, action.defenderId, this.gameState, this.rng);
        const outcome = result.attackerWins ? 'won' : 'lost';
        this.eventLog.addEvent(
          `${playerName} T${action.attackerId} → T${action.defenderId} (${outcome})`,
          PLAYER_COLORS[this.gameState.currentPlayerIndex],
        );

        // Check for elimination
        for (const p of this.gameState.players) {
          if (!p.isAlive) {
            const owned = this.gameState.territories.filter(t => t.owner === p.id);
            if (owned.length === 0 && !p.isAlive) {
              // Already handled by executeAttack setting isAlive
            }
          }
        }

        if (this.speed !== 'instant') {
          this.territoryEffects.hideAttackLine();
        }

        this.refreshDisplay();
        this.statusText.setText(`Turn ${this.turnIndex + 1} — ${playerName} attacks`);

        if ((this.gameState.phase as string) === 'gameOver') {
          this.statusText.setText('Replay complete — game over!');
        }
        break;
      }

      case 'endTurn': {
        endTurn(this.gameState, this.rng);
        this.refreshDisplay();
        const nextName = this.gameState.players[this.gameState.currentPlayerIndex]?.name ?? '?';
        this.eventLog.addEvent(`Turn ${this.gameState.turnNumber} — ${nextName}'s turn`, 0xffffff);
        this.statusText.setText(`Turn ${this.gameState.turnNumber} — ${nextName}'s turn`);
        break;
      }

      case 'surrender': {
        const surrenderPlayer = this.gameState.players.find(p => p.id === action.playerId);
        if (surrenderPlayer) {
          this.eventLog.addEvent(`${surrenderPlayer.name} surrendered!`, 0xff4444);
          distributeSurrenderedTerritories(this.gameState, action.playerId);
          this.refreshDisplay();
        }
        break;
      }

      case 'powerUp':
      case 'fortify':
      case 'reinforce':
        // These affect game state but we don't have full logic here — skip gracefully
        this.eventLog.addEvent(`${playerName} used power-up`, 0x44aaff);
        break;
    }
  }

  private refreshDisplay(): void {
    this.mapRenderer.drawMap(this.gameState, null, [], []);
    this.diceRenderer.drawDiceStacks(this.gameState.territories);
  }

  private delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
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

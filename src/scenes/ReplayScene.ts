import Phaser from 'phaser';
import { GameState, createInitialGameState } from '../game/GameState';
import { createPlayer } from '../game/Player';
import { executeAttack, endTurn, distributeSurrenderedTerritories } from '../game/GameRules';
import { useFortify, useReinforce } from '../game/PowerUps';
import { SPEED_CONFIGS } from '../game/GameConfig';
import { TurnRecord, GameAction, GameRecording, deserializeAdjacency } from '../game/GameRecorder';
import { formatAction } from '../game/EventFormatter';
import { SeededRandom } from '../utils/random';
import { MapRenderer } from '../rendering/MapRenderer';
import { DiceRenderer, createDiceTextures } from '../rendering/DiceRenderer';
import { TerritoryEffects } from '../rendering/TerritoryEffects';
import { EventLog } from '../rendering/EventLog';
import { UIRenderer } from '../rendering/UIRenderer';
import { PLAYER_COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { Territory } from '../game/Territory';

export class ReplayScene extends Phaser.Scene {
  private gameState!: GameState;
  private rng!: SeededRandom;
  private mapRenderer!: MapRenderer;
  private diceRenderer!: DiceRenderer;
  private uiRenderer!: UIRenderer;
  private territoryEffects!: TerritoryEffects;
  private eventLog!: EventLog;

  private recording!: GameRecording;
  private turns: TurnRecord[] = [];

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

  init(data: { recording: GameRecording }): void {
    this.recording = data.recording;
    this.turns = this.recording.turns;
    this.turnIndex = 0;
    this.actionIndex = 0;
    this.paused = false;
    this.speed = 'normal';
    this.isProcessing = false;
  }

  create(): void {
    createDiceTextures(this);

    // Restore game state from serialized initial snapshot
    const initial = this.recording.initialState;
    const adjacency = deserializeAdjacency(initial.adjacency);

    const territories: Territory[] = initial.territories.map(st => ({
      id: st.id,
      cells: st.cells.map(c => ({ x: c.x, y: c.y })),
      center: { x: st.center.x, y: st.center.y },
      neighbors: [...st.neighbors],
      owner: st.owner,
      dice: st.dice,
      gridType: st.gridType,
      powerUp: st.powerUp,
    }));

    const players = initial.players.map(sp =>
      createPlayer(sp.id, sp.name, sp.isHuman, sp.color, sp.personality)
    );

    this.gameState = createInitialGameState(territories, players, adjacency);
    this.gameState.powerUpsEnabled = initial.powerUpsEnabled;

    // RNG for replay (executeAttack needs it for dice rolls — same seed reproduces results)
    this.rng = new SeededRandom(1);

    // Create renderers
    this.mapRenderer = new MapRenderer(this);
    this.diceRenderer = new DiceRenderer(this);
    this.uiRenderer = new UIRenderer(this);
    this.uiRenderer.setSpectatorMode(true);
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
    this.statusText.setText(`Turn 1 — ready to replay ${this.turns.length} turns`);

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

    if (key === 'N' && this.paused) {
      this.stepOneAction();
      return;
    }

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
    if (this.turnIndex >= this.turns.length) {
      this.statusText.setText('Replay complete!');
      return;
    }

    this.isProcessing = true;

    const turn = this.turns[this.turnIndex];
    if (this.actionIndex >= turn.actions.length) {
      this.turnIndex++;
      this.actionIndex = 0;
      this.isProcessing = false;

      if (this.turnIndex >= this.turns.length) {
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
    if (this.turnIndex >= this.turns.length) return;

    const turn = this.turns[this.turnIndex];
    if (this.actionIndex >= turn.actions.length) {
      this.turnIndex++;
      this.actionIndex = 0;
      if (this.turnIndex >= this.turns.length) {
        this.statusText.setText('Replay complete!');
        return;
      }
    }

    const action = this.turns[this.turnIndex].actions[this.actionIndex];
    this.executeAction(action);
    this.actionIndex++;
  }

  private async executeAction(action: GameAction): Promise<void> {
    const playerNames = this.gameState.players.map(p => p.name);
    const playerColors = this.gameState.players.map(p => p.color);

    // Use EventFormatter for log entries
    const formatted = formatAction(action, playerNames, playerColors);
    if (formatted) {
      this.eventLog.addEvent(formatted.text, formatted.color);
    }

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

        // Apply the recorded result directly instead of re-rolling
        const attacker = this.gameState.territories[action.attackerId];
        const defender = this.gameState.territories[action.defenderId];

        // Consume passive power-ups (charge/shield) as the real battle engine would
        if (attacker.powerUp === 'charge') attacker.powerUp = undefined;
        if (defender.powerUp === 'shield') defender.powerUp = undefined;

        if (action.result.attackerWins) {
          defender.owner = attacker.owner;
          defender.dice = attacker.dice - 1;
          attacker.dice = 1;
          // Check for elimination
          for (const p of this.gameState.players) {
            const owned = this.gameState.territories.filter(t => t.owner === p.id).length;
            if (owned === 0 && p.isAlive) {
              p.isAlive = false;
            }
          }
          // Check for game over
          const alive = this.gameState.players.filter(p => p.isAlive);
          if (alive.length === 1) {
            this.gameState.phase = 'gameOver';
            this.gameState.winner = alive[0].id;
          }
        } else {
          attacker.dice = 1;
        }

        if (this.speed !== 'instant') {
          this.territoryEffects.hideAttackLine();
        }

        this.refreshDisplay();
        const name = playerNames[action.attackerPlayerId] ?? '?';
        this.statusText.setText(`Turn ${this.turnIndex + 1} — ${name} attacks`);

        if (this.gameState.phase === 'gameOver') {
          this.statusText.setText('Replay complete — game over!');
        }
        break;
      }

      case 'endTurn': {
        // Disable power-up spawning — replay applies spawns from recorded powerUpSpawn actions
        const wasEnabled = this.gameState.powerUpsEnabled;
        this.gameState.powerUpsEnabled = false;
        endTurn(this.gameState, this.rng);
        this.gameState.powerUpsEnabled = wasEnabled;
        this.refreshDisplay();
        const nextName = this.gameState.players[this.gameState.currentPlayerIndex]?.name ?? '?';
        this.eventLog.addEvent(`Turn ${this.gameState.turnNumber} — ${nextName}'s turn`, 0xffffff);
        this.statusText.setText(`Turn ${this.gameState.turnNumber} — ${nextName}'s turn`);
        break;
      }

      case 'surrender': {
        distributeSurrenderedTerritories(this.gameState, action.playerId);
        this.refreshDisplay();
        break;
      }

      case 'elimination':
        break;

      case 'fortify': {
        useFortify(action.fromId, action.toId, action.diceCount, this.gameState);
        this.refreshDisplay();
        break;
      }

      case 'reinforce': {
        useReinforce(action.territoryId, this.gameState);
        this.refreshDisplay();
        break;
      }

      case 'powerUpSpawn': {
        this.gameState.territories[action.territoryId].powerUp = action.powerUpType;
        this.refreshDisplay();
        break;
      }
    }
  }

  private refreshDisplay(): void {
    this.mapRenderer.drawMap(this.gameState, null, [], []);
    this.diceRenderer.drawDiceStacks(this.gameState.territories);
    this.uiRenderer.update(this.gameState);
  }

  private delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }
}

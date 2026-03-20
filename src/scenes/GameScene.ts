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
} from '../game/GameRules';
import { executeAITurn } from '../game/AIPlayer';
import { SeededRandom } from '../utils/random';
import { MapRenderer } from '../rendering/MapRenderer';
import { DiceRenderer, createDiceTextures } from '../rendering/DiceRenderer';
import { UIRenderer } from '../rendering/UIRenderer';
import { PLAYER_COLORS, DEFAULT_TERRITORY_COUNT, DEFAULT_PLAYER_COUNT } from '../config';

export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private rng!: SeededRandom;
  private mapRenderer!: MapRenderer;
  private diceRenderer!: DiceRenderer;
  private uiRenderer!: UIRenderer;
  private isProcessing = false;

  constructor() {
    super('GameScene');
  }

  create(): void {
    // Generate dice textures
    createDiceTextures(this);

    // Initialize RNG
    this.rng = new SeededRandom(Date.now());

    // Generate map
    const { territories, adjacency } = generateMap(DEFAULT_TERRITORY_COUNT, this.rng);

    // Create players
    const players = [
      createPlayer(0, 'Player', true, PLAYER_COLORS[0]),
      createPlayer(1, 'AI Red', false, PLAYER_COLORS[1]),
      createPlayer(2, 'AI Green', false, PLAYER_COLORS[2]),
      createPlayer(3, 'AI Yellow', false, PLAYER_COLORS[3]),
    ];

    // Assign territories and dice
    assignTerritories(territories, DEFAULT_PLAYER_COUNT, this.rng);

    // Create game state
    this.gameState = createInitialGameState(territories, players, adjacency);

    // Create renderers
    this.mapRenderer = new MapRenderer(this);
    this.diceRenderer = new DiceRenderer(this);
    this.uiRenderer = new UIRenderer(this);

    // Setup UI callbacks
    this.uiRenderer.setEndTurnCallback(() => this.onEndTurn());

    // Setup territory click handler
    this.mapRenderer.createInteractiveZones(this.gameState, (id) =>
      this.onTerritoryClick(id)
    );

    // Initial render
    this.refreshDisplay();
    this.uiRenderer.setStatus('Select a territory to attack from');
  }

  private onTerritoryClick(territoryId: number): void {
    if (this.isProcessing) return;
    if (this.gameState.phase === 'gameOver') return;

    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    if (!currentPlayer.isHuman) return;

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

    if (!canAttackFrom(territoryId, this.gameState)) {
      this.uiRenderer.setStatus('Can\'t attack from there (need >1 die and an enemy neighbor)');
      return;
    }

    this.gameState.selectedTerritoryId = territoryId;
    this.gameState.phase = 'selectingDefender';
    this.refreshDisplay();
    this.uiRenderer.setStatus('Select an enemy territory to attack');
  }

  private handleDefenderSelection(territoryId: number): void {
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

    // Execute the attack
    this.isProcessing = true;
    const result = executeAttack(attackerId, territoryId, this.gameState, this.rng);

    const attacker = this.gameState.territories[attackerId];
    const defender = this.gameState.territories[territoryId];

    if (result.attackerWins) {
      this.uiRenderer.setStatus(
        `Victory! ${result.attackerTotal} vs ${result.defenderTotal} — Territory captured!`
      );
    } else {
      this.uiRenderer.setStatus(
        `Defeat! ${result.attackerTotal} vs ${result.defenderTotal} — Attack failed!`
      );
    }

    // Check for game over
    if (this.gameState.phase === 'gameOver') {
      this.time.delayedCall(1500, () => this.handleGameOver());
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

  private onEndTurn(): void {
    if (this.isProcessing) return;
    if (this.gameState.phase === 'gameOver') return;

    this.isProcessing = true;
    this.gameState.phase = 'selectingAttacker';
    this.gameState.selectedTerritoryId = null;

    endTurn(this.gameState, this.rng);
    this.refreshDisplay();

    if ((this.gameState.phase as string) === 'gameOver') {
      this.time.delayedCall(1000, () => this.handleGameOver());
      this.isProcessing = false;
      return;
    }

    // Process AI turns
    this.processAITurns();
  }

  private processAITurns(): void {
    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];

    if (!currentPlayer.isHuman && currentPlayer.isAlive) {
      this.uiRenderer.setStatus(`${currentPlayer.name} is thinking...`);
      this.refreshDisplay();

      this.time.delayedCall(800, () => {
        executeAITurn(this.gameState, this.rng);

        if ((this.gameState.phase as string) === 'gameOver') {
          this.refreshDisplay();
          this.time.delayedCall(1000, () => this.handleGameOver());
          this.isProcessing = false;
          return;
        }

        endTurn(this.gameState, this.rng);
        this.refreshDisplay();

        if ((this.gameState.phase as string) === 'gameOver') {
          this.time.delayedCall(1000, () => this.handleGameOver());
          this.isProcessing = false;
          return;
        }

        // Continue to next AI or back to human
        const nextPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
        if (!nextPlayer.isHuman && nextPlayer.isAlive) {
          this.time.delayedCall(500, () => this.processAITurns());
        } else {
          this.isProcessing = false;
          this.uiRenderer.setStatus('Your turn! Select a territory to attack from.');
          this.refreshDisplay();
        }
      });
    } else {
      this.isProcessing = false;
      this.uiRenderer.setStatus('Your turn! Select a territory to attack from.');
      this.refreshDisplay();
    }
  }

  private handleGameOver(): void {
    const winner = this.gameState.players.find(
      (p) => p.id === this.gameState.winner
    );
    this.scene.start('GameOverScene', {
      winnerName: winner?.name ?? 'Unknown',
      isVictory: winner?.isHuman ?? false,
    });
  }

  private refreshDisplay(): void {
    const selectedId = this.gameState.selectedTerritoryId;
    const validTargets = selectedId !== null
      ? getValidTargets(selectedId, this.gameState).map((t) => t.id)
      : [];
    const attackable = getAttackableTerritories(this.gameState).map((t) => t.id);

    this.mapRenderer.drawMap(this.gameState, selectedId, validTargets, attackable);
    this.diceRenderer.drawDiceStacks(this.gameState.territories);
    this.uiRenderer.update(this.gameState);
  }
}

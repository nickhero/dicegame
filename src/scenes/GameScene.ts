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
import { selectBestMove } from '../game/AIPlayer';
import { getRandomPersonality, PERSONALITIES } from '../game/AIPersonality';
import { SeededRandom } from '../utils/random';
import { MapRenderer } from '../rendering/MapRenderer';
import { DiceRenderer, createDiceTextures } from '../rendering/DiceRenderer';
import { UIRenderer } from '../rendering/UIRenderer';
import { BattleAnimator } from '../rendering/BattleAnimator';
import { EventLog } from '../rendering/EventLog';
import { PLAYER_COLORS, DEFAULT_TERRITORY_COUNT, DEFAULT_PLAYER_COUNT, GAME_WIDTH, GAME_HEIGHT } from '../config';

export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private rng!: SeededRandom;
  private mapRenderer!: MapRenderer;
  private diceRenderer!: DiceRenderer;
  private uiRenderer!: UIRenderer;
  private battleAnimator!: BattleAnimator;
  private eventLog!: EventLog;
  private isProcessing = false;
  private helpOverlay: Phaser.GameObjects.Container | null = null;
  private confirmDialog: Phaser.GameObjects.Container | null = null;
  private isDialogOpen = false;

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

    // Create players — assign random AI personalities
    const players = [
      createPlayer(0, 'Player', true, PLAYER_COLORS[0]),
      createPlayer(1, 'AI Red', false, PLAYER_COLORS[1], getRandomPersonality(this.rng)),
      createPlayer(2, 'AI Green', false, PLAYER_COLORS[2], getRandomPersonality(this.rng)),
      createPlayer(3, 'AI Yellow', false, PLAYER_COLORS[3], getRandomPersonality(this.rng)),
    ];

    // Assign territories and dice
    assignTerritories(territories, DEFAULT_PLAYER_COUNT, this.rng);

    // Create game state
    this.gameState = createInitialGameState(territories, players, adjacency);

    // Create renderers
    this.mapRenderer = new MapRenderer(this);
    this.diceRenderer = new DiceRenderer(this);
    this.uiRenderer = new UIRenderer(this);
    this.battleAnimator = new BattleAnimator(this);
    this.eventLog = new EventLog(this);

    // Setup UI callbacks
    this.uiRenderer.setEndTurnCallback(() => this.onEndTurn());

    // Setup territory click handler
    this.mapRenderer.createInteractiveZones(this.gameState, (id) =>
      this.onTerritoryClick(id)
    );

    // Setup keyboard shortcuts
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      this.handleKeyDown(event);
    });

    // Initial render
    this.refreshDisplay();
    this.uiRenderer.setStatus('Select a territory to attack from');
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const key = event.key.toUpperCase();

    // H / ? always toggles help overlay (even when it's open)
    if (key === 'H' || event.key === '?') {
      this.toggleHelpOverlay();
      return;
    }

    // Block all other shortcuts while a dialog is open
    if (this.isDialogOpen) return;

    // R — restart with confirmation
    if (key === 'R') {
      this.showConfirmDialog();
      return;
    }

    // Block gameplay shortcuts while processing
    if (this.isProcessing) return;
    if (this.gameState.phase === 'gameOver') return;

    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    if (!currentPlayer.isHuman) return;

    // E / Space — end turn
    if (key === 'E' || key === ' ') {
      event.preventDefault();
      this.onEndTurn();
      return;
    }

    // Escape — deselect territory
    if (key === 'ESCAPE') {
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
    const h = 300;

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
      ['Escape', 'Deselect territory'],
      ['R', 'Restart game'],
      ['H / ?', 'Toggle this help'],
    ];

    shortcuts.forEach(([key, desc], i) => {
      const y = -h / 2 + 75 + i * 40;
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

    // Execute the attack
    this.isProcessing = true;
    const result = executeAttack(attackerId, territoryId, this.gameState, this.rng);

    const outcome = result.attackerWins ? 'won' : 'lost';
    this.eventLog.addEvent(
      `Player attacked T${attackerId} → T${territoryId} (${outcome} ${result.attackerTotal} vs ${result.defenderTotal})`,
      PLAYER_COLORS[this.gameState.currentPlayerIndex]
    );

    // Check for eliminations after attack
    for (const p of this.gameState.players) {
      if (!p.isHuman && !p.isAlive) {
        const hasTerritories = this.gameState.territories.some((t) => t.owner === p.id);
        if (!hasTerritories) {
          this.eventLog.addEvent(`${p.name} was eliminated!`, 0xff4444);
        }
      }
    }

    // Show battle animation
    await this.battleAnimator.showBattle(
      result.attackerRolls,
      result.defenderRolls,
      attackerColor,
      defenderColor,
      result.attackerWins
    );

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

    // Track dice before endTurn to calculate bonus
    const playerIdx = this.gameState.currentPlayerIndex;
    const player = this.gameState.players[playerIdx];
    const diceBefore = this.gameState.territories
      .filter((t) => t.owner === player.id)
      .reduce((sum, t) => sum + t.dice, 0);

    endTurn(this.gameState, this.rng);

    const diceAfter = this.gameState.territories
      .filter((t) => t.owner === player.id)
      .reduce((sum, t) => sum + t.dice, 0);
    const bonus = diceAfter - diceBefore;
    if (bonus > 0) {
      this.eventLog.addEvent(
        `Player received ${bonus} bonus dice`,
        PLAYER_COLORS[playerIdx]
      );
    }

    this.eventLog.addEvent(
      `Turn ${this.gameState.turnNumber} — ${this.gameState.players[this.gameState.currentPlayerIndex].name}'s turn`,
      0xffffff
    );

    this.refreshDisplay();

    if ((this.gameState.phase as string) === 'gameOver') {
      this.time.delayedCall(1000, () => this.handleGameOver());
      this.isProcessing = false;
      return;
    }

    // Process AI turns
    this.processAITurns();
  }

  private async processAITurns(): Promise<void> {
    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];

    if (!currentPlayer.isHuman && currentPlayer.isAlive) {
      this.uiRenderer.setStatus(`${currentPlayer.name} is thinking...`);
      this.refreshDisplay();

      await this.delay(800);

      // Track state before AI attacks
      const aliveBeforeAI = new Set(
        this.gameState.players.filter((p) => p.isAlive).map((p) => p.id)
      );

      // Do AI attacks one by one with battle animation
      const personality = PERSONALITIES[currentPlayer.personality ?? 'balanced'];
      const maxAttacks = Math.min(personality.maxAttacksPerTurn, 50);
      let attackCount = 0;

      while (attackCount < maxAttacks) {
        const move = selectBestMove(this.gameState, this.rng);
        if (!move) break;
        if (!isValidAttack(move.attackerId, move.defenderId, this.gameState)) break;

        const attackerColor = PLAYER_COLORS[this.gameState.currentPlayerIndex];
        const defenderColor = PLAYER_COLORS[this.gameState.territories[move.defenderId].owner];

        const result = executeAttack(move.attackerId, move.defenderId, this.gameState, this.rng);
        this.refreshDisplay();

        const outcome = result.attackerWins ? 'won' : 'lost';
        this.eventLog.addEvent(
          `${currentPlayer.name} attacked T${move.attackerId} → T${move.defenderId} (${outcome} ${result.attackerTotal} vs ${result.defenderTotal})`,
          currentPlayer.color
        );

        await this.battleAnimator.showBattle(
          result.attackerRolls,
          result.defenderRolls,
          attackerColor,
          defenderColor,
          result.attackerWins,
          2
        );

        if (this.gameState.phase === 'gameOver') break;
        attackCount++;
      }

      if (attackCount === 0) {
        this.eventLog.addEvent(
          `${currentPlayer.name} ended without attacking`,
          currentPlayer.color
        );
      }

      // Check for eliminations
      for (const p of this.gameState.players) {
        if (aliveBeforeAI.has(p.id) && !p.isAlive) {
          this.eventLog.addEvent(`${p.name} was eliminated!`, 0xff4444);
        }
      }

      if ((this.gameState.phase as string) === 'gameOver') {
        this.refreshDisplay();
        this.time.delayedCall(1000, () => this.handleGameOver());
        this.isProcessing = false;
        return;
      }

      // Track dice before endTurn for AI bonus logging
      const aiDiceBefore = this.gameState.territories
        .filter((t) => t.owner === currentPlayer.id)
        .reduce((sum, t) => sum + t.dice, 0);

      endTurn(this.gameState, this.rng);

      const aiDiceAfter = this.gameState.territories
        .filter((t) => t.owner === currentPlayer.id)
        .reduce((sum, t) => sum + t.dice, 0);
      const aiBonus = aiDiceAfter - aiDiceBefore;
      if (aiBonus > 0) {
        this.eventLog.addEvent(
          `${currentPlayer.name} received ${aiBonus} bonus dice`,
          currentPlayer.color
        );
      }

      this.eventLog.addEvent(
        `Turn ${this.gameState.turnNumber} — ${this.gameState.players[this.gameState.currentPlayerIndex].name}'s turn`,
        0xffffff
      );

      this.refreshDisplay();

      if ((this.gameState.phase as string) === 'gameOver') {
        this.time.delayedCall(1000, () => this.handleGameOver());
        this.isProcessing = false;
        return;
      }

      // Continue to next AI or back to human
      const nextPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
      if (!nextPlayer.isHuman && nextPlayer.isAlive) {
        await this.delay(500);
        await this.processAITurns();
      } else {
        this.isProcessing = false;
        this.uiRenderer.setStatus('Your turn! Select a territory to attack from.');
        this.refreshDisplay();
      }
    } else {
      this.isProcessing = false;
      this.uiRenderer.setStatus('Your turn! Select a territory to attack from.');
      this.refreshDisplay();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
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

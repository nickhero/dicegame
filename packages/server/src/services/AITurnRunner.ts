import type { Namespace } from 'socket.io';
import type { ActiveGame } from './GameEngine';
import { GameEngine } from './GameEngine';
import { serializeFullState, filterStateForPlayer } from './FogFilter';
import {
  SERVER_TIMING,
  type SpeedMode,
  type AIActionPayload,
  selectBestMove,
  useAIPowerUps,
  shouldAISurrender,
  isValidAttack,
  getVisibleTerritories,
  tickAlliances,
  aiWouldAcceptProposal,
  formAlliance,
  wouldBreakAlliance,
  breakAlliance,
  PERSONALITIES,
  type PersonalityType,
  GameStats,
} from '@dicewars/shared';

const GAME_CLEANUP_DELAY_MS = 5 * 60 * 1000;
const MAX_ATTACKS_HARD_CAP = 50;

export class AITurnRunner {
  private runningGames = new Set<string>();

  constructor(
    private gameEngine: GameEngine,
    private gameNamespace: Namespace,
    private onGameEnd?: (gameId: string, game: ActiveGame) => void,
  ) {}

  /**
   * Main entry point — called after endTurn when next player is AI.
   * Processes sequential AI turns until a human player's turn is reached.
   */
  async runAITurns(gameId: string): Promise<void> {
    if (this.runningGames.has(gameId)) return;
    this.runningGames.add(gameId);

    try {
      const game = this.gameEngine.getGame(gameId);
      if (!game || game.status !== 'playing') return;

      const speed = (game.config.speed || 'normal') as SpeedMode;
      const timing = SERVER_TIMING[speed] || SERVER_TIMING.normal;

      while (game.status === 'playing' && game.aiPlayerIndices.has(game.state.currentPlayerIndex)) {
        const playerIndex = game.state.currentPlayerIndex;

        if (speed === 'instant') {
          await this.runInstantAITurn(gameId, game, playerIndex);
        } else {
          await this.runAnimatedAITurn(gameId, game, playerIndex, timing);
        }

        if (game.status !== 'playing') break;
      }
    } finally {
      this.runningGames.delete(gameId);
    }
  }

  /**
   * Run all-AI spectator game — same as runAITurns (the while-loop
   * naturally runs through all AI players without stopping).
   */
  async runSpectatorGame(gameId: string): Promise<void> {
    await this.runAITurns(gameId);
  }

  isRunning(gameId: string): boolean {
    return this.runningGames.has(gameId);
  }

  // ── Animated (normal / fast) ──────────────────────────────────────

  private async runAnimatedAITurn(
    gameId: string,
    game: ActiveGame,
    playerIndex: number,
    timing: (typeof SERVER_TIMING)[keyof typeof SERVER_TIMING],
  ): Promise<void> {
    const state = game.state;
    const player = state.players[playerIndex];
    if (!player.isAlive) return;

    // 1. Check surrender
    if (shouldAISurrender(state, playerIndex)) {
      this.emitAIAction(gameId, playerIndex, 'surrender', {});
      this.gameEngine.surrenderAI(gameId, playerIndex);

      this.emitStateUpdate(gameId, game);

      if (game.state.winner !== null) {
        this.emitGameOver(gameId, game.state.winner);
        return;
      }

      await this.delay(timing.surrenderDelay);

      // Advance turn past the surrendered player
      try {
        const endResult = this.gameEngine.endAITurn(gameId, playerIndex);
        this.emitTurnChanged(gameId, game, playerIndex, endResult);
        this.emitStateUpdate(gameId, game);
        await this.delay(timing.turnEndDelay);
      } catch {
        // Player may already be dead / turn advanced by surrender logic
      }
      return;
    }

    // 2. Alliance tick (at start of each AI turn when alliances enabled)
    if (game.config.alliances && state.allianceState) {
      this.processAllianceTick(gameId, game, playerIndex);
      await this.delay(timing.allianceDelay);
    }

    // 3. Power-ups
    if (state.powerUpsEnabled) {
      const results = useAIPowerUps(state);
      for (const result of results) {
        if (result.action) {
          this.emitAIAction(gameId, playerIndex, 'powerUp', { description: result.description });
        }
      }
      if (results.length > 0) {
        this.emitStateUpdate(gameId, game);
        await this.delay(timing.powerUpDelay);
      }
    }

    // 4. Attack loop
    const maxAttacks = this.getMaxAttacks(game, playerIndex);
    let attackCount = 0;

    while (attackCount < maxAttacks && game.status === 'playing') {
      const aiVisibleSet = game.config.fogOfWar
        ? getVisibleTerritories(state, playerIndex)
        : undefined;

      const move = selectBestMove(state, game.rng, undefined, aiVisibleSet);
      if (!move) break;
      if (!isValidAttack(move.attackerId, move.defenderId, state)) break;

      // Broadcast AI action intent
      this.emitAIAction(gameId, playerIndex, 'attack', {
        from: move.attackerId,
        to: move.defenderId,
      });

      try {
        // Handle alliance breaking
        const defenderOwner = state.territories[move.defenderId].owner;
        if (
          state.allianceState &&
          wouldBreakAlliance(state.allianceState, playerIndex, defenderOwner)
        ) {
          breakAlliance(state.allianceState, playerIndex, defenderOwner);
          this.emitAIAction(gameId, playerIndex, 'alliance', {
            type: 'broken',
            targetPlayerIndex: defenderOwner,
          });
        }

        const result = this.gameEngine.executeAIAttack(gameId, playerIndex, move.attackerId, move.defenderId);

        // Broadcast battle result
        this.gameNamespace.to(`game:${gameId}`).emit('game:battleResult', {
          attackerTerritoryId: move.attackerId,
          defenderTerritoryId: move.defenderId,
          attackerDice: result.result.attackerRolls,
          defenderDice: result.result.defenderRolls,
          attackerWins: result.result.attackerWins,
          attackerPlayerIndex: playerIndex,
          defenderPlayerIndex: defenderOwner,
        });

        await this.delay(timing.battleAnimDelay);

        this.emitStateUpdate(gameId, game);

        await this.delay(timing.attackDelay);

        if (result.gameOver) {
          this.emitGameOver(gameId, result.gameOver.winnerIndex);
          return;
        }

        attackCount++;
      } catch {
        break;
      }
    }

    // 5. End turn
    try {
      const endResult = this.gameEngine.endAITurn(gameId, playerIndex);

      this.emitTurnChanged(gameId, game, playerIndex, endResult);
      this.emitStateUpdate(gameId, game);

      await this.delay(timing.turnEndDelay);
    } catch (err) {
      console.error(`[AI] Failed to end turn for player ${playerIndex} in ${gameId}:`, err);
    }
  }

  // ── Instant mode ──────────────────────────────────────────────────

  private async runInstantAITurn(
    gameId: string,
    game: ActiveGame,
    playerIndex: number,
  ): Promise<void> {
    const state = game.state;
    const player = state.players[playerIndex];
    if (!player.isAlive) return;

    const actions: AIActionPayload[] = [];

    // 1. Check surrender
    if (shouldAISurrender(state, playerIndex)) {
      actions.push({ playerIndex, actionType: 'surrender', details: {} });
      this.gameEngine.surrenderAI(gameId, playerIndex);

      if (game.state.winner !== null) {
        this.emitInstantBatch(gameId, game, actions);
        this.emitGameOver(gameId, game.state.winner);
        return;
      }

      try {
        const endResult = this.gameEngine.endAITurn(gameId, playerIndex);
        actions.push({ playerIndex, actionType: 'endTurn', details: { bonusDice: endResult.bonusDice } });
      } catch {
        // Already advanced
      }

      this.emitInstantBatch(gameId, game, actions);
      return;
    }

    // 2. Alliance tick
    if (game.config.alliances && state.allianceState) {
      this.processAllianceTick(gameId, game, playerIndex);
    }

    // 3. Power-ups
    if (state.powerUpsEnabled) {
      const results = useAIPowerUps(state);
      for (const result of results) {
        if (result.action) {
          actions.push({ playerIndex, actionType: 'powerUp', details: { description: result.description } });
        }
      }
    }

    // 4. Attack loop
    const maxAttacks = this.getMaxAttacks(game, playerIndex);
    let attackCount = 0;

    while (attackCount < maxAttacks && game.status === 'playing') {
      const aiVisibleSet = game.config.fogOfWar
        ? getVisibleTerritories(state, playerIndex)
        : undefined;

      const move = selectBestMove(state, game.rng, undefined, aiVisibleSet);
      if (!move) break;
      if (!isValidAttack(move.attackerId, move.defenderId, state)) break;

      try {
        const defenderOwner = state.territories[move.defenderId].owner;
        if (
          state.allianceState &&
          wouldBreakAlliance(state.allianceState, playerIndex, defenderOwner)
        ) {
          breakAlliance(state.allianceState, playerIndex, defenderOwner);
        }

        const result = this.gameEngine.executeAIAttack(gameId, playerIndex, move.attackerId, move.defenderId);

        actions.push({
          playerIndex,
          actionType: 'attack',
          details: {
            from: move.attackerId,
            to: move.defenderId,
            attackerWins: result.result.attackerWins,
          },
        });

        if (result.gameOver) {
          this.emitInstantBatch(gameId, game, actions);
          this.emitGameOver(gameId, result.gameOver.winnerIndex);
          return;
        }

        attackCount++;
      } catch {
        break;
      }
    }

    // 5. End turn
    try {
      const endResult = this.gameEngine.endAITurn(gameId, playerIndex);
      actions.push({ playerIndex, actionType: 'endTurn', details: { bonusDice: endResult.bonusDice } });
    } catch {
      // End turn failed
    }

    this.emitInstantBatch(gameId, game, actions);
  }

  // ── Alliance processing ───────────────────────────────────────────

  private processAllianceTick(
    gameId: string,
    game: ActiveGame,
    _playerIndex: number,
  ): void {
    const state = game.state;
    if (!state.allianceState) return;

    const tickResult = tickAlliances(state.allianceState, state, game.rng);

    // Process AI responses to new proposals
    for (const proposal of tickResult.newProposals) {
      const targetPlayer = state.players[proposal.toPlayer];
      if (!targetPlayer.isHuman && targetPlayer.isAlive) {
        if (aiWouldAcceptProposal(state.allianceState, state, proposal)) {
          formAlliance(state.allianceState, proposal.fromPlayer, proposal.toPlayer, state.turnNumber);
          game.recorder.recordAction({
            type: 'allianceFormed',
            player1: proposal.fromPlayer,
            player2: proposal.toPlayer,
            duration: proposal.duration,
          });
        }
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private getMaxAttacks(game: ActiveGame, playerIndex: number): number {
    const player = game.state.players[playerIndex];
    const personalityType: PersonalityType = (player.personality ?? 'balanced') as PersonalityType;
    const personality = player.customPersonalityConfig ?? PERSONALITIES[personalityType];
    return Math.min(personality.maxAttacksPerTurn, MAX_ATTACKS_HARD_CAP);
  }

  private emitAIAction(
    gameId: string,
    playerIndex: number,
    actionType: AIActionPayload['actionType'],
    details: Record<string, unknown>,
  ): void {
    this.gameNamespace.to(`game:${gameId}`).emit('game:aiAction', {
      playerIndex,
      actionType,
      details,
    });
  }

  private emitStateUpdate(gameId: string, game: ActiveGame): void {
    for (const [, socket] of this.gameNamespace.sockets) {
      if (socket.rooms.has(`game:${gameId}`) && socket.data.userId) {
        const playerIndex = game.playerMap.get(socket.data.userId as string) ?? -1;
        const state = game.config.fogOfWar
          ? filterStateForPlayer(game, playerIndex)
          : serializeFullState(game);
        state.localPlayerIndex = playerIndex;
        socket.emit('game:stateUpdate', state);
      }
    }
  }

  private emitTurnChanged(
    gameId: string,
    game: ActiveGame,
    previousPlayerIndex: number,
    endResult: { bonusDice: number; nextPlayerIndex: number; powerUpSpawns?: Array<{ territoryId: number; type: string }> },
  ): void {
    this.gameNamespace.to(`game:${gameId}`).emit('game:turnChanged', {
      previousPlayerIndex,
      currentPlayerIndex: endResult.nextPlayerIndex,
      turnNumber: game.state.turnNumber,
      bonusDice: endResult.bonusDice,
      powerUpSpawns: endResult.powerUpSpawns?.map((s) => ({
        territoryId: s.territoryId,
        type: s.type,
      })),
    });
  }

  private emitGameOver(gameId: string, winnerIndex: number): void {
    const game = this.gameEngine.getGame(gameId);
    let stats: Record<string, unknown> = {};
    if (game) {
      try {
        game.recorder.endCurrentTurn();
        const recording = game.recorder.getRecording(
          game.state.winner,
          game.state.players[game.state.winner ?? -1]?.name ?? 'Unknown',
        );
        const summary = GameStats.computeFromRecording(recording);
        stats = GameStats.serializeStats(summary);
      } catch { /* fallback to empty stats */ }
    }
    this.gameNamespace.to(`game:${gameId}`).emit('game:gameOver', {
      winnerIndex,
      stats,
    });
    if (game && this.onGameEnd) {
      this.onGameEnd(gameId, game);
    }
    setTimeout(() => this.gameEngine.destroyGame(gameId), GAME_CLEANUP_DELAY_MS);
  }

  private emitInstantBatch(gameId: string, game: ActiveGame, actions: AIActionPayload[]): void {
    for (const [, socket] of this.gameNamespace.sockets) {
      if (socket.rooms.has(`game:${gameId}`) && socket.data.userId) {
        const playerIndex = game.playerMap.get(socket.data.userId as string) ?? -1;
        const finalState = game.config.fogOfWar
          ? filterStateForPlayer(game, playerIndex)
          : serializeFullState(game);
        finalState.localPlayerIndex = playerIndex;
        socket.emit('game:instantBatch', { actions, finalState });
      }
    }
  }

  private delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

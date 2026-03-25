import type { Namespace, Socket } from 'socket.io';
import type { GameErrorCode } from '@dicewars/shared';
import { GameEngine, GameEngineError } from '../services/GameEngine';
import type { ActiveGame } from '../services/GameEngine';
import { serializeGameState } from './serializeState';
import type { AITurnRunner } from '../services/AITurnRunner';
import type { TurnTimer } from '../services/TurnTimer';
import type { TurnTimerDuration } from '../services/TurnTimer';
import type { AppDatabase } from '../db/connection';
import { MatchHistoryService } from '../services/MatchHistoryService';
import { AchievementService } from '../services/AchievementService';

const GAME_CLEANUP_DELAY_MS = 5 * 60 * 1000;

const SPECTATOR_ERROR = { code: 'SPECTATOR_CANNOT_ACT' as GameErrorCode, message: 'Spectators cannot perform game actions' };

async function handleGameEnd(gameId: string, game: ActiveGame, db: AppDatabase) {
  try {
    const matchService = new MatchHistoryService(db);
    const achievementService = new AchievementService(db);

    const matchId = await matchService.saveMatch(gameId, game);

    // Check achievements for each human player
    for (const [userId, playerIndex] of game.playerMap) {
      if (!game.aiPlayerIndices.has(playerIndex)) {
        await achievementService.checkAndUnlock(userId, game, matchId);
      }
    }
  } catch (err) {
    console.error('[GameEnd] Failed to save match or check achievements:', err);
  }
}

export function setupGameActionHandlers(
  socket: Socket,
  gameNamespace: Namespace,
  gameEngine: GameEngine,
  db: AppDatabase,
  aiTurnRunner?: AITurnRunner,
  turnTimer?: TurnTimer,
): void {
  // Per-socket action rate limiting: max 10 actions per second
  const ACTION_RATE_LIMIT = 10;
  const ACTION_RATE_WINDOW_MS = 1000;
  let actionTimestamps: number[] = [];

  function isRateLimited(): boolean {
    const now = Date.now();
    actionTimestamps = actionTimestamps.filter(t => now - t < ACTION_RATE_WINDOW_MS);
    if (actionTimestamps.length >= ACTION_RATE_LIMIT) return true;
    actionTimestamps.push(now);
    return false;
  }

  const RATE_LIMITED_ERROR = { code: 'RATE_LIMITED' as GameErrorCode, message: 'Too many actions, slow down' };

  function getTurnDuration(gameId: string): TurnTimerDuration {
    const game = gameEngine.getGame(gameId);
    return (game?.config.turnTimerDuration ?? 0) as TurnTimerDuration;
  }

  function emitStateUpdate(gameId: string, game: ActiveGame) {
    const state = serializeGameState(game);
    if (turnTimer) {
      state.turnTimerRemaining = turnTimer.getRemainingSeconds(gameId);
    }
    gameNamespace.to(`game:${gameId}`).emit('game:stateUpdate', state);
  }

  // game:attack — Player attacks a territory
  socket.on('game:attack', ({ fromTerritoryId, toTerritoryId }, ack) => {
    if (isRateLimited()) {
      return ack({ success: false, error: RATE_LIMITED_ERROR });
    }
    if (socket.data.isSpectator) {
      return ack({ success: false, error: SPECTATOR_ERROR });
    }
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({ success: false, error: { code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode, message: 'Not in a game' } });
    }

    try {
      // Capture player indices before attack mutates ownership
      const game = gameEngine.getGame(gameId);
      const attackerPlayerIndex = game?.state.territories[fromTerritoryId]?.owner ?? -1;
      const defenderPlayerIndex = game?.state.territories[toTerritoryId]?.owner ?? -1;

      const result = gameEngine.executeAttack(gameId, socket.data.userId, fromTerritoryId, toTerritoryId);

      // Broadcast battle result to all players in the room
      gameNamespace.to(`game:${gameId}`).emit('game:battleResult', {
        attackerTerritoryId: fromTerritoryId,
        defenderTerritoryId: toTerritoryId,
        attackerDice: result.result.attackerRolls,
        defenderDice: result.result.defenderRolls,
        attackerWins: result.result.attackerWins,
        attackerPlayerIndex,
        defenderPlayerIndex,
      });

      // Broadcast updated state
      const updatedGame = gameEngine.getGame(gameId)!;
      emitStateUpdate(gameId, updatedGame);

      // Check game over
      if (result.gameOver) {
        if (turnTimer) turnTimer.destroyGame(gameId);
        gameNamespace.to(`game:${gameId}`).emit('game:gameOver', {
          winnerIndex: result.gameOver.winnerIndex,
          stats: {},
        });
        handleGameEnd(gameId, updatedGame, db);
        setTimeout(() => gameEngine.destroyGame(gameId), GAME_CLEANUP_DELAY_MS);
      }

      ack({ success: true, data: result });
    } catch (err) {
      ack({ success: false, error: toGameError(err) });
    }
  });

  // game:endTurn — End current turn
  socket.on('game:endTurn', (ack) => {
    if (isRateLimited()) {
      return ack({ success: false, error: RATE_LIMITED_ERROR });
    }
    if (socket.data.isSpectator) {
      return ack({ success: false, error: SPECTATOR_ERROR });
    }
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({ success: false, error: { code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode, message: 'Not in a game' } });
    }

    try {
      // Clear timer for the current player's manual turn end
      if (turnTimer) turnTimer.clearTimer(gameId);

      const result = gameEngine.endTurn(gameId, socket.data.userId);

      const game = gameEngine.getGame(gameId)!;
      const playerIndex = game.playerMap.get(socket.data.userId)!;

      // Broadcast turn change (playerIndex is the previous player since endTurn mutated state)
      gameNamespace.to(`game:${gameId}`).emit('game:turnChanged', {
        previousPlayerIndex: playerIndex,
        currentPlayerIndex: result.nextPlayerIndex,
        turnNumber: game.state.turnNumber,
        bonusDice: result.bonusDice,
        powerUpSpawns: result.powerUpSpawns?.map((s) => ({
          territoryId: s.territoryId,
          type: s.type,
        })),
      });

      // Start timer for the next human player's turn
      if (turnTimer && !game.aiPlayerIndices.has(result.nextPlayerIndex)) {
        turnTimer.startTimer(gameId, getTurnDuration(gameId));
      }

      // Broadcast updated state
      emitStateUpdate(gameId, game);

      // Trigger AI turns if next player is AI
      if (aiTurnRunner && game.aiPlayerIndices.has(result.nextPlayerIndex)) {
        aiTurnRunner.runAITurns(gameId);
      }

      ack({ success: true, data: result });
    } catch (err) {
      ack({ success: false, error: toGameError(err) });
    }
  });

  // game:usePowerUp — Use a power-up
  socket.on('game:usePowerUp', ({ type, targetTerritoryId, sourceTerritoryId }, ack) => {
    if (isRateLimited()) {
      return ack({ success: false, error: RATE_LIMITED_ERROR });
    }
    if (socket.data.isSpectator) {
      return ack({ success: false, error: SPECTATOR_ERROR });
    }
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({ success: false, error: { code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode, message: 'Not in a game' } });
    }

    try {
      gameEngine.usePowerUp(gameId, socket.data.userId, type, targetTerritoryId, sourceTerritoryId);

      const game = gameEngine.getGame(gameId)!;
      emitStateUpdate(gameId, game);

      ack({ success: true });
    } catch (err) {
      ack({ success: false, error: toGameError(err) });
    }
  });

  // game:surrender — not rate-limited (one-time critical action)
  socket.on('game:surrender', (ack) => {
    if (socket.data.isSpectator) {
      return ack({ success: false, error: SPECTATOR_ERROR });
    }
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({ success: false, error: { code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode, message: 'Not in a game' } });
    }

    try {
      const result = gameEngine.surrender(gameId, socket.data.userId);

      const game = gameEngine.getGame(gameId)!;
      emitStateUpdate(gameId, game);

      if (result.gameOver) {
        if (turnTimer) turnTimer.destroyGame(gameId);
        gameNamespace.to(`game:${gameId}`).emit('game:gameOver', {
          winnerIndex: result.gameOver.winnerIndex,
          stats: {},
        });
        handleGameEnd(gameId, game, db);
        setTimeout(() => gameEngine.destroyGame(gameId), GAME_CLEANUP_DELAY_MS);
      }

      ack({ success: true });
    } catch (err) {
      ack({ success: false, error: toGameError(err) });
    }
  });

  // game:undo
  socket.on('game:undo', (ack) => {
    if (isRateLimited()) {
      return ack({ success: false, error: RATE_LIMITED_ERROR });
    }
    if (socket.data.isSpectator) {
      return ack({ success: false, error: SPECTATOR_ERROR });
    }
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({ success: false, error: { code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode, message: 'Not in a game' } });
    }

    try {
      gameEngine.undo(gameId, socket.data.userId);

      const game = gameEngine.getGame(gameId)!;
      const state = serializeGameState(game);
      if (turnTimer) {
        state.turnTimerRemaining = turnTimer.getRemainingSeconds(gameId);
      }
      gameNamespace.to(`game:${gameId}`).emit('game:stateUpdate', state);

      ack({ success: true, data: state });
    } catch (err) {
      ack({ success: false, error: toGameError(err) });
    }
  });

  // game:proposeAlliance
  socket.on('game:proposeAlliance', ({ targetPlayerIndex }, ack) => {
    if (isRateLimited()) {
      return ack({ success: false, error: RATE_LIMITED_ERROR });
    }
    if (socket.data.isSpectator) {
      return ack({ success: false, error: SPECTATOR_ERROR });
    }
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({ success: false, error: { code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode, message: 'Not in a game' } });
    }

    try {
      gameEngine.proposeAlliance(gameId, socket.data.userId, targetPlayerIndex);

      const game = gameEngine.getGame(gameId)!;
      emitStateUpdate(gameId, game);

      ack({ success: true });
    } catch (err) {
      ack({ success: false, error: toGameError(err) });
    }
  });

  // game:respondAlliance
  socket.on('game:respondAlliance', ({ proposalId, accept }, ack) => {
    if (isRateLimited()) {
      return ack({ success: false, error: RATE_LIMITED_ERROR });
    }
    if (socket.data.isSpectator) {
      return ack({ success: false, error: SPECTATOR_ERROR });
    }
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({ success: false, error: { code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode, message: 'Not in a game' } });
    }

    try {
      // proposalId encodes the proposer's player index
      const proposerIndex = parseInt(proposalId, 10);
      if (isNaN(proposerIndex)) {
        return ack({ success: false, error: { code: 'GAME_ALLIANCE_PROPOSAL_NOT_FOUND' as GameErrorCode, message: 'Invalid proposal ID' } });
      }

      gameEngine.respondAlliance(gameId, socket.data.userId, proposerIndex, accept);

      const game = gameEngine.getGame(gameId)!;
      emitStateUpdate(gameId, game);

      ack({ success: true });
    } catch (err) {
      ack({ success: false, error: toGameError(err) });
    }
  });
}

function toGameError(err: unknown): { code: GameErrorCode; message: string } {
  if (err instanceof GameEngineError) {
    return { code: err.code, message: err.message };
  }
  return { code: 'INTERNAL_ERROR' as GameErrorCode, message: 'An unexpected error occurred' };
}

import type { Namespace, Socket } from 'socket.io';
import type { GameErrorCode } from '@dicewars/shared';
import { GameEngine, GameEngineError } from '../services/GameEngine';
import { serializeGameState } from './serializeState';
import type { AITurnRunner } from '../services/AITurnRunner';

const GAME_CLEANUP_DELAY_MS = 5 * 60 * 1000;

export function setupGameActionHandlers(
  socket: Socket,
  gameNamespace: Namespace,
  gameEngine: GameEngine,
  aiTurnRunner?: AITurnRunner,
): void {
  // game:attack — Player attacks a territory
  socket.on('game:attack', ({ fromTerritoryId, toTerritoryId }, ack) => {
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
      gameNamespace.to(`game:${gameId}`).emit('game:stateUpdate', serializeGameState(updatedGame));

      // Check game over
      if (result.gameOver) {
        gameNamespace.to(`game:${gameId}`).emit('game:gameOver', {
          winnerIndex: result.gameOver.winnerIndex,
          stats: {},
        });
        setTimeout(() => gameEngine.destroyGame(gameId), GAME_CLEANUP_DELAY_MS);
      }

      ack({ success: true, data: result });
    } catch (err) {
      ack({ success: false, error: toGameError(err) });
    }
  });

  // game:endTurn — End current turn
  socket.on('game:endTurn', (ack) => {
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({ success: false, error: { code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode, message: 'Not in a game' } });
    }

    try {
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

      // Broadcast updated state
      gameNamespace.to(`game:${gameId}`).emit('game:stateUpdate', serializeGameState(game));

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
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({ success: false, error: { code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode, message: 'Not in a game' } });
    }

    try {
      gameEngine.usePowerUp(gameId, socket.data.userId, type, targetTerritoryId, sourceTerritoryId);

      const game = gameEngine.getGame(gameId)!;
      gameNamespace.to(`game:${gameId}`).emit('game:stateUpdate', serializeGameState(game));

      ack({ success: true });
    } catch (err) {
      ack({ success: false, error: toGameError(err) });
    }
  });

  // game:surrender
  socket.on('game:surrender', (ack) => {
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({ success: false, error: { code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode, message: 'Not in a game' } });
    }

    try {
      const result = gameEngine.surrender(gameId, socket.data.userId);

      const game = gameEngine.getGame(gameId)!;
      gameNamespace.to(`game:${gameId}`).emit('game:stateUpdate', serializeGameState(game));

      if (result.gameOver) {
        gameNamespace.to(`game:${gameId}`).emit('game:gameOver', {
          winnerIndex: result.gameOver.winnerIndex,
          stats: {},
        });
        setTimeout(() => gameEngine.destroyGame(gameId), GAME_CLEANUP_DELAY_MS);
      }

      ack({ success: true });
    } catch (err) {
      ack({ success: false, error: toGameError(err) });
    }
  });

  // game:undo
  socket.on('game:undo', (ack) => {
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({ success: false, error: { code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode, message: 'Not in a game' } });
    }

    try {
      gameEngine.undo(gameId, socket.data.userId);

      const game = gameEngine.getGame(gameId)!;
      const state = serializeGameState(game);
      gameNamespace.to(`game:${gameId}`).emit('game:stateUpdate', state);

      ack({ success: true, data: state });
    } catch (err) {
      ack({ success: false, error: toGameError(err) });
    }
  });

  // game:proposeAlliance
  socket.on('game:proposeAlliance', ({ targetPlayerIndex }, ack) => {
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({ success: false, error: { code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode, message: 'Not in a game' } });
    }

    try {
      gameEngine.proposeAlliance(gameId, socket.data.userId, targetPlayerIndex);

      const game = gameEngine.getGame(gameId)!;
      gameNamespace.to(`game:${gameId}`).emit('game:stateUpdate', serializeGameState(game));

      ack({ success: true });
    } catch (err) {
      ack({ success: false, error: toGameError(err) });
    }
  });

  // game:respondAlliance
  socket.on('game:respondAlliance', ({ proposalId, accept }, ack) => {
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
      gameNamespace.to(`game:${gameId}`).emit('game:stateUpdate', serializeGameState(game));

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

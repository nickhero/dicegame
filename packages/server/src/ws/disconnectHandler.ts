import type { Namespace, Socket } from 'socket.io';
import type { GameEngine } from '../services/GameEngine';
import { serializeGameState } from './serializeState';
import type { GameErrorCode } from '@dicewars/shared';

// Track grace periods: `${gameId}:${userId}` → timer
const gracePeriods = new Map<string, NodeJS.Timeout>();

const GRACE_PERIOD_MS = 60_000; // 60 seconds

export function setupDisconnectHandler(
  socket: Socket,
  gameNamespace: Namespace,
  gameEngine: GameEngine,
): void {
  socket.on('disconnect', () => {
    const gameId = socket.data.gameId;
    const userId = socket.data.userId;
    if (!gameId || !userId) return;

    const game = gameEngine.getGame(gameId);
    if (!game || game.status !== 'playing') return;

    const playerIndex = game.playerMap.get(userId);
    if (playerIndex === undefined) return;

    // AI players don't need a grace period
    if (game.aiPlayerIndices.has(playerIndex)) return;

    console.log(
      `[Game] Player ${playerIndex} disconnected from ${gameId}, starting grace period`,
    );

    // Record disconnect time
    game.disconnectedPlayers.set(userId, Date.now());

    // Notify room
    gameNamespace.to(`game:${gameId}`).emit('game:playerDisconnected', {
      playerIndex,
      graceSeconds: GRACE_PERIOD_MS / 1000,
    });

    // Start grace timer
    const key = `${gameId}:${userId}`;
    const timer = setTimeout(() => {
      gracePeriods.delete(key);
      convertToAI(gameId, userId, playerIndex, gameEngine, gameNamespace);
    }, GRACE_PERIOD_MS);

    gracePeriods.set(key, timer);
  });
}

export function setupReconnectHandler(
  socket: Socket,
  gameNamespace: Namespace,
  gameEngine: GameEngine,
): void {
  socket.on('game:reconnect', async ({ gameId }, ack) => {
    const userId = socket.data.userId;
    const game = gameEngine.getGame(gameId);

    if (!game) {
      return ack({
        success: false,
        error: {
          code: 'GAME_NOT_FOUND' as GameErrorCode,
          message: 'Game not found',
        },
      });
    }

    const playerIndex = game.playerMap.get(userId);
    if (playerIndex === undefined) {
      return ack({
        success: false,
        error: {
          code: 'CONNECTION_NOT_IN_GAME' as GameErrorCode,
          message: 'Not in this game',
        },
      });
    }

    // Cancel grace timer
    const key = `${gameId}:${userId}`;
    const timer = gracePeriods.get(key);
    if (timer) {
      clearTimeout(timer);
      gracePeriods.delete(key);
    }

    // Clear disconnect record
    game.disconnectedPlayers.delete(userId);

    // If player was converted to AI, convert back to human
    if (game.aiPlayerIndices.has(playerIndex)) {
      game.aiPlayerIndices.delete(playerIndex);
      game.state.players[playerIndex].isHuman = true;
    }

    // Join socket room
    socket.join(`game:${gameId}`);
    socket.data.gameId = gameId;

    // Notify room
    gameNamespace.to(`game:${gameId}`).emit('game:playerReconnected', {
      playerIndex,
    });

    // Send current state
    const state = serializeGameState(game);
    ack({ success: true, data: state });
  });
}

function convertToAI(
  gameId: string,
  userId: string,
  playerIndex: number,
  gameEngine: GameEngine,
  gameNamespace: Namespace,
): void {
  const game = gameEngine.getGame(gameId);
  if (!game || game.status !== 'playing') return;

  console.log(`[Game] Converting player ${playerIndex} to AI in ${gameId}`);

  // Mark as AI
  game.aiPlayerIndices.add(playerIndex);
  game.state.players[playerIndex].isHuman = false;
  game.disconnectedPlayers.delete(userId);

  // Notify room
  gameNamespace
    .to(`game:${gameId}`)
    .emit('game:playerConvertedToAI' as never, { playerIndex } as never);

  // Broadcast updated state
  gameNamespace
    .to(`game:${gameId}`)
    .emit('game:stateUpdate', serializeGameState(game));

  // If it's this player's turn, signal AI turn needed
  if (game.state.currentPlayerIndex === playerIndex) {
    gameNamespace.emit('_internal:aiTurnNeeded' as never, {
      gameId,
      playerIndex,
    } as never);
  }
}

/** Clean up all grace period timers for a game (e.g. when game ends). */
export function clearGameGracePeriods(gameId: string): void {
  for (const [key, timer] of gracePeriods.entries()) {
    if (key.startsWith(`${gameId}:`)) {
      clearTimeout(timer);
      gracePeriods.delete(key);
    }
  }
}

/** Exposed for testing — reset all grace periods. */
export function _resetGracePeriods(): void {
  for (const timer of gracePeriods.values()) {
    clearTimeout(timer);
  }
  gracePeriods.clear();
}

/** Exposed for testing — access the grace periods map. */
export function _getGracePeriods(): Map<string, NodeJS.Timeout> {
  return gracePeriods;
}

export { GRACE_PERIOD_MS };

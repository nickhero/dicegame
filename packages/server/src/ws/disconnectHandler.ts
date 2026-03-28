import type { Namespace, Socket } from 'socket.io';
import type { GameEngine } from '../services/GameEngine';
import { serializeGameState } from './serializeState';
import type { GameErrorCode } from '@dicewars/shared';
import { decrementSpectators } from './spectatorHandlers';
import { LobbyService } from '../services/LobbyService';
import { getDb } from '../db/connection';
import { gamePlayers } from '../db/schema';
import { eq } from 'drizzle-orm';
import { _getWaitingRooms } from './waitingRoom';
import { lobbyBroadcaster } from './lobbyBroadcaster';

// Track grace periods: `${gameId}:${userId}` → timer
const gracePeriods = new Map<string, NodeJS.Timeout>();

const GRACE_PERIOD_MS = 60_000; // 60 seconds

export function setupDisconnectHandler(
  socket: Socket,
  gameNamespace: Namespace,
  gameEngine: GameEngine,
  aiTurnRunner?: import('../services/AITurnRunner').AITurnRunner,
): void {
  socket.on('disconnect', () => {
    const gameId = socket.data.gameId;
    const userId = socket.data.userId;
    if (!gameId || !userId) return;

    // Spectators disconnect cleanly — no grace period needed
    if (socket.data.isSpectator) {
      const count = decrementSpectators(gameId);
      gameNamespace.to(`game:${gameId}`).emit('game:spectatorCount', { count });
      return;
    }

    const game = gameEngine.getGame(gameId);

    // If no active game engine, this is a waiting room disconnect
    if (!game || game.status !== 'playing') {
      handleWaitingRoomDisconnect(socket, gameId, userId, gameNamespace);
      return;
    }

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
    const existing = gracePeriods.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      gracePeriods.delete(key);
      convertToAI(gameId, userId, playerIndex, gameEngine, gameNamespace, aiTurnRunner);
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

/** Remove a player from a waiting room when their socket disconnects. */
async function handleWaitingRoomDisconnect(
  socket: Socket,
  gameId: string,
  userId: string,
  gameNamespace: Namespace,
): Promise<void> {
  const db = getDb();

  const playerRows = db
    .select()
    .from(gamePlayers)
    .where(eq(gamePlayers.gameId, gameId))
    .all();
  const mySlot = playerRows.find((p) => p.userId === userId);
  if (!mySlot) return;

  console.log(
    `[WaitingRoom] Player ${mySlot.slotIndex} (${socket.data.userName}) disconnected from waiting room ${gameId}`,
  );

  try {
    const lobbyService = new LobbyService(db);
    await lobbyService.leaveGame(gameId, userId);

    // Clean up ephemeral ready state
    const waitingRooms = _getWaitingRooms();
    const room = waitingRooms.get(gameId);
    if (room) {
      room.readyPlayers.delete(userId);
    }

    // Notify remaining players
    gameNamespace.to(`game:${gameId}`).emit('game:playerLeft', {
      playerIndex: mySlot.slotIndex,
    });

    // Update lobby player count
    const updatedGame = await lobbyService.getGame(gameId);
    if (updatedGame) {
      lobbyBroadcaster.broadcastPlayerCount(gameId, updatedGame.playerCount);
    }
  } catch (err) {
    console.error(`[WaitingRoom] Failed to clean up disconnected player:`, err);
  }
}

function convertToAI(
  gameId: string,
  userId: string,
  playerIndex: number,
  gameEngine: GameEngine,
  gameNamespace: Namespace,
  aiTurnRunner?: import('../services/AITurnRunner').AITurnRunner,
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

  // If it's this player's turn, trigger AI turn directly
  if (game.state.currentPlayerIndex === playerIndex && aiTurnRunner) {
    aiTurnRunner.runAITurns(gameId).catch((err) => {
      console.error(`[AI] runAITurns failed for ${gameId}:`, err);
    });
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

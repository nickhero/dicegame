import type { Namespace, Socket } from 'socket.io';
import { eq, and } from 'drizzle-orm';
import { GameErrorCode } from '@dicewars/shared';
import { GameEngine } from '../services/GameEngine';
import { serializeFullState } from '../services/FogFilter';
import { gamePlayers } from '../db/schema';
import type { AppDatabase } from '../db/connection';

// Track spectator counts per game (avoids fetchSockets race conditions)
const spectatorCounts = new Map<string, number>();

export function getSpectatorCount(gameId: string): number {
  return spectatorCounts.get(gameId) ?? 0;
}

function incrementSpectators(gameId: string): number {
  const count = (spectatorCounts.get(gameId) ?? 0) + 1;
  spectatorCounts.set(gameId, count);
  return count;
}

export function decrementSpectators(gameId: string): number {
  const count = Math.max(0, (spectatorCounts.get(gameId) ?? 0) - 1);
  if (count === 0) spectatorCounts.delete(gameId);
  else spectatorCounts.set(gameId, count);
  return count;
}

/** Exposed for testing — reset spectator counts. */
export function _resetSpectatorCounts(): void {
  spectatorCounts.clear();
}

export function setupSpectatorHandlers(
  socket: Socket,
  gameNamespace: Namespace,
  gameEngine: GameEngine,
  db: AppDatabase,
): void {
  // game:spectate — Join a game as spectator
  socket.on('game:spectate', async ({ gameId }, ack) => {
    try {
      // Check if game exists in GameEngine (active game)
      const activeGame = gameEngine.getGame(gameId);

      if (!activeGame) {
        // Check if game exists in DB (waiting room phase)
        const rows = db
          .select()
          .from(gamePlayers)
          .where(eq(gamePlayers.gameId, gameId))
          .all();

        if (rows.length === 0) {
          return ack({
            success: false,
            error: { code: GameErrorCode.GAME_NOT_FOUND, message: 'Game not found' },
          });
        }
      }

      // Join socket to the game room
      socket.join(`game:${gameId}`);
      socket.data.gameId = gameId;
      socket.data.isSpectator = true;

      // If game is active, send current full state
      if (activeGame) {
        socket.emit('game:stateUpdate', serializeFullState(activeGame));
      }

      // Add spectator to gamePlayers table
      const existingRow = db
        .select()
        .from(gamePlayers)
        .where(
          and(
            eq(gamePlayers.gameId, gameId),
            eq(gamePlayers.userId, socket.data.userId),
            eq(gamePlayers.isSpectator, true),
          ),
        )
        .all();

      if (existingRow.length === 0) {
        const id = `sp_${socket.data.userId}_${gameId}_${Date.now()}`;
        db.insert(gamePlayers)
          .values({
            id,
            gameId,
            userId: socket.data.userId,
            slotIndex: -1,
            isAI: false,
            isSpectator: true,
            joinedAt: new Date().toISOString(),
          })
          .run();
      }

      // Broadcast spectator count
      const count = incrementSpectators(gameId);
      gameNamespace.to(`game:${gameId}`).emit('game:spectatorCount', { count });

      ack({ success: true });
    } catch {
      ack({
        success: false,
        error: { code: GameErrorCode.INTERNAL_ERROR, message: 'Failed to join as spectator' },
      });
    }
  });

  // game:leaveSpectate — Leave spectating
  socket.on('game:leaveSpectate', async (ack) => {
    const gameId = socket.data.gameId;
    if (!gameId || !socket.data.isSpectator) {
      return ack({
        success: false,
        error: { code: GameErrorCode.CONNECTION_NOT_IN_GAME, message: 'Not spectating a game' },
      });
    }

    socket.leave(`game:${gameId}`);
    socket.data.gameId = undefined;
    socket.data.isSpectator = undefined;

    // Broadcast updated spectator count
    const count = decrementSpectators(gameId);
    gameNamespace.to(`game:${gameId}`).emit('game:spectatorCount', { count });

    ack({ success: true });
  });
}

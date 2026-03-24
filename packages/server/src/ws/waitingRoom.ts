import { Namespace, Socket } from 'socket.io';
import { eq } from 'drizzle-orm';
import { LobbyService } from '../services/LobbyService';
import { GameEngine, type PlayerSlot } from '../services/GameEngine';
import { serializeFullState } from '../services/FogFilter';
import { getDb, type AppDatabase } from '../db/connection';
import { gamePlayers, users } from '../db/schema';
import { lobbyBroadcaster } from './lobbyBroadcaster';
import { PLAYER_COLORS, GameErrorCode } from '@dicewars/shared';
import type { AITurnRunner } from '../services/AITurnRunner';

interface WaitingRoomState {
  readyPlayers: Set<string>;
}

const waitingRooms = new Map<string, WaitingRoomState>();

/** Exposed for testing – reset ephemeral state between test runs. */
export function _resetWaitingRooms() {
  waitingRooms.clear();
}

export function setupWaitingRoomHandlers(
  socket: Socket,
  gameNamespace: Namespace,
  gameEngine: GameEngine,
  db?: AppDatabase,
  aiTurnRunner?: AITurnRunner,
) {
  const database = db ?? getDb();

  // game:join — Player joins a game's waiting room
  socket.on('game:join', async ({ gameId }: { gameId: string }, ack) => {
    try {
      const lobbyService = new LobbyService(database);
      const game = await lobbyService.getGame(gameId);

      if (!game) {
        return ack({
          success: false,
          error: { code: GameErrorCode.LOBBY_GAME_NOT_FOUND, message: 'Game not found' },
        });
      }

      socket.join(`game:${gameId}`);
      socket.data.gameId = gameId;

      if (!waitingRooms.has(gameId)) {
        waitingRooms.set(gameId, { readyPlayers: new Set() });
      }

      // Find this player's slot
      const playerRows = database
        .select()
        .from(gamePlayers)
        .where(eq(gamePlayers.gameId, gameId))
        .all();

      const mySlot = playerRows.find((p) => p.userId === socket.data.userId);

      if (mySlot) {
        socket.to(`game:${gameId}`).emit('game:playerJoined', {
          playerIndex: mySlot.slotIndex,
          name: socket.data.userName,
          isAI: false,
        });
      }

      ack({
        success: true,
        data: {
          game,
          readyPlayers: [...waitingRooms.get(gameId)!.readyPlayers],
        },
      });
    } catch {
      ack({
        success: false,
        error: { code: GameErrorCode.INTERNAL_ERROR, message: 'Failed to join' },
      });
    }
  });

  // game:ready — Toggle ready state
  socket.on('game:ready', (ack) => {
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({
        success: false,
        error: { code: GameErrorCode.CONNECTION_NOT_IN_GAME, message: 'Not in a game' },
      });
    }

    const room = waitingRooms.get(gameId);
    if (!room) {
      return ack({
        success: false,
        error: { code: GameErrorCode.GAME_NOT_FOUND, message: 'Waiting room not found' },
      });
    }

    const userId = socket.data.userId;
    if (room.readyPlayers.has(userId)) {
      room.readyPlayers.delete(userId);
    } else {
      room.readyPlayers.add(userId);
    }

    gameNamespace.to(`game:${gameId}`).emit('game:readyState', {
      userId,
      ready: room.readyPlayers.has(userId),
      readyPlayers: [...room.readyPlayers],
    });

    ack({ success: true });
  });

  // game:start — Creator starts the game
  socket.on('game:start', async ({ gameId }: { gameId: string }, ack) => {
    try {
      const lobbyService = new LobbyService(database);

      // Validates creator + status, updates DB to 'started'
      await lobbyService.startGame(gameId, socket.data.userId);

      // Build player slots from DB
      const playerRows = database
        .select()
        .from(gamePlayers)
        .where(eq(gamePlayers.gameId, gameId))
        .all();
      playerRows.sort((a, b) => a.slotIndex - b.slotIndex);

      const playerSlots: PlayerSlot[] = playerRows.map((row) => {
        let name = 'AI';
        if (!row.isAI && row.userId) {
          const userRow = database
            .select()
            .from(users)
            .where(eq(users.id, row.userId))
            .all();
          name = userRow[0]?.displayName ?? 'Unknown';
        } else if (row.isAI) {
          name = `AI ${row.slotIndex + 1}`;
        }
        return {
          userId: row.userId ?? undefined,
          name,
          isAI: row.isAI,
          aiPersonality: row.aiPersonality ?? undefined,
          color: PLAYER_COLORS[row.slotIndex % PLAYER_COLORS.length],
        };
      });

      // Retrieve the room config
      const game = await lobbyService.getGame(gameId);
      const roomConfig = game!.config;
      const serverConfig = {
        playerCount: playerSlots.length,
        territoryCount: roomConfig.territoryCount,
        mapShape: roomConfig.mapShape,
        gridType: roomConfig.gridType,
        speed: 'normal',
        powerUps: roomConfig.powerUps,
        fogOfWar: roomConfig.fogOfWar,
        alliances: roomConfig.alliances,
        undoEnabled: false,
      };

      const activeGame = gameEngine.createGame(gameId, serverConfig, playerSlots);
      const wireState = serializeFullState(activeGame);

      gameNamespace.to(`game:${gameId}`).emit('game:stateUpdate', wireState);
      lobbyBroadcaster.broadcastGameRemoved(gameId);
      waitingRooms.delete(gameId);

      // If first player is AI, start AI turns
      if (aiTurnRunner && activeGame.aiPlayerIndices.has(activeGame.state.currentPlayerIndex)) {
        aiTurnRunner.runAITurns(gameId);
      }

      ack({ success: true });
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      ack({
        success: false,
        error: {
          code: error.code || GameErrorCode.INTERNAL_ERROR,
          message: error.message || 'Failed to start game',
        },
      });
    }
  });

  // game:leave — Player leaves the waiting room
  socket.on('game:leave', async (ack) => {
    const gameId = socket.data.gameId;
    if (!gameId) {
      return ack({
        success: false,
        error: { code: GameErrorCode.CONNECTION_NOT_IN_GAME, message: 'Not in a game' },
      });
    }

    try {
      const lobbyService = new LobbyService(database);

      // Find the player's slot before removing
      const playerRows = database
        .select()
        .from(gamePlayers)
        .where(eq(gamePlayers.gameId, gameId))
        .all();
      const mySlot = playerRows.find((p) => p.userId === socket.data.userId);

      await lobbyService.leaveGame(gameId, socket.data.userId);

      socket.leave(`game:${gameId}`);
      socket.data.gameId = undefined;

      if (mySlot) {
        socket.to(`game:${gameId}`).emit('game:playerLeft', {
          playerIndex: mySlot.slotIndex,
        });
      }

      // Clean up ready state
      const room = waitingRooms.get(gameId);
      if (room) {
        room.readyPlayers.delete(socket.data.userId);
      }

      // Get updated player count
      const updatedGame = await lobbyService.getGame(gameId);
      if (updatedGame) {
        lobbyBroadcaster.broadcastPlayerCount(gameId, updatedGame.playerCount);
      }

      ack({ success: true });
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      ack({
        success: false,
        error: {
          code: error.code || GameErrorCode.INTERNAL_ERROR,
          message: error.message || 'Failed to leave game',
        },
      });
    }
  });

  // Handle disconnection from waiting room
  socket.on('disconnect', () => {
    const gameId = socket.data.gameId;
    if (gameId) {
      const room = waitingRooms.get(gameId);
      if (room) {
        room.readyPlayers.delete(socket.data.userId);
      }
    }
  });
}

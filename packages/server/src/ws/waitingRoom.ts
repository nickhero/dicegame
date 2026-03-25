import { Namespace, Socket } from 'socket.io';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { LobbyService } from '../services/LobbyService';
import { GameEngine, type PlayerSlot } from '../services/GameEngine';
import { serializeFullState } from '../services/FogFilter';
import { getDb, type AppDatabase } from '../db/connection';
import { gamePlayers, gameRooms, users } from '../db/schema';
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
        speed: roomConfig.speed || 'normal',
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

      // If ALL players are AI, creator becomes a spectator
      if (activeGame.aiPlayerIndices.size === activeGame.state.players.length) {
        socket.data.isSpectator = true;
        if (aiTurnRunner) {
          aiTurnRunner.runAITurns(gameId);
        }
      } else if (aiTurnRunner && activeGame.aiPlayerIndices.has(activeGame.state.currentPlayerIndex)) {
        // If first player is AI, start AI turns
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

  // game:addAI — Creator adds an AI player to an empty slot
  socket.on(
    'game:addAI',
    async (
      { gameId, slotIndex, personality }: { gameId: string; slotIndex: number; personality: string },
      ack,
    ) => {
      try {
        const rooms = database.select().from(gameRooms).where(eq(gameRooms.id, gameId)).all();
        if (rooms.length === 0) {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_GAME_NOT_FOUND, message: 'Game not found' },
          });
        }
        const room = rooms[0];

        if (room.creatorId !== socket.data.userId) {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_NOT_CREATOR, message: 'Only the creator can manage slots' },
          });
        }

        if (room.status !== 'waiting') {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_GAME_STARTED, message: 'Game is not in waiting status' },
          });
        }

        if (slotIndex < 0 || slotIndex >= room.maxPlayers) {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_INVALID_CONFIG, message: 'Invalid slot index' },
          });
        }

        const playerRows = database
          .select()
          .from(gamePlayers)
          .where(eq(gamePlayers.gameId, gameId))
          .all();

        const existingSlot = playerRows.find((p) => p.slotIndex === slotIndex);
        if (existingSlot) {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_GAME_FULL, message: 'Slot is not empty' },
          });
        }

        const id = nanoid();
        const now = new Date().toISOString();
        database
          .insert(gamePlayers)
          .values({
            id,
            gameId,
            userId: null,
            slotIndex,
            isAI: true,
            aiPersonality: personality,
            isSpectator: false,
            joinedAt: now,
          })
          .run();

        // Update player count
        database
          .update(gameRooms)
          .set({ currentPlayerCount: playerRows.length + 1 })
          .where(eq(gameRooms.id, gameId))
          .run();

        const updatedPlayers = database
          .select()
          .from(gamePlayers)
          .where(eq(gamePlayers.gameId, gameId))
          .all();

        gameNamespace.to(`game:${gameId}`).emit('game:playerJoined', {
          playerIndex: slotIndex,
          name: `AI ${slotIndex + 1}`,
          isAI: true,
          personality,
        });

        ack({ success: true, data: { players: updatedPlayers } });
      } catch {
        ack({
          success: false,
          error: { code: GameErrorCode.INTERNAL_ERROR, message: 'Failed to add AI' },
        });
      }
    },
  );

  // game:removeAI — Creator removes an AI player
  socket.on(
    'game:removeAI',
    async ({ gameId, slotIndex }: { gameId: string; slotIndex: number }, ack) => {
      try {
        const rooms = database.select().from(gameRooms).where(eq(gameRooms.id, gameId)).all();
        if (rooms.length === 0) {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_GAME_NOT_FOUND, message: 'Game not found' },
          });
        }
        const room = rooms[0];

        if (room.creatorId !== socket.data.userId) {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_NOT_CREATOR, message: 'Only the creator can manage slots' },
          });
        }

        if (room.status !== 'waiting') {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_GAME_STARTED, message: 'Game is not in waiting status' },
          });
        }

        const playerRows = database
          .select()
          .from(gamePlayers)
          .where(eq(gamePlayers.gameId, gameId))
          .all();

        const slot = playerRows.find((p) => p.slotIndex === slotIndex);
        if (!slot) {
          return ack({
            success: false,
            error: { code: GameErrorCode.GAME_INVALID_TERRITORY, message: 'No player in that slot' },
          });
        }

        if (!slot.isAI) {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_NOT_CREATOR, message: 'Cannot remove a human player' },
          });
        }

        database
          .delete(gamePlayers)
          .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.slotIndex, slotIndex)))
          .run();

        // Update player count
        database
          .update(gameRooms)
          .set({ currentPlayerCount: playerRows.length - 1 })
          .where(eq(gameRooms.id, gameId))
          .run();

        gameNamespace.to(`game:${gameId}`).emit('game:playerLeft', {
          playerIndex: slotIndex,
        });

        ack({ success: true });
      } catch {
        ack({
          success: false,
          error: { code: GameErrorCode.INTERNAL_ERROR, message: 'Failed to remove AI' },
        });
      }
    },
  );

  // game:rearrangeSlots — Creator swaps two player slots
  socket.on(
    'game:rearrangeSlots',
    async (
      { gameId, fromSlot, toSlot }: { gameId: string; fromSlot: number; toSlot: number },
      ack,
    ) => {
      try {
        const rooms = database.select().from(gameRooms).where(eq(gameRooms.id, gameId)).all();
        if (rooms.length === 0) {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_GAME_NOT_FOUND, message: 'Game not found' },
          });
        }
        const room = rooms[0];

        if (room.creatorId !== socket.data.userId) {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_NOT_CREATOR, message: 'Only the creator can manage slots' },
          });
        }

        if (room.status !== 'waiting') {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_GAME_STARTED, message: 'Game is not in waiting status' },
          });
        }

        if (fromSlot < 0 || fromSlot >= room.maxPlayers || toSlot < 0 || toSlot >= room.maxPlayers) {
          return ack({
            success: false,
            error: { code: GameErrorCode.LOBBY_INVALID_CONFIG, message: 'Invalid slot index' },
          });
        }

        const playerRows = database
          .select()
          .from(gamePlayers)
          .where(eq(gamePlayers.gameId, gameId))
          .all();

        const fromPlayer = playerRows.find((p) => p.slotIndex === fromSlot);
        const toPlayer = playerRows.find((p) => p.slotIndex === toSlot);

        if (!fromPlayer && !toPlayer) {
          return ack({
            success: false,
            error: { code: GameErrorCode.GAME_INVALID_TERRITORY, message: 'Both slots are empty' },
          });
        }

        // Swap slot indices using a temporary value to avoid unique constraint issues
        if (fromPlayer && toPlayer) {
          // Both occupied — swap
          database
            .update(gamePlayers)
            .set({ slotIndex: -1 })
            .where(eq(gamePlayers.id, fromPlayer.id))
            .run();
          database
            .update(gamePlayers)
            .set({ slotIndex: fromSlot })
            .where(eq(gamePlayers.id, toPlayer.id))
            .run();
          database
            .update(gamePlayers)
            .set({ slotIndex: toSlot })
            .where(eq(gamePlayers.id, fromPlayer.id))
            .run();
        } else if (fromPlayer) {
          // Only from is occupied — move to toSlot
          database
            .update(gamePlayers)
            .set({ slotIndex: toSlot })
            .where(eq(gamePlayers.id, fromPlayer.id))
            .run();
        } else if (toPlayer) {
          // Only to is occupied — move to fromSlot
          database
            .update(gamePlayers)
            .set({ slotIndex: fromSlot })
            .where(eq(gamePlayers.id, toPlayer.id))
            .run();
        }

        const updatedPlayers = database
          .select()
          .from(gamePlayers)
          .where(eq(gamePlayers.gameId, gameId))
          .all();
        updatedPlayers.sort((a, b) => a.slotIndex - b.slotIndex);

        gameNamespace.to(`game:${gameId}`).emit('game:slotsRearranged', {
          players: updatedPlayers.map((p) => ({
            slotIndex: p.slotIndex,
            isAI: p.isAI,
            userId: p.userId,
            aiPersonality: p.aiPersonality,
          })),
        });

        ack({ success: true });
      } catch {
        ack({
          success: false,
          error: { code: GameErrorCode.INTERNAL_ERROR, message: 'Failed to rearrange slots' },
        });
      }
    },
  );

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

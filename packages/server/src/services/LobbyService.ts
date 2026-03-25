import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import { AppDatabase } from '../db/connection';
import { gameRooms, gamePlayers, users } from '../db/schema';
import { GameErrorCode } from '@dicewars/shared';
import type { CreateGameRequest } from '../types/api';
import type { GameRoomSummary, GameSetupSummary } from '@dicewars/shared';

type GameRoom = typeof gameRooms.$inferSelect;
type GamePlayer = typeof gamePlayers.$inferSelect;

export class LobbyError extends Error {
  constructor(
    public code: GameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LobbyError';
  }
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

function validateConfig(config: CreateGameRequest['config']): void {
  if (!config || typeof config !== 'object') {
    throw new LobbyError(GameErrorCode.LOBBY_INVALID_CONFIG, 'Config is required');
  }
  if (typeof config.playerCount !== 'number' || config.playerCount < 2 || config.playerCount > 8) {
    throw new LobbyError(GameErrorCode.LOBBY_INVALID_CONFIG, 'Player count must be between 2 and 8');
  }
  const validTerritories = [15, 20, 28, 35, 42];
  if (!validTerritories.includes(config.territoryCount)) {
    throw new LobbyError(GameErrorCode.LOBBY_INVALID_CONFIG, 'Invalid territory count');
  }
  const validMapShapes = ['rectangle', 'diamond', 'ring', 'continent'];
  if (!validMapShapes.includes(config.mapShape)) {
    throw new LobbyError(GameErrorCode.LOBBY_INVALID_CONFIG, 'Invalid map shape');
  }
  const validGridTypes = ['square', 'hex'];
  if (!validGridTypes.includes(config.gridType)) {
    throw new LobbyError(GameErrorCode.LOBBY_INVALID_CONFIG, 'Invalid grid type');
  }
  const validSpeeds = ['normal', 'fast', 'instant'];
  if (!validSpeeds.includes(config.speed)) {
    throw new LobbyError(GameErrorCode.LOBBY_INVALID_CONFIG, 'Invalid speed');
  }
}

function toSummary(room: GameRoom, creatorName: string): GameRoomSummary {
  const config = (typeof room.config === 'string' ? JSON.parse(room.config) : room.config) as Record<string, unknown>;
  const setupSummary: GameSetupSummary = {
    mapShape: (config.mapShape as string) || 'rectangle',
    gridType: (config.gridType as string) || 'square',
    territoryCount: (config.territoryCount as number) || 28,
    speed: (config.speed as string) || 'normal',
    powerUps: (config.powerUps as boolean) || false,
    fogOfWar: (config.fogOfWar as boolean) || false,
    alliances: (config.alliances as boolean) || false,
  };
  return {
    id: room.id,
    name: room.name,
    creatorName,
    status: room.status as GameRoomSummary['status'],
    playerCount: room.currentPlayerCount,
    maxPlayers: room.maxPlayers,
    hasPassword: !!room.passwordHash,
    config: setupSummary,
    createdAt: room.createdAt,
  };
}

export class LobbyService {
  constructor(private db: AppDatabase) {}

  async createGame(creatorId: string, request: CreateGameRequest): Promise<GameRoomSummary> {
    validateConfig(request.config);

    const roomId = nanoid(12);
    const inviteCode = nanoid(6);
    const now = new Date().toISOString();

    const passwordHash = request.password ? hashPassword(request.password) : null;

    // Count AI slots
    const aiSlots = request.aiSlots || [];
    const humanSlots = 1; // creator
    const initialPlayerCount = humanSlots + aiSlots.length;

    this.db
      .insert(gameRooms)
      .values({
        id: roomId,
        name: request.name,
        creatorId,
        status: 'waiting',
        passwordHash,
        inviteCode,
        config: request.config as unknown as Record<string, unknown>,
        maxPlayers: request.config.playerCount,
        currentPlayerCount: initialPlayerCount,
        createdAt: now,
      })
      .run();

    // Insert creator as player at slot 0
    this.db
      .insert(gamePlayers)
      .values({
        id: nanoid(12),
        gameId: roomId,
        userId: creatorId,
        slotIndex: 0,
        isAI: false,
        isSpectator: false,
        joinedAt: now,
      })
      .run();

    // Insert AI players
    for (const ai of aiSlots) {
      this.db
        .insert(gamePlayers)
        .values({
          id: nanoid(12),
          gameId: roomId,
          slotIndex: ai.slot,
          isAI: true,
          aiPersonality: ai.personality,
          isSpectator: false,
          joinedAt: now,
        })
        .run();
    }

    // Get creator name for summary
    const creator = this.db.select().from(users).where(eq(users.id, creatorId)).all();
    const creatorName = creator[0]?.displayName || 'Unknown';

    const room = this.db.select().from(gameRooms).where(eq(gameRooms.id, roomId)).all()[0];
    return toSummary(room, creatorName);
  }

  async listGames(): Promise<GameRoomSummary[]> {
    const rooms = this.db
      .select()
      .from(gameRooms)
      .where(eq(gameRooms.status, 'waiting'))
      .all();

    const summaries: GameRoomSummary[] = [];
    for (const room of rooms) {
      const creator = this.db.select().from(users).where(eq(users.id, room.creatorId)).all();
      const creatorName = creator[0]?.displayName || 'Unknown';
      summaries.push(toSummary(room, creatorName));
    }
    return summaries;
  }

  async getGame(gameId: string): Promise<GameRoomSummary | undefined> {
    const rooms = this.db.select().from(gameRooms).where(eq(gameRooms.id, gameId)).all();
    if (rooms.length === 0) return undefined;
    const room = rooms[0];
    const creator = this.db.select().from(users).where(eq(users.id, room.creatorId)).all();
    const creatorName = creator[0]?.displayName || 'Unknown';
    return toSummary(room, creatorName);
  }

  async joinGame(gameId: string, userId: string, password?: string): Promise<void> {
    const rooms = this.db.select().from(gameRooms).where(eq(gameRooms.id, gameId)).all();
    if (rooms.length === 0) {
      throw new LobbyError(GameErrorCode.LOBBY_GAME_NOT_FOUND, 'Game not found');
    }
    const room = rooms[0];

    if (room.status !== 'waiting') {
      throw new LobbyError(GameErrorCode.LOBBY_GAME_STARTED, 'Game has already started');
    }

    if (room.currentPlayerCount >= room.maxPlayers) {
      throw new LobbyError(GameErrorCode.LOBBY_GAME_FULL, 'Game is full');
    }

    if (room.passwordHash) {
      if (!password || hashPassword(password) !== room.passwordHash) {
        throw new LobbyError(GameErrorCode.LOBBY_INVALID_PASSWORD, 'Invalid password');
      }
    }

    // Check if user already in game
    const existing = this.db
      .select()
      .from(gamePlayers)
      .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
      .all();
    if (existing.length > 0) {
      throw new LobbyError(GameErrorCode.LOBBY_ALREADY_JOINED, 'Already in this game');
    }

    // Find next available slot
    const players = this.db
      .select()
      .from(gamePlayers)
      .where(eq(gamePlayers.gameId, gameId))
      .all();
    const usedSlots = new Set(players.map((p) => p.slotIndex));
    let nextSlot = 0;
    while (usedSlots.has(nextSlot)) nextSlot++;

    this.db
      .insert(gamePlayers)
      .values({
        id: nanoid(12),
        gameId,
        userId,
        slotIndex: nextSlot,
        isAI: false,
        isSpectator: false,
        joinedAt: new Date().toISOString(),
      })
      .run();

    this.db
      .update(gameRooms)
      .set({ currentPlayerCount: room.currentPlayerCount + 1 })
      .where(eq(gameRooms.id, gameId))
      .run();
  }

  async leaveGame(gameId: string, userId: string): Promise<void> {
    const rooms = this.db.select().from(gameRooms).where(eq(gameRooms.id, gameId)).all();
    if (rooms.length === 0) {
      throw new LobbyError(GameErrorCode.LOBBY_GAME_NOT_FOUND, 'Game not found');
    }
    const room = rooms[0];

    const existing = this.db
      .select()
      .from(gamePlayers)
      .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
      .all();
    if (existing.length === 0) {
      throw new LobbyError(GameErrorCode.LOBBY_NOT_JOINED, 'Not in this game');
    }

    this.db
      .delete(gamePlayers)
      .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
      .run();

    // If creator leaves, cancel the game
    if (room.creatorId === userId) {
      this.db.delete(gamePlayers).where(eq(gamePlayers.gameId, gameId)).run();
      this.db
        .update(gameRooms)
        .set({ status: 'abandoned', currentPlayerCount: 0 })
        .where(eq(gameRooms.id, gameId))
        .run();
    } else {
      this.db
        .update(gameRooms)
        .set({ currentPlayerCount: room.currentPlayerCount - 1 })
        .where(eq(gameRooms.id, gameId))
        .run();
    }
  }

  async startGame(gameId: string, userId: string): Promise<GameRoomSummary> {
    const rooms = this.db.select().from(gameRooms).where(eq(gameRooms.id, gameId)).all();
    if (rooms.length === 0) {
      throw new LobbyError(GameErrorCode.LOBBY_GAME_NOT_FOUND, 'Game not found');
    }
    const room = rooms[0];

    if (room.creatorId !== userId) {
      throw new LobbyError(GameErrorCode.LOBBY_NOT_CREATOR, 'Only the creator can start the game');
    }

    if (room.status !== 'waiting') {
      throw new LobbyError(GameErrorCode.LOBBY_GAME_STARTED, 'Game has already started');
    }

    // Count total players (humans + AI)
    const players = this.db
      .select()
      .from(gamePlayers)
      .where(eq(gamePlayers.gameId, gameId))
      .all();
    if (players.length < 2) {
      throw new LobbyError(GameErrorCode.LOBBY_MIN_PLAYERS, 'At least 2 players required to start');
    }

    const now = new Date().toISOString();
    this.db
      .update(gameRooms)
      .set({ status: 'started', startedAt: now })
      .where(eq(gameRooms.id, gameId))
      .run();

    const updated = this.db.select().from(gameRooms).where(eq(gameRooms.id, gameId)).all()[0];
    const creator = this.db.select().from(users).where(eq(users.id, updated.creatorId)).all();
    return toSummary(updated, creator[0]?.displayName || 'Unknown');
  }

  async updateConfig(gameId: string, userId: string, config: Partial<CreateGameRequest['config']>): Promise<void> {
    const rooms = this.db.select().from(gameRooms).where(eq(gameRooms.id, gameId)).all();
    if (rooms.length === 0) {
      throw new LobbyError(GameErrorCode.LOBBY_GAME_NOT_FOUND, 'Game not found');
    }
    const room = rooms[0];

    if (room.creatorId !== userId) {
      throw new LobbyError(GameErrorCode.LOBBY_NOT_CREATOR, 'Only the creator can update config');
    }

    if (room.status !== 'waiting') {
      throw new LobbyError(GameErrorCode.LOBBY_GAME_STARTED, 'Cannot update config after game has started');
    }

    const existingConfig = (typeof room.config === 'string' ? JSON.parse(room.config) : room.config) as Record<string, unknown>;
    const mergedConfig = { ...existingConfig, ...config };

    validateConfig(mergedConfig as CreateGameRequest['config']);

    this.db
      .update(gameRooms)
      .set({ config: mergedConfig })
      .where(eq(gameRooms.id, gameId))
      .run();
  }

  async cancelGame(gameId: string, userId: string): Promise<void> {
    const rooms = this.db.select().from(gameRooms).where(eq(gameRooms.id, gameId)).all();
    if (rooms.length === 0) {
      throw new LobbyError(GameErrorCode.LOBBY_GAME_NOT_FOUND, 'Game not found');
    }
    const room = rooms[0];

    if (room.creatorId !== userId) {
      throw new LobbyError(GameErrorCode.LOBBY_NOT_CREATOR, 'Only the creator can cancel the game');
    }

    if (room.status !== 'waiting') {
      throw new LobbyError(GameErrorCode.LOBBY_GAME_STARTED, 'Cannot cancel a game that has started');
    }

    this.db.delete(gamePlayers).where(eq(gamePlayers.gameId, gameId)).run();
    this.db
      .update(gameRooms)
      .set({ status: 'abandoned', currentPlayerCount: 0 })
      .where(eq(gameRooms.id, gameId))
      .run();
  }

  async resolveInvite(inviteCode: string): Promise<GameRoomSummary | undefined> {
    const rooms = this.db
      .select()
      .from(gameRooms)
      .where(eq(gameRooms.inviteCode, inviteCode))
      .all();
    if (rooms.length === 0) return undefined;
    const room = rooms[0];
    const creator = this.db.select().from(users).where(eq(users.id, room.creatorId)).all();
    return toSummary(room, creator[0]?.displayName || 'Unknown');
  }

  async cleanupStaleRooms(maxAgeMinutes = 10): Promise<string[]> {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
    const staleRooms = this.db
      .select()
      .from(gameRooms)
      .where(
        and(
          eq(gameRooms.status, 'waiting'),
          eq(gameRooms.currentPlayerCount, 0),
        ),
      )
      .all()
      .filter((room) => room.createdAt < cutoff);

    const removedIds: string[] = [];
    for (const room of staleRooms) {
      this.db.delete(gamePlayers).where(eq(gamePlayers.gameId, room.id)).run();
      this.db
        .update(gameRooms)
        .set({ status: 'abandoned' })
        .where(eq(gameRooms.id, room.id))
        .run();
      removedIds.push(room.id);
    }
    return removedIds;
  }
}

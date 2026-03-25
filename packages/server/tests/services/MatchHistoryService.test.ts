import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../../src/db/connection';
import { MatchHistoryService } from '../../src/services/MatchHistoryService';
import { matches, matchPlayers, gameRooms, users } from '../../src/db/schema';
import { GameEngine, ServerGameConfig, PlayerSlot } from '../../src/services/GameEngine';
import { PLAYER_COLORS } from '@dicewars/shared';

function applySchema(db: ReturnType<typeof createTestDb>) {
  db.run(sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    is_guest INTEGER NOT NULL DEFAULT 1,
    password_hash TEXT,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS game_rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    creator_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'waiting',
    password_hash TEXT,
    invite_code TEXT UNIQUE,
    config TEXT NOT NULL,
    max_players INTEGER NOT NULL DEFAULT 8,
    current_player_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    winner_id TEXT
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS game_players (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES game_rooms(id),
    user_id TEXT REFERENCES users(id),
    slot_index INTEGER NOT NULL,
    is_ai INTEGER NOT NULL DEFAULT 0,
    ai_personality TEXT,
    is_spectator INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    room_id TEXT REFERENCES game_rooms(id),
    recording TEXT,
    stats TEXT,
    seed TEXT,
    config TEXT,
    winner_index INTEGER,
    turn_count INTEGER,
    created_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS match_players (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id),
    user_id TEXT REFERENCES users(id),
    player_index INTEGER NOT NULL,
    is_ai INTEGER NOT NULL DEFAULT 0,
    ai_personality TEXT,
    is_winner INTEGER NOT NULL DEFAULT 0
  )`);
}

function makeConfig(overrides: Partial<ServerGameConfig> = {}): ServerGameConfig {
  return {
    playerCount: 2,
    territoryCount: 15,
    mapShape: 'rectangle',
    gridType: 'square',
    speed: 'normal',
    powerUps: false,
    fogOfWar: false,
    alliances: false,
    undoEnabled: false,
    seed: '42',
    ...overrides,
  };
}

function makeSlots(count: number, humanCount = 1): PlayerSlot[] {
  const slots: PlayerSlot[] = [];
  for (let i = 0; i < count; i++) {
    if (i < humanCount) {
      slots.push({
        userId: `user-${i}`,
        name: `Player ${i}`,
        isAI: false,
        color: PLAYER_COLORS[i],
      });
    } else {
      slots.push({
        name: `AI ${i}`,
        isAI: true,
        aiPersonality: 'balanced',
        color: PLAYER_COLORS[i],
      });
    }
  }
  return slots;
}

function seedDatabase(db: ReturnType<typeof createTestDb>, userIds: string[]) {
  const now = new Date().toISOString();
  for (const id of userIds) {
    db.insert(users).values({
      id,
      displayName: `User ${id}`,
      isGuest: true,
      createdAt: now,
      lastSeenAt: now,
    }).run();
  }
}

function createRoom(db: ReturnType<typeof createTestDb>, roomId: string, creatorId: string) {
  const now = new Date().toISOString();
  db.insert(gameRooms).values({
    id: roomId,
    name: 'Test Room',
    creatorId,
    config: JSON.stringify({}),
    createdAt: now,
  }).run();
}

/** Force a game to end by eliminating all but one player */
function forceGameEnd(game: ReturnType<GameEngine['createGame']>, winnerIndex: number) {
  for (const player of game.state.players) {
    if (player.id !== winnerIndex) {
      player.isAlive = false;
    }
  }
  game.state.winner = winnerIndex;
  game.status = 'finished';
}

describe('MatchHistoryService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: MatchHistoryService;
  let engine: GameEngine;

  beforeEach(() => {
    db = createTestDb();
    applySchema(db);
    engine = new GameEngine();
  });

  it('saves a match and verifies it is in DB', async () => {
    seedDatabase(db, ['user-0']);
    createRoom(db, 'room-1', 'user-0');

    const config = makeConfig();
    const slots = makeSlots(2, 1);
    const game = engine.createGame('room-1', config, slots);
    forceGameEnd(game, 0);

    service = new MatchHistoryService(db);
    const matchId = await service.saveMatch('room-1', game);

    expect(matchId).toBeTruthy();

    // Verify match row
    const matchRows = db.select().from(matches).all();
    expect(matchRows).toHaveLength(1);
    expect(matchRows[0].id).toBe(matchId);
    expect(matchRows[0].roomId).toBe('room-1');
    expect(matchRows[0].winnerIndex).toBe(0);
    expect(matchRows[0].seed).toBe('42');

    // Verify match_players rows
    const playerRows = db.select().from(matchPlayers).all();
    expect(playerRows).toHaveLength(2);

    // Verify gameRooms updated
    const rooms = db.select().from(gameRooms).all();
    expect(rooms[0].status).toBe('finished');
    expect(rooms[0].finishedAt).toBeTruthy();
    expect(rooms[0].winnerId).toBe('user-0');
  });

  it('correctly handles AI players in match_players', async () => {
    seedDatabase(db, ['user-0']);
    createRoom(db, 'room-1', 'user-0');

    const config = makeConfig();
    const slots = makeSlots(2, 1); // 1 human, 1 AI
    const game = engine.createGame('room-1', config, slots);
    forceGameEnd(game, 0);

    service = new MatchHistoryService(db);
    await service.saveMatch('room-1', game);

    const playerRows = db.select().from(matchPlayers).all();
    const humanPlayer = playerRows.find((p) => p.playerIndex === 0);
    const aiPlayer = playerRows.find((p) => p.playerIndex === 1);

    expect(humanPlayer?.isAI).toBe(false);
    expect(humanPlayer?.userId).toBe('user-0');
    expect(humanPlayer?.isWinner).toBe(true);

    expect(aiPlayer?.isAI).toBe(true);
    expect(aiPlayer?.userId).toBeNull();
    expect(aiPlayer?.aiPersonality).toBe('balanced');
    expect(aiPlayer?.isWinner).toBe(false);
  });

  it('returns user matches with pagination', async () => {
    seedDatabase(db, ['user-0']);
    createRoom(db, 'room-1', 'user-0');
    createRoom(db, 'room-2', 'user-0');
    createRoom(db, 'room-3', 'user-0');

    service = new MatchHistoryService(db);

    // Create and save 3 matches
    for (let i = 1; i <= 3; i++) {
      const config = makeConfig({ seed: String(i * 100) });
      const slots = makeSlots(2, 1);
      const game = engine.createGame(`room-${i}`, config, slots);
      forceGameEnd(game, 0);
      await service.saveMatch(`room-${i}`, game);
      engine.destroyGame(`room-${i}`);
    }

    // Get all matches
    const allMatches = await service.getUserMatches('user-0');
    expect(allMatches).toHaveLength(3);

    // Test pagination
    const page1 = await service.getUserMatches('user-0', 2, 0);
    expect(page1).toHaveLength(2);

    const page2 = await service.getUserMatches('user-0', 2, 2);
    expect(page2).toHaveLength(1);
  });

  it('returns match detail with full recording', async () => {
    seedDatabase(db, ['user-0']);
    createRoom(db, 'room-1', 'user-0');

    const config = makeConfig();
    const slots = makeSlots(2, 1);
    const game = engine.createGame('room-1', config, slots);
    forceGameEnd(game, 0);

    service = new MatchHistoryService(db);
    const matchId = await service.saveMatch('room-1', game);

    const detail = await service.getMatchDetail(matchId);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(matchId);
    expect(detail!.recording).toBeTruthy();
    expect(detail!.stats).toBeTruthy();
    expect(detail!.players).toHaveLength(2);
    expect(detail!.players[0].displayName).toBe('User user-0');
  });

  it('returns null for non-existent match detail', async () => {
    service = new MatchHistoryService(db);
    const detail = await service.getMatchDetail('nonexistent');
    expect(detail).toBeNull();
  });

  it('tracks multiple players matches separately', async () => {
    seedDatabase(db, ['user-0', 'user-1']);
    createRoom(db, 'room-1', 'user-0');
    createRoom(db, 'room-2', 'user-0');

    service = new MatchHistoryService(db);

    // Match 1: both players
    const config1 = makeConfig();
    const slots1: PlayerSlot[] = [
      { userId: 'user-0', name: 'Player 0', isAI: false, color: PLAYER_COLORS[0] },
      { userId: 'user-1', name: 'Player 1', isAI: false, color: PLAYER_COLORS[1] },
    ];
    const game1 = engine.createGame('room-1', config1, slots1);
    forceGameEnd(game1, 0);
    await service.saveMatch('room-1', game1);
    engine.destroyGame('room-1');

    // Match 2: only user-0 (vs AI)
    const config2 = makeConfig({ seed: '99' });
    const slots2 = makeSlots(2, 1);
    const game2 = engine.createGame('room-2', config2, slots2);
    forceGameEnd(game2, 0);
    await service.saveMatch('room-2', game2);
    engine.destroyGame('room-2');

    // user-0 should have 2 matches
    const user0Matches = await service.getUserMatches('user-0');
    expect(user0Matches).toHaveLength(2);

    // user-1 should have 1 match
    const user1Matches = await service.getUserMatches('user-1');
    expect(user1Matches).toHaveLength(1);
    expect(user1Matches[0].userWon).toBe(false);
  });
});

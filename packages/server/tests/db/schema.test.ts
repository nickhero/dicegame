import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../../src/db/connection';
import * as schema from '../../src/db/schema';

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
  db.run(sql`CREATE TABLE IF NOT EXISTS user_achievements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    achievement_id TEXT NOT NULL,
    unlocked_at TEXT NOT NULL,
    match_id TEXT REFERENCES matches(id)
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    preferences TEXT NOT NULL
  )`);
}

describe('Database schema', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    applySchema(db);
  });

  it('creates all tables', () => {
    const tables = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    );
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('game_rooms');
    expect(tableNames).toContain('game_players');
    expect(tableNames).toContain('matches');
    expect(tableNames).toContain('match_players');
    expect(tableNames).toContain('user_achievements');
    expect(tableNames).toContain('user_preferences');
  });

  it('inserts and retrieves a user', () => {
    const now = new Date().toISOString();
    db.insert(schema.users).values({
      id: 'user-1',
      displayName: 'TestPlayer',
      isGuest: true,
      createdAt: now,
      lastSeenAt: now,
    }).run();

    const result = db.select().from(schema.users).all();
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe('TestPlayer');
    expect(result[0].isGuest).toBe(true);
  });

  it('inserts a game room with creator reference', () => {
    const now = new Date().toISOString();
    db.insert(schema.users).values({
      id: 'user-1',
      displayName: 'Creator',
      createdAt: now,
      lastSeenAt: now,
    }).run();

    db.insert(schema.gameRooms).values({
      id: 'room-1',
      name: 'Test Room',
      creatorId: 'user-1',
      config: JSON.stringify({ mapSize: 'medium' }),
      createdAt: now,
    }).run();

    const rooms = db.select().from(schema.gameRooms).all();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].name).toBe('Test Room');
    expect(rooms[0].creatorId).toBe('user-1');
    expect(rooms[0].status).toBe('waiting');
  });

  it('inserts game players', () => {
    const now = new Date().toISOString();
    db.insert(schema.users).values({
      id: 'user-1',
      displayName: 'Player',
      createdAt: now,
      lastSeenAt: now,
    }).run();

    db.insert(schema.gameRooms).values({
      id: 'room-1',
      name: 'Room',
      creatorId: 'user-1',
      config: JSON.stringify({}),
      createdAt: now,
    }).run();

    db.insert(schema.gamePlayers).values({
      id: 'gp-1',
      gameId: 'room-1',
      userId: 'user-1',
      slotIndex: 0,
      joinedAt: now,
    }).run();

    db.insert(schema.gamePlayers).values({
      id: 'gp-2',
      gameId: 'room-1',
      slotIndex: 1,
      isAI: true,
      aiPersonality: 'aggressive',
      joinedAt: now,
    }).run();

    const players = db.select().from(schema.gamePlayers).all();
    expect(players).toHaveLength(2);
    expect(players[0].isAI).toBe(false);
    expect(players[1].isAI).toBe(true);
    expect(players[1].aiPersonality).toBe('aggressive');
  });

  it('enforces foreign key constraint on game_players.game_id', () => {
    const now = new Date().toISOString();
    expect(() => {
      db.insert(schema.gamePlayers).values({
        id: 'gp-1',
        gameId: 'nonexistent-room',
        slotIndex: 0,
        joinedAt: now,
      }).run();
    }).toThrow();
  });

  it('enforces unique constraint on invite_code', () => {
    const now = new Date().toISOString();
    db.insert(schema.users).values({
      id: 'user-1',
      displayName: 'Creator',
      createdAt: now,
      lastSeenAt: now,
    }).run();

    db.insert(schema.gameRooms).values({
      id: 'room-1',
      name: 'Room 1',
      creatorId: 'user-1',
      inviteCode: 'ABC123',
      config: JSON.stringify({}),
      createdAt: now,
    }).run();

    expect(() => {
      db.insert(schema.gameRooms).values({
        id: 'room-2',
        name: 'Room 2',
        creatorId: 'user-1',
        inviteCode: 'ABC123',
        config: JSON.stringify({}),
        createdAt: now,
      }).run();
    }).toThrow();
  });
});

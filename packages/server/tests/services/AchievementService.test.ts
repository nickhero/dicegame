import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../../src/db/connection';
import { AchievementService } from '../../src/services/AchievementService';
import { userAchievements, users, matches, gameRooms } from '../../src/db/schema';
import { GameEngine, ServerGameConfig, PlayerSlot } from '../../src/services/GameEngine';
import { PLAYER_COLORS } from '@dicewars/shared';
import { nanoid } from 'nanoid';

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

function seedDatabase(db: ReturnType<typeof createTestDb>) {
  const now = new Date().toISOString();
  db.insert(users).values({
    id: 'user-0',
    displayName: 'TestPlayer',
    isGuest: true,
    createdAt: now,
    lastSeenAt: now,
  }).run();
}

function insertMatchStub(db: ReturnType<typeof createTestDb>, matchId: string) {
  db.run(sql`INSERT INTO matches (id, created_at) VALUES (${matchId}, ${new Date().toISOString()})`);
}

describe('AchievementService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: AchievementService;
  let engine: GameEngine;

  beforeEach(() => {
    db = createTestDb();
    applySchema(db);
    engine = new GameEngine();
    seedDatabase(db);
  });

  it('unlocks achievements and saves them', async () => {
    const config = makeConfig();
    const slots = makeSlots(2, 1);
    const game = engine.createGame('room-1', config, slots);

    // Force a win for player 0 to get "pacifist_start" (end first turn without attacking)
    game.state.winner = 0;
    game.status = 'finished';
    for (const p of game.state.players) {
      if (p.id !== 0) p.isAlive = false;
    }

    const matchId = 'match-test-1';
    insertMatchStub(db, matchId);

    service = new AchievementService(db);
    const unlocked = await service.checkAndUnlock('user-0', game, matchId);

    // At minimum, pacifist_start should unlock (no attacks recorded)
    expect(unlocked).toContain('pacifist_start');

    // Verify in DB
    const rows = db.select().from(userAchievements).all();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const pacifist = rows.find((r) => r.achievementId === 'pacifist_start');
    expect(pacifist).toBeDefined();
    expect(pacifist?.userId).toBe('user-0');
    expect(pacifist?.matchId).toBe(matchId);
  });

  it('does not re-save duplicate achievements', async () => {
    const config = makeConfig();
    const slots = makeSlots(2, 1);
    const game = engine.createGame('room-1', config, slots);

    game.state.winner = 0;
    game.status = 'finished';
    for (const p of game.state.players) {
      if (p.id !== 0) p.isAlive = false;
    }

    const matchId1 = 'match-test-1';
    const matchId2 = 'match-test-2';
    insertMatchStub(db, matchId1);
    insertMatchStub(db, matchId2);

    service = new AchievementService(db);

    const firstUnlock = await service.checkAndUnlock('user-0', game, matchId1);
    expect(firstUnlock.length).toBeGreaterThan(0);

    // Create a second game with same conditions
    engine.destroyGame('room-1');
    const game2 = engine.createGame('room-1', config, slots);
    game2.state.winner = 0;
    game2.status = 'finished';
    for (const p of game2.state.players) {
      if (p.id !== 0) p.isAlive = false;
    }

    const secondUnlock = await service.checkAndUnlock('user-0', game2, matchId2);

    // The same achievements should NOT be unlocked again
    for (const id of firstUnlock) {
      expect(secondUnlock).not.toContain(id);
    }

    // DB should only have one entry per achievement
    const rows = db.select().from(userAchievements).all();
    const achievementIds = rows.map((r) => r.achievementId);
    const uniqueIds = [...new Set(achievementIds)];
    expect(achievementIds.length).toBe(uniqueIds.length);
  });

  it('returns correct user achievements list', async () => {
    const matchId = 'match-test-1';
    insertMatchStub(db, matchId);

    service = new AchievementService(db);

    // Manually insert some achievements
    const now = new Date().toISOString();
    db.insert(userAchievements).values({
      id: 'ua-1',
      userId: 'user-0',
      achievementId: 'first_blood',
      unlockedAt: now,
      matchId,
    }).run();
    db.insert(userAchievements).values({
      id: 'ua-2',
      userId: 'user-0',
      achievementId: 'speed_demon',
      unlockedAt: now,
      matchId,
    }).run();

    const achievements = await service.getUserAchievements('user-0');
    expect(achievements).toHaveLength(2);
    expect(achievements.map((a) => a.achievementId)).toContain('first_blood');
    expect(achievements.map((a) => a.achievementId)).toContain('speed_demon');
    expect(achievements[0].matchId).toBe(matchId);
  });

  it('returns empty array for unknown user', async () => {
    service = new AchievementService(db);
    const achievements = await service.getUserAchievements('unknown-user');
    expect(achievements).toHaveLength(0);
  });
});

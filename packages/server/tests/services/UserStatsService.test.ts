import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../../src/db/connection';
import { UserStatsService } from '../../src/services/UserStatsService';

function applySchema(db: ReturnType<typeof createTestDb>) {
  db.run(sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
    is_guest INTEGER NOT NULL DEFAULT 1, password_hash TEXT,
    created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS game_rooms (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    creator_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'waiting', password_hash TEXT,
    invite_code TEXT UNIQUE, config TEXT NOT NULL,
    max_players INTEGER NOT NULL DEFAULT 8,
    current_player_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, winner_id TEXT
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY, room_id TEXT REFERENCES game_rooms(id),
    recording TEXT, stats TEXT, seed TEXT, config TEXT,
    winner_index INTEGER, turn_count INTEGER,
    created_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS match_players (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id),
    user_id TEXT REFERENCES users(id), player_index INTEGER NOT NULL,
    is_ai INTEGER NOT NULL DEFAULT 0, ai_personality TEXT,
    is_winner INTEGER NOT NULL DEFAULT 0
  )`);
}

function seedUser(db: ReturnType<typeof createTestDb>, id: string, name: string) {
  const now = new Date().toISOString();
  db.run(sql`INSERT INTO users (id, display_name, is_guest, created_at, last_seen_at)
    VALUES (${id}, ${name}, 1, ${now}, ${now})`);
}

function seedMatch(
  db: ReturnType<typeof createTestDb>,
  matchId: string,
  turnCount: number,
  createdAt: string,
) {
  db.run(sql`INSERT INTO matches (id, turn_count, created_at)
    VALUES (${matchId}, ${turnCount}, ${createdAt})`);
}

function seedMatchPlayer(
  db: ReturnType<typeof createTestDb>,
  id: string,
  matchId: string,
  userId: string,
  playerIndex: number,
  isWinner: boolean,
) {
  db.run(sql`INSERT INTO match_players (id, match_id, user_id, player_index, is_ai, is_winner)
    VALUES (${id}, ${matchId}, ${userId}, ${playerIndex}, 0, ${isWinner ? 1 : 0})`);
}

describe('UserStatsService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: UserStatsService;

  beforeEach(() => {
    db = createTestDb();
    applySchema(db);
    service = new UserStatsService(db);
  });

  it('returns zeros for user with no games', async () => {
    seedUser(db, 'user-1', 'Alice');
    const stats = await service.getUserStats('user-1');
    expect(stats).toEqual({
      totalGames: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      averageTurnCount: 0,
      longestWinStreak: 0,
    });
  });

  it('computes stats correctly after wins and losses', async () => {
    seedUser(db, 'user-1', 'Alice');

    seedMatch(db, 'match-1', 10, '2024-01-01T00:00:00Z');
    seedMatchPlayer(db, 'mp-1', 'match-1', 'user-1', 0, true);

    seedMatch(db, 'match-2', 20, '2024-01-02T00:00:00Z');
    seedMatchPlayer(db, 'mp-2', 'match-2', 'user-1', 0, false);

    seedMatch(db, 'match-3', 15, '2024-01-03T00:00:00Z');
    seedMatchPlayer(db, 'mp-3', 'match-3', 'user-1', 0, true);

    const stats = await service.getUserStats('user-1');
    expect(stats.totalGames).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBe(67);
    expect(stats.averageTurnCount).toBe(15);
  });

  it('calculates longest win streak correctly', async () => {
    seedUser(db, 'user-1', 'Alice');

    // W, W, L, W, W, W, L
    const outcomes = [true, true, false, true, true, true, false];
    outcomes.forEach((isWin, i) => {
      const matchId = `match-${i}`;
      seedMatch(db, matchId, 10, `2024-01-0${i + 1}T00:00:00Z`);
      seedMatchPlayer(db, `mp-${i}`, matchId, 'user-1', 0, isWin);
    });

    const stats = await service.getUserStats('user-1');
    expect(stats.longestWinStreak).toBe(3);
  });

  it('handles a single win streak at the end', async () => {
    seedUser(db, 'user-1', 'Alice');

    // L, L, W, W, W, W
    const outcomes = [false, false, true, true, true, true];
    outcomes.forEach((isWin, i) => {
      const matchId = `match-${i}`;
      seedMatch(db, matchId, 10, `2024-01-0${i + 1}T00:00:00Z`);
      seedMatchPlayer(db, `mp-${i}`, matchId, 'user-1', 0, isWin);
    });

    const stats = await service.getUserStats('user-1');
    expect(stats.longestWinStreak).toBe(4);
  });

  it('returns leaderboard ordered by wins', async () => {
    seedUser(db, 'user-1', 'Alice');
    seedUser(db, 'user-2', 'Bob');
    seedUser(db, 'user-3', 'Charlie');

    // Alice: 3 wins, 1 loss
    for (let i = 0; i < 4; i++) {
      const matchId = `match-a${i}`;
      seedMatch(db, matchId, 10, `2024-01-0${i + 1}T00:00:00Z`);
      seedMatchPlayer(db, `mp-a${i}`, matchId, 'user-1', 0, i < 3);
    }

    // Bob: 1 win, 2 losses
    for (let i = 0; i < 3; i++) {
      const matchId = `match-b${i}`;
      seedMatch(db, matchId, 10, `2024-02-0${i + 1}T00:00:00Z`);
      seedMatchPlayer(db, `mp-b${i}`, matchId, 'user-2', 0, i === 0);
    }

    // Charlie: 2 wins, 0 losses
    for (let i = 0; i < 2; i++) {
      const matchId = `match-c${i}`;
      seedMatch(db, matchId, 10, `2024-03-0${i + 1}T00:00:00Z`);
      seedMatchPlayer(db, `mp-c${i}`, matchId, 'user-3', 0, true);
    }

    const leaderboard = await service.getLeaderboard();
    expect(leaderboard).toHaveLength(3);
    expect(leaderboard[0].userId).toBe('user-1');
    expect(leaderboard[0].wins).toBe(3);
    expect(leaderboard[0].totalGames).toBe(4);
    expect(leaderboard[1].userId).toBe('user-3');
    expect(leaderboard[1].wins).toBe(2);
    expect(leaderboard[2].userId).toBe('user-2');
    expect(leaderboard[2].wins).toBe(1);
  });

  it('leaderboard includes display names', async () => {
    seedUser(db, 'user-1', 'Alice');
    seedMatch(db, 'match-1', 10, '2024-01-01T00:00:00Z');
    seedMatchPlayer(db, 'mp-1', 'match-1', 'user-1', 0, true);

    const leaderboard = await service.getLeaderboard();
    expect(leaderboard[0].displayName).toBe('Alice');
  });

  it('leaderboard includes correct win rate', async () => {
    seedUser(db, 'user-1', 'Alice');

    seedMatch(db, 'match-1', 10, '2024-01-01T00:00:00Z');
    seedMatchPlayer(db, 'mp-1', 'match-1', 'user-1', 0, true);
    seedMatch(db, 'match-2', 10, '2024-01-02T00:00:00Z');
    seedMatchPlayer(db, 'mp-2', 'match-2', 'user-1', 0, false);

    const leaderboard = await service.getLeaderboard();
    expect(leaderboard[0].winRate).toBe(50);
  });

  it('leaderboard respects limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      seedUser(db, `user-${i}`, `Player${i}`);
      seedMatch(db, `match-${i}`, 10, `2024-01-0${i + 1}T00:00:00Z`);
      seedMatchPlayer(db, `mp-${i}`, `match-${i}`, `user-${i}`, 0, true);
    }

    const leaderboard = await service.getLeaderboard(3);
    expect(leaderboard).toHaveLength(3);
  });

  it('leaderboard excludes AI players', async () => {
    seedUser(db, 'user-1', 'Alice');
    seedMatch(db, 'match-1', 10, '2024-01-01T00:00:00Z');
    seedMatchPlayer(db, 'mp-1', 'match-1', 'user-1', 0, true);

    // Add an AI player to the same match
    db.run(sql`INSERT INTO match_players (id, match_id, user_id, player_index, is_ai, is_winner)
      VALUES ('mp-ai', 'match-1', NULL, 1, 1, 0)`);

    const leaderboard = await service.getLeaderboard();
    expect(leaderboard).toHaveLength(1);
    expect(leaderboard[0].userId).toBe('user-1');
  });
});

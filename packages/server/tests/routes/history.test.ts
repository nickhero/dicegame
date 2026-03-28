import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { createApp } from '../../src/app';
import { createTestDb } from '../../src/db/connection';
import { users, matches, matchPlayers } from '../../src/db/schema';
import { config } from '../../src/config';

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
  db.run(sql`CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    achievement_id TEXT NOT NULL,
    match_id TEXT REFERENCES matches(id),
    unlocked_at TEXT NOT NULL
  )`);
}

const encoder = new TextEncoder();

async function createToken(sub: string, name: string) {
  const secret = encoder.encode(config.jwtSecret);
  return new SignJWT({ name, isGuest: true })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('24h')
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secret);
}

function seedUser(db: ReturnType<typeof createTestDb>, id: string, name: string) {
  const now = new Date().toISOString();
  db.insert(users).values({
    id,
    displayName: name,
    isGuest: true,
    createdAt: now,
    lastSeenAt: now,
  }).run();
}

function seedMatch(db: ReturnType<typeof createTestDb>, matchId: string, userId: string) {
  const now = new Date().toISOString();
  db.insert(matches).values({
    id: matchId,
    roomId: null,
    recording: '{}' as unknown as Record<string, unknown>,
    stats: '{}' as unknown as Record<string, unknown>,
    seed: '42',
    config: '{}' as unknown as Record<string, unknown>,
    winnerIndex: 0,
    turnCount: 10,
    createdAt: now,
  }).run();

  db.insert(matchPlayers).values({
    id: `mp-${matchId}-${userId}`,
    matchId,
    userId,
    playerIndex: 0,
    isAI: false,
    isWinner: true,
  }).run();
}

describe('History routes', () => {
  let db: ReturnType<typeof createTestDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    applySchema(db);
    app = createApp(db);
  });

  describe('DELETE /api/me/history/:id', () => {
    it('deletes a match owned by the user and returns 204', async () => {
      seedUser(db, 'user-1', 'Alice');
      seedMatch(db, 'match-1', 'user-1');
      const token = await createToken('user-1', 'Alice');

      const res = await app.request('/api/me/history/match-1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(204);

      // Verify match and match_players are deleted
      const remainingMatches = db.select().from(matches).all();
      expect(remainingMatches).toHaveLength(0);
      const remainingPlayers = db.select().from(matchPlayers).all();
      expect(remainingPlayers).toHaveLength(0);
    });

    it('returns 404 for non-existent match', async () => {
      seedUser(db, 'user-1', 'Alice');
      const token = await createToken('user-1', 'Alice');

      const res = await app.request('/api/me/history/nonexistent', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when match belongs to another user', async () => {
      seedUser(db, 'user-1', 'Alice');
      seedUser(db, 'user-2', 'Bob');
      seedMatch(db, 'match-1', 'user-2');
      const token = await createToken('user-1', 'Alice');

      const res = await app.request('/api/me/history/match-1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(404);

      // Verify match is not deleted
      const remainingMatches = db.select().from(matches).all();
      expect(remainingMatches).toHaveLength(1);
    });

    it('requires authentication', async () => {
      const res = await app.request('/api/me/history/match-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
    });
  });
});

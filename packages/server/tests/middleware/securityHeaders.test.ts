import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { createApp } from '../../src/app';
import { createTestDb } from '../../src/db/connection';
import { config } from '../../src/config';

type TestDb = ReturnType<typeof createTestDb>;

function applySchema(db: TestDb) {
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
  db.run(sql`CREATE TABLE IF NOT EXISTS game_players (
    id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES game_rooms(id),
    user_id TEXT REFERENCES users(id), slot_index INTEGER NOT NULL,
    is_ai INTEGER NOT NULL DEFAULT 0, ai_personality TEXT,
    is_spectator INTEGER NOT NULL DEFAULT 0, joined_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY, room_id TEXT REFERENCES game_rooms(id),
    recording TEXT, stats TEXT, seed TEXT, config TEXT,
    winner_index INTEGER, turn_count INTEGER, created_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS match_players (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id),
    user_id TEXT REFERENCES users(id), player_index INTEGER NOT NULL,
    is_ai INTEGER NOT NULL DEFAULT 0, ai_personality TEXT,
    is_winner INTEGER NOT NULL DEFAULT 0
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS user_achievements (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    achievement_id TEXT NOT NULL, unlocked_at TEXT NOT NULL,
    match_id TEXT REFERENCES matches(id)
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id), preferences TEXT NOT NULL
  )`);
}

const encoder = new TextEncoder();

async function createTestToken(userId = 'test-user', name = 'TestPlayer') {
  const secret = encoder.encode(config.jwtSecret);
  return new SignJWT({ sub: userId, name, isGuest: true })
    .setSubject(userId)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

function seedUser(db: TestDb, id: string, name: string) {
  const now = new Date().toISOString();
  db.run(sql`INSERT INTO users (id, display_name, is_guest, created_at, last_seen_at)
    VALUES (${id}, ${name}, 1, ${now}, ${now})`);
}

describe('Security Headers Middleware', () => {
  let db: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    applySchema(db);
    app = createApp(db);
  });

  it('should include X-Content-Type-Options header', async () => {
    const res = await app.request('/api/health');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('should include X-Frame-Options header', async () => {
    const res = await app.request('/api/health');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('should include Referrer-Policy header', async () => {
    const res = await app.request('/api/health');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('should include Content-Security-Policy header', async () => {
    const res = await app.request('/api/health');
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
  });

  it('should include X-XSS-Protection header set to 0', async () => {
    const res = await app.request('/api/health');
    expect(res.headers.get('X-XSS-Protection')).toBe('0');
  });

  it('should include security headers on authenticated routes', async () => {
    seedUser(db, 'test-user', 'TestPlayer');
    const token = await createTestToken();
    const res = await app.request('/api/games', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('should include security headers on error responses', async () => {
    const res = await app.request('/api/games', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });
});

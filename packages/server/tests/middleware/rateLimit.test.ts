import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app';
import { createTestDb } from '../../src/db/connection';
import { config } from '../../src/config';
import { rateLimit } from '../../src/middleware/rateLimit';
import { Hono } from 'hono';

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

describe('Rate Limit Middleware', () => {
  let savedNodeEnv: string;

  beforeEach(() => {
    savedNodeEnv = config.nodeEnv;
  });

  afterEach(() => {
    config.nodeEnv = savedNodeEnv;
  });

  it('should block requests after exceeding limit', async () => {
    config.nodeEnv = 'production';

    const limiter = rateLimit({ maxRequests: 3, windowMs: 60_000 });
    const app = new Hono();
    app.use('*', limiter);
    app.get('/', (c) => c.json({ ok: true }));

    // First 3 requests should succeed
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/', { headers: { 'X-Forwarded-For': '1.2.3.4' } });
      expect(res.status).toBe(200);
    }

    // 4th request should be rate limited
    const res = await app.request('/', { headers: { 'X-Forwarded-For': '1.2.3.4' } });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe('AUTH_RATE_LIMITED');
  });

  it('should return 429 with proper error body', async () => {
    config.nodeEnv = 'production';

    const limiter = rateLimit({ maxRequests: 1, windowMs: 60_000 });
    const app = new Hono();
    app.use('*', limiter);
    app.get('/', (c) => c.json({ ok: true }));

    // Exhaust the limit
    await app.request('/', { headers: { 'X-Forwarded-For': '10.0.0.1' } });

    // Should get 429
    const res = await app.request('/', { headers: { 'X-Forwarded-For': '10.0.0.1' } });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many requests, please try again later',
      },
    });
  });

  it('should be per-IP', async () => {
    config.nodeEnv = 'production';

    const limiter = rateLimit({ maxRequests: 1, windowMs: 60_000 });
    const app = new Hono();
    app.use('*', limiter);
    app.get('/', (c) => c.json({ ok: true }));

    // Exhaust limit for IP A
    await app.request('/', { headers: { 'X-Forwarded-For': '10.0.0.1' } });
    const resA = await app.request('/', { headers: { 'X-Forwarded-For': '10.0.0.1' } });
    expect(resA.status).toBe(429);

    // IP B should still work
    const resB = await app.request('/', { headers: { 'X-Forwarded-For': '10.0.0.2' } });
    expect(resB.status).toBe(200);
  });

  it('should reset after window expires', async () => {
    config.nodeEnv = 'production';

    const limiter = rateLimit({ maxRequests: 1, windowMs: 50 }); // 50ms window
    const app = new Hono();
    app.use('*', limiter);
    app.get('/', (c) => c.json({ ok: true }));

    // Exhaust limit
    await app.request('/', { headers: { 'X-Forwarded-For': '10.0.0.3' } });
    const blockedRes = await app.request('/', { headers: { 'X-Forwarded-For': '10.0.0.3' } });
    expect(blockedRes.status).toBe(429);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));

    // Should work again
    const res = await app.request('/', { headers: { 'X-Forwarded-For': '10.0.0.3' } });
    expect(res.status).toBe(200);
  });

  it('should skip rate limiting in test environment', async () => {
    config.nodeEnv = 'test';

    const limiter = rateLimit({ maxRequests: 1, windowMs: 60_000 });
    const app = new Hono();
    app.use('*', limiter);
    app.get('/', (c) => c.json({ ok: true }));

    // Should succeed even after exceeding the limit
    await app.request('/', { headers: { 'X-Forwarded-For': '10.0.0.4' } });
    const res = await app.request('/', { headers: { 'X-Forwarded-For': '10.0.0.4' } });
    expect(res.status).toBe(200);
  });
});

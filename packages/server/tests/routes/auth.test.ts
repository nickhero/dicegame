import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { createApp } from '../../src/app';
import { createTestDb } from '../../src/db/connection';
import { users } from '../../src/db/schema';
import { config } from '../../src/config';

function applyUsersSchema(db: ReturnType<typeof createTestDb>) {
  db.run(sql`CREATE TABLE IF NOT EXISTS users (\n    id TEXT PRIMARY KEY,\n    display_name TEXT NOT NULL,\n    is_guest INTEGER NOT NULL DEFAULT 1,\n    password_hash TEXT,\n    created_at TEXT NOT NULL,\n    last_seen_at TEXT NOT NULL\n  )`);
}

const encoder = new TextEncoder();

async function createToken(
  sub: string,
  name: string,
  opts?: { iat?: number; exp?: string },
) {
  const secret = encoder.encode(config.jwtSecret);
  let builder = new SignJWT({ name, isGuest: true })
    .setSubject(sub)
    .setProtectedHeader({ alg: 'HS256' });

  if (opts?.iat !== undefined) {
    builder = builder.setIssuedAt(opts.iat);
  } else {
    builder = builder.setIssuedAt();
  }

  builder = builder.setExpirationTime(opts?.exp ?? '24h');
  return builder.sign(secret);
}

describe('Auth endpoints', () => {
  let db: ReturnType<typeof createTestDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    applyUsersSchema(db);
    app = createApp(db);
  });

  describe('POST /api/auth/guest', () => {
    it('creates guest user with valid name', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'TestPlayer' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeTruthy();
      expect(body.user.name).toBe('TestPlayer');
      expect(body.user.isGuest).toBe(true);
      expect(body.user.id).toMatch(/^guest_/);
    });

    it('persists guest user to database', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Persisted' }),
      });
      const body = await res.json();

      const dbUsers = db.select().from(users).all();
      expect(dbUsers).toHaveLength(1);
      expect(dbUsers[0].id).toBe(body.user.id);
      expect(dbUsers[0].displayName).toBe('Persisted');
      expect(dbUsers[0].isGuest).toBe(true);
    });

    it('multiple guest creations return different IDs', async () => {
      const res1 = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Player1' }),
      });
      const res2 = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Player2' }),
      });
      const body1 = await res1.json();
      const body2 = await res2.json();
      expect(body1.user.id).not.toBe(body2.user.id);

      const dbUsers = db.select().from(users).all();
      expect(dbUsers).toHaveLength(2);
    });

    it('rejects empty name', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: '' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('AUTH_INVALID_NAME');
    });

    it('rejects name too short', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'A' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects name too long', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'A'.repeat(21) }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects special characters', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: '<script>alert(1)</script>' }),
      });
      expect(res.status).toBe(400);
    });

    it('accepts name with spaces and hyphens', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Cool Player-1' }),
      });
      expect(res.status).toBe(200);
    });

    it('rejects guest username if it belongs to a registered account', async () => {
      await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'RegisteredGeneral', password: 'mypassword123' }),
      });

      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'RegisteredGeneral' }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('AUTH_USERNAME_TAKEN');

      const resLower = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'registeredgeneral' }),
      });
      expect(resLower.status).toBe(409);
    });

    it('rejects guest username even if a guest with that name was created prior to registration', async () => {
      await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'PriorUser' }),
      });

      const regRes = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'PriorUser', password: 'password123' }),
      });
      expect(regRes.status).toBe(200);

      const guestRes = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'PriorUser' }),
      });
      expect(guestRes.status).toBe(409);
      const body = await guestRes.json();
      expect(body.error.code).toBe('AUTH_USERNAME_TAKEN');

      const loginRes = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'PriorUser', password: 'password123' }),
      });
      expect(loginRes.status).toBe(200);
    });

    it('allows guest username if it matches another guest user', async () => {
      const res1 = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'GuestHero' }),
      });
      expect(res1.status).toBe(200);

      const res2 = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'GuestHero' }),
      });
      expect(res2.status).toBe(200);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('requires valid auth', async () => {
      const res = await app.request('/api/auth/refresh', {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });

    it('rejects fresh token (outside refresh window)', async () => {
      // Token issued just now — not eligible for refresh
      const token = await createToken('guest_test1', 'Tester');
      const res = await app.request('/api/auth/refresh', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toBe('Token not eligible for refresh yet');
    });

    it('succeeds within refresh window', async () => {
      // Create user in DB first (refresh calls updateLastSeen)
      const now = new Date().toISOString();
      db.insert(users)
        .values({ id: 'guest_old1', displayName: 'OldUser', isGuest: true, createdAt: now, lastSeenAt: now })
        .run();

      // Token issued 21 hours ago — within the last 4h refresh window
      const iat = Math.floor(Date.now() / 1000) - 21 * 60 * 60;
      const token = await createToken('guest_old1', 'OldUser', { iat, exp: '3h' });

      const res = await app.request('/api/auth/refresh', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeTruthy();
    });
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user successfully', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Commander123', password: 'supersecret123' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeTruthy();
      expect(body.user.name).toBe('Commander123');
      expect(body.user.isGuest).toBe(false);
      expect(body.user.id).toMatch(/^user_/);

      const dbUser = db.select().from(users).all()[0];
      expect(dbUser.displayName).toBe('Commander123');
      expect(dbUser.isGuest).toBe(false);
      expect(dbUser.passwordHash).toBeTruthy();
      expect(dbUser.passwordHash).not.toBe('supersecret123');
    });

    it('rejects short username', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ab', password: 'supersecret123' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects short password', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ValidUser', password: 'short' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("AUTH_INVALID_PASSWORD");
    });

    it("rejects password exceeding 128 chars", async () => {
      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "ValidUserLong", password: "a".repeat(129) }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("AUTH_INVALID_PASSWORD");
    });

    it('rejects duplicate username', async () => {
      await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ExistingUser', password: 'supersecret123' }),
      });

      const res2 = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ExistingUser', password: 'differentPass123' }),
      });
      expect(res2.status).toBe(409);
      const body2 = await res2.json();
      expect(body2.error.code).toBe('AUTH_USER_EXISTS');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'LoginUser', password: 'mypassword123' }),
      });
    });

    it('logs in successfully with correct credentials', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'LoginUser', password: 'mypassword123' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeTruthy();
      expect(body.user.name).toBe('LoginUser');
      expect(body.user.isGuest).toBe(false);
    });

    it('rejects invalid password', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'LoginUser', password: 'wrongpassword' }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('rejects non-existent username', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'UnknownUser', password: 'somepassword123' }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('rejects missing credentials', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'LoginUser' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Rate limiting', () => {
    it('blocks after threshold when not in test env', async () => {
      const { Hono } = await import('hono');
      const { rateLimit } = await import('../../src/middleware/rateLimit');

      // Temporarily override NODE_ENV to enable rate limiting
      const origEnv = config.nodeEnv;
      config.nodeEnv = 'production';

      try {
        // Create a minimal app with a small rate limit for fast testing
        const testApp = new Hono();
        const limiter = rateLimit({ maxRequests: 5, windowMs: 60_000 });
        testApp.post('/test', limiter, (c) => c.json({ ok: true }));

        // Make 5 successful requests
        for (let i = 0; i < 5; i++) {
          const res = await testApp.request('/test', {
            method: 'POST',
            headers: { 'X-Forwarded-For': '10.0.0.1' },
          });
          expect(res.status).toBe(200);
        }

        // 6th request should be rate limited
        const res = await testApp.request('/test', {
          method: 'POST',
          headers: { 'X-Forwarded-For': '10.0.0.1' },
        });
        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.error.code).toBe('AUTH_RATE_LIMITED');
      } finally {
        config.nodeEnv = origEnv;
      }
    });
  });
});

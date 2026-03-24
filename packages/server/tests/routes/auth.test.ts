import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { createApp } from '../../src/app';
import { createTestDb } from '../../src/db/connection';
import { users } from '../../src/db/schema';
import { config } from '../../src/config';

function applyUsersSchema(db: ReturnType<typeof createTestDb>) {
  db.run(sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    is_guest INTEGER NOT NULL DEFAULT 1,
    password_hash TEXT,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )`);
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
    it('returns 501 not implemented', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(501);
      const body = await res.json();
      expect(body.error).toBe('Not implemented');
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns 501 not implemented', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(501);
      const body = await res.json();
      expect(body.error).toBe('Not implemented');
    });
  });

  describe('Rate limiting', () => {
    it('blocks after threshold when not in test env', async () => {
      // Temporarily override NODE_ENV to enable rate limiting
      const origEnv = config.nodeEnv;
      config.nodeEnv = 'development';

      // Create a fresh app with rate limiting active
      const rateLimitedApp = createApp(db);

      try {
        // Make 10 successful requests
        for (let i = 0; i < 10; i++) {
          const res = await rateLimitedApp.request('/api/auth/guest', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Forwarded-For': '1.2.3.4',
            },
            body: JSON.stringify({ displayName: `Player${i}` }),
          });
          expect(res.status).toBe(200);
        }

        // 11th request should be rate limited
        const res = await rateLimitedApp.request('/api/auth/guest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '1.2.3.4',
          },
          body: JSON.stringify({ displayName: 'Blocked' }),
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

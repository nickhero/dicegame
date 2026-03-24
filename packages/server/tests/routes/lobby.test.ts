import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { createApp } from '../../src/app';
import { createTestDb } from '../../src/db/connection';
import { config } from '../../src/config';

type TestDb = ReturnType<typeof createTestDb>;

function applySchema(db: TestDb) {
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

const validConfig = {
  playerCount: 4,
  territoryCount: 28,
  mapShape: 'rectangle',
  gridType: 'square',
  speed: 'normal',
  powerUps: false,
  fogOfWar: false,
  alliances: false,
  undoEnabled: true,
};

function authHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

describe('Lobby endpoints', () => {
  let db: TestDb;
  let app: ReturnType<typeof createApp>;
  let token: string;
  const userId = 'test-creator';
  const userName = 'Creator';

  beforeEach(async () => {
    db = createTestDb();
    applySchema(db);
    app = createApp(db);
    seedUser(db, userId, userName);
    token = await createTestToken(userId, userName);
  });

  // ── Create Game ───────────────────────────────────────────────

  describe('POST /api/games', () => {
    it('creates game with valid config → 201', async () => {
      const res = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Test Game', config: validConfig }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeTruthy();
      expect(body.name).toBe('Test Game');
      expect(body.creatorName).toBe(userName);
      expect(body.status).toBe('waiting');
      expect(body.playerCount).toBe(1);
      expect(body.maxPlayers).toBe(4);
      expect(body.hasPassword).toBe(false);
      expect(body.config.mapShape).toBe('rectangle');
      expect(body.config.gridType).toBe('square');
      expect(body.config.territoryCount).toBe(28);
    });

    it('creates game without auth → 401', async () => {
      const res = await app.request('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'No Auth', config: validConfig }),
      });
      expect(res.status).toBe(401);
    });

    it('rejects invalid config (player count < 2) → 400', async () => {
      const res = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Bad Config',
          config: { ...validConfig, playerCount: 1 },
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('LOBBY_INVALID_CONFIG');
    });

    it('rejects invalid config (player count > 8) → 400', async () => {
      const res = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Bad Config',
          config: { ...validConfig, playerCount: 10 },
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('LOBBY_INVALID_CONFIG');
    });

    it('rejects missing name → 400', async () => {
      const res = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ config: validConfig }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('LOBBY_INVALID_CONFIG');
    });

    it('rejects missing config → 400', async () => {
      const res = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'No Config' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('LOBBY_INVALID_CONFIG');
    });

    it('creates password-protected game', async () => {
      const res = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Secret Game',
          config: validConfig,
          password: 'mysecret',
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.hasPassword).toBe(true);
    });

    it('creates game with AI slots', async () => {
      const res = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'AI Game',
          config: validConfig,
          aiSlots: [
            { slot: 1, personality: 'aggressive' },
            { slot: 2, personality: 'cautious' },
          ],
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      // Creator (1) + 2 AI = 3
      expect(body.playerCount).toBe(3);
    });
  });

  // ── List Games ────────────────────────────────────────────────

  describe('GET /api/games', () => {
    it('returns empty array initially', async () => {
      const res = await app.request('/api/games', {
        headers: authHeaders(token),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('returns created public games', async () => {
      // Create a game first
      await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Public Game', config: validConfig }),
      });

      const res = await app.request('/api/games', {
        headers: authHeaders(token),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('Public Game');
      expect(body[0].status).toBe('waiting');
    });

    it('excludes started games', async () => {
      // Create and start a game (need 2 players via AI)
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Started Game',
          config: validConfig,
          aiSlots: [{ slot: 1, personality: 'aggressive' }],
        }),
      });
      const game = await createRes.json();

      await app.request(`/api/games/${game.id}/start`, {
        method: 'POST',
        headers: authHeaders(token),
      });

      const res = await app.request('/api/games', {
        headers: authHeaders(token),
      });
      const body = await res.json();
      expect(body).toHaveLength(0);
    });

    it('requires auth → 401', async () => {
      const res = await app.request('/api/games');
      expect(res.status).toBe(401);
    });
  });

  // ── Get Game ──────────────────────────────────────────────────

  describe('GET /api/games/:id', () => {
    it('returns game by ID → 200', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'My Game', config: validConfig }),
      });
      const game = await createRes.json();

      const res = await app.request(`/api/games/${game.id}`, {
        headers: authHeaders(token),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(game.id);
      expect(body.name).toBe('My Game');
    });

    it('returns 404 for non-existent game', async () => {
      const res = await app.request('/api/games/nonexistent', {
        headers: authHeaders(token),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('LOBBY_GAME_NOT_FOUND');
    });
  });

  // ── Join Game ─────────────────────────────────────────────────

  describe('POST /api/games/:id/join', () => {
    let gameId: string;

    beforeEach(async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Join Test', config: validConfig }),
      });
      const game = await createRes.json();
      gameId = game.id;
    });

    it('join game → 200', async () => {
      const joinerId = 'joiner-1';
      seedUser(db, joinerId, 'Joiner');
      const joinerToken = await createTestToken(joinerId, 'Joiner');

      const res = await app.request(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: authHeaders(joinerToken),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('join full game → 409', async () => {
      // Create a 2-player game with 1 AI slot — only 1 human slot left (creator fills it)
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Full Game',
          config: { ...validConfig, playerCount: 2 },
          aiSlots: [{ slot: 1, personality: 'balanced' }],
        }),
      });
      const game = await createRes.json();

      // Try to join — should fail because game is full (creator + 1 AI = 2/2)
      const joinerId = 'joiner-full';
      seedUser(db, joinerId, 'FullJoiner');
      const joinerToken = await createTestToken(joinerId, 'FullJoiner');

      const res = await app.request(`/api/games/${game.id}/join`, {
        method: 'POST',
        headers: authHeaders(joinerToken),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('LOBBY_GAME_FULL');
    });

    it('join started game → 409', async () => {
      // Create with AI so we can start
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Started',
          config: validConfig,
          aiSlots: [{ slot: 1, personality: 'aggressive' }],
        }),
      });
      const game = await createRes.json();

      await app.request(`/api/games/${game.id}/start`, {
        method: 'POST',
        headers: authHeaders(token),
      });

      const joinerId = 'joiner-started';
      seedUser(db, joinerId, 'Late');
      const joinerToken = await createTestToken(joinerId, 'Late');

      const res = await app.request(`/api/games/${game.id}/join`, {
        method: 'POST',
        headers: authHeaders(joinerToken),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('LOBBY_GAME_STARTED');
    });

    it('join with wrong password → 403', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Protected',
          config: validConfig,
          password: 'correct',
        }),
      });
      const game = await createRes.json();

      const joinerId = 'joiner-wrong-pw';
      seedUser(db, joinerId, 'WrongPW');
      const joinerToken = await createTestToken(joinerId, 'WrongPW');

      const res = await app.request(`/api/games/${game.id}/join`, {
        method: 'POST',
        headers: authHeaders(joinerToken),
        body: JSON.stringify({ password: 'wrong' }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('LOBBY_INVALID_PASSWORD');
    });

    it('join password-protected game with correct password → 200', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Protected OK',
          config: validConfig,
          password: 'secret123',
        }),
      });
      const game = await createRes.json();

      const joinerId = 'joiner-correct-pw';
      seedUser(db, joinerId, 'CorrectPW');
      const joinerToken = await createTestToken(joinerId, 'CorrectPW');

      const res = await app.request(`/api/games/${game.id}/join`, {
        method: 'POST',
        headers: authHeaders(joinerToken),
        body: JSON.stringify({ password: 'secret123' }),
      });
      expect(res.status).toBe(200);
    });

    it('join same game twice → 409', async () => {
      const joinerId = 'joiner-dupe';
      seedUser(db, joinerId, 'Dupe');
      const joinerToken = await createTestToken(joinerId, 'Dupe');

      await app.request(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: authHeaders(joinerToken),
        body: JSON.stringify({}),
      });

      const res = await app.request(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: authHeaders(joinerToken),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('LOBBY_ALREADY_JOINED');
    });
  });

  // ── Leave Game ────────────────────────────────────────────────

  describe('POST /api/games/:id/leave', () => {
    it('leave game → 200', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Leave Test', config: validConfig }),
      });
      const game = await createRes.json();

      const joinerId = 'joiner-leave';
      seedUser(db, joinerId, 'Leaver');
      const joinerToken = await createTestToken(joinerId, 'Leaver');

      await app.request(`/api/games/${game.id}/join`, {
        method: 'POST',
        headers: authHeaders(joinerToken),
        body: JSON.stringify({}),
      });

      const res = await app.request(`/api/games/${game.id}/leave`, {
        method: 'POST',
        headers: authHeaders(joinerToken),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('creator leaving abandons the game', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Creator Leave', config: validConfig }),
      });
      const game = await createRes.json();

      await app.request(`/api/games/${game.id}/leave`, {
        method: 'POST',
        headers: authHeaders(token),
      });

      // Game should now be abandoned
      const getRes = await app.request(`/api/games/${game.id}`, {
        headers: authHeaders(token),
      });
      const updated = await getRes.json();
      expect(updated.status).toBe('abandoned');
    });
  });

  // ── Start Game ────────────────────────────────────────────────

  describe('POST /api/games/:id/start', () => {
    it('start game as creator → 200', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Start Test',
          config: validConfig,
          aiSlots: [{ slot: 1, personality: 'balanced' }],
        }),
      });
      const game = await createRes.json();

      const res = await app.request(`/api/games/${game.id}/start`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('started');
    });

    it('start game as non-creator → 403', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Not My Game',
          config: validConfig,
          aiSlots: [{ slot: 1, personality: 'balanced' }],
        }),
      });
      const game = await createRes.json();

      const otherId = 'other-user';
      seedUser(db, otherId, 'Other');
      const otherToken = await createTestToken(otherId, 'Other');

      const res = await app.request(`/api/games/${game.id}/start`, {
        method: 'POST',
        headers: authHeaders(otherToken),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('LOBBY_NOT_CREATOR');
    });

    it('start game with too few players → 400', async () => {
      // Only creator, no AI — just 1 player
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Solo', config: validConfig }),
      });
      const game = await createRes.json();

      const res = await app.request(`/api/games/${game.id}/start`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('LOBBY_MIN_PLAYERS');
    });
  });

  // ── Cancel Game ───────────────────────────────────────────────

  describe('DELETE /api/games/:id', () => {
    it('cancel game as creator → 200', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Cancel Me', config: validConfig }),
      });
      const game = await createRes.json();

      const res = await app.request(`/api/games/${game.id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Should be abandoned, not in waiting list
      const listRes = await app.request('/api/games', {
        headers: authHeaders(token),
      });
      const list = await listRes.json();
      expect(list).toHaveLength(0);
    });

    it('cancel game as non-creator → 403', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Not Yours', config: validConfig }),
      });
      const game = await createRes.json();

      const otherId = 'cancel-other';
      seedUser(db, otherId, 'Intruder');
      const otherToken = await createTestToken(otherId, 'Intruder');

      const res = await app.request(`/api/games/${game.id}`, {
        method: 'DELETE',
        headers: authHeaders(otherToken),
      });
      expect(res.status).toBe(403);
    });
  });

  // ── Update Config ─────────────────────────────────────────────

  describe('PATCH /api/games/:id', () => {
    it('updates config as creator → 200', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Patch Test', config: validConfig }),
      });
      const game = await createRes.json();

      const res = await app.request(`/api/games/${game.id}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ config: { powerUps: true } }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('rejects non-creator → 403', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Not Yours', config: validConfig }),
      });
      const game = await createRes.json();

      const otherId = 'patch-other';
      seedUser(db, otherId, 'PatchOther');
      const otherToken = await createTestToken(otherId, 'PatchOther');

      const res = await app.request(`/api/games/${game.id}`, {
        method: 'PATCH',
        headers: authHeaders(otherToken),
        body: JSON.stringify({ config: { powerUps: true } }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ── Invite Code ───────────────────────────────────────────────

  describe('GET /api/games/invite/:code', () => {
    it('resolves valid invite code → 200', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Invite Test', config: validConfig }),
      });
      const game = await createRes.json();

      // Get invite code from DB
      const rooms = db.all<{ invite_code: string }>(
        sql`SELECT invite_code FROM game_rooms WHERE id = ${game.id}`,
      );
      const inviteCode = rooms[0].invite_code;

      const res = await app.request(`/api/games/invite/${inviteCode}`, {
        headers: authHeaders(token),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(game.id);
      expect(body.name).toBe('Invite Test');
    });

    it('returns 404 for invalid invite code', async () => {
      const res = await app.request('/api/games/invite/ZZZZZZ', {
        headers: authHeaders(token),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('LOBBY_GAME_NOT_FOUND');
    });
  });

  // ── AI Slots ──────────────────────────────────────────────────

  describe('AI slots', () => {
    it('AI slots are properly created', async () => {
      const createRes = await app.request('/api/games', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'AI Check',
          config: validConfig,
          aiSlots: [
            { slot: 1, personality: 'aggressive' },
            { slot: 2, personality: 'cautious' },
            { slot: 3, personality: 'balanced' },
          ],
        }),
      });
      expect(createRes.status).toBe(201);
      const game = await createRes.json();

      // Creator (1) + 3 AI = 4
      expect(game.playerCount).toBe(4);

      // Verify in DB
      const players = db.all<{ slot_index: number; is_ai: number; ai_personality: string | null }>(
        sql`SELECT slot_index, is_ai, ai_personality FROM game_players
            WHERE game_id = ${game.id} ORDER BY slot_index`,
      );
      expect(players).toHaveLength(4);
      // Slot 0 = creator (human)
      expect(players[0].is_ai).toBe(0);
      expect(players[0].slot_index).toBe(0);
      // Slots 1-3 = AI
      expect(players[1].is_ai).toBe(1);
      expect(players[1].ai_personality).toBe('aggressive');
      expect(players[2].is_ai).toBe(1);
      expect(players[2].ai_personality).toBe('cautious');
      expect(players[3].is_ai).toBe(1);
      expect(players[3].ai_personality).toBe('balanced');
    });
  });
});

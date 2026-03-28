/**
 * Integration tests for the spectator mode feature.
 *
 * Tests cover:
 *   - Spectator joining an active game and receiving full state
 *   - Spectator action restriction (attack, endTurn rejected)
 *   - Spectator count broadcasts on join/leave
 *   - Multiple spectators watching the same game
 *   - Spectator disconnect without grace period
 *   - All-AI game: creator becomes spectator automatically
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'node:http';
import { type Socket, io as ioClient } from 'socket.io-client';
import { sql } from 'drizzle-orm';
import type { AddressInfo } from 'node:net';
import { createSocketServer } from '../../src/ws';
import { createApp } from '../../src/app';
import { createTestDb } from '../../src/db/connection';
import { _resetWaitingRooms } from '../../src/ws/waitingRoom';
import { _resetGracePeriods } from '../../src/ws/disconnectHandler';
import { _resetSpectatorCounts } from '../../src/ws/spectatorHandlers';
import type { WireGameState } from '@dicewars/shared';

// ────────────────────────────────────────────
// Test Infrastructure
// ────────────────────────────────────────────

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

const AI_GAME_CONFIG = {
  playerCount: 2,
  territoryCount: 15,
  mapShape: 'rectangle',
  gridType: 'square',
  speed: 'instant',
  powerUps: false,
  fogOfWar: false,
  alliances: false,
};

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function connectGameClient(port: number, token: string): Socket {
  return ioClient(`http://localhost:${port}/game`, {
    autoConnect: false,
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
}

function waitForConnect(client: Socket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
    client.on('connect', () => { clearTimeout(timeout); resolve(); });
    client.on('connect_error', (err) => { clearTimeout(timeout); reject(err); });
    client.connect();
  });
}

function emit<T>(client: Socket, event: string, data?: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Ack timeout for ${event}`)), 5000);
    const args = data !== undefined
      ? [data, (ack: T) => { clearTimeout(timeout); resolve(ack); }]
      : [(ack: T) => { clearTimeout(timeout); resolve(ack); }];
    client.emit(event, ...args);
  });
}

function waitForEvent<T>(client: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Event timeout for ${event}`)), timeoutMs);
    client.once(event as string, (data: T) => { clearTimeout(timeout); resolve(data); });
  });
}

async function guestAuth(app: ReturnType<typeof createApp>, name: string): Promise<{ token: string; user: { id: string; name: string } }> {
  const res = await app.request('/api/auth/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: name }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

async function createGameViaREST(
  app: ReturnType<typeof createApp>,
  token: string,
  name: string,
  config = AI_GAME_CONFIG,
  aiSlots?: Array<{ slot: number; personality: string }>,
): Promise<{ id: string; name: string }> {
  const res = await app.request('/api/games', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, config, aiSlots }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

async function joinGameViaREST(
  app: ReturnType<typeof createApp>,
  token: string,
  gameId: string,
): Promise<void> {
  const res = await app.request(`/api/games/${gameId}/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
}

/**
 * Setup a human-vs-AI game, start it, and return the client + game info.
 */
async function setupHumanVsAIGame(
  app: ReturnType<typeof createApp>,
  port: number,
  clients: Socket[],
): Promise<{
  client: Socket;
  gameId: string;
  initialState: WireGameState;
  token: string;
}> {
  const { token } = await guestAuth(app, `P-${Date.now()}`);
  const game = await createGameViaREST(
    app, token, `Spec-${Date.now()}`, AI_GAME_CONFIG,
    [{ slot: 1, personality: 'cautious' }],
  );

  const client = connectGameClient(port, token);
  clients.push(client);
  await waitForConnect(client);
  await emit(client, 'game:join', { gameId: game.id });

  const statePromise = waitForEvent<WireGameState>(client, 'game:stateUpdate');
  await emit(client, 'game:start', { gameId: game.id });
  const initialState = await statePromise;

  return { client, gameId: game.id, initialState, token };
}

// ────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────

describe('Spectator Mode', () => {
  let httpServer: HttpServer;
  let port: number;
  let db: TestDb;
  let app: ReturnType<typeof createApp>;
  const clients: Socket[] = [];

  beforeAll(() => new Promise<void>((resolve) => {
    db = createTestDb();
    applySchema(db);
    app = createApp(db);
    httpServer = createServer();
    createSocketServer(httpServer, db);
    httpServer.listen(0, () => {
      port = (httpServer.address() as AddressInfo).port;
      resolve();
    });
  }));

  afterAll(() => new Promise<void>((resolve) => {
    for (const c of clients) c.disconnect();
    httpServer.close(() => resolve());
  }));

  afterEach(() => {
    for (const c of clients) c.disconnect();
    clients.length = 0;
    _resetWaitingRooms();
    _resetGracePeriods();
    _resetSpectatorCounts();
  });

  // ── Test 1: Spectator joins active game and receives full state ──

  it('spectator can join an active game and receive full state', async () => {
    const { gameId } = await setupHumanVsAIGame(app, port, clients);

    // Create a spectator
    const specAuth = await guestAuth(app, 'Spectator1');
    const specClient = connectGameClient(port, specAuth.token);
    clients.push(specClient);
    await waitForConnect(specClient);

    const statePromise = waitForEvent<WireGameState>(specClient, 'game:stateUpdate');

    const ack = await emit<{ success: boolean }>(
      specClient, 'game:spectate', { gameId },
    );
    expect(ack.success).toBe(true);

    const state = await statePromise;
    expect(state.territories.length).toBe(15);
    expect(state.players.length).toBe(2);
    // Full state: all territories visible
    expect(state.territories.every((t) => t.visible)).toBe(true);
  });

  // ── Test 2: Spectator cannot perform game actions (attack) ──

  it('spectator cannot perform game actions (attack rejected)', async () => {
    const { gameId } = await setupHumanVsAIGame(app, port, clients);

    const specAuth = await guestAuth(app, 'SpecNoAttack');
    const specClient = connectGameClient(port, specAuth.token);
    clients.push(specClient);
    await waitForConnect(specClient);

    // Set up listener BEFORE emitting spectate (event arrives during ack processing)
    const statePromise = waitForEvent<WireGameState>(specClient, 'game:stateUpdate');
    await emit(specClient, 'game:spectate', { gameId });
    await statePromise;

    const ack = await emit<{ success: boolean; error?: { code: string } }>(
      specClient, 'game:attack', { fromTerritoryId: 0, toTerritoryId: 1 },
    );
    expect(ack.success).toBe(false);
    expect(ack.error?.code).toBe('SPECTATOR_CANNOT_ACT');
  });

  // ── Test 3: Spectator cannot end turn ──

  it('spectator cannot end turn', async () => {
    const { gameId } = await setupHumanVsAIGame(app, port, clients);

    const specAuth = await guestAuth(app, 'SpecNoTurn');
    const specClient = connectGameClient(port, specAuth.token);
    clients.push(specClient);
    await waitForConnect(specClient);

    const statePromise = waitForEvent<WireGameState>(specClient, 'game:stateUpdate');
    await emit(specClient, 'game:spectate', { gameId });
    await statePromise;

    const ack = await emit<{ success: boolean; error?: { code: string } }>(
      specClient, 'game:endTurn',
    );
    expect(ack.success).toBe(false);
    expect(ack.error?.code).toBe('SPECTATOR_CANNOT_ACT');
  });

  // ── Test 4: Spectator count broadcasts on join/leave ──

  it('spectator count broadcasts correctly on join/leave', async () => {
    const { client, gameId } = await setupHumanVsAIGame(app, port, clients);

    const specAuth = await guestAuth(app, 'SpecCount');
    const specClient = connectGameClient(port, specAuth.token);
    clients.push(specClient);
    await waitForConnect(specClient);

    // Player should receive spectatorCount when spectator joins
    const countPromise = waitForEvent<{ count: number }>(client, 'game:spectatorCount');

    await emit(specClient, 'game:spectate', { gameId });

    const countData = await countPromise;
    expect(countData.count).toBe(1);

    // Now spectator leaves — player should receive updated count
    const leaveCountPromise = waitForEvent<{ count: number }>(client, 'game:spectatorCount');

    await emit(specClient, 'game:leaveSpectate');

    const leaveCountData = await leaveCountPromise;
    expect(leaveCountData.count).toBe(0);
  });

  // ── Test 5: Multiple spectators can watch the same game ──

  it('multiple spectators can watch the same game', async () => {
    const { client, gameId } = await setupHumanVsAIGame(app, port, clients);

    const spec1Auth = await guestAuth(app, 'Spec1');
    const spec2Auth = await guestAuth(app, 'Spec2');

    const spec1 = connectGameClient(port, spec1Auth.token);
    const spec2 = connectGameClient(port, spec2Auth.token);
    clients.push(spec1, spec2);

    await Promise.all([waitForConnect(spec1), waitForConnect(spec2)]);

    // First spectator joins
    const count1Promise = waitForEvent<{ count: number }>(client, 'game:spectatorCount');
    await emit(spec1, 'game:spectate', { gameId });
    const count1 = await count1Promise;
    expect(count1.count).toBe(1);

    // Second spectator joins
    const count2Promise = waitForEvent<{ count: number }>(client, 'game:spectatorCount');
    await emit(spec2, 'game:spectate', { gameId });
    const count2 = await count2Promise;
    expect(count2.count).toBe(2);

    // Both should have received state
    // (stateUpdate was emitted during spectate, this just verifies no crash)
  });

  // ── Test 6: Spectator disconnect doesn't trigger grace period ──

  it('spectator disconnect does not trigger grace period', async () => {
    const { client, gameId } = await setupHumanVsAIGame(app, port, clients);

    const specAuth = await guestAuth(app, 'SpecDisc');
    const specClient = connectGameClient(port, specAuth.token);
    clients.push(specClient);
    await waitForConnect(specClient);

    // Listen for join's spectatorCount event on the host client
    const joinCountPromise = waitForEvent<{ count: number }>(client, 'game:spectatorCount');

    const statePromise = waitForEvent<WireGameState>(specClient, 'game:stateUpdate');
    await emit(specClient, 'game:spectate', { gameId });
    await statePromise;

    // Consume the join broadcast (count = 1) before listening for disconnect
    const joinCount = await joinCountPromise;
    expect(joinCount.count).toBe(1);

    // Listen for playerDisconnected — should NOT fire for spectators
    let disconnectFired = false;
    client.on('game:playerDisconnected', () => { disconnectFired = true; });

    // Now listen for spectatorCount update after disconnect
    const countPromise = waitForEvent<{ count: number }>(client, 'game:spectatorCount');

    specClient.disconnect();

    const countData = await countPromise;
    expect(countData.count).toBe(0);

    // Give a small window to ensure playerDisconnected doesn't fire
    await new Promise((r) => setTimeout(r, 200));
    expect(disconnectFired).toBe(false);
  });

  // ── Test 7: All-AI game: creator becomes spectator ──

  it('all-AI game: creator becomes spectator automatically', async () => {
    const { token } = await guestAuth(app, 'AIHost');

    // Create a 2-player game with AI at slot 1
    const allAIConfig = {
      playerCount: 2,
      territoryCount: 15,
      mapShape: 'rectangle',
      gridType: 'square',
      speed: 'instant',
      powerUps: false,
      fogOfWar: false,
      alliances: false,
    };

    const game = await createGameViaREST(
      app, token, 'AllAIGame', allAIConfig,
      [{ slot: 1, personality: 'cautious' }],
    );

    // Manually update creator's slot to be AI (simulating all-AI setup)
    db.run(sql`UPDATE game_players SET is_ai = 1, ai_personality = 'aggressive' WHERE game_id = ${game.id} AND slot_index = 0`);

    const client = connectGameClient(port, token);
    clients.push(client);
    await waitForConnect(client);
    await emit(client, 'game:join', { gameId: game.id });

    // Start the game — should receive stateUpdate
    const statePromise = waitForEvent<WireGameState>(client, 'game:stateUpdate');
    const ack = await emit<{ success: boolean }>(client, 'game:start', { gameId: game.id });
    expect(ack.success).toBe(true);

    const state = await statePromise;
    expect(state.territories.length).toBe(15);
    expect(state.players.every((p) => p.isAI)).toBe(true);

    // Creator should NOT be able to perform actions (is spectator)
    const attackAck = await emit<{ success: boolean; error?: { code: string } }>(
      client, 'game:attack', { fromTerritoryId: 0, toTerritoryId: 1 },
    );
    expect(attackAck.success).toBe(false);
    expect(attackAck.error?.code).toBe('SPECTATOR_CANNOT_ACT');
  });

  // ── Test: Spectator joining non-existent game ──

  it('spectating a non-existent game returns error', async () => {
    const specAuth = await guestAuth(app, 'SpecNone');
    const specClient = connectGameClient(port, specAuth.token);
    clients.push(specClient);
    await waitForConnect(specClient);

    const ack = await emit<{ success: boolean; error?: { code: string } }>(
      specClient, 'game:spectate', { gameId: 'nonexistent-game-id' },
    );
    expect(ack.success).toBe(false);
    expect(ack.error?.code).toBe('GAME_NOT_FOUND');
  });
});

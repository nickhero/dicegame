/**
 * End-to-end integration tests for the full client↔server WebSocket flow.
 *
 * Tests the complete game lifecycle:
 *   Auth → Lobby → WaitingRoom → Game (attack, endTurn, surrender, powerUps)
 *
 * These tests spin up a real HTTP + Socket.IO server and connect real
 * socket.io-client instances — the same transport the Phaser client uses.
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

const DEFAULT_GAME_CONFIG = {
  playerCount: 2,
  territoryCount: 15,
  mapShape: 'rectangle',
  gridType: 'square',
  speed: 'normal',
  powerUps: false,
  fogOfWar: false,
  alliances: false,
};

/** Minimal 2-player game with 1 AI slot so a single human can start it. */
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
// Helper functions
// ────────────────────────────────────────────

function connectGameClient(port: number, token: string): Socket {
  return ioClient(`http://localhost:${port}/game`, {
    autoConnect: false,
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
}

function connectLobbyClient(port: number, token: string): Socket {
  return ioClient(`http://localhost:${port}/lobby`, {
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
  config = DEFAULT_GAME_CONFIG,
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

// ────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────

describe('Integration: Full Game Flow', () => {
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
  });

  // ── Auth ──────────────────────────────────

  describe('Auth → Lobby → Game lifecycle', () => {
    it('guest auth returns token and user info', async () => {
      const { token, user } = await guestAuth(app, 'Alice');
      expect(token).toBeTruthy();
      expect(user.name).toBe('Alice');
      expect(user.id).toMatch(/^guest_/);
    });

    it('lobby WS receives game list on connect', async () => {
      const { token } = await guestAuth(app, 'Lobby-Test');
      const lobbyClient = connectLobbyClient(port, token);
      clients.push(lobbyClient);

      const gameList = waitForEvent<unknown[]>(lobbyClient, 'lobby:gameList');
      await waitForConnect(lobbyClient);
      const list = await gameList;

      expect(Array.isArray(list)).toBe(true);
    });
  });

  // ── Game creation + waiting room ──────────

  describe('Waiting room flow', () => {
    it('player can create game, join WS room, and ready up', async () => {
      const { token } = await guestAuth(app, 'Creator');
      const game = await createGameViaREST(app, token, 'Test Room');
      expect(game.id).toBeTruthy();

      const client = connectGameClient(port, token);
      clients.push(client);
      await waitForConnect(client);

      const joinAck = await emit<{ success: boolean; data?: unknown }>(
        client, 'game:join', { gameId: game.id },
      );
      expect(joinAck.success).toBe(true);

      const readyAck = await emit<{ success: boolean }>(client, 'game:ready');
      expect(readyAck.success).toBe(true);
    });

    it('second player joining emits playerJoined to first player', async () => {
      const auth1 = await guestAuth(app, 'Host');
      const auth2 = await guestAuth(app, 'Joiner');

      const game = await createGameViaREST(app, auth1.token, 'Join Test');
      await joinGameViaREST(app, auth2.token, game.id);

      const host = connectGameClient(port, auth1.token);
      clients.push(host);
      await waitForConnect(host);
      await emit(host, 'game:join', { gameId: game.id });

      const joinedPromise = waitForEvent<{ playerIndex: number; name: string }>(host, 'game:playerJoined');

      const joiner = connectGameClient(port, auth2.token);
      clients.push(joiner);
      await waitForConnect(joiner);
      await emit(joiner, 'game:join', { gameId: game.id });

      const joined = await joinedPromise;
      expect(joined.playerIndex).toBeGreaterThanOrEqual(0);
      expect(joined.name).toBe('Joiner');
    });
  });

  // ── Game start + state ────────────────────

  describe('Game start and initial state', () => {
    it('creator can start game, all players receive stateUpdate', async () => {
      const auth1 = await guestAuth(app, 'Starter');
      const auth2 = await guestAuth(app, 'Player2');

      const game = await createGameViaREST(app, auth1.token, 'Start Test');
      await joinGameViaREST(app, auth2.token, game.id);

      const client1 = connectGameClient(port, auth1.token);
      const client2 = connectGameClient(port, auth2.token);
      clients.push(client1, client2);

      await Promise.all([waitForConnect(client1), waitForConnect(client2)]);
      await Promise.all([
        emit(client1, 'game:join', { gameId: game.id }),
        emit(client2, 'game:join', { gameId: game.id }),
      ]);

      const state1Promise = waitForEvent<WireGameState>(client1, 'game:stateUpdate');
      const state2Promise = waitForEvent<WireGameState>(client2, 'game:stateUpdate');

      const startAck = await emit<{ success: boolean }>(
        client1, 'game:start', { gameId: game.id },
      );
      expect(startAck.success).toBe(true);

      const [state1, state2] = await Promise.all([state1Promise, state2Promise]);

      expect(state1.territories.length).toBe(15);
      expect(state1.players.length).toBe(2);
      expect(state1.turnNumber).toBe(1);
      expect(state1.gameOver).toBe(false);
      expect(state1.currentPlayerIndex).toBe(state2.currentPlayerIndex);

      // WireTerritory contract
      const t = state1.territories[0];
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('cells');
      expect(t).toHaveProperty('center');
      expect(t).toHaveProperty('neighborIds');
      expect(t).toHaveProperty('owner');
      expect(t).toHaveProperty('dice');
      expect(Array.isArray(t.cells)).toBe(true);
      expect(t.center).toHaveLength(2);

      // WirePlayer contract
      const p = state1.players[0];
      expect(p).toHaveProperty('index');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('color');
      expect(p).toHaveProperty('isAI');
      expect(p).toHaveProperty('alive');
      expect(p).toHaveProperty('territoryCount');
      expect(p.alive).toBe(true);
    });

    it('non-creator cannot start the game', async () => {
      const auth1 = await guestAuth(app, 'Creator2');
      const auth2 = await guestAuth(app, 'NotCreator');

      const game = await createGameViaREST(app, auth1.token, 'No-Start Test');
      await joinGameViaREST(app, auth2.token, game.id);

      const client2 = connectGameClient(port, auth2.token);
      clients.push(client2);
      await waitForConnect(client2);
      await emit(client2, 'game:join', { gameId: game.id });

      const ack = await emit<{ success: boolean; error?: { code: string } }>(
        client2, 'game:start', { gameId: game.id },
      );
      expect(ack.success).toBe(false);
      expect(ack.error?.code).toBeTruthy();
    });
  });

  // ── Game actions ──────────────────────────

  describe('Game actions (attack, endTurn, surrender)', () => {
    async function setupHumanVsAIGame(): Promise<{
      client: Socket;
      gameId: string;
      initialState: WireGameState;
      token: string;
    }> {
      const { token } = await guestAuth(app, `P-${Date.now()}`);
      const game = await createGameViaREST(
        app, token, `Action-${Date.now()}`, AI_GAME_CONFIG,
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

    it('attack emits battleResult + stateUpdate', async () => {
      const { client, initialState } = await setupHumanVsAIGame();

      // Wait until it's the human's turn
      let state = initialState;
      while (state.currentPlayerIndex !== 0) {
        state = await waitForEvent<WireGameState>(client, 'game:stateUpdate', 10000);
      }

      // Find a valid attack pair
      const myTerritory = state.territories.find(
        (t) => t.owner === 0 && t.dice > 1 && t.neighborIds.some(
          (nid) => state.territories[nid].owner !== 0,
        ),
      );

      if (!myTerritory) {
        console.warn('No valid attack found, skipping');
        return;
      }

      const target = myTerritory.neighborIds.find(
        (nid) => state.territories[nid].owner !== 0,
      )!;

      const battlePromise = waitForEvent<{
        attackerTerritoryId: number;
        defenderTerritoryId: number;
        attackerDice: number[];
        defenderDice: number[];
        attackerWins: boolean;
      }>(client, 'game:battleResult');

      const statePromise = waitForEvent<WireGameState>(client, 'game:stateUpdate');

      const ack = await emit<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>(
        client, 'game:attack', { fromTerritoryId: myTerritory.id, toTerritoryId: target },
      );
      expect(ack.success).toBe(true);

      const battle = await battlePromise;
      expect(battle.attackerTerritoryId).toBe(myTerritory.id);
      expect(battle.defenderTerritoryId).toBe(target);
      expect(Array.isArray(battle.attackerDice)).toBe(true);
      expect(Array.isArray(battle.defenderDice)).toBe(true);
      expect(typeof battle.attackerWins).toBe('boolean');

      // Dice counts match territory dice
      expect(battle.attackerDice.length).toBe(myTerritory.dice);

      const newState = await statePromise;
      expect(newState.territories.length).toBeGreaterThan(0);
    });

    it('endTurn emits turnChanged + stateUpdate', async () => {
      const { client, initialState } = await setupHumanVsAIGame();

      let state = initialState;
      while (state.currentPlayerIndex !== 0) {
        state = await waitForEvent<WireGameState>(client, 'game:stateUpdate', 10000);
      }

      const turnPromise = waitForEvent<{
        previousPlayerIndex: number;
        currentPlayerIndex: number;
        turnNumber: number;
        bonusDice: number;
      }>(client, 'game:turnChanged');

      const ack = await emit<{ success: boolean }>(client, 'game:endTurn');
      expect(ack.success).toBe(true);

      const turn = await turnPromise;
      expect(turn.previousPlayerIndex).toBe(0);
      expect(turn.currentPlayerIndex).toBe(1);
      expect(typeof turn.bonusDice).toBe('number');
      expect(turn.turnNumber).toBeGreaterThanOrEqual(1);
    });

    it('cannot attack when it is not your turn', async () => {
      // Use a 2-human game so the turn doesn't auto-cycle back
      const auth1 = await guestAuth(app, `Turn1-${Date.now()}`);
      const auth2 = await guestAuth(app, `Turn2-${Date.now()}`);

      const game = await createGameViaREST(
        app, auth1.token, `TurnCheck-${Date.now()}`, DEFAULT_GAME_CONFIG,
      );
      await joinGameViaREST(app, auth2.token, game.id);

      const client1 = connectGameClient(port, auth1.token);
      const client2 = connectGameClient(port, auth2.token);
      clients.push(client1, client2);

      await Promise.all([waitForConnect(client1), waitForConnect(client2)]);
      await Promise.all([
        emit(client1, 'game:join', { gameId: game.id }),
        emit(client2, 'game:join', { gameId: game.id }),
      ]);

      const s1 = waitForEvent<WireGameState>(client1, 'game:stateUpdate');
      await emit(client1, 'game:start', { gameId: game.id });
      const state = await s1;

      // Determine which client is NOT the current player
      const nonActiveClient = state.currentPlayerIndex === 0 ? client2 : client1;
      const nonActiveIdx = state.currentPlayerIndex === 0 ? 1 : 0;

      // Find a territory owned by the non-active player that could attack
      const t = state.territories.find(
        (t) => t.owner === nonActiveIdx && t.dice > 1 && t.neighborIds.some(
          (nid) => state.territories[nid].owner !== nonActiveIdx,
        ),
      );
      if (!t) return; // inconclusive

      const neighbor = t.neighborIds.find((nid) => state.territories[nid].owner !== nonActiveIdx)!;

      const ack = await emit<{ success: boolean; error?: { code: string } }>(
        nonActiveClient, 'game:attack', { fromTerritoryId: t.id, toTerritoryId: neighbor },
      );
      expect(ack.success).toBe(false);
      expect(ack.error?.code).toBeTruthy();
    });

    it('cannot attack own territory', async () => {
      const { client, initialState } = await setupHumanVsAIGame();

      let state = initialState;
      while (state.currentPlayerIndex !== 0) {
        state = await waitForEvent<WireGameState>(client, 'game:stateUpdate', 10000);
      }

      const myTerritories = state.territories.filter((t) => t.owner === 0);
      if (myTerritories.length < 2) return;

      // Find two adjacent own territories
      const from = myTerritories.find((t) => t.dice > 1 && t.neighborIds.some(
        (nid) => state.territories[nid].owner === 0,
      ));
      if (!from) return;

      const to = from.neighborIds.find((nid) => state.territories[nid].owner === 0)!;

      const ack = await emit<{ success: boolean; error?: { code: string } }>(
        client, 'game:attack', { fromTerritoryId: from.id, toTerritoryId: to },
      );
      expect(ack.success).toBe(false);
    });

    it('surrender ends game when 2 players', async () => {
      const { client } = await setupHumanVsAIGame();

      const gameOverPromise = waitForEvent<{ winnerIndex: number }>(client, 'game:gameOver');

      const ack = await emit<{ success: boolean }>(client, 'game:surrender');
      expect(ack.success).toBe(true);

      const gameOver = await gameOverPromise;
      expect(gameOver.winnerIndex).toBe(1); // AI wins
    });
  });

  // ── Error handling ────────────────────────

  describe('Error handling', () => {
    it('game actions fail when not in a game room', async () => {
      const { token } = await guestAuth(app, 'NoRoom');
      const client = connectGameClient(port, token);
      clients.push(client);
      await waitForConnect(client);

      const attackAck = await emit<{ success: boolean; error?: { code: string } }>(
        client, 'game:attack', { fromTerritoryId: 0, toTerritoryId: 1 },
      );
      expect(attackAck.success).toBe(false);
      expect(attackAck.error?.code).toBe('CONNECTION_NOT_IN_GAME');

      const endAck = await emit<{ success: boolean; error?: { code: string } }>(
        client, 'game:endTurn',
      );
      expect(endAck.success).toBe(false);
      expect(endAck.error?.code).toBe('CONNECTION_NOT_IN_GAME');

      const surrenderAck = await emit<{ success: boolean; error?: { code: string } }>(
        client, 'game:surrender',
      );
      expect(surrenderAck.success).toBe(false);
      expect(surrenderAck.error?.code).toBe('CONNECTION_NOT_IN_GAME');
    });

    it('joining non-existent game fails', async () => {
      const { token } = await guestAuth(app, 'BadJoin');
      const client = connectGameClient(port, token);
      clients.push(client);
      await waitForConnect(client);

      const ack = await emit<{ success: boolean; error?: { code: string } }>(
        client, 'game:join', { gameId: 'nonexistent-id' },
      );
      expect(ack.success).toBe(false);
    });

    it('unauthenticated /game connection is rejected', async () => {
      const client = ioClient(`http://localhost:${port}/game`, {
        autoConnect: false,
        transports: ['websocket'],
        reconnection: false,
      });
      clients.push(client);

      const error = await new Promise<Error>((resolve) => {
        client.on('connect_error', resolve);
        client.connect();
      });
      expect(error.message).toBe('AUTH_REQUIRED');
    });
  });

  // ── Wire format contract ──────────────────

  describe('Wire format contract', () => {
    it('WireGameState matches expected shape for deserialization', async () => {
      const auth1 = await guestAuth(app, 'Wire1');
      const auth2 = await guestAuth(app, 'Wire2');

      const game = await createGameViaREST(app, auth1.token, 'Wire Test');
      await joinGameViaREST(app, auth2.token, game.id);

      const client = connectGameClient(port, auth1.token);
      clients.push(client);
      await waitForConnect(client);
      await emit(client, 'game:join', { gameId: game.id });

      const client2 = connectGameClient(port, auth2.token);
      clients.push(client2);
      await waitForConnect(client2);
      await emit(client2, 'game:join', { gameId: game.id });

      const statePromise = waitForEvent<WireGameState>(client, 'game:stateUpdate');
      await emit(client, 'game:start', { gameId: game.id });
      const state = await statePromise;

      // Top-level required fields
      expect(state).toHaveProperty('territories');
      expect(state).toHaveProperty('players');
      expect(state).toHaveProperty('currentPlayerIndex');
      expect(state).toHaveProperty('turnNumber');
      expect(state).toHaveProperty('phase');
      expect(state).toHaveProperty('alliances');
      expect(state).toHaveProperty('powerUpLocations');
      expect(state).toHaveProperty('gameOver');
      expect(state).toHaveProperty('winner');

      // Type assertions
      expect(typeof state.currentPlayerIndex).toBe('number');
      expect(typeof state.turnNumber).toBe('number');
      expect(typeof state.gameOver).toBe('boolean');
      expect(['selectingAttacker', 'selectingDefender']).toContain(state.phase);
      expect(Array.isArray(state.alliances)).toBe(true);
      expect(Array.isArray(state.powerUpLocations)).toBe(true);

      // WireTerritory: cells are [number, number][] tuples, center is [number, number]
      for (const t of state.territories) {
        expect(typeof t.id).toBe('number');
        expect(Array.isArray(t.cells)).toBe(true);
        if (t.cells.length > 0) {
          expect(t.cells[0]).toHaveLength(2);
          expect(typeof t.cells[0][0]).toBe('number');
          expect(typeof t.cells[0][1]).toBe('number');
        }
        expect(t.center).toHaveLength(2);
        expect(typeof t.center[0]).toBe('number');
        expect(typeof t.center[1]).toBe('number');
        expect(Array.isArray(t.neighborIds)).toBe(true);
        expect(typeof t.owner).toBe('number');
        expect(typeof t.dice).toBe('number');
        expect(t.dice).toBeGreaterThanOrEqual(1);
        expect(typeof t.visible).toBe('boolean');
      }

      // WirePlayer
      for (const p of state.players) {
        expect(typeof p.index).toBe('number');
        expect(typeof p.name).toBe('string');
        expect(typeof p.color).toBe('number');
        expect(typeof p.isAI).toBe('boolean');
        expect(typeof p.alive).toBe('boolean');
        expect(typeof p.territoryCount).toBe('number');
        expect(p.territoryCount).toBeGreaterThan(0);
      }

      // Adjacency: every neighborId should reference a valid territory
      const allIds = new Set(state.territories.map((t) => t.id));
      for (const t of state.territories) {
        for (const nid of t.neighborIds) {
          expect(allIds.has(nid)).toBe(true);
        }
      }
    });
  });

  // ── Disconnect/reconnect ──────────────────

  describe('Disconnect and reconnect', () => {
    it('disconnect emits playerDisconnected to other players', async () => {
      const auth1 = await guestAuth(app, 'Disc-Host');
      const auth2 = await guestAuth(app, 'Disc-Player');

      const game = await createGameViaREST(app, auth1.token, 'Disconnect Test');
      await joinGameViaREST(app, auth2.token, game.id);

      const client1 = connectGameClient(port, auth1.token);
      const client2 = connectGameClient(port, auth2.token);
      clients.push(client1, client2);

      await Promise.all([waitForConnect(client1), waitForConnect(client2)]);
      await Promise.all([
        emit(client1, 'game:join', { gameId: game.id }),
        emit(client2, 'game:join', { gameId: game.id }),
      ]);

      // Start game (need 2 state updates — one for each client)
      const start1 = waitForEvent<WireGameState>(client1, 'game:stateUpdate');
      const start2 = waitForEvent<WireGameState>(client2, 'game:stateUpdate');
      await emit(client1, 'game:start', { gameId: game.id });
      await Promise.all([start1, start2]);

      // Listen for disconnect notification on client1
      const disconnectPromise = waitForEvent<{ playerIndex: number; graceSeconds: number }>(
        client1, 'game:playerDisconnected',
      );

      // Client2 disconnects
      client2.disconnect();

      const disconnectEvent = await disconnectPromise;
      expect(disconnectEvent.playerIndex).toBeGreaterThanOrEqual(0);
      expect(typeof disconnectEvent.graceSeconds).toBe('number');
      expect(disconnectEvent.graceSeconds).toBeGreaterThan(0);
    });

    it('reconnect restores game state and cancels grace period', async () => {
      const auth1 = await guestAuth(app, 'Recon-Host');
      const auth2 = await guestAuth(app, 'Recon-Player');

      const game = await createGameViaREST(app, auth1.token, 'Reconnect Test');
      await joinGameViaREST(app, auth2.token, game.id);

      const client1 = connectGameClient(port, auth1.token);
      const client2 = connectGameClient(port, auth2.token);
      clients.push(client1);

      await Promise.all([waitForConnect(client1), waitForConnect(client2)]);
      await Promise.all([
        emit(client1, 'game:join', { gameId: game.id }),
        emit(client2, 'game:join', { gameId: game.id }),
      ]);

      // Start game
      const s1 = waitForEvent<WireGameState>(client1, 'game:stateUpdate');
      const s2 = waitForEvent<WireGameState>(client2, 'game:stateUpdate');
      await emit(client1, 'game:start', { gameId: game.id });
      await Promise.all([s1, s2]);

      // Disconnect client2
      client2.disconnect();
      await new Promise((r) => setTimeout(r, 300));

      // Reconnect
      const client2b = connectGameClient(port, auth2.token);
      clients.push(client2b);
      await waitForConnect(client2b);

      // Listen for reconnected event on client1
      const reconEventPromise = waitForEvent<{ playerIndex: number }>(
        client1, 'game:playerReconnected', 3000,
      );

      const reconAck = await emit<{ success: boolean; data?: WireGameState }>(
        client2b, 'game:reconnect', { gameId: game.id },
      );
      expect(reconAck.success).toBe(true);
      expect(reconAck.data).toBeTruthy();
      expect(reconAck.data!.territories.length).toBe(15);
      expect(reconAck.data!.players.length).toBe(2);

      // Other player received reconnect notification
      const reconEvent = await reconEventPromise;
      expect(reconEvent.playerIndex).toBeGreaterThanOrEqual(0);
    });
  });

  // ── REST Lobby API ────────────────────────

  describe('REST Lobby API', () => {
    it('GET /api/games lists waiting games', async () => {
      const { token } = await guestAuth(app, 'Lister');
      await createGameViaREST(app, token, 'Listed Game');

      const res = await app.request('/api/games', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const games = await res.json();
      expect(Array.isArray(games)).toBe(true);
      const found = games.find((g: { name: string }) => g.name === 'Listed Game');
      expect(found).toBeTruthy();
      expect(found.status).toBe('waiting');
      expect(found.config).toBeTruthy();
      expect(found.config.mapShape).toBe('rectangle');
    });

    it('POST /api/games/:id/join + leave works', async () => {
      const auth1 = await guestAuth(app, 'JL-Creator');
      const auth2 = await guestAuth(app, 'JL-Joiner');

      const game = await createGameViaREST(app, auth1.token, 'JoinLeave');

      await joinGameViaREST(app, auth2.token, game.id);

      let res = await app.request(`/api/games/${game.id}`, {
        headers: { Authorization: `Bearer ${auth1.token}` },
      });
      let detail = await res.json();
      expect(detail.playerCount).toBe(2);

      res = await app.request(`/api/games/${game.id}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth2.token}` },
      });
      expect(res.status).toBe(200);

      res = await app.request(`/api/games/${game.id}`, {
        headers: { Authorization: `Bearer ${auth1.token}` },
      });
      detail = await res.json();
      expect(detail.playerCount).toBe(1);
    });

    it('cannot join a full game', async () => {
      const auth1 = await guestAuth(app, 'Full-Creator');
      const auth2 = await guestAuth(app, 'Full-Joiner');
      const auth3 = await guestAuth(app, 'Full-Extra');

      const game = await createGameViaREST(app, auth1.token, 'Full Game');
      await joinGameViaREST(app, auth2.token, game.id);

      const res = await app.request(`/api/games/${game.id}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth3.token}` },
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBeTruthy();
    });

    it('password-protected game rejects wrong password', async () => {
      const auth1 = await guestAuth(app, 'PW-Creator');
      const auth2 = await guestAuth(app, 'PW-Joiner');

      const res = await app.request('/api/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth1.token}`,
        },
        body: JSON.stringify({
          name: 'PW Game',
          password: 'secret123',
          config: DEFAULT_GAME_CONFIG,
        }),
      });
      const game = await res.json();

      const joinRes = await app.request(`/api/games/${game.id}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth2.token}`,
        },
        body: JSON.stringify({ password: 'wrong' }),
      });
      expect(joinRes.status).toBe(403);
    });
  });
});

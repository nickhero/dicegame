/**
 * Shared helpers for end-to-end tests.
 *
 * Spins up a real HTTP + Socket.IO server backed by an in-memory SQLite
 * database so every test suite starts from a clean state.
 */
import { createServer, Server as HttpServer } from 'node:http';
import { type Socket, io as ioClient } from 'socket.io-client';
import { sql } from 'drizzle-orm';
import type { AddressInfo } from 'node:net';
import type { Server as SocketIOServer } from 'socket.io';
import { createSocketServer } from '../../src/ws';
import { createApp } from '../../src/app';
import { createTestDb } from '../../src/db/connection';
import { _resetWaitingRooms } from '../../src/ws/waitingRoom';
import { _resetGracePeriods } from '../../src/ws/disconnectHandler';
import { _resetSpectatorCounts } from '../../src/ws/spectatorHandlers';
import type { WireGameState } from '@dicewars/shared';

export type TestDb = ReturnType<typeof createTestDb>;

// ── Schema bootstrap ───────────────────────────
export function applySchema(db: TestDb) {
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
  db.run(sql`CREATE TABLE IF NOT EXISTS custom_ai_presets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
}

// ── Server lifecycle ───────────────────────────

export interface TestServer {
  httpServer: HttpServer;
  io: SocketIOServer;
  app: ReturnType<typeof createApp>;
  db: TestDb;
  port: number;
}

export async function createTestServer(): Promise<TestServer> {
  const db = createTestDb();
  applySchema(db);
  const app = createApp(db);
  const httpServer = createServer();
  const io = createSocketServer(httpServer, db);

  const port = await new Promise<number>((resolve) => {
    httpServer.listen(0, () => {
      resolve((httpServer.address() as AddressInfo).port);
    });
  });

  return { httpServer, io, app, db, port };
}

export async function shutdownServer(server: TestServer): Promise<void> {
  server.io.close();
  await new Promise<void>((resolve) => {
    server.httpServer.close(() => resolve());
  });
}

export function resetServerState(): void {
  _resetWaitingRooms();
  _resetGracePeriods();
  _resetSpectatorCounts();
}

// ── Auth helpers ───────────────────────────────

export async function guestAuth(
  app: ReturnType<typeof createApp>,
  displayName: string,
): Promise<{ token: string; user: { id: string; name: string } }> {
  const res = await app.request('/api/auth/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
  if (res.status !== 200) {
    throw new Error(`Guest auth failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// ── REST helpers ───────────────────────────────

export interface GameConfig {
  playerCount: number;
  territoryCount: number;
  mapShape: string;
  gridType: string;
  speed: string;
  powerUps: boolean;
  fogOfWar: boolean;
  alliances: boolean;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  playerCount: 2,
  territoryCount: 15,
  mapShape: 'rectangle',
  gridType: 'square',
  speed: 'instant',
  powerUps: false,
  fogOfWar: false,
  alliances: false,
};

export async function createGameViaREST(
  app: ReturnType<typeof createApp>,
  token: string,
  name: string,
  config: GameConfig = DEFAULT_GAME_CONFIG,
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
  if (res.status !== 201) {
    throw new Error(`Create game failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function joinGameViaREST(
  app: ReturnType<typeof createApp>,
  token: string,
  gameId: string,
): Promise<void> {
  const res = await app.request(`/api/games/${gameId}/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) {
    throw new Error(`Join game failed (${res.status}): ${await res.text()}`);
  }
}

// ── Socket helpers ─────────────────────────────

export function connectGameClient(port: number, token: string): Socket {
  return ioClient(`http://localhost:${port}/game`, {
    autoConnect: false,
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
}

export function waitForConnect(client: Socket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5_000);
    client.on('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    client.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    client.connect();
  });
}

/** Emit an event and wait for the ack callback. */
export function emit<T>(client: Socket, event: string, data?: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Ack timeout for ${event}`)), 5_000);
    const args =
      data !== undefined
        ? [data, (ack: T) => { clearTimeout(timeout); resolve(ack); }]
        : [(ack: T) => { clearTimeout(timeout); resolve(ack); }];
    client.emit(event, ...args);
  });
}

/** Wait for a specific server-pushed event. */
export function waitForEvent<T>(client: Socket, event: string, timeoutMs = 10_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Event timeout for ${event}`)),
      timeoutMs,
    );
    client.once(event as string, (data: T) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

/** Wait for event but resolve with `null` if it doesn't arrive within `timeoutMs`. */
export function waitForEventOptional<T>(
  client: Socket,
  event: string,
  timeoutMs = 3_000,
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timeout = setTimeout(() => resolve(null), timeoutMs);
    client.once(event as string, (data: T) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

// ── State tracker (handles both stateUpdate and instantBatch) ──────

/**
 * Tracks game state from all relevant server events.
 * In instant speed, AI emits `game:instantBatch` (not `game:stateUpdate`).
 * This tracker listens to both, always maintaining the latest state.
 */
export interface StateTracker {
  /** Current latest state. */
  state: WireGameState;
  /** Wait until a new state arrives (from any event source). */
  waitForState(timeoutMs?: number): Promise<WireGameState>;
  /** Stop tracking. */
  destroy(): void;
}

export function createStateTracker(
  client: Socket,
  initialState?: WireGameState,
): StateTracker {
  let state = initialState ?? (null as unknown as WireGameState);
  let pendingResolve: ((s: WireGameState) => void) | null = null;
  // Queue of states that arrived when nobody was waiting
  const stateQueue: WireGameState[] = [];

  function onStateUpdate(s: WireGameState) {
    state = s;
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(s);
    } else {
      stateQueue.push(s);
    }
  }

  function onInstantBatch(data: { finalState: WireGameState }) {
    if (data.finalState) {
      onStateUpdate(data.finalState);
    }
  }

  function onGameOver() {
    // Mark state as game over so waitForState doesn't block forever
    if (state) {
      state = { ...state, gameOver: true };
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(state);
      } else {
        stateQueue.push(state);
      }
    }
  }

  client.on('game:stateUpdate', onStateUpdate);
  client.on('game:instantBatch' as string, onInstantBatch);
  client.on('game:gameOver' as string, onGameOver);

  return {
    get state() {
      return state;
    },
    waitForState(timeoutMs = 15_000): Promise<WireGameState> {
      // If there's already a queued state, return immediately
      if (stateQueue.length > 0) {
        const s = stateQueue.shift()!;
        state = s;
        return Promise.resolve(s);
      }

      return new Promise<WireGameState>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingResolve = null;
          reject(new Error('StateTracker: timeout waiting for state'));
        }, timeoutMs);

        pendingResolve = (s) => {
          clearTimeout(timeout);
          resolve(s);
        };
      });
    },
    destroy() {
      client.off('game:stateUpdate', onStateUpdate);
      client.off('game:instantBatch' as string, onInstantBatch);
      client.off('game:gameOver' as string, onGameOver);
      pendingResolve = null;
      stateQueue.length = 0;
    },
  };
}

// ── Game-flow helpers ──────────────────────────

export interface AuthInfo {
  token: string;
  user: { id: string; name: string };
}

/**
 * Creates an authenticated client, connects it, and joins + readies up in the
 * given game room. Returns the connected socket.
 */
export async function joinAndReady(
  port: number,
  auth: AuthInfo,
  gameId: string,
): Promise<Socket> {
  const client = connectGameClient(port, auth.token);
  await waitForConnect(client);
  const joinAck = await emit<{ success: boolean }>(client, 'game:join', { gameId });
  if (!joinAck.success) throw new Error('game:join failed');
  const readyAck = await emit<{ success: boolean }>(client, 'game:ready');
  if (!readyAck.success) throw new Error('game:ready failed');
  return client;
}

/**
 * Wait for the game state where it is the given player index's turn.
 * If the initial state already matches, returns it immediately.
 */
export async function waitForMyTurn(
  client: Socket,
  playerIndex: number,
  initialState: WireGameState,
  timeoutMs = 30_000,
): Promise<WireGameState> {
  let state = initialState;
  const deadline = Date.now() + timeoutMs;
  while (state.currentPlayerIndex !== playerIndex && !state.gameOver) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Timeout waiting for my turn');
    state = await waitForEvent<WireGameState>(client, 'game:stateUpdate', remaining);
  }
  return state;
}

/**
 * Find a valid attack pair (from → to) for the given player index.
 * Returns `null` if none exists.
 */
export function findAttackPair(
  state: WireGameState,
  playerIndex: number,
): { from: number; to: number } | null {
  for (const t of state.territories) {
    if (t.owner !== playerIndex || t.dice <= 1) continue;
    for (const nid of t.neighborIds) {
      if (state.territories[nid].owner !== playerIndex) {
        return { from: t.id, to: nid };
      }
    }
  }
  return null;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

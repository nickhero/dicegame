import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'node:http';
import { type Socket, io as ioClient } from 'socket.io-client';
import { SignJWT } from 'jose';
import { sql } from 'drizzle-orm';
import { createSocketServer } from '../../src/ws';
import { LobbyBroadcaster, lobbyBroadcaster } from '../../src/ws/lobbyBroadcaster';
import { LobbyService } from '../../src/services/LobbyService';
import { createTestDb } from '../../src/db/connection';
import { config } from '../../src/config';
import type { AddressInfo } from 'node:net';

type TestDb = ReturnType<typeof createTestDb>;

const secret = new TextEncoder().encode(config.jwtSecret);

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

async function createTestToken(userId: string, userName: string) {
  return new SignJWT({ sub: userId, name: userName })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
}

function seedUser(db: TestDb, id: string, name: string) {
  const now = new Date().toISOString();
  db.run(sql`INSERT INTO users (id, display_name, is_guest, created_at, last_seen_at)
    VALUES (${id}, ${name}, 1, ${now}, ${now})`);
}

function connectLobbyClient(port: number, token: string): Socket {
  return ioClient(`http://localhost:${port}/lobby`, {
    autoConnect: false,
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
}

const validConfig = {
  playerCount: 4,
  territoryCount: 28,
  mapShape: 'rectangle' as const,
  gridType: 'square' as const,
  speed: 'normal' as const,
  powerUps: false,
  fogOfWar: false,
  alliances: false,
  undoEnabled: true,
};

describe('Lobby WebSocket', () => {
  let httpServer: HttpServer;
  let port: number;
  let db: TestDb;
  let clients: Socket[];

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        db = createTestDb();
        applySchema(db);
        httpServer = createServer();
        createSocketServer(httpServer, db);
        httpServer.listen(0, () => {
          port = (httpServer.address() as AddressInfo).port;
          resolve();
        });
      }),
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      }),
  );

  beforeEach(() => {
    clients = [];
  });

  afterEach(() => {
    for (const c of clients) {
      if (c.connected) c.disconnect();
    }
  });

  it('sends lobby:gameList on connect with empty list', async () => {
    const token = await createTestToken('user-1', 'Alice');
    const client = connectLobbyClient(port, token);
    clients.push(client);

    const games = await new Promise<unknown[]>((resolve, reject) => {
      client.on('lobby:gameList', resolve);
      client.on('connect_error', reject);
      client.connect();
    });

    expect(games).toEqual([]);
  });

  it('sends lobby:gameList with existing games on connect', async () => {
    seedUser(db, 'creator-1', 'Creator');
    const lobbyService = new LobbyService(db);
    const game = await lobbyService.createGame('creator-1', {
      name: 'Test Room',
      config: validConfig,
    });

    const token = await createTestToken('user-list', 'Lister');
    const client = connectLobbyClient(port, token);
    clients.push(client);

    const games = await new Promise<unknown[]>((resolve, reject) => {
      client.on('lobby:gameList', resolve);
      client.on('connect_error', reject);
      client.connect();
    });

    expect(games).toHaveLength(1);
    expect((games[0] as { id: string }).id).toBe(game.id);
    expect((games[0] as { name: string }).name).toBe('Test Room');
  });

  it('broadcasts lobby:gameCreated to connected clients', async () => {
    const token = await createTestToken('user-bc', 'Broadcaster');
    const client = connectLobbyClient(port, token);
    clients.push(client);

    // Wait for connection and initial game list
    await new Promise<void>((resolve, reject) => {
      client.on('lobby:gameList', () => resolve());
      client.on('connect_error', reject);
      client.connect();
    });

    const gameCreatedPromise = new Promise<unknown>((resolve) => {
      client.on('lobby:gameCreated', resolve);
    });

    // Broadcast a game creation
    lobbyBroadcaster.broadcastGameCreated({
      id: 'broadcast-game-1',
      name: 'Broadcast Test',
      creatorName: 'Someone',
      status: 'waiting',
      playerCount: 1,
      maxPlayers: 4,
      hasPassword: false,
      config: {
        mapShape: 'rectangle',
        gridType: 'square',
        territoryCount: 28,
        powerUps: false,
        fogOfWar: false,
        alliances: false,
      },
      createdAt: new Date().toISOString(),
    });

    const received = (await gameCreatedPromise) as { id: string; name: string };
    expect(received.id).toBe('broadcast-game-1');
    expect(received.name).toBe('Broadcast Test');
  });

  it('broadcasts lobby:gameRemoved to connected clients', async () => {
    const token = await createTestToken('user-rm', 'Remover');
    const client = connectLobbyClient(port, token);
    clients.push(client);

    await new Promise<void>((resolve, reject) => {
      client.on('lobby:gameList', () => resolve());
      client.on('connect_error', reject);
      client.connect();
    });

    const gameRemovedPromise = new Promise<string>((resolve) => {
      client.on('lobby:gameRemoved', resolve);
    });

    lobbyBroadcaster.broadcastGameRemoved('removed-game-id');

    const removedId = await gameRemovedPromise;
    expect(removedId).toBe('removed-game-id');
  });

  it('broadcasts lobby:playerCount to connected clients', async () => {
    const token = await createTestToken('user-pc', 'Counter');
    const client = connectLobbyClient(port, token);
    clients.push(client);

    await new Promise<void>((resolve, reject) => {
      client.on('lobby:gameList', () => resolve());
      client.on('connect_error', reject);
      client.connect();
    });

    const playerCountPromise = new Promise<{ gameId: string; count: number }>((resolve) => {
      client.on('lobby:playerCount', resolve);
    });

    lobbyBroadcaster.broadcastPlayerCount('game-123', 3);

    const data = await playerCountPromise;
    expect(data.gameId).toBe('game-123');
    expect(data.count).toBe(3);
  });

  it('broadcasts lobby:gameUpdated to connected clients', async () => {
    const token = await createTestToken('user-up', 'Updater');
    const client = connectLobbyClient(port, token);
    clients.push(client);

    await new Promise<void>((resolve, reject) => {
      client.on('lobby:gameList', () => resolve());
      client.on('connect_error', reject);
      client.connect();
    });

    const gameUpdatedPromise = new Promise<unknown>((resolve) => {
      client.on('lobby:gameUpdated', resolve);
    });

    lobbyBroadcaster.broadcastGameUpdated({
      id: 'updated-game-1',
      name: 'Updated Room',
      creatorName: 'Updater',
      status: 'waiting',
      playerCount: 2,
      maxPlayers: 4,
      hasPassword: false,
      config: {
        mapShape: 'diamond',
        gridType: 'hex',
        territoryCount: 35,
        powerUps: true,
        fogOfWar: false,
        alliances: false,
      },
      createdAt: new Date().toISOString(),
    });

    const received = (await gameUpdatedPromise) as { id: string; name: string };
    expect(received.id).toBe('updated-game-1');
    expect(received.name).toBe('Updated Room');
  });

  it('multiple clients all receive broadcasts', async () => {
    const token1 = await createTestToken('user-m1', 'Multi1');
    const token2 = await createTestToken('user-m2', 'Multi2');
    const client1 = connectLobbyClient(port, token1);
    const client2 = connectLobbyClient(port, token2);
    clients.push(client1, client2);

    // Connect both clients
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        client1.on('lobby:gameList', () => resolve());
        client1.on('connect_error', reject);
        client1.connect();
      }),
      new Promise<void>((resolve, reject) => {
        client2.on('lobby:gameList', () => resolve());
        client2.on('connect_error', reject);
        client2.connect();
      }),
    ]);

    const p1 = new Promise<string>((resolve) => {
      client1.on('lobby:gameRemoved', resolve);
    });
    const p2 = new Promise<string>((resolve) => {
      client2.on('lobby:gameRemoved', resolve);
    });

    lobbyBroadcaster.broadcastGameRemoved('multi-game-id');

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('multi-game-id');
    expect(r2).toBe('multi-game-id');
  });
});

describe('LobbyBroadcaster unit', () => {
  it('does not throw when namespace is not set', () => {
    const broadcaster = new LobbyBroadcaster();
    expect(() => broadcaster.broadcastGameCreated({} as never)).not.toThrow();
    expect(() => broadcaster.broadcastGameRemoved('id')).not.toThrow();
    expect(() => broadcaster.broadcastGameUpdated({} as never)).not.toThrow();
    expect(() => broadcaster.broadcastPlayerCount('id', 1)).not.toThrow();
  });

  it('emits events when namespace is set', () => {
    const broadcaster = new LobbyBroadcaster();
    const emitted: { event: string; args: unknown[] }[] = [];
    const mockNamespace = {
      emit: (event: string, ...args: unknown[]) => {
        emitted.push({ event, args });
      },
    };
    broadcaster.setNamespace(mockNamespace as never);

    broadcaster.broadcastGameCreated({ id: 'g1' } as never);
    broadcaster.broadcastGameRemoved('g2');
    broadcaster.broadcastPlayerCount('g3', 5);

    expect(emitted).toHaveLength(3);
    expect(emitted[0].event).toBe('lobby:gameCreated');
    expect(emitted[1].event).toBe('lobby:gameRemoved');
    expect(emitted[1].args[0]).toBe('g2');
    expect(emitted[2].event).toBe('lobby:playerCount');
    expect(emitted[2].args[0]).toEqual({ gameId: 'g3', count: 5 });
  });
});

describe('LobbyService.cleanupStaleRooms', () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
    applySchema(db);
  });

  it('removes stale rooms with 0 players older than threshold', async () => {
    seedUser(db, 'stale-creator', 'StaleCreator');
    const oldDate = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago

    db.run(sql`INSERT INTO game_rooms (id, name, creator_id, status, config, max_players, current_player_count, created_at)
      VALUES ('stale-room', 'Stale', 'stale-creator', 'waiting', '{}', 4, 0, ${oldDate})`);

    const lobbyService = new LobbyService(db);
    const removed = await lobbyService.cleanupStaleRooms(10);

    expect(removed).toEqual(['stale-room']);

    // Verify status is now abandoned
    const rooms = db.all<{ status: string }>(sql`SELECT status FROM game_rooms WHERE id = 'stale-room'`);
    expect(rooms[0].status).toBe('abandoned');
  });

  it('does not remove rooms with players', async () => {
    seedUser(db, 'active-creator', 'ActiveCreator');
    const oldDate = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    db.run(sql`INSERT INTO game_rooms (id, name, creator_id, status, config, max_players, current_player_count, created_at)
      VALUES ('active-room', 'Active', 'active-creator', 'waiting', '{}', 4, 2, ${oldDate})`);

    const lobbyService = new LobbyService(db);
    const removed = await lobbyService.cleanupStaleRooms(10);

    expect(removed).toEqual([]);
  });

  it('does not remove recent rooms', async () => {
    seedUser(db, 'recent-creator', 'RecentCreator');
    const recentDate = new Date().toISOString(); // just now

    db.run(sql`INSERT INTO game_rooms (id, name, creator_id, status, config, max_players, current_player_count, created_at)
      VALUES ('recent-room', 'Recent', 'recent-creator', 'waiting', '{}', 4, 0, ${recentDate})`);

    const lobbyService = new LobbyService(db);
    const removed = await lobbyService.cleanupStaleRooms(10);

    expect(removed).toEqual([]);
  });

  it('does not remove started rooms', async () => {
    seedUser(db, 'started-creator', 'StartedCreator');
    const oldDate = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    db.run(sql`INSERT INTO game_rooms (id, name, creator_id, status, config, max_players, current_player_count, created_at)
      VALUES ('started-room', 'Started', 'started-creator', 'started', '{}', 4, 0, ${oldDate})`);

    const lobbyService = new LobbyService(db);
    const removed = await lobbyService.cleanupStaleRooms(10);

    expect(removed).toEqual([]);
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'node:http';
import { type Socket, io as ioClient } from 'socket.io-client';
import { SignJWT } from 'jose';
import { sql } from 'drizzle-orm';
import { createSocketServer } from '../../src/ws';
import { LobbyService } from '../../src/services/LobbyService';
import { createTestDb } from '../../src/db/connection';
import { gameEngine } from '../../src/services/gameEngineInstance';
import { _resetWaitingRooms } from '../../src/ws/waitingRoom';
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
  db.run(sql`INSERT OR IGNORE INTO users (id, display_name, is_guest, created_at, last_seen_at)
    VALUES (${id}, ${name}, 1, ${now}, ${now})`);
}

function connectGameClient(port: number, token: string): Socket {
  return ioClient(`http://localhost:${port}/game`, {
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

describe('Waiting Room WebSocket', () => {
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
    _resetWaitingRooms();
  });

  afterEach(() => {
    for (const c of clients) {
      if (c.connected) c.disconnect();
    }
  });

  async function connectAndWait(token: string): Promise<Socket> {
    const client = connectGameClient(port, token);
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('connect_error', reject);
      client.connect();
    });
    return client;
  }

  async function createSeededGame(creatorId: string, creatorName: string) {
    seedUser(db, creatorId, creatorName);
    const lobbyService = new LobbyService(db);
    return lobbyService.createGame(creatorId, { name: 'Test Room', config: validConfig });
  }

  // --- game:join ---

  it('player joins waiting room and receives game info', async () => {
    const game = await createSeededGame('join-creator-1', 'Creator');
    const token = await createTestToken('join-creator-1', 'Creator');
    const client = await connectAndWait(token);

    const result = await new Promise<any>((resolve) => {
      client.emit('game:join', { gameId: game.id }, resolve);
    });

    expect(result.success).toBe(true);
    expect(result.data.players).toBeInstanceOf(Array);
    expect(result.data.maxPlayers).toBeGreaterThan(0);
    // Creator should be in the players list
    const creator = result.data.players.find((p: any) => p.name === 'Creator');
    expect(creator).toBeDefined();
  });

  it('cannot join non-existent game', async () => {
    const token = await createTestToken('join-user-noexist', 'NoExist');
    const client = await connectAndWait(token);

    const result = await new Promise<any>((resolve) => {
      client.emit('game:join', { gameId: 'nonexistent-game-id' }, resolve);
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('LOBBY_GAME_NOT_FOUND');
  });

  it('other players are notified when someone joins', async () => {
    const game = await createSeededGame('join-notify-creator', 'CreatorN');

    // Second player joins the DB game
    seedUser(db, 'join-notify-p2', 'Player2');
    const lobbyService = new LobbyService(db);
    await lobbyService.joinGame(game.id, 'join-notify-p2');

    // Connect creator first
    const creatorToken = await createTestToken('join-notify-creator', 'CreatorN');
    const creatorClient = await connectAndWait(creatorToken);

    await new Promise<any>((resolve) => {
      creatorClient.emit('game:join', { gameId: game.id }, resolve);
    });

    // Set up listener for playerJoined
    const joinedPromise = new Promise<any>((resolve) => {
      creatorClient.on('game:playerJoined', resolve);
    });

    // Player 2 connects and joins
    const p2Token = await createTestToken('join-notify-p2', 'Player2');
    const p2Client = await connectAndWait(p2Token);

    await new Promise<any>((resolve) => {
      p2Client.emit('game:join', { gameId: game.id }, resolve);
    });

    const joined = await joinedPromise;
    expect(joined.name).toBe('Player2');
    expect(joined.isAI).toBe(false);
    expect(typeof joined.playerIndex).toBe('number');
  });

  // --- game:ready ---

  it('player toggles ready state', async () => {
    const game = await createSeededGame('ready-creator-1', 'ReadyCreator');
    const token = await createTestToken('ready-creator-1', 'ReadyCreator');
    const client = await connectAndWait(token);

    await new Promise<any>((resolve) => {
      client.emit('game:join', { gameId: game.id }, resolve);
    });

    // Listen for readyState broadcast
    const readyPromise = new Promise<any>((resolve) => {
      client.on('game:readyState', resolve);
    });

    const readyResult = await new Promise<any>((resolve) => {
      client.emit('game:ready', resolve);
    });

    expect(readyResult.success).toBe(true);

    const readyState = await readyPromise;
    expect(readyState.userId).toBe('ready-creator-1');
    expect(readyState.ready).toBe(true);
    expect(readyState.readyPlayers).toContain('ready-creator-1');
  });

  it('player untoggles ready state', async () => {
    const game = await createSeededGame('unready-creator', 'UnreadyCreator');
    const token = await createTestToken('unready-creator', 'UnreadyCreator');
    const client = await connectAndWait(token);

    await new Promise<any>((resolve) => {
      client.emit('game:join', { gameId: game.id }, resolve);
    });

    // Set up listener before emitting to avoid race
    const firstReadyPromise = new Promise<void>((resolve) => {
      client.once('game:readyState', () => resolve());
    });

    // Ready up
    await new Promise<any>((resolve) => {
      client.emit('game:ready', resolve);
    });

    await firstReadyPromise;

    // Listen for second readyState (unready) before emitting
    const unreadyPromise = new Promise<any>((resolve) => {
      client.on('game:readyState', resolve);
    });

    // Unready
    const unreadyResult = await new Promise<any>((resolve) => {
      client.emit('game:ready', resolve);
    });

    expect(unreadyResult.success).toBe(true);

    const unreadyState = await unreadyPromise;
    expect(unreadyState.userId).toBe('unready-creator');
    expect(unreadyState.ready).toBe(false);
    expect(unreadyState.readyPlayers).not.toContain('unready-creator');
  });

  it('ready fails when not in a game', async () => {
    const token = await createTestToken('ready-no-game', 'NoGame');
    const client = await connectAndWait(token);

    const result = await new Promise<any>((resolve) => {
      client.emit('game:ready', resolve);
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('CONNECTION_NOT_IN_GAME');
  });

  // --- game:start ---

  it('creator starts the game', async () => {
    const game = await createSeededGame('start-creator-1', 'StartCreator');

    // Add a second player (need at least 2)
    seedUser(db, 'start-p2', 'StartP2');
    const lobbyService = new LobbyService(db);
    await lobbyService.joinGame(game.id, 'start-p2');

    const creatorToken = await createTestToken('start-creator-1', 'StartCreator');
    const creatorClient = await connectAndWait(creatorToken);

    await new Promise<any>((resolve) => {
      creatorClient.emit('game:join', { gameId: game.id }, resolve);
    });

    // Listen for stateUpdate
    const statePromise = new Promise<any>((resolve) => {
      creatorClient.on('game:stateUpdate', resolve);
    });

    const startResult = await new Promise<any>((resolve) => {
      creatorClient.emit('game:start', { gameId: game.id }, resolve);
    });

    expect(startResult.success).toBe(true);

    const state = await statePromise;
    expect(state.territories).toBeDefined();
    expect(state.players).toBeDefined();
    expect(state.players.length).toBe(2);
    expect(state.currentPlayerIndex).toBeDefined();
    expect(state.turnNumber).toBeDefined();

    // Verify game engine has the active game
    const activeGame = gameEngine.getGame(game.id);
    expect(activeGame).toBeDefined();

    // Cleanup
    gameEngine.destroyGame(game.id);
  });

  it('non-creator cannot start the game', async () => {
    const game = await createSeededGame('start-nc-creator', 'NCCreator');

    seedUser(db, 'start-nc-p2', 'NonCreator');
    const lobbyService = new LobbyService(db);
    await lobbyService.joinGame(game.id, 'start-nc-p2');

    const p2Token = await createTestToken('start-nc-p2', 'NonCreator');
    const p2Client = await connectAndWait(p2Token);

    await new Promise<any>((resolve) => {
      p2Client.emit('game:join', { gameId: game.id }, resolve);
    });

    const startResult = await new Promise<any>((resolve) => {
      p2Client.emit('game:start', { gameId: game.id }, resolve);
    });

    expect(startResult.success).toBe(false);
    expect(startResult.error.code).toBe('LOBBY_NOT_CREATOR');
  });

  it('game start broadcasts state to all players in room', async () => {
    const game = await createSeededGame('start-bc-creator', 'BCCreator');

    seedUser(db, 'start-bc-p2', 'BCPlayer2');
    const lobbyService = new LobbyService(db);
    await lobbyService.joinGame(game.id, 'start-bc-p2');

    const creatorToken = await createTestToken('start-bc-creator', 'BCCreator');
    const p2Token = await createTestToken('start-bc-p2', 'BCPlayer2');

    const creatorClient = await connectAndWait(creatorToken);
    const p2Client = await connectAndWait(p2Token);

    // Both join the waiting room
    await Promise.all([
      new Promise<any>((resolve) => {
        creatorClient.emit('game:join', { gameId: game.id }, resolve);
      }),
      new Promise<any>((resolve) => {
        p2Client.emit('game:join', { gameId: game.id }, resolve);
      }),
    ]);

    // Both listen for stateUpdate
    const creatorStatePromise = new Promise<any>((resolve) => {
      creatorClient.on('game:stateUpdate', resolve);
    });
    const p2StatePromise = new Promise<any>((resolve) => {
      p2Client.on('game:stateUpdate', resolve);
    });

    // Creator starts
    const startResult = await new Promise<any>((resolve) => {
      creatorClient.emit('game:start', { gameId: game.id }, resolve);
    });
    expect(startResult.success).toBe(true);

    const [creatorState, p2State] = await Promise.all([creatorStatePromise, p2StatePromise]);

    expect(creatorState.players.length).toBe(2);
    expect(p2State.players.length).toBe(2);
    expect(creatorState.territories.length).toBe(p2State.territories.length);

    gameEngine.destroyGame(game.id);
  });

  // --- game:leave ---

  it('player leaves the waiting room', async () => {
    const game = await createSeededGame('leave-creator-1', 'LeaveCreator');

    seedUser(db, 'leave-p2', 'LeaveP2');
    const lobbyService = new LobbyService(db);
    await lobbyService.joinGame(game.id, 'leave-p2');

    const p2Token = await createTestToken('leave-p2', 'LeaveP2');
    const p2Client = await connectAndWait(p2Token);

    await new Promise<any>((resolve) => {
      p2Client.emit('game:join', { gameId: game.id }, resolve);
    });

    const leaveResult = await new Promise<any>((resolve) => {
      p2Client.emit('game:leave', resolve);
    });

    expect(leaveResult.success).toBe(true);
  });

  it('room is notified when player leaves', async () => {
    const game = await createSeededGame('leave-notify-creator', 'LeaveNCreator');

    seedUser(db, 'leave-notify-p2', 'LeaveNP2');
    const lobbyService = new LobbyService(db);
    await lobbyService.joinGame(game.id, 'leave-notify-p2');

    const creatorToken = await createTestToken('leave-notify-creator', 'LeaveNCreator');
    const p2Token = await createTestToken('leave-notify-p2', 'LeaveNP2');

    const creatorClient = await connectAndWait(creatorToken);
    const p2Client = await connectAndWait(p2Token);

    // Both join the room
    await Promise.all([
      new Promise<any>((resolve) => {
        creatorClient.emit('game:join', { gameId: game.id }, resolve);
      }),
      new Promise<any>((resolve) => {
        p2Client.emit('game:join', { gameId: game.id }, resolve);
      }),
    ]);

    // Creator listens for playerLeft
    const leftPromise = new Promise<any>((resolve) => {
      creatorClient.on('game:playerLeft', resolve);
    });

    // P2 leaves
    await new Promise<any>((resolve) => {
      p2Client.emit('game:leave', resolve);
    });

    const left = await leftPromise;
    expect(typeof left.playerIndex).toBe('number');
  });

  it('leave fails when not in a game', async () => {
    const token = await createTestToken('leave-no-game', 'LeaveNoGame');
    const client = await connectAndWait(token);

    const result = await new Promise<any>((resolve) => {
      client.emit('game:leave', resolve);
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('CONNECTION_NOT_IN_GAME');
  });

  // --- game:addAI ---

  it('creator can add AI to empty slot', async () => {
    const game = await createSeededGame('addai-creator', 'AddAICreator');
    const token = await createTestToken('addai-creator', 'AddAICreator');
    const client = await connectAndWait(token);

    await new Promise<any>((resolve) => {
      client.emit('game:join', { gameId: game.id }, resolve);
    });

    const result = await new Promise<any>((resolve) => {
      client.emit('game:addAI', { gameId: game.id, slotIndex: 1, personality: 'aggressive' }, resolve);
    });

    expect(result.success).toBe(true);
    expect(result.data.players).toBeDefined();
  });

  it('non-creator cannot add AI', async () => {
    const game = await createSeededGame('addai-nc-creator', 'AddAINCCreator');

    seedUser(db, 'addai-nc-p2', 'NonCreator');
    const lobbyService = new LobbyService(db);
    await lobbyService.joinGame(game.id, 'addai-nc-p2');

    const p2Token = await createTestToken('addai-nc-p2', 'NonCreator');
    const p2Client = await connectAndWait(p2Token);

    await new Promise<any>((resolve) => {
      p2Client.emit('game:join', { gameId: game.id }, resolve);
    });

    const result = await new Promise<any>((resolve) => {
      p2Client.emit('game:addAI', { gameId: game.id, slotIndex: 2, personality: 'cautious' }, resolve);
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('LOBBY_NOT_CREATOR');
  });

  // --- game:removeAI ---

  it('creator can remove AI', async () => {
    const game = await createSeededGame('rmai-creator', 'RmAICreator');
    const token = await createTestToken('rmai-creator', 'RmAICreator');
    const client = await connectAndWait(token);

    await new Promise<any>((resolve) => {
      client.emit('game:join', { gameId: game.id }, resolve);
    });

    // Add AI first
    await new Promise<any>((resolve) => {
      client.emit('game:addAI', { gameId: game.id, slotIndex: 1, personality: 'balanced' }, resolve);
    });

    const result = await new Promise<any>((resolve) => {
      client.emit('game:removeAI', { gameId: game.id, slotIndex: 1 }, resolve);
    });

    expect(result.success).toBe(true);
  });

  it('creator cannot remove human players', async () => {
    const game = await createSeededGame('rmhuman-creator', 'RmHumanCreator');

    seedUser(db, 'rmhuman-p2', 'HumanPlayer');
    const lobbyService = new LobbyService(db);
    await lobbyService.joinGame(game.id, 'rmhuman-p2');

    const token = await createTestToken('rmhuman-creator', 'RmHumanCreator');
    const client = await connectAndWait(token);

    await new Promise<any>((resolve) => {
      client.emit('game:join', { gameId: game.id }, resolve);
    });

    // Try to remove the human player (slot 1, since creator is slot 0)
    const result = await new Promise<any>((resolve) => {
      client.emit('game:removeAI', { gameId: game.id, slotIndex: 1 }, resolve);
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Cannot remove a human player');
  });

  // --- game:rearrangeSlots ---

  it('creator can swap slots', async () => {
    const game = await createSeededGame('swap-creator', 'SwapCreator');
    const token = await createTestToken('swap-creator', 'SwapCreator');
    const client = await connectAndWait(token);

    await new Promise<any>((resolve) => {
      client.emit('game:join', { gameId: game.id }, resolve);
    });

    // Add AI to slot 1
    await new Promise<any>((resolve) => {
      client.emit('game:addAI', { gameId: game.id, slotIndex: 1, personality: 'aggressive' }, resolve);
    });

    // Listen for slotsRearranged
    const rearrangePromise = new Promise<any>((resolve) => {
      client.on('game:slotsRearranged', resolve);
    });

    const result = await new Promise<any>((resolve) => {
      client.emit('game:rearrangeSlots', { gameId: game.id, fromSlot: 0, toSlot: 1 }, resolve);
    });

    expect(result.success).toBe(true);

    const rearranged = await rearrangePromise;
    expect(rearranged.players).toBeDefined();
    expect(rearranged.players.length).toBe(2);
  });

  it('cannot modify slots after game started', async () => {
    const game = await createSeededGame('started-creator', 'StartedCreator');

    // Add a second player so game can start
    seedUser(db, 'started-p2', 'StartedP2');
    const lobbyService = new LobbyService(db);
    await lobbyService.joinGame(game.id, 'started-p2');

    const creatorToken = await createTestToken('started-creator', 'StartedCreator');
    const creatorClient = await connectAndWait(creatorToken);

    await new Promise<any>((resolve) => {
      creatorClient.emit('game:join', { gameId: game.id }, resolve);
    });

    // Start the game
    const startResult = await new Promise<any>((resolve) => {
      creatorClient.emit('game:start', { gameId: game.id }, resolve);
    });
    expect(startResult.success).toBe(true);

    // Try to add AI after game started
    const addResult = await new Promise<any>((resolve) => {
      creatorClient.emit('game:addAI', { gameId: game.id, slotIndex: 3, personality: 'cautious' }, resolve);
    });

    expect(addResult.success).toBe(false);
    expect(addResult.error.code).toBe('LOBBY_GAME_STARTED');

    // Try to rearrange after game started
    const rearrangeResult = await new Promise<any>((resolve) => {
      creatorClient.emit('game:rearrangeSlots', { gameId: game.id, fromSlot: 0, toSlot: 1 }, resolve);
    });

    expect(rearrangeResult.success).toBe(false);
    expect(rearrangeResult.error.code).toBe('LOBBY_GAME_STARTED');

    gameEngine.destroyGame(game.id);
  });

  // --- multiple players ---

  it('multiple players join and all receive ready updates', async () => {
    const game = await createSeededGame('multi-creator', 'MultiCreator');

    seedUser(db, 'multi-p2', 'MultiP2');
    const lobbyService = new LobbyService(db);
    await lobbyService.joinGame(game.id, 'multi-p2');

    const creatorToken = await createTestToken('multi-creator', 'MultiCreator');
    const p2Token = await createTestToken('multi-p2', 'MultiP2');

    const creatorClient = await connectAndWait(creatorToken);
    const p2Client = await connectAndWait(p2Token);

    // Both join the room
    await Promise.all([
      new Promise<any>((resolve) => {
        creatorClient.emit('game:join', { gameId: game.id }, resolve);
      }),
      new Promise<any>((resolve) => {
        p2Client.emit('game:join', { gameId: game.id }, resolve);
      }),
    ]);

    // Both listen for readyState
    const creatorReadyPromise = new Promise<any>((resolve) => {
      creatorClient.on('game:readyState', resolve);
    });
    const p2ReadyPromise = new Promise<any>((resolve) => {
      p2Client.on('game:readyState', resolve);
    });

    // Creator readies up
    await new Promise<any>((resolve) => {
      creatorClient.emit('game:ready', resolve);
    });

    const [creatorReady, p2Ready] = await Promise.all([creatorReadyPromise, p2ReadyPromise]);

    expect(creatorReady.userId).toBe('multi-creator');
    expect(creatorReady.ready).toBe(true);
    expect(p2Ready.userId).toBe('multi-creator');
    expect(p2Ready.ready).toBe(true);
  });

  // --- disconnect ---

  it('ready state is cleaned up on disconnect', async () => {
    const game = await createSeededGame('dc-creator', 'DCCreator');

    seedUser(db, 'dc-p2', 'DCP2');
    const lobbyService = new LobbyService(db);
    await lobbyService.joinGame(game.id, 'dc-p2');

    const creatorToken = await createTestToken('dc-creator', 'DCCreator');
    const p2Token = await createTestToken('dc-p2', 'DCP2');

    const creatorClient = await connectAndWait(creatorToken);
    const p2Client = await connectAndWait(p2Token);

    // Both join
    await Promise.all([
      new Promise<any>((resolve) => {
        creatorClient.emit('game:join', { gameId: game.id }, resolve);
      }),
      new Promise<any>((resolve) => {
        p2Client.emit('game:join', { gameId: game.id }, resolve);
      }),
    ]);

    // Set up listener before emitting to avoid race
    const firstReadyPromise = new Promise<void>((resolve) => {
      creatorClient.once('game:readyState', () => resolve());
    });

    // P2 readies up
    await new Promise<any>((resolve) => {
      p2Client.emit('game:ready', resolve);
    });

    // Wait for readyState broadcast
    await firstReadyPromise;

    // P2 disconnects
    p2Client.disconnect();

    // Wait a moment for disconnect to propagate
    await new Promise((r) => setTimeout(r, 100));

    // Creator readies and checks: p2 should no longer be in readyPlayers
    const readyPromise = new Promise<any>((resolve) => {
      creatorClient.on('game:readyState', resolve);
    });

    await new Promise<any>((resolve) => {
      creatorClient.emit('game:ready', resolve);
    });

    const readyState = await readyPromise;
    expect(readyState.readyPlayers).not.toContain('dc-p2');
    expect(readyState.readyPlayers).toContain('dc-creator');
  });
});

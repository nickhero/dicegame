/**
 * E2E Test: Fuzz test
 *
 * Sends random valid/invalid actions and verifies the server never crashes.
 * The server must always respond with either success or a structured error.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { Socket } from 'socket.io-client';
import {
  createTestServer,
  shutdownServer,
  resetServerState,
  guestAuth,
  createGameViaREST,
  connectGameClient,
  waitForConnect,
  emit,
  createStateTracker,
  type StateTracker,
  type TestServer,
  DEFAULT_GAME_CONFIG,
} from './helpers';

let counter = 0;
function uniqueName(prefix: string): string {
  return `${prefix}-${++counter}`;
}

describe('E2E: Fuzz Test', () => {
  let server: TestServer;
  const clients: Socket[] = [];

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    for (const c of clients) c.disconnect();
    if (server) await shutdownServer(server);
  });

  afterEach(() => {
    for (const c of clients) c.disconnect();
    clients.length = 0;
    resetServerState();
  });

  async function startFreshGame(): Promise<{
    client: Socket;
    gameId: string;
    tracker: StateTracker;
  }> {
    const auth = await guestAuth(server.app, uniqueName('Fz'));
    const game = await createGameViaREST(
      server.app,
      auth.token,
      uniqueName('FzGame'),
      {
        ...DEFAULT_GAME_CONFIG,
        playerCount: 2,
        territoryCount: 15,
        speed: 'instant',
      },
      [
        { slot: 1, personality: 'aggressive' },
      ],
    );

    const client = connectGameClient(server.port, auth.token);
    clients.push(client);
    await waitForConnect(client);
    await emit(client, 'game:join', { gameId: game.id });

    // Create tracker BEFORE starting game to capture all events
    const tracker = createStateTracker(client);
    await emit(client, 'game:start', { gameId: game.id });
    await tracker.waitForState();

    return { client, gameId: game.id, tracker };
  }

  it('server handles 50 random actions without crashing', async () => {

    let { client, gameId, tracker } = await startFreshGame();
    let serverErrors = 0;
    let gamesStarted = 1;

    for (let i = 0; i < 50; i++) {
      const state = tracker.state;

      // If game is over, start a new one (max 3 restarts to save time)
      if (state.gameOver && gamesStarted < 4) {
        tracker.destroy();
        client.disconnect();
        const fresh = await startFreshGame();
        client = fresh.client;
        gameId = fresh.gameId;
        tracker = fresh.tracker;
        gamesStarted++;
      }
      if (tracker.state.gameOver) break;

      const action = Math.floor(Math.random() * 5);
      let ack: { success: boolean; error?: unknown };

      try {
        switch (action) {
          case 0: {
            const territories = tracker.state.territories;
            const from = Math.floor(Math.random() * (territories.length + 5));
            const to = Math.floor(Math.random() * (territories.length + 5));
            ack = await emit<{ success: boolean; error?: unknown }>(
              client,
              'game:attack',
              { fromTerritoryId: from, toTerritoryId: to },
            );
            break;
          }
          case 1: {
            ack = await emit<{ success: boolean; error?: unknown }>(client, 'game:endTurn');
            break;
          }
          case 2: {
            ack = await emit<{ success: boolean; error?: unknown }>(
              client,
              'game:usePowerUp',
              {
                type: ['fortify', 'reinforce', 'shield', 'charge'][Math.floor(Math.random() * 4)],
                targetTerritoryId: Math.floor(Math.random() * tracker.state.territories.length),
              },
            );
            break;
          }
          case 3: {
            ack = await emit<{ success: boolean; error?: unknown }>(client, 'game:undo');
            break;
          }
          case 4: {
            ack = await emit<{ success: boolean; error?: unknown }>(
              client,
              'game:proposeAlliance',
              { targetPlayerIndex: Math.floor(Math.random() * 2) },
            );
            break;
          }
          default:
            ack = { success: false };
        }

        expect(typeof ack.success).toBe('boolean');
      } catch (err) {
        serverErrors++;
        if (serverErrors > 10) {
          throw new Error(`Too many server errors during fuzz: ${err}`);
        }
      }

      // Brief drain — pick up state updates without blocking
      try { await tracker.waitForState(200); } catch { /* nothing pending */ }
    }

    tracker.destroy();
    expect(serverErrors).toBeLessThanOrEqual(10);
  }, 60_000);

  it('sending actions without being in a game returns errors, not crashes', async () => {
    const auth = await guestAuth(server.app, 'NoGameFuzz');
    const client = connectGameClient(server.port, auth.token);
    clients.push(client);
    await waitForConnect(client);

    // Send all action types without being in a game
    const actions = [
      { event: 'game:attack', data: { fromTerritoryId: 0, toTerritoryId: 1 } },
      { event: 'game:endTurn', data: undefined },
      { event: 'game:surrender', data: undefined },
      { event: 'game:undo', data: undefined },
      { event: 'game:usePowerUp', data: { type: 'fortify', targetTerritoryId: 0 } },
      { event: 'game:proposeAlliance', data: { targetPlayerIndex: 1 } },
    ];

    for (const { event, data } of actions) {
      const ack = await emit<{ success: boolean; error?: { code: string } }>(
        client,
        event,
        data,
      );
      expect(ack.success).toBe(false);
      expect(ack.error?.code).toBe('CONNECTION_NOT_IN_GAME');
    }
  }, 15_000);
});

/**
 * E2E Test: Stress test — multiple concurrent games
 *
 * Runs 10 concurrent games (1 human + 3 AI, small maps, instant speed).
 * Each game: start → play a few turns → surrender.
 * Verifies all games start, receive state, and end without errors.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  waitForEvent,
  createStateTracker,
  type TestServer,
  DEFAULT_GAME_CONFIG,
} from './helpers';

let counter = 0;
function uniqueName(prefix: string): string {
  return `${prefix}-${++counter}`;
}

describe('E2E: Stress Test', () => {
  let server: TestServer;
  const allClients: Socket[] = [];

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    for (const c of allClients) c.disconnect();
    if (server) await shutdownServer(server);
    resetServerState();
  });

  it('10 concurrent games complete without errors', async () => {
    const GAME_COUNT = 10;
    const errors: string[] = [];

    async function runGame(index: number): Promise<void> {
      const auth = await guestAuth(server.app, uniqueName('St'));
      const game = await createGameViaREST(
        server.app,
        auth.token,
        uniqueName('SG'),
        {
          ...DEFAULT_GAME_CONFIG,
          playerCount: 2,
          territoryCount: 15,
          speed: 'instant',
        },
        [{ slot: 1, personality: 'balanced' }],
      );

      const client = connectGameClient(server.port, auth.token);
      allClients.push(client);
      await waitForConnect(client);

      const joinAck = await emit<{ success: boolean }>(client, 'game:join', { gameId: game.id });
      if (!joinAck.success) {
        errors.push(`Game ${index}: join failed`);
        return;
      }

      // Create tracker BEFORE starting game to capture all events
      const tracker = createStateTracker(client);
      const startAck = await emit<{ success: boolean }>(client, 'game:start', { gameId: game.id });
      if (!startAck.success) {
        tracker.destroy();
        errors.push(`Game ${index}: start failed`);
        return;
      }

      let state = await tracker.waitForState(10_000);

      // Verify we got a valid initial state
      if (!state?.territories?.length) {
        tracker.destroy();
        errors.push(`Game ${index}: no valid initial state`);
        return;
      }

      // Play up to 5 turns, then surrender
      const MAX_TURNS = 5;
      for (let t = 0; t < MAX_TURNS && !state.gameOver; t++) {
        // Drain until it's our turn
        while (state.currentPlayerIndex !== 0 && !state.gameOver) {
          state = await tracker.waitForState(10_000);
        }
        if (state.gameOver) break;

        const ack = await emit<{ success: boolean }>(client, 'game:endTurn');
        if (!ack.success) break;
        state = await tracker.waitForState(10_000);
      }

      tracker.destroy();

      // End the game via surrender if still going
      if (!state.gameOver) {
        const gameOverPromise = waitForEvent(client, 'game:gameOver', 10_000);
        await emit(client, 'game:surrender');
        await gameOverPromise.catch(() => {
          errors.push(`Game ${index}: game didn't end after surrender`);
        });
      }
    }

    // Launch all games concurrently
    const results = await Promise.allSettled(
      Array.from({ length: GAME_COUNT }, (_, i) =>
        runGame(i).catch((err) => {
          errors.push(`Game ${i}: ${err.message}`);
        }),
      ),
    );

    // Check for rejected promises
    for (const r of results) {
      if (r.status === 'rejected') {
        errors.push(`Unhandled rejection: ${r.reason}`);
      }
    }

    expect(errors).toEqual([]);
  }, 60_000);
});

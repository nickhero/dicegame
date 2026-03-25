/**
 * E2E Test: Full game lifecycle
 *
 * Auth → create game → join → ready → start → play (attack + endTurn)
 * → AI turns complete → game over → verify match saved.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { Socket } from 'socket.io-client';
import type { WireGameState } from '@dicewars/shared';
import {
  createTestServer,
  shutdownServer,
  resetServerState,
  guestAuth,
  createGameViaREST,
  joinGameViaREST,
  connectGameClient,
  waitForConnect,
  emit,
  waitForEvent,
  findAttackPair,
  createStateTracker,
  type TestServer,
  type AuthInfo,
  type StateTracker,
  DEFAULT_GAME_CONFIG,
} from './helpers';

let counter = 0;
function uniqueName(prefix: string): string {
  return `${prefix}-${++counter}`;
}

describe('E2E: Full Game Lifecycle', () => {
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

  // ── Helper: set up a 2-player game (1 human + 1 AI, instant speed) ───
  async function setupHumanAIGame(): Promise<{
    client: Socket;
    gameId: string;
    initialState: WireGameState;
    auth: AuthInfo;
    tracker: StateTracker;
  }> {
    const auth = await guestAuth(server.app, uniqueName('Pl'));
    const game = await createGameViaREST(
      server.app,
      auth.token,
      uniqueName('LC'),
      { ...DEFAULT_GAME_CONFIG, playerCount: 2, speed: 'instant' },
      [{ slot: 1, personality: 'balanced' }],
    );

    const client = connectGameClient(server.port, auth.token);
    clients.push(client);
    await waitForConnect(client);
    await emit(client, 'game:join', { gameId: game.id });

    // Create tracker BEFORE starting game so no events are missed
    const tracker = createStateTracker(client);
    await emit(client, 'game:start', { gameId: game.id });
    const initialState = await tracker.waitForState();

    return { client, gameId: game.id, initialState, auth, tracker };
  }

  it('plays through a full game lifecycle (auth → play → game over)', async () => {
    // 1. Auth
    const alice = await guestAuth(server.app, 'Alice');
    const bob = await guestAuth(server.app, 'Bob');
    expect(alice.token).toBeTruthy();
    expect(bob.user.name).toBe('Bob');

    // 2. Create 2-player game (humans only, instant speed, small map)
    const game = await createGameViaREST(
      server.app,
      alice.token,
      'Lifecycle Test',
      { ...DEFAULT_GAME_CONFIG, playerCount: 2, territoryCount: 15, speed: 'instant' },
    );
    expect(game.id).toBeTruthy();
    await joinGameViaREST(server.app, bob.token, game.id);

    // 3. Both connect via WebSocket
    const client1 = connectGameClient(server.port, alice.token);
    const client2 = connectGameClient(server.port, bob.token);
    clients.push(client1, client2);
    await Promise.all([waitForConnect(client1), waitForConnect(client2)]);

    // 4. Both join the game room
    await Promise.all([
      emit(client1, 'game:join', { gameId: game.id }),
      emit(client2, 'game:join', { gameId: game.id }),
    ]);

    // 5. Start game — both receive initial state
    const state1Promise = waitForEvent<WireGameState>(client1, 'game:stateUpdate');
    const state2Promise = waitForEvent<WireGameState>(client2, 'game:stateUpdate');
    const startAck = await emit<{ success: boolean }>(client1, 'game:start', { gameId: game.id });
    expect(startAck.success).toBe(true);

    const [state1, state2] = await Promise.all([state1Promise, state2Promise]);
    expect(state1.territories.length).toBe(15);
    expect(state1.players.length).toBe(2);
    expect(state1.currentPlayerIndex).toBe(state2.currentPlayerIndex);

    // 6. One player surrenders → game over immediately in a 2-player game
    const gameOverPromise1 = waitForEvent<{ winnerIndex: number }>(client1, 'game:gameOver', 10_000);
    const gameOverPromise2 = waitForEvent<{ winnerIndex: number }>(client2, 'game:gameOver', 10_000);

    const surrenderAck = await emit<{ success: boolean }>(client1, 'game:surrender');
    expect(surrenderAck.success).toBe(true);

    const [gameOver1, gameOver2] = await Promise.all([gameOverPromise1, gameOverPromise2]);
    expect(gameOver1.winnerIndex).toBe(1); // Bob wins
    expect(gameOver2.winnerIndex).toBe(1);
  }, 20_000);

  it('attack + endTurn cycle works correctly', async () => {
    const { client, tracker } = await setupHumanAIGame();

    let state = tracker.state;
    let attacksPerformed = 0;
    let turnsCompleted = 0;

    // Drain to latest state (AI may have already played if it went first)
    while (state.currentPlayerIndex !== 0 && !state.gameOver) {
      state = await tracker.waitForState(10_000);
    }

    // Play up to 5 turns — enough to verify the attack/endTurn cycle
    for (let turn = 0; turn < 5 && !state.gameOver; turn++) {
      // Try to attack
      const pair = findAttackPair(state, 0);
      if (pair) {
        const ack = await emit<{ success: boolean }>(
          client, 'game:attack', { fromTerritoryId: pair.from, toTerritoryId: pair.to },
        );
        expect(ack.success).toBe(true);
        state = await tracker.waitForState(10_000);
        attacksPerformed++;
        if (state.gameOver) break;
      }

      // End turn
      const endAck = await emit<{ success: boolean }>(client, 'game:endTurn');
      expect(endAck.success).toBe(true);
      state = await tracker.waitForState(10_000);
      turnsCompleted++;

      // Wait for our turn again (AI plays instantly)
      while (state.currentPlayerIndex !== 0 && !state.gameOver) {
        state = await tracker.waitForState(10_000);
      }
    }

    // Verify we actually played some turns
    expect(attacksPerformed + turnsCompleted).toBeGreaterThan(0);

    // Finish the game via surrender if not already over
    if (!state.gameOver) {
      const surrenderAck = await emit<{ success: boolean }>(client, 'game:surrender');
      expect(surrenderAck.success).toBe(true);
      state = await tracker.waitForState(10_000);
      expect(state.gameOver).toBe(true);
    }

    tracker.destroy();
  }, 45_000);

  it('match is saved to database after game over', async () => {
    const { client, auth, tracker } = await setupHumanAIGame();
    tracker.destroy();

    // Set up listener BEFORE triggering game over
    const gameOverPromise = waitForEvent(client, 'game:gameOver', 10_000);
    await emit(client, 'game:surrender');
    await gameOverPromise;

    // Wait for async DB write
    await new Promise((r) => setTimeout(r, 500));

    // Verify via REST
    const res = await server.app.request('/api/me/history', {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    expect(res.status).toBe(200);
    const history = await res.json();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThanOrEqual(1);
  }, 15_000);
});

/**
 * E2E Test: Multi-client simulation
 *
 * 4 human players in one game, all interacting simultaneously.
 * Verifies consistent state updates across all clients.
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
  type TestServer,
  type AuthInfo,
  DEFAULT_GAME_CONFIG,
} from './helpers';

let counter = 0;
function uniqueName(prefix: string): string {
  return `${prefix}-${++counter}`;
}

describe('E2E: Multi-client Simulation', () => {
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

  it('4 human players play a complete game', async () => {
    // Create 4 authenticated users
    const auths: AuthInfo[] = [];
    for (let i = 0; i < 4; i++) {
      auths.push(await guestAuth(server.app, uniqueName('MC')));
    }

    // Player 0 creates a 4-player game, small map
    const game = await createGameViaREST(
      server.app,
      auths[0].token,
      uniqueName('MultiGame'),
      {
        ...DEFAULT_GAME_CONFIG,
        playerCount: 4,
        territoryCount: 15,
        speed: 'instant',
      },
    );

    // All others join via REST
    for (let i = 1; i < 4; i++) {
      await joinGameViaREST(server.app, auths[i].token, game.id);
    }

    // All connect via WebSocket and join the game room
    const playerClients: Socket[] = [];
    for (const auth of auths) {
      const client = connectGameClient(server.port, auth.token);
      clients.push(client);
      playerClients.push(client);
      await waitForConnect(client);
      const joinAck = await emit<{ success: boolean }>(client, 'game:join', { gameId: game.id });
      expect(joinAck.success).toBe(true);
    }

    // All receive initial state after start
    const statePromises = playerClients.map((c) =>
      waitForEvent<WireGameState>(c, 'game:stateUpdate'),
    );
    const startAck = await emit<{ success: boolean }>(playerClients[0], 'game:start', { gameId: game.id });
    expect(startAck.success).toBe(true);

    const initialStates = await Promise.all(statePromises);

    // Verify all clients see the same initial state
    for (const s of initialStates) {
      expect(s.territories.length).toBe(15);
      expect(s.players.length).toBe(4);
      expect(s.currentPlayerIndex).toBe(initialStates[0].currentPlayerIndex);
    }

    // Track latest state from client 0 (reference)
    let latestState = initialStates[0];
    let errorsEncountered = 0;

    // Set up gameOver listeners on all clients ONCE
    const gameOverPromises = playerClients.map((c) =>
      waitForEvent<{ winnerIndex: number }>(c, 'game:gameOver', 30_000),
    );

    // Play turns — players surrender one by one until game ends
    // (This guarantees the game ends quickly and deterministically)
    for (let i = 0; i < 3; i++) {
      const currentIdx = latestState.currentPlayerIndex;
      const currentClient = playerClients[currentIdx];

      if (latestState.gameOver) break;

      // Try one attack first if possible
      const pair = findAttackPair(latestState, currentIdx);
      if (pair) {
        // Set up state listeners BEFORE emitting
        const updatePromises = playerClients.map((c) =>
          waitForEvent<WireGameState>(c, 'game:stateUpdate', 5_000),
        );
        const ack = await emit<{ success: boolean }>(
          currentClient,
          'game:attack',
          { fromTerritoryId: pair.from, toTerritoryId: pair.to },
        );
        if (!ack.success) errorsEncountered++;
        const updates = await Promise.all(updatePromises);
        latestState = updates[0];
        if (latestState.gameOver) break;
      }

      // Surrender the current player
      const updatePromises = playerClients.map((c) =>
        waitForEvent<WireGameState>(c, 'game:stateUpdate', 5_000).catch(() => latestState),
      );
      const surrenderAck = await emit<{ success: boolean }>(currentClient, 'game:surrender');
      if (surrenderAck.success) {
        const updates = await Promise.all(updatePromises);
        latestState = updates[0];
      }
      if (latestState.gameOver) break;

      // End turn so the next player can go
      if (!latestState.gameOver && latestState.currentPlayerIndex === currentIdx) {
        const endUpdatePromises = playerClients.map((c) =>
          waitForEvent<WireGameState>(c, 'game:stateUpdate', 5_000).catch(() => latestState),
        );
        await emit(currentClient, 'game:endTurn');
        const updates = await Promise.all(endUpdatePromises);
        latestState = updates[0];
      }
    }

    // All clients should receive game:gameOver
    const gameOverResults = await Promise.all(gameOverPromises);
    for (const result of gameOverResults) {
      expect(typeof result.winnerIndex).toBe('number');
    }

    // All clients received the same winner
    const winners = new Set(gameOverResults.map((r) => r.winnerIndex));
    expect(winners.size).toBe(1);

    expect(errorsEncountered).toBe(0);
  }, 30_000);
});

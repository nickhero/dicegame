/**
 * E2E Test: Reconnection
 *
 * Player disconnects mid-game, reconnects with a new socket (same JWT),
 * and verifies full state is restored and actions still work.
 */
import { describe, it, expect, afterAll, afterEach } from 'vitest';
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
  delay,
  type TestServer,
  DEFAULT_GAME_CONFIG,
} from './helpers';

describe('E2E: Reconnection', () => {
  let server: TestServer;
  const clients: Socket[] = [];

  afterAll(async () => {
    for (const c of clients) c.disconnect();
    if (server) await shutdownServer(server);
  });

  afterEach(() => {
    for (const c of clients) c.disconnect();
    clients.length = 0;
    resetServerState();
  });

  it('disconnected player can reconnect and receive full game state', async () => {
    server = await createTestServer();

    const auth1 = await guestAuth(server.app, 'Recon-Host');
    const auth2 = await guestAuth(server.app, 'Recon-Player');

    const game = await createGameViaREST(
      server.app,
      auth1.token,
      'Reconnect Test',
      { ...DEFAULT_GAME_CONFIG, playerCount: 2, territoryCount: 15, speed: 'instant' },
    );
    await joinGameViaREST(server.app, auth2.token, game.id);

    // Connect both players
    const client1 = connectGameClient(server.port, auth1.token);
    const client2 = connectGameClient(server.port, auth2.token);
    clients.push(client1);
    // Don't push client2 into clients array yet — we'll manage its lifecycle manually

    await Promise.all([waitForConnect(client1), waitForConnect(client2)]);
    await Promise.all([
      emit(client1, 'game:join', { gameId: game.id }),
      emit(client2, 'game:join', { gameId: game.id }),
    ]);

    // Start game
    const s1Promise = waitForEvent<WireGameState>(client1, 'game:stateUpdate');
    const s2Promise = waitForEvent<WireGameState>(client2, 'game:stateUpdate');
    await emit(client1, 'game:start', { gameId: game.id });
    const [initialState1] = await Promise.all([s1Promise, s2Promise]);

    expect(initialState1.players.length).toBe(2);

    // Player 2 disconnects
    const disconnectPromise = waitForEvent<{ playerIndex: number; graceSeconds: number }>(
      client1,
      'game:playerDisconnected',
    );
    client2.disconnect();

    const disconnectEvent = await disconnectPromise;
    expect(disconnectEvent.playerIndex).toBeGreaterThanOrEqual(0);
    expect(disconnectEvent.graceSeconds).toBeGreaterThan(0);

    // Wait 2 seconds
    await delay(2_000);

    // Player 2 reconnects with a new socket
    const client2b = connectGameClient(server.port, auth2.token);
    clients.push(client2b);
    await waitForConnect(client2b);

    // Listen for reconnect notification on client1
    const reconEventPromise = waitForEvent<{ playerIndex: number }>(
      client1,
      'game:playerReconnected',
      5_000,
    );

    // Send reconnect
    const reconAck = await emit<{ success: boolean; data?: WireGameState }>(
      client2b,
      'game:reconnect',
      { gameId: game.id },
    );
    expect(reconAck.success).toBe(true);
    expect(reconAck.data).toBeTruthy();
    expect(reconAck.data!.territories.length).toBe(15);
    expect(reconAck.data!.players.length).toBe(2);

    // Client1 should get reconnection notification
    const reconEvent = await reconEventPromise;
    expect(reconEvent.playerIndex).toBeGreaterThanOrEqual(0);

    // Verify the reconnected player can still act
    // End turn or surrender to confirm actions work
    const surrenderAck = await emit<{ success: boolean }>(client2b, 'game:surrender');
    expect(surrenderAck.success).toBe(true);
  }, 20_000);

  it('reconnected player can continue playing until game over', async () => {
    server = server ?? await createTestServer();

    const auth1 = await guestAuth(server.app, 'Cont-Host');
    const auth2 = await guestAuth(server.app, 'Cont-Player');

    const game = await createGameViaREST(
      server.app,
      auth1.token,
      'Continue After Reconnect',
      {
        ...DEFAULT_GAME_CONFIG,
        playerCount: 2,
        territoryCount: 15,
        speed: 'instant',
      },
    );
    await joinGameViaREST(server.app, auth2.token, game.id);

    const client1 = connectGameClient(server.port, auth1.token);
    const client2 = connectGameClient(server.port, auth2.token);
    clients.push(client1);

    await Promise.all([waitForConnect(client1), waitForConnect(client2)]);
    await Promise.all([
      emit(client1, 'game:join', { gameId: game.id }),
      emit(client2, 'game:join', { gameId: game.id }),
    ]);

    const s1Promise = waitForEvent<WireGameState>(client1, 'game:stateUpdate');
    const s2Promise = waitForEvent<WireGameState>(client2, 'game:stateUpdate');
    await emit(client1, 'game:start', { gameId: game.id });
    await Promise.all([s1Promise, s2Promise]);

    // Player 1 disconnects briefly
    client1.disconnect();
    await delay(500);

    // Reconnect
    const client1b = connectGameClient(server.port, auth1.token);
    clients.push(client1b);
    await waitForConnect(client1b);

    const reconAck = await emit<{ success: boolean; data?: WireGameState }>(
      client1b,
      'game:reconnect',
      { gameId: game.id },
    );
    expect(reconAck.success).toBe(true);

    // Now player 1 surrenders — game should end normally
    const gameOverPromise = waitForEvent<{ winnerIndex: number }>(client1b, 'game:gameOver', 10_000);
    await emit(client1b, 'game:surrender');
    const gameOver = await gameOverPromise;
    expect(typeof gameOver.winnerIndex).toBe('number');
  }, 20_000);
});

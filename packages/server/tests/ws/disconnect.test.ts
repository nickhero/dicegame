import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine, type ServerGameConfig, type PlayerSlot, type ActiveGame } from '../../src/services/GameEngine';
import { PLAYER_COLORS } from '@dicewars/shared';
import {
  setupDisconnectHandler,
  setupReconnectHandler,
  clearGameGracePeriods,
  _resetGracePeriods,
  _getGracePeriods,
  GRACE_PERIOD_MS,
} from '../../src/ws/disconnectHandler';

function makeConfig(overrides: Partial<ServerGameConfig> = {}): ServerGameConfig {
  return {
    playerCount: 4,
    territoryCount: 20,
    mapShape: 'rectangle',
    gridType: 'square',
    speed: 'normal',
    powerUps: false,
    fogOfWar: false,
    alliances: false,
    undoEnabled: false,
    seed: '42',
    ...overrides,
  };
}

function makeSlots(count: number, humanCount = 2): PlayerSlot[] {
  const slots: PlayerSlot[] = [];
  for (let i = 0; i < count; i++) {
    if (i < humanCount) {
      slots.push({
        userId: `user-${i}`,
        name: `Player ${i}`,
        isAI: false,
        color: PLAYER_COLORS[i],
      });
    } else {
      slots.push({
        name: `AI ${i}`,
        isAI: true,
        aiPersonality: 'balanced',
        color: PLAYER_COLORS[i],
      });
    }
  }
  return slots;
}

// Minimal mock for Socket
function createMockSocket(overrides: { userId?: string; gameId?: string } = {}) {
  const listeners = new Map<string, Function>();
  return {
    data: {
      userId: overrides.userId ?? 'user-0',
      userName: 'Test Player',
      gameId: overrides.gameId,
    },
    on: vi.fn((event: string, handler: Function) => {
      listeners.set(event, handler);
    }),
    join: vi.fn(),
    _listeners: listeners,
    _trigger(event: string, ...args: unknown[]) {
      const handler = listeners.get(event);
      if (handler) handler(...args);
    },
  };
}

// Minimal mock for Namespace
function createMockNamespace() {
  const emitFn = vi.fn();
  const toFn = vi.fn(() => ({ emit: emitFn }));
  return {
    to: toFn,
    emit: vi.fn(),
    _toEmit: emitFn,
    _to: toFn,
  };
}

describe('Disconnect Handler', () => {
  let engine: GameEngine;
  let game: ActiveGame;
  const roomId = 'room-dc';

  beforeEach(() => {
    vi.useFakeTimers();
    _resetGracePeriods();
    engine = new GameEngine();
    game = engine.createGame(roomId, makeConfig(), makeSlots(4, 2));
  });

  afterEach(() => {
    _resetGracePeriods();
    vi.useRealTimers();
  });

  it('starts grace period on player disconnect and emits game:playerDisconnected', () => {
    const socket = createMockSocket({ userId: 'user-0', gameId: roomId });
    const ns = createMockNamespace();

    setupDisconnectHandler(socket as never, ns as never, engine);

    socket._trigger('disconnect', 'transport close');

    // Grace period timer should be set
    const key = `${roomId}:user-0`;
    expect(_getGracePeriods().has(key)).toBe(true);

    // Player should be recorded as disconnected
    expect(game.disconnectedPlayers.has('user-0')).toBe(true);

    // Notification emitted
    expect(ns._to).toHaveBeenCalledWith(`game:${roomId}`);
    expect(ns._toEmit).toHaveBeenCalledWith('game:playerDisconnected', {
      playerIndex: 0,
      graceSeconds: GRACE_PERIOD_MS / 1000,
    });
  });

  it('cancels grace period on reconnect and emits game:playerReconnected', () => {
    // First set up disconnect
    const socket1 = createMockSocket({ userId: 'user-0', gameId: roomId });
    const ns = createMockNamespace();

    setupDisconnectHandler(socket1 as never, ns as never, engine);
    socket1._trigger('disconnect', 'transport close');

    const key = `${roomId}:user-0`;
    expect(_getGracePeriods().has(key)).toBe(true);

    // Now reconnect
    const socket2 = createMockSocket({ userId: 'user-0' });
    setupReconnectHandler(socket2 as never, ns as never, engine);

    const ack = vi.fn();
    socket2._trigger('game:reconnect', { gameId: roomId }, ack);

    // Grace period should be cancelled
    expect(_getGracePeriods().has(key)).toBe(false);

    // Disconnect record should be cleared
    expect(game.disconnectedPlayers.has('user-0')).toBe(false);

    // Reconnect notification emitted
    expect(ns._toEmit).toHaveBeenCalledWith('game:playerReconnected', {
      playerIndex: 0,
    });

    // Ack should include state
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          territories: expect.any(Array),
          players: expect.any(Array),
        }),
      }),
    );
  });

  it('converts player to AI when grace period expires', () => {
    const socket = createMockSocket({ userId: 'user-0', gameId: roomId });
    const ns = createMockNamespace();

    setupDisconnectHandler(socket as never, ns as never, engine);
    socket._trigger('disconnect', 'transport close');

    // Player should still be human
    expect(game.state.players[0].isHuman).toBe(true);
    expect(game.aiPlayerIndices.has(0)).toBe(false);

    // Advance time past grace period
    vi.advanceTimersByTime(GRACE_PERIOD_MS);

    // Player should now be AI
    expect(game.state.players[0].isHuman).toBe(false);
    expect(game.aiPlayerIndices.has(0)).toBe(true);

    // Disconnect record should be cleared
    expect(game.disconnectedPlayers.has('user-0')).toBe(false);

    // Grace period timer should be cleaned up
    const key = `${roomId}:user-0`;
    expect(_getGracePeriods().has(key)).toBe(false);

    // State update emitted
    expect(ns._toEmit).toHaveBeenCalledWith(
      'game:stateUpdate',
      expect.objectContaining({
        players: expect.any(Array),
      }),
    );
  });

  it('restores converted AI player back to human on reconnect', () => {
    const socket = createMockSocket({ userId: 'user-0', gameId: roomId });
    const ns = createMockNamespace();

    setupDisconnectHandler(socket as never, ns as never, engine);
    socket._trigger('disconnect', 'transport close');

    // Force conversion
    vi.advanceTimersByTime(GRACE_PERIOD_MS);

    expect(game.state.players[0].isHuman).toBe(false);
    expect(game.aiPlayerIndices.has(0)).toBe(true);

    // Reconnect
    const socket2 = createMockSocket({ userId: 'user-0' });
    setupReconnectHandler(socket2 as never, ns as never, engine);

    const ack = vi.fn();
    socket2._trigger('game:reconnect', { gameId: roomId }, ack);

    // Player should be human again
    expect(game.state.players[0].isHuman).toBe(true);
    expect(game.aiPlayerIndices.has(0)).toBe(false);

    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it('does not start grace period for non-active game', () => {
    game.status = 'finished';

    const socket = createMockSocket({ userId: 'user-0', gameId: roomId });
    const ns = createMockNamespace();

    setupDisconnectHandler(socket as never, ns as never, engine);
    socket._trigger('disconnect', 'transport close');

    // No grace period should be set
    expect(_getGracePeriods().size).toBe(0);
    expect(game.disconnectedPlayers.size).toBe(0);
  });

  it('ignores disconnect for AI players', () => {
    // Slot index 2 is AI
    const socket = createMockSocket({ userId: 'user-ai', gameId: roomId });
    const ns = createMockNamespace();

    // Add user-ai to playerMap as an AI player (index 2)
    game.playerMap.set('user-ai', 2);

    setupDisconnectHandler(socket as never, ns as never, engine);
    socket._trigger('disconnect', 'transport close');

    // No grace period for AI
    expect(_getGracePeriods().size).toBe(0);
    expect(game.disconnectedPlayers.size).toBe(0);
  });

  it('ignores disconnect when socket has no gameId', () => {
    const socket = createMockSocket({ userId: 'user-0' }); // no gameId
    const ns = createMockNamespace();

    setupDisconnectHandler(socket as never, ns as never, engine);
    socket._trigger('disconnect', 'transport close');

    expect(_getGracePeriods().size).toBe(0);
  });

  it('returns error on reconnect to non-existent game', () => {
    const socket = createMockSocket({ userId: 'user-0' });
    const ns = createMockNamespace();

    setupReconnectHandler(socket as never, ns as never, engine);

    const ack = vi.fn();
    socket._trigger('game:reconnect', { gameId: 'no-such-game' }, ack);

    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'GAME_NOT_FOUND' }),
      }),
    );
  });

  it('returns error on reconnect for player not in game', () => {
    const socket = createMockSocket({ userId: 'stranger' });
    const ns = createMockNamespace();

    setupReconnectHandler(socket as never, ns as never, engine);

    const ack = vi.fn();
    socket._trigger('game:reconnect', { gameId: roomId }, ack);

    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'CONNECTION_NOT_IN_GAME' }),
      }),
    );
  });

  it('clearGameGracePeriods removes all timers for a game', () => {
    const socket0 = createMockSocket({ userId: 'user-0', gameId: roomId });
    const socket1 = createMockSocket({ userId: 'user-1', gameId: roomId });
    const ns = createMockNamespace();

    setupDisconnectHandler(socket0 as never, ns as never, engine);
    setupDisconnectHandler(socket1 as never, ns as never, engine);

    socket0._trigger('disconnect', 'transport close');
    socket1._trigger('disconnect', 'transport close');

    expect(_getGracePeriods().size).toBe(2);

    clearGameGracePeriods(roomId);

    expect(_getGracePeriods().size).toBe(0);
  });
});

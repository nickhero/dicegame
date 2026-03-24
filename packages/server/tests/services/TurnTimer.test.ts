import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine, type ServerGameConfig, type PlayerSlot } from '../../src/services/GameEngine';
import { TurnTimer, type TurnTimerDuration } from '../../src/services/TurnTimer';
import { PLAYER_COLORS } from '@dicewars/shared';

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

describe('TurnTimer', () => {
  let engine: GameEngine;
  let timer: TurnTimer;
  let ns: ReturnType<typeof createMockNamespace>;
  const roomId = 'room-tt';

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new GameEngine();
    ns = createMockNamespace();
    timer = new TurnTimer(engine, ns as never);
  });

  afterEach(() => {
    timer.destroyGame(roomId);
    vi.useRealTimers();
  });

  it('fires after duration and auto-ends turn', () => {
    const game = engine.createGame(roomId, makeConfig(), makeSlots(4, 2));

    // Ensure current player is human (player 0)
    expect(game.state.currentPlayerIndex).toBe(0);
    expect(game.aiPlayerIndices.has(0)).toBe(false);

    const duration: TurnTimerDuration = 30;
    timer.startTimer(roomId, duration);

    // Timer should be active
    expect(timer._getTimers().has(roomId)).toBe(true);

    // Advance time
    vi.advanceTimersByTime(30_000);

    // Timer should have fired and been cleaned up
    expect(timer._getTimers().has(roomId)).toBe(false);

    // Turn should have been ended — turnChanged event emitted
    expect(ns._to).toHaveBeenCalledWith(`game:${roomId}`);
    expect(ns._toEmit).toHaveBeenCalledWith(
      'game:turnChanged',
      expect.objectContaining({
        previousPlayerIndex: 0,
      }),
    );
  });

  it('clears timer on manual endTurn (clearTimer)', () => {
    engine.createGame(roomId, makeConfig(), makeSlots(4, 2));

    timer.startTimer(roomId, 60);
    expect(timer._getTimers().has(roomId)).toBe(true);

    timer.clearTimer(roomId);
    expect(timer._getTimers().has(roomId)).toBe(false);

    // Advancing time should NOT fire the callback
    vi.advanceTimersByTime(60_000);
    expect(ns._toEmit).not.toHaveBeenCalledWith(
      'game:turnChanged',
      expect.anything(),
    );
  });

  it('does not set timer for AI players', () => {
    const game = engine.createGame(roomId, makeConfig(), makeSlots(4, 0)); // all AI

    expect(game.aiPlayerIndices.has(game.state.currentPlayerIndex)).toBe(true);

    timer.startTimer(roomId, 30);
    expect(timer._getTimers().has(roomId)).toBe(false);
  });

  it('does not set timer for single-player games', () => {
    engine.createGame(roomId, makeConfig(), makeSlots(4, 1)); // 1 human, 3 AI

    timer.startTimer(roomId, 30);
    expect(timer._getTimers().has(roomId)).toBe(false);
  });

  it('returns correct remaining seconds', () => {
    engine.createGame(roomId, makeConfig(), makeSlots(4, 2));

    timer.startTimer(roomId, 60);

    // At the start
    expect(timer.getRemainingSeconds(roomId)).toBe(60);

    // After 15 seconds
    vi.advanceTimersByTime(15_000);
    expect(timer.getRemainingSeconds(roomId)).toBe(45);

    // After 45 more seconds (total 60)
    vi.advanceTimersByTime(45_000);
    // Timer should have fired; no remaining
    expect(timer.getRemainingSeconds(roomId)).toBeNull();
  });

  it('returns null for non-existent timer', () => {
    expect(timer.getRemainingSeconds('no-such-game')).toBeNull();
  });

  it('does not set timer when duration is 0 (unlimited)', () => {
    engine.createGame(roomId, makeConfig(), makeSlots(4, 2));

    timer.startTimer(roomId, 0);
    expect(timer._getTimers().has(roomId)).toBe(false);
  });

  it('multiple games have independent timers', () => {
    const roomId2 = 'room-tt-2';
    engine.createGame(roomId, makeConfig(), makeSlots(4, 2));
    engine.createGame(roomId2, makeConfig(), makeSlots(4, 2));

    timer.startTimer(roomId, 30);
    timer.startTimer(roomId2, 60);

    expect(timer._getTimers().has(roomId)).toBe(true);
    expect(timer._getTimers().has(roomId2)).toBe(true);

    // Advance 30s — first timer fires, second still active
    vi.advanceTimersByTime(30_000);
    expect(timer._getTimers().has(roomId)).toBe(false);
    expect(timer._getTimers().has(roomId2)).toBe(true);

    // Advance 30 more seconds — second timer fires
    vi.advanceTimersByTime(30_000);
    expect(timer._getTimers().has(roomId2)).toBe(false);

    timer.destroyGame(roomId2);
  });

  it('destroyGame clears the timer', () => {
    engine.createGame(roomId, makeConfig(), makeSlots(4, 2));

    timer.startTimer(roomId, 30);
    expect(timer._getTimers().has(roomId)).toBe(true);

    timer.destroyGame(roomId);
    expect(timer._getTimers().has(roomId)).toBe(false);

    // Should not fire after destroy
    vi.advanceTimersByTime(30_000);
    expect(ns._toEmit).not.toHaveBeenCalledWith(
      'game:turnChanged',
      expect.anything(),
    );
  });

  it('replaces existing timer when startTimer is called again', () => {
    engine.createGame(roomId, makeConfig(), makeSlots(4, 2));

    timer.startTimer(roomId, 30);
    const firstTimers = timer._getTimers().get(roomId);

    // Start again with different duration
    timer.startTimer(roomId, 60);
    const secondTimers = timer._getTimers().get(roomId);

    expect(firstTimers).not.toBe(secondTimers);
    expect(timer.getRemainingSeconds(roomId)).toBe(60);
  });
});

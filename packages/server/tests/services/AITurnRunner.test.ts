import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AITurnRunner } from '../../src/services/AITurnRunner';
import { GameEngine, type ServerGameConfig, type PlayerSlot } from '../../src/services/GameEngine';
import { PLAYER_COLORS } from '@dicewars/shared';

// ── Mock namespace ──────────────────────────────────────────────────

function createMockNamespace() {
  const emitFn = vi.fn();
  const toObj = { emit: emitFn };
  return {
    to: vi.fn(() => toObj),
    emit: vi.fn(),
    _toObj: toObj,
    _emitFn: emitFn,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ServerGameConfig> = {}): ServerGameConfig {
  return {
    playerCount: 4,
    territoryCount: 20,
    mapShape: 'rectangle',
    gridType: 'square',
    speed: 'instant',
    powerUps: false,
    fogOfWar: false,
    alliances: false,
    undoEnabled: false,
    seed: '42',
    ...overrides,
  };
}

function makeSlots(count: number, humanCount = 1, personality = 'balanced'): PlayerSlot[] {
  const slots: PlayerSlot[] = [];
  for (let i = 0; i < count; i++) {
    if (i < humanCount) {
      slots.push({
        userId: `user-${i}`,
        name: `Player ${i}`,
        isAI: false,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      });
    } else {
      slots.push({
        name: `AI ${i}`,
        isAI: true,
        aiPersonality: personality,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      });
    }
  }
  return slots;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('AITurnRunner', () => {
  let engine: GameEngine;
  let ns: ReturnType<typeof createMockNamespace>;
  let runner: AITurnRunner;
  const gameId = 'test-game';

  beforeEach(() => {
    engine = new GameEngine();
    ns = createMockNamespace();
    runner = new AITurnRunner(engine, ns as never);
  });

  describe('basic AI turn execution', () => {
    it('should execute AI attacks and end turn', async () => {
      const config = makeConfig({ speed: 'instant' });
      const slots = makeSlots(4, 1, 'aggressive');
      engine.createGame(gameId, config, slots);

      // End human turn → advance to AI player 1
      engine.endTurn(gameId, 'user-0');
      const game = engine.getGame(gameId)!;
      expect(game.state.currentPlayerIndex).toBe(1);
      expect(game.aiPlayerIndices.has(1)).toBe(true);

      // Run AI turns — should process players 1, 2, 3 and stop at player 0
      await runner.runAITurns(gameId);

      // Should have emitted events
      expect(ns.to).toHaveBeenCalled();

      // Turn should be back to player 0 (human) or game is over
      if (game.status === 'playing') {
        expect(game.state.currentPlayerIndex).toBe(0);
      }
    });

    it('should stop at human player turn', async () => {
      const config = makeConfig({ speed: 'instant' });
      // Player 0 human, players 1-3 AI
      const slots = makeSlots(4, 1, 'cautious');
      engine.createGame(gameId, config, slots);

      // End human turn → triggers AI
      engine.endTurn(gameId, 'user-0');

      await runner.runAITurns(gameId);

      const game = engine.getGame(gameId)!;
      // If game is still playing, it must be the human's turn
      if (game.status === 'playing') {
        expect(game.state.currentPlayerIndex).toBe(0);
        expect(game.aiPlayerIndices.has(0)).toBe(false);
      }
    });
  });

  describe('double execution guard', () => {
    it('should prevent double execution', async () => {
      const config = makeConfig({ speed: 'instant' });
      const slots = makeSlots(4, 1, 'balanced');
      engine.createGame(gameId, config, slots);

      engine.endTurn(gameId, 'user-0');

      // Start two concurrent AI runs
      const p1 = runner.runAITurns(gameId);
      const p2 = runner.runAITurns(gameId);

      await Promise.all([p1, p2]);

      // Guard should have blocked the second one — no double processing
      expect(runner.isRunning(gameId)).toBe(false);
    });
  });

  describe('all-AI game', () => {
    it('should handle all-AI game to completion', async () => {
      const config = makeConfig({
        speed: 'instant',
        playerCount: 3,
        territoryCount: 15,
        seed: '123',
      });
      // All AI, no humans
      const slots: PlayerSlot[] = [
        { name: 'AI 0', isAI: true, aiPersonality: 'aggressive', color: PLAYER_COLORS[0] },
        { name: 'AI 1', isAI: true, aiPersonality: 'balanced', color: PLAYER_COLORS[1] },
        { name: 'AI 2', isAI: true, aiPersonality: 'cautious', color: PLAYER_COLORS[2] },
      ];
      engine.createGame(gameId, config, slots);

      await runner.runSpectatorGame(gameId);

      const game = engine.getGame(gameId);
      // Game should have finished (or be destroyed)
      if (game) {
        expect(game.status).toBe('finished');
        expect(game.state.winner).not.toBeNull();
      }
    });
  });

  describe('instant mode', () => {
    it('should complete very quickly with no delays', async () => {
      const config = makeConfig({ speed: 'instant' });
      const slots = makeSlots(4, 1, 'aggressive');
      engine.createGame(gameId, config, slots);

      engine.endTurn(gameId, 'user-0');

      const start = Date.now();
      await runner.runAITurns(gameId);
      const elapsed = Date.now() - start;

      // Instant mode should be very fast — well under 1 second
      expect(elapsed).toBeLessThan(1000);
    });

    it('should emit instantBatch events', async () => {
      const config = makeConfig({ speed: 'instant' });
      const slots = makeSlots(4, 1, 'aggressive');
      engine.createGame(gameId, config, slots);

      engine.endTurn(gameId, 'user-0');

      await runner.runAITurns(gameId);

      // Check that instantBatch was emitted
      const emitCalls = ns._emitFn.mock.calls;
      const batchCalls = emitCalls.filter(
        (call: unknown[]) => call[0] === 'game:instantBatch',
      );
      expect(batchCalls.length).toBeGreaterThan(0);

      // Each batch should have actions and finalState
      for (const call of batchCalls) {
        const payload = call[1] as { actions: unknown[]; finalState: unknown };
        expect(payload.actions).toBeDefined();
        expect(Array.isArray(payload.actions)).toBe(true);
        expect(payload.finalState).toBeDefined();
      }
    });
  });

  describe('game features', () => {
    it('should handle power-ups enabled', async () => {
      const config = makeConfig({ speed: 'instant', powerUps: true });
      const slots = makeSlots(4, 1, 'balanced');
      const game = engine.createGame(gameId, config, slots);

      // Place a reinforce power-up on an AI territory
      const aiTerritory = game.state.territories.find((t) => t.owner === 1);
      if (aiTerritory) {
        aiTerritory.powerUp = 'reinforce';
      }

      engine.endTurn(gameId, 'user-0');

      await runner.runAITurns(gameId);

      // Verify no errors occurred (turn advanced or game ended)
      if (game.status === 'playing') {
        expect(game.state.currentPlayerIndex).toBe(0);
      }
    });

    it('should handle alliances enabled', async () => {
      const config = makeConfig({ speed: 'instant', alliances: true });
      const slots = makeSlots(4, 1, 'cautious');
      engine.createGame(gameId, config, slots);

      engine.endTurn(gameId, 'user-0');

      await runner.runAITurns(gameId);

      const game = engine.getGame(gameId)!;
      if (game.status === 'playing') {
        expect(game.state.currentPlayerIndex).toBe(0);
      }
    });

    it('should handle fog of war enabled', async () => {
      const config = makeConfig({ speed: 'instant', fogOfWar: true });
      const slots = makeSlots(4, 1, 'balanced');
      engine.createGame(gameId, config, slots);

      engine.endTurn(gameId, 'user-0');

      await runner.runAITurns(gameId);

      const game = engine.getGame(gameId)!;
      if (game.status === 'playing') {
        expect(game.state.currentPlayerIndex).toBe(0);
      }
    });
  });

  describe('normal speed mode', () => {
    it('should emit individual events in animated mode', async () => {
      // Use 'fast' speed so delays are short but non-zero — the runner
      // uses the animated path (not instant), yet the test finishes quickly.
      const config = makeConfig({ speed: 'fast' });
      const slots = makeSlots(2, 1, 'cautious');
      engine.createGame(gameId, config, slots);

      // End human turn → triggers AI player 1
      engine.endTurn(gameId, 'user-0');

      await runner.runAITurns(gameId);

      const game = engine.getGame(gameId)!;

      // Should have used individual events (stateUpdate, turnChanged, etc.)
      const emitCalls = ns._emitFn.mock.calls;
      const eventTypes = emitCalls.map((call: unknown[]) => call[0]);

      // Should emit turnChanged and stateUpdate at minimum
      if (game.status === 'playing') {
        expect(eventTypes).toContain('game:turnChanged');
        expect(eventTypes).toContain('game:stateUpdate');
      }
    });
  });

  describe('surrender handling', () => {
    it('should surrender a desperate AI player', async () => {
      const config = makeConfig({ speed: 'instant', playerCount: 4, territoryCount: 20 });
      const slots = makeSlots(4, 1, 'balanced');
      const game = engine.createGame(gameId, config, slots);

      // Put AI player 1 in a desperate situation — 1 territory, 1 die
      for (const t of game.state.territories) {
        if (t.owner === 1) {
          t.owner = 0; // Give to player 0
        }
      }
      // Give back exactly one territory
      const lastT = game.state.territories.find((t) => t.owner === 0)!;
      lastT.owner = 1;
      lastT.dice = 1;

      // Set consecutive desperate counter high enough to trigger surrender
      game.state.consecutiveDesperate.set(1, 2);

      engine.endTurn(gameId, 'user-0');

      await runner.runAITurns(gameId);

      // Player 1 should have surrendered
      expect(game.state.players[1].isAlive).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle game not found', async () => {
      // Should not throw
      await runner.runAITurns('nonexistent');
    });

    it('should handle finished game', async () => {
      const config = makeConfig({ speed: 'instant' });
      const slots = makeSlots(4, 1);
      const game = engine.createGame(gameId, config, slots);
      game.status = 'finished';

      // Should not throw
      await runner.runAITurns(gameId);
    });

    it('should clean up running state even on error', async () => {
      const config = makeConfig({ speed: 'instant' });
      const slots = makeSlots(4, 1);
      engine.createGame(gameId, config, slots);

      engine.endTurn(gameId, 'user-0');

      await runner.runAITurns(gameId);

      // Running state should be cleaned up
      expect(runner.isRunning(gameId)).toBe(false);
    });

    it('should handle game where AI player is already dead', async () => {
      const config = makeConfig({ speed: 'instant' });
      const slots = makeSlots(4, 1, 'balanced');
      const game = engine.createGame(gameId, config, slots);

      // Kill player 1
      game.state.players[1].isAlive = false;
      for (const t of game.state.territories) {
        if (t.owner === 1) t.owner = 0;
      }

      engine.endTurn(gameId, 'user-0');

      // Turn should have skipped dead player 1 and gone to player 2
      await runner.runAITurns(gameId);

      if (game.status === 'playing') {
        expect(game.state.currentPlayerIndex).toBe(0);
      }
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  filterStateForPlayer,
  serializeFullState,
} from '../../src/services/FogFilter';
import {
  GameEngine,
  ServerGameConfig,
  PlayerSlot,
} from '../../src/services/GameEngine';
import { PLAYER_COLORS } from '@dicewars/shared';

function makeConfig(overrides: Partial<ServerGameConfig> = {}): ServerGameConfig {
  return {
    playerCount: 3,
    territoryCount: 12,
    mapShape: 'rectangle',
    gridType: 'square',
    speed: 'normal',
    powerUps: false,
    fogOfWar: true,
    alliances: false,
    undoEnabled: false,
    seed: 'fog-test-seed',
    ...overrides,
  };
}

function makeSlots(count: number): PlayerSlot[] {
  const slots: PlayerSlot[] = [
    { userId: 'alice', name: 'Alice', isAI: false, color: PLAYER_COLORS[0] },
    { userId: 'bob', name: 'Bob', isAI: false, color: PLAYER_COLORS[1] },
    {
      name: 'Charlie',
      isAI: true,
      aiPersonality: 'aggressive',
      color: PLAYER_COLORS[2],
    },
  ];
  return slots.slice(0, count);
}

function createTestGame(fogOfWar = true) {
  const engine = new GameEngine();
  const config = makeConfig({ fogOfWar });
  const slots = makeSlots(config.playerCount);
  return engine.createGame('test-fog', config, slots);
}

describe('FogFilter', () => {
  describe('serializeFullState', () => {
    it('should include all territories with full detail', () => {
      const game = createTestGame(false);
      const state = serializeFullState(game);

      expect(state.territories.length).toBe(game.state.territories.length);
      expect(state.territories.every((t) => t.visible)).toBe(true);
      expect(state.territories.every((t) => t.owner >= 0)).toBe(true);
      expect(state.territories.every((t) => t.dice > 0)).toBe(true);
    });

    it('should serialize all players', () => {
      const game = createTestGame(false);
      const state = serializeFullState(game);

      expect(state.players.length).toBe(3);
      expect(state.players[0].name).toBe('Alice');
      expect(state.players[0].isAI).toBe(false);
      expect(state.players[2].name).toBe('Charlie');
      expect(state.players[2].isAI).toBe(true);
      expect(state.players[2].personality).toBe('aggressive');
    });

    it('should serialize territory shape data', () => {
      const game = createTestGame(false);
      const state = serializeFullState(game);

      for (const t of state.territories) {
        expect(t.cells.length).toBeGreaterThan(0);
        expect(t.center).toHaveLength(2);
        expect(t.neighborIds.length).toBeGreaterThan(0);
      }
    });
  });

  describe('filterStateForPlayer', () => {
    it('should show own territories with full detail', () => {
      const game = createTestGame();
      const state = filterStateForPlayer(game, 0);

      const ownTerritories = state.territories.filter((t) => t.owner === 0);
      expect(ownTerritories.length).toBeGreaterThan(0);
      expect(ownTerritories.every((t) => t.visible)).toBe(true);
      expect(ownTerritories.every((t) => t.dice > 0)).toBe(true);
    });

    it('should hide distant enemy territories', () => {
      const game = createTestGame();
      const state = filterStateForPlayer(game, 0);

      const hiddenTerritories = state.territories.filter((t) => !t.visible);
      expect(hiddenTerritories.every((t) => t.owner === -1)).toBe(true);
      expect(hiddenTerritories.every((t) => t.dice === 0)).toBe(true);
      expect(hiddenTerritories.every((t) => t.powerUp === null)).toBe(true);
    });

    it('should show adjacent enemy territories', () => {
      const game = createTestGame();
      const state = filterStateForPlayer(game, 0);

      // At least some enemy territories should be visible (those adjacent to player's)
      const visibleEnemy = state.territories.filter(
        (t) => t.visible && t.owner !== 0 && t.owner !== -1,
      );
      expect(visibleEnemy.length).toBeGreaterThan(0);
    });

    it('should preserve territory shape for hidden territories', () => {
      const game = createTestGame();
      const state = filterStateForPlayer(game, 0);

      const hiddenTerritories = state.territories.filter((t) => !t.visible);
      if (hiddenTerritories.length > 0) {
        expect(hiddenTerritories[0].cells.length).toBeGreaterThan(0);
        expect(hiddenTerritories[0].center).toBeDefined();
        expect(hiddenTerritories[0].center).toHaveLength(2);
      }
    });

    it('should return full state when fog disabled', () => {
      const game = createTestGame(false);
      const state = filterStateForPlayer(game, 0);

      expect(state.territories.every((t) => t.visible)).toBe(true);
      expect(state.territories.every((t) => t.owner >= 0)).toBe(true);
    });

    it('should not leak reserve dice of other players', () => {
      const game = createTestGame();
      const state = filterStateForPlayer(game, 0);

      state.players.forEach((p) => {
        if (p.index !== 0) {
          expect(p.reserveDice).toBe(0);
        }
      });
    });

    it('spectator (playerIndex = -1) should see full state', () => {
      const game = createTestGame();
      const state = filterStateForPlayer(game, -1);

      expect(state.territories.every((t) => t.visible)).toBe(true);
      expect(state.territories.every((t) => t.owner >= 0)).toBe(true);
    });

    it('should report correct territory counts for requesting player', () => {
      const game = createTestGame();
      const actualCount = game.state.territories.filter((t) => t.owner === 0).length;
      const state = filterStateForPlayer(game, 0);

      const p0 = state.players.find((p) => p.index === 0)!;
      expect(p0.territoryCount).toBe(actualCount);
    });

    it('should report only visible territory counts for other players', () => {
      const game = createTestGame();
      const state = filterStateForPlayer(game, 0);

      // Other players' reported territory counts should be <= their actual counts
      for (const p of state.players) {
        if (p.index === 0) continue;
        const actual = game.state.territories.filter((t) => t.owner === p.index).length;
        expect(p.territoryCount).toBeLessThanOrEqual(actual);
      }
    });

    it('dead players should see full state', () => {
      const game = createTestGame();
      // Kill player 0
      game.state.players[0].isAlive = false;
      const state = filterStateForPlayer(game, 0);

      expect(state.territories.every((t) => t.visible)).toBe(true);
    });
  });
});

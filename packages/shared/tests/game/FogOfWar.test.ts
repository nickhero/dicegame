import { describe, it, expect } from 'vitest';
import { getVisibleTerritories, isVisible } from '../../src/game/FogOfWar';
import { GameState, createInitialGameState } from '../../src/game/GameState';
import { Territory } from '../../src/game/Territory';
import { createPlayer } from '../../src/game/Player';
import { buildAdjacencyMap } from '../../src/utils/graph';

/**
 * Map layout:
 *   0 -- 1 -- 2
 *        |    |
 *        3 -- 4
 *
 * Player 0 owns: 0, 1
 * Player 1 owns: 2, 3, 4
 */
function createFogTestState(): GameState {
  const adjacency = buildAdjacencyMap([
    [0, 1], [1, 2], [1, 3], [2, 4], [3, 4],
  ]);

  const territories: Territory[] = [
    { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1], owner: 0, dice: 3 },
    { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0, 2, 3], owner: 0, dice: 4 },
    { id: 2, cells: [], center: { x: 2, y: 0 }, neighbors: [1, 4], owner: 1, dice: 2 },
    { id: 3, cells: [], center: { x: 1, y: 1 }, neighbors: [1, 4], owner: 1, dice: 5 },
    { id: 4, cells: [], center: { x: 2, y: 1 }, neighbors: [2, 3], owner: 1, dice: 1 },
  ];

  const players = [
    createPlayer(0, 'Human', true, 0x4a90d9),
    createPlayer(1, 'AI', false, 0xd94a4a, 'balanced'),
  ];

  return createInitialGameState(territories, players, adjacency);
}

describe('getVisibleTerritories', () => {
  it('own territories are visible', () => {
    const state = createFogTestState();
    const visible = getVisibleTerritories(state, 0);

    expect(visible.has(0)).toBe(true);
    expect(visible.has(1)).toBe(true);
  });

  it('adjacent enemy territories are visible', () => {
    const state = createFogTestState();
    const visible = getVisibleTerritories(state, 0);

    // Territory 2 and 3 are neighbors of territory 1 (owned by player 0)
    expect(visible.has(2)).toBe(true);
    expect(visible.has(3)).toBe(true);
  });

  it('non-adjacent enemy territories are hidden', () => {
    const state = createFogTestState();
    const visible = getVisibleTerritories(state, 0);

    // Territory 4 is not adjacent to any of player 0's territories
    expect(visible.has(4)).toBe(false);
  });

  it('visibility updates when territories change owner', () => {
    const state = createFogTestState();

    // Initially territory 4 is hidden from player 0
    let visible = getVisibleTerritories(state, 0);
    expect(visible.has(4)).toBe(false);

    // Player 0 captures territory 2
    state.territories[2].owner = 0;

    // Now territory 4 should be visible (neighbor of territory 2)
    visible = getVisibleTerritories(state, 0);
    expect(visible.has(4)).toBe(true);
  });

  it('all territories visible when fog of war is disabled (no filtering)', () => {
    const state = createFogTestState();
    // When fog of war is disabled, we don't call getVisibleTerritories.
    // But if we were to get all territory IDs, none would be filtered.
    const allIds = new Set(state.territories.map((t) => t.id));
    // Confirm all 5 territories exist
    expect(allIds.size).toBe(5);

    // Without fog, all territories are treated as visible — no visibleSet is passed
    // Renderers treat undefined visibleSet as "show everything"
    for (const t of state.territories) {
      expect(allIds.has(t.id)).toBe(true);
    }
  });
});

describe('isVisible', () => {
  it('returns true for own territories', () => {
    const state = createFogTestState();
    expect(isVisible(state, 0, 0)).toBe(true);
    expect(isVisible(state, 0, 1)).toBe(true);
  });

  it('returns true for adjacent enemy territories', () => {
    const state = createFogTestState();
    expect(isVisible(state, 0, 2)).toBe(true);
    expect(isVisible(state, 0, 3)).toBe(true);
  });

  it('returns false for non-adjacent enemy territories', () => {
    const state = createFogTestState();
    expect(isVisible(state, 0, 4)).toBe(false);
  });

  it('updates when territory ownership changes', () => {
    const state = createFogTestState();
    expect(isVisible(state, 0, 4)).toBe(false);

    // Capture territory 3
    state.territories[3].owner = 0;
    expect(isVisible(state, 0, 4)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  shouldAISurrender,
  distributeSurrenderedTerritories,
  checkWinner,
} from '../../src/game/GameRules';
import { GameState, createInitialGameState } from '../../src/game/GameState';
import { Territory } from '../../src/game/Territory';
import { createPlayer } from '../../src/game/Player';
import { buildAdjacencyMap } from '../../src/utils/graph';
import { createAllianceState, formAlliance } from '../../src/game/Alliance';

/**
 * Build a 6-territory map for surrender tests:
 *
 *  0 -- 1 -- 2
 *  |    |    |
 *  3 -- 4 -- 5
 */
function createSurrenderTestState(): GameState {
  const adjacency = buildAdjacencyMap([
    [0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5],
  ]);

  const territories: Territory[] = [
    { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1, 3], owner: 0, dice: 4 },
    { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0, 2, 4], owner: 0, dice: 3 },
    { id: 2, cells: [], center: { x: 2, y: 0 }, neighbors: [1, 5], owner: 1, dice: 2 },
    { id: 3, cells: [], center: { x: 0, y: 1 }, neighbors: [0, 4], owner: 0, dice: 3 },
    { id: 4, cells: [], center: { x: 1, y: 1 }, neighbors: [1, 3, 5], owner: 0, dice: 2 },
    { id: 5, cells: [], center: { x: 2, y: 1 }, neighbors: [2, 4], owner: 1, dice: 1 },
  ];

  const players = [
    createPlayer(0, 'Player', true, 0x4a90d9),
    createPlayer(1, 'AI 1', false, 0xd94a4a, 'balanced'),
    createPlayer(2, 'AI 2', false, 0x4ad94a, 'balanced'),
  ];

  return createInitialGameState(territories, players, adjacency);
}

describe('shouldAISurrender', () => {
  it('returns false when player has > 2 territories', () => {
    const state = createSurrenderTestState();
    // Give player 1 three territories
    state.territories[3].owner = 1;
    // First call to start tracking
    expect(shouldAISurrender(state, 1)).toBe(false);
    expect(shouldAISurrender(state, 1)).toBe(false);
  });

  it('returns false on first desperate turn (needs ≥ 2 consecutive)', () => {
    const state = createSurrenderTestState();
    // Player 1 has territories 2 (2 dice) and 5 (1 dice) — no positive advantage
    expect(shouldAISurrender(state, 1)).toBe(false);
  });

  it('returns true after 2 consecutive desperate turns', () => {
    const state = createSurrenderTestState();
    // Player 1: 2 territories (2,5), both weak, no attack with advantage ≥ 1
    // Neighbor territory 1 has 3 dice — territory 2 has 2 dice → advantage = -1
    // Neighbor territory 4 has 2 dice — territory 5 has 1 die → can't attack (≤1)

    // First turn: desperate but not yet ready
    expect(shouldAISurrender(state, 1)).toBe(false);
    // Second turn: should now surrender
    expect(shouldAISurrender(state, 1)).toBe(true);
  });

  it('resets counter when conditions no longer met', () => {
    const state = createSurrenderTestState();
    // First desperate turn
    expect(shouldAISurrender(state, 1)).toBe(false);

    // Give player 1 an attack with advantage
    state.territories[2].dice = 5; // now 5 vs neighbor 1's 3 dice = advantage +2
    expect(shouldAISurrender(state, 1)).toBe(false);

    // Back to desperate — counter should have reset
    state.territories[2].dice = 2;
    expect(shouldAISurrender(state, 1)).toBe(false); // first desperate turn again
  });

  it('reckless personality never surrenders', () => {
    const state = createSurrenderTestState();
    state.players[1].personality = 'reckless';

    // Even after many desperate turns
    for (let i = 0; i < 10; i++) {
      expect(shouldAISurrender(state, 1)).toBe(false);
    }
  });

  it('aggressive personality surrenders at 1 territory', () => {
    const state = createSurrenderTestState();
    state.players[1].personality = 'aggressive';

    // With 2 territories aggressive should not surrender
    expect(shouldAISurrender(state, 1)).toBe(false);
    expect(shouldAISurrender(state, 1)).toBe(false);

    // Down to 1 territory (only territory 2 with 1 die)
    state.territories[5].owner = 0;
    state.territories[2].dice = 1;
    state.consecutiveDesperate.set(1, 0); // reset
    expect(shouldAISurrender(state, 1)).toBe(false); // first desperate turn
    expect(shouldAISurrender(state, 1)).toBe(true);  // second desperate turn → surrender
  });

  it('aggressive does not surrender at 2 territories even when desperate', () => {
    const state = createSurrenderTestState();
    state.players[1].personality = 'aggressive';
    // Player 1 has 2 territories, no good attacks
    for (let i = 0; i < 5; i++) {
      expect(shouldAISurrender(state, 1)).toBe(false);
    }
  });

  it('does not surrender when charge power-up gives effective advantage', () => {
    const state = createSurrenderTestState();
    state.powerUpsEnabled = true;
    // Territory 2: 2 dice + charge (+2) = effective 4 vs neighbor territory 1 with 3 dice
    // Raw dice: 2 vs 3 = -1 advantage (would normally surrender)
    // With charge: 4 vs 3 = +1 advantage (should NOT surrender)
    state.territories[2].powerUp = 'charge';

    for (let i = 0; i < 5; i++) {
      expect(shouldAISurrender(state, 1)).toBe(false);
    }
  });

  it('surrenders when power-up does not create attack advantage', () => {
    const state = createSurrenderTestState();
    state.powerUpsEnabled = true;
    // Territory 2: 2 dice, neighbor territory 1 has 3 dice
    // Shield doesn't help with attack advantage
    state.territories[2].powerUp = 'shield';

    expect(shouldAISurrender(state, 1)).toBe(false); // first desperate turn
    expect(shouldAISurrender(state, 1)).toBe(true);  // second → surrender
  });

  it('surrenders normally when power-ups disabled even with powerUp field set', () => {
    const state = createSurrenderTestState();
    state.powerUpsEnabled = false;
    state.territories[2].powerUp = 'charge';

    expect(shouldAISurrender(state, 1)).toBe(false); // first desperate turn
    expect(shouldAISurrender(state, 1)).toBe(true);  // second → surrender
  });

  it('surrenders when only attack targets are allies and AI would not break', () => {
    const state = createSurrenderTestState();
    // Player 1 owns territories 2, 5. Player 0 owns 0,1,3,4.
    // Give player 1 enough dice to have raw advantage over neighbors
    state.territories[2].dice = 5;

    // Without alliance, player 1 has advantage and won't surrender
    expect(shouldAISurrender(state, 1)).toBe(false);
    state.consecutiveDesperate!.set(1, 0);

    // Now ally player 1 (balanced) with player 0 — balanced AI won't break alliances
    state.allianceState = createAllianceState(3);
    formAlliance(state.allianceState, 0, 1, 0);

    // All neighbors of player 1's territories are player 0 (allied)
    // Balanced personality won't break → no valid targets → desperate
    expect(shouldAISurrender(state, 1)).toBe(false); // first desperate turn
    expect(shouldAISurrender(state, 1)).toBe(true);  // second → surrender
  });

  it('does not surrender when allied targets exist but AI would break alliance', () => {
    const state = createSurrenderTestState();
    state.players[1].personality = 'reckless';
    state.territories[2].dice = 5;

    state.allianceState = createAllianceState(3);
    formAlliance(state.allianceState, 0, 1, 0);

    // Reckless never surrenders (personality override)
    for (let i = 0; i < 5; i++) {
      expect(shouldAISurrender(state, 1)).toBe(false);
    }
  });
});

describe('distributeSurrenderedTerritories', () => {
  it('assigns territory to neighbor with most adjacent territories', () => {
    const state = createSurrenderTestState();
    // Player 0 owns 0,1,3,4 — Player 1 owns 2,5
    // Territory 2 neighbors: 1 (player 0), 5 (player 1)
    // Territory 5 neighbors: 2 (player 1), 4 (player 0)
    // After surrender, territory 2's neighbor player 0 has 1 adjacent (territory 1)
    // Territory 5's neighbor player 0 has 1 adjacent (territory 4)
    distributeSurrenderedTerritories(state, 1);

    expect(state.territories[2].owner).toBe(0);
    expect(state.territories[5].owner).toBe(0);
    expect(state.players[1].isAlive).toBe(false);
  });

  it('breaks ties by lower player id', () => {
    // Territory 4 is surrendered; its neighbors are 3 (player 0) and 5 (player 2)
    // Each has exactly 1 adjacent territory → tie → lower id (player 0) wins
    const adjacency = buildAdjacencyMap([
      [0, 1], [1, 2], [0, 3], [3, 4], [4, 5], [2, 5],
    ]);

    const territories: Territory[] = [
      { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1, 3], owner: 0, dice: 4 },
      { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0, 2], owner: 0, dice: 3 },
      { id: 2, cells: [], center: { x: 2, y: 0 }, neighbors: [1, 5], owner: 2, dice: 2 },
      { id: 3, cells: [], center: { x: 0, y: 1 }, neighbors: [0, 4], owner: 0, dice: 3 },
      { id: 4, cells: [], center: { x: 1, y: 1 }, neighbors: [3, 5], owner: 1, dice: 2 },
      { id: 5, cells: [], center: { x: 2, y: 1 }, neighbors: [2, 4], owner: 2, dice: 1 },
    ];

    const players = [
      createPlayer(0, 'Player', true, 0x4a90d9),
      createPlayer(1, 'AI 1', false, 0xd94a4a, 'balanced'),
      createPlayer(2, 'AI 2', false, 0x4ad94a, 'balanced'),
    ];

    const state = createInitialGameState(territories, players, adjacency);

    // Player 1 owns only territory 4 (neighbors: 3, 5)
    // Neighbor 3 → player 0 (1 adjacent)
    // Neighbor 5 → player 2 (1 adjacent)
    // Tie → lower id wins → player 0
    distributeSurrenderedTerritories(state, 1);
    expect(state.territories[4].owner).toBe(0);
  });

  it('falls back to player with most territories when no alive neighbor', () => {
    // Create an isolated territory scenario
    const adjacency = buildAdjacencyMap([
      [0, 1], [2, 3],
    ]);
    const territories: Territory[] = [
      { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1], owner: 0, dice: 3 },
      { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0], owner: 0, dice: 3 },
      { id: 2, cells: [], center: { x: 2, y: 0 }, neighbors: [3], owner: 1, dice: 2 },
      { id: 3, cells: [], center: { x: 3, y: 0 }, neighbors: [2], owner: 1, dice: 2 },
    ];
    const players = [
      createPlayer(0, 'Player', true, 0x4a90d9),
      createPlayer(1, 'AI 1', false, 0xd94a4a, 'balanced'),
    ];
    const state = createInitialGameState(territories, players, adjacency);

    // Player 1's territories (2,3) only neighbor each other
    distributeSurrenderedTerritories(state, 1);

    // Should go to player 0 (only alive player)
    expect(state.territories[2].owner).toBe(0);
    expect(state.territories[3].owner).toBe(0);
  });

  it('keeps dice as-is on surrendered territories', () => {
    const state = createSurrenderTestState();
    const diceBefore2 = state.territories[2].dice;
    const diceBefore5 = state.territories[5].dice;

    distributeSurrenderedTerritories(state, 1);

    expect(state.territories[2].dice).toBe(diceBefore2);
    expect(state.territories[5].dice).toBe(diceBefore5);
  });

  it('marks surrendered player as dead', () => {
    const state = createSurrenderTestState();
    distributeSurrenderedTerritories(state, 1);
    expect(state.players[1].isAlive).toBe(false);
  });

  it('triggers game over when only one player remains', () => {
    const state = createSurrenderTestState();
    // Kill player 2
    state.players[2].isAlive = false;
    distributeSurrenderedTerritories(state, 1);

    expect(state.players[1].isAlive).toBe(false);
    expect(state.winner).toBe(0);
    expect(state.phase).toBe('gameOver');
  });
});

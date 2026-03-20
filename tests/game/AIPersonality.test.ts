import { describe, it, expect } from 'vitest';
import {
  PERSONALITIES,
  ALL_PERSONALITY_TYPES,
  PersonalityType,
  scoreMove,
  filterMovesByPersonality,
  checkConnectivityGain,
  getRandomPersonality,
} from '../../src/game/AIPersonality';
import { AIMove } from '../../src/game/AIPlayer';
import { GameState, createInitialGameState } from '../../src/game/GameState';
import { Territory } from '../../src/game/Territory';
import { createPlayer } from '../../src/game/Player';
import { buildAdjacencyMap } from '../../src/utils/graph';
import { SeededRandom } from '../../src/utils/random';

function createTestState(): GameState {
  // T0-T1 (connected, owned by 0), T2-T3 (connected, owned by 1)
  // T0 connects to T2 (cross-border), T1 connects to T3 (cross-border)
  const adjacency = buildAdjacencyMap([
    [0, 1], [0, 2], [1, 3], [2, 3],
  ]);

  const territories: Territory[] = [
    { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1, 2], owner: 0, dice: 5 },
    { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0, 3], owner: 0, dice: 3 },
    { id: 2, cells: [], center: { x: 0, y: 1 }, neighbors: [0, 3], owner: 1, dice: 2 },
    { id: 3, cells: [], center: { x: 1, y: 1 }, neighbors: [1, 2], owner: 1, dice: 6 },
  ];

  const players = [
    createPlayer(0, 'Human', true, 0x4a90d9),
    createPlayer(1, 'AI', false, 0xd94a4a, 'balanced'),
  ];

  return createInitialGameState(territories, players, adjacency);
}

describe('PERSONALITIES', () => {
  it('defines all 6 personality types', () => {
    expect(ALL_PERSONALITY_TYPES).toHaveLength(6);
    expect(ALL_PERSONALITY_TYPES).toContain('cautious');
    expect(ALL_PERSONALITY_TYPES).toContain('balanced');
    expect(ALL_PERSONALITY_TYPES).toContain('aggressive');
    expect(ALL_PERSONALITY_TYPES).toContain('reckless');
    expect(ALL_PERSONALITY_TYPES).toContain('expansionist');
    expect(ALL_PERSONALITY_TYPES).toContain('turtle');
  });

  it('cautious requires advantage >= 2 and max 3 attacks', () => {
    const p = PERSONALITIES.cautious;
    expect(p.minAdvantage).toBe(2);
    expect(p.maxAttacksPerTurn).toBe(3);
  });

  it('balanced requires advantage >= 1 and unlimited attacks', () => {
    const p = PERSONALITIES.balanced;
    expect(p.minAdvantage).toBe(1);
    expect(p.maxAttacksPerTurn).toBe(Infinity);
  });

  it('aggressive requires advantage >= 0', () => {
    expect(PERSONALITIES.aggressive.minAdvantage).toBe(0);
  });

  it('reckless allows negative advantage', () => {
    expect(PERSONALITIES.reckless.minAdvantage).toBe(-1);
  });

  it('expansionist has connectivity bonus', () => {
    expect(PERSONALITIES.expansionist.connectivityBonus).toBeGreaterThan(0);
  });

  it('turtle has highest min advantage and lowest attack cap', () => {
    const p = PERSONALITIES.turtle;
    expect(p.minAdvantage).toBe(3);
    expect(p.maxAttacksPerTurn).toBe(2);
  });

  it('each personality has a label and description', () => {
    for (const type of ALL_PERSONALITY_TYPES) {
      const p = PERSONALITIES[type];
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });
});

describe('filterMovesByPersonality', () => {
  const moves: AIMove[] = [
    { attackerId: 0, defenderId: 2, advantage: 3 },
    { attackerId: 1, defenderId: 3, advantage: 1 },
    { attackerId: 2, defenderId: 0, advantage: 0 },
    { attackerId: 3, defenderId: 1, advantage: -1 },
  ];

  it('cautious filters to advantage >= 2', () => {
    const filtered = filterMovesByPersonality(moves, PERSONALITIES.cautious);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].advantage).toBe(3);
  });

  it('balanced filters to advantage >= 1', () => {
    const filtered = filterMovesByPersonality(moves, PERSONALITIES.balanced);
    expect(filtered).toHaveLength(2);
  });

  it('aggressive filters to advantage >= 0', () => {
    const filtered = filterMovesByPersonality(moves, PERSONALITIES.aggressive);
    expect(filtered).toHaveLength(3);
  });

  it('reckless allows advantage >= -1 (all moves)', () => {
    const filtered = filterMovesByPersonality(moves, PERSONALITIES.reckless);
    expect(filtered).toHaveLength(4);
  });

  it('turtle filters to advantage >= 3', () => {
    const filtered = filterMovesByPersonality(moves, PERSONALITIES.turtle);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].advantage).toBe(3);
  });
});

describe('scoreMove', () => {
  it('base score equals dice advantage for non-expansionist', () => {
    const state = createTestState();
    const move: AIMove = { attackerId: 0, defenderId: 2, advantage: 3 };
    const score = scoreMove(move, PERSONALITIES.balanced, state);
    expect(score).toBe(3);
  });

  it('expansionist gets bonus for connecting territory groups', () => {
    // Create state where player 0 has disconnected groups
    const adjacency = buildAdjacencyMap([
      [0, 1], [1, 2], [2, 3], [3, 4],
    ]);
    const territories: Territory[] = [
      { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1], owner: 0, dice: 5 },
      { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0, 2], owner: 1, dice: 2 },
      { id: 2, cells: [], center: { x: 2, y: 0 }, neighbors: [1, 3], owner: 0, dice: 4 },
      { id: 3, cells: [], center: { x: 3, y: 0 }, neighbors: [2, 4], owner: 1, dice: 3 },
      { id: 4, cells: [], center: { x: 4, y: 0 }, neighbors: [3], owner: 0, dice: 3 },
    ];
    const players = [
      createPlayer(0, 'Test', false, 0x4a90d9, 'expansionist'),
      createPlayer(1, 'Enemy', false, 0xd94a4a, 'balanced'),
    ];
    const state = createInitialGameState(territories, players, adjacency);

    // Attack T1 (connects T0 to T2)
    const connectingMove: AIMove = { attackerId: 0, defenderId: 1, advantage: 3 };
    const score = scoreMove(connectingMove, PERSONALITIES.expansionist, state);
    expect(score).toBe(3 + PERSONALITIES.expansionist.connectivityBonus);

    // Non-connecting move
    const nonConnectingMove: AIMove = { attackerId: 2, defenderId: 3, advantage: 1 };
    const scoreNon = scoreMove(nonConnectingMove, PERSONALITIES.expansionist, state);
    // T3 doesn't connect anything new (T2 and T4 are already connected via T3's neighbors)
    // Actually T2-T4 are disconnected (T3 is enemy), so capturing T3 WOULD connect them
    expect(scoreNon).toBe(1 + PERSONALITIES.expansionist.connectivityBonus);
  });
});

describe('checkConnectivityGain', () => {
  it('returns true when capture would connect groups', () => {
    const adjacency = buildAdjacencyMap([[0, 1], [1, 2]]);
    const territories: Territory[] = [
      { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1], owner: 0, dice: 3 },
      { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0, 2], owner: 1, dice: 2 },
      { id: 2, cells: [], center: { x: 2, y: 0 }, neighbors: [1], owner: 0, dice: 3 },
    ];
    const players = [
      createPlayer(0, 'A', false, 0x000000),
      createPlayer(1, 'B', false, 0xffffff),
    ];
    const state = createInitialGameState(territories, players, adjacency);

    expect(checkConnectivityGain(1, 0, state)).toBe(true);
  });

  it('returns false when capture does not connect groups', () => {
    const adjacency = buildAdjacencyMap([[0, 1], [1, 2]]);
    const territories: Territory[] = [
      { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1], owner: 0, dice: 3 },
      { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0, 2], owner: 0, dice: 3 },
      { id: 2, cells: [], center: { x: 2, y: 0 }, neighbors: [1], owner: 1, dice: 2 },
    ];
    const players = [
      createPlayer(0, 'A', false, 0x000000),
      createPlayer(1, 'B', false, 0xffffff),
    ];
    const state = createInitialGameState(territories, players, adjacency);

    // Player 0 already has T0 and T1 connected. Capturing T2 expands but doesn't connect.
    expect(checkConnectivityGain(2, 0, state)).toBe(false);
  });
});

describe('getRandomPersonality', () => {
  it('returns a valid personality type', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 20; i++) {
      const p = getRandomPersonality(rng);
      expect(ALL_PERSONALITY_TYPES).toContain(p);
    }
  });

  it('produces different personalities with different seeds', () => {
    const results = new Set<PersonalityType>();
    // Use widely spaced seeds to get different LCG outputs
    for (let seed = 1000; seed <= 100000; seed += 2000) {
      const rng = new SeededRandom(seed);
      results.add(getRandomPersonality(rng));
    }
    // With 50 widely spaced seeds, we should get at least 3 different personalities
    expect(results.size).toBeGreaterThanOrEqual(3);
  });
});

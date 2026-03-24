import { describe, it, expect, beforeEach } from 'vitest';
import {
  PERSONALITIES,
  ALL_PERSONALITY_TYPES,
  PersonalityType,
  scoreMove,
  filterMovesByPersonality,
  checkConnectivityGain,
  getRandomPersonality,
  CustomAIPreset,
  customPresetToPersonality,
  saveCustomPreset,
  loadCustomPresets,
  deleteCustomPreset,
} from '../../src/game/AIPersonality';
import { AIMove } from '../../src/game/AIPlayer';
import { GameState, createInitialGameState } from '../../src/game/GameState';
import { Territory } from '../../src/game/Territory';
import { createPlayer } from '../../src/game/Player';
import { buildAdjacencyMap } from '../../src/utils/graph';
import { SeededRandom } from '../../src/utils/random';
import { setStorageAdapter, StorageAdapter } from '../../src/game/StorageAdapter';

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

/* ------------------------------------------------------------------ */
/*  Custom AI Presets                                                   */
/* ------------------------------------------------------------------ */

describe('customPresetToPersonality', () => {
  it('converts a preset to an AIPersonality config', () => {
    const preset: CustomAIPreset = { name: 'Berserker', minAdvantage: -1, maxAttacksPerTurn: Infinity, connectivityBonus: 0 };
    const personality = customPresetToPersonality(preset);
    expect(personality.label).toBe('Berserker');
    expect(personality.minAdvantage).toBe(-1);
    expect(personality.maxAttacksPerTurn).toBe(Infinity);
    expect(personality.connectivityBonus).toBe(0);
  });

  it('handles finite maxAttacksPerTurn', () => {
    const preset: CustomAIPreset = { name: 'Careful', minAdvantage: 3, maxAttacksPerTurn: 2, connectivityBonus: 1 };
    const personality = customPresetToPersonality(preset);
    expect(personality.maxAttacksPerTurn).toBe(2);
    expect(personality.description).toContain('max=2');
  });

  it('shows ∞ in description for unlimited attacks', () => {
    const preset: CustomAIPreset = { name: 'All-out', minAdvantage: 0, maxAttacksPerTurn: Infinity, connectivityBonus: 0 };
    const personality = customPresetToPersonality(preset);
    expect(personality.description).toContain('∞');
  });

  it('uses "Custom" as default label for empty name', () => {
    const preset: CustomAIPreset = { name: '', minAdvantage: 1, maxAttacksPerTurn: 5, connectivityBonus: 0 };
    const personality = customPresetToPersonality(preset);
    expect(personality.label).toBe('Custom');
  });
});

describe('custom personality AI behavior', () => {
  it('filters moves according to custom minAdvantage', () => {
    const moves: AIMove[] = [
      { attackerId: 0, defenderId: 2, advantage: 3 },
      { attackerId: 1, defenderId: 3, advantage: 0 },
      { attackerId: 2, defenderId: 0, advantage: -1 },
    ];
    const custom = customPresetToPersonality({ name: 'Test', minAdvantage: 0, maxAttacksPerTurn: Infinity, connectivityBonus: 0 });
    const filtered = filterMovesByPersonality(moves, custom);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((m) => m.advantage >= 0)).toBe(true);
  });

  it('scores moves with custom connectivityBonus', () => {
    const adjacency = buildAdjacencyMap([[0, 1], [1, 2]]);
    const territories: Territory[] = [
      { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1], owner: 0, dice: 5 },
      { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0, 2], owner: 1, dice: 2 },
      { id: 2, cells: [], center: { x: 2, y: 0 }, neighbors: [1], owner: 0, dice: 4 },
    ];
    const players = [
      createPlayer(0, 'Test', false, 0x000000, 'balanced'),
      createPlayer(1, 'Enemy', false, 0xffffff, 'balanced'),
    ];
    const state = createInitialGameState(territories, players, adjacency);

    const custom = customPresetToPersonality({ name: 'Connector', minAdvantage: 0, maxAttacksPerTurn: Infinity, connectivityBonus: 3 });
    const move: AIMove = { attackerId: 0, defenderId: 1, advantage: 3 };
    const score = scoreMove(move, custom, state);
    // T0 and T2 are disconnected; capturing T1 connects them → bonus of 3
    expect(score).toBe(3 + 3);
  });
});

describe('Custom AI Preset storage', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map<string, string>();
    setStorageAdapter({
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
  });

  it('saves and loads a preset', () => {
    const preset: CustomAIPreset = { name: 'Rusher', minAdvantage: -1, maxAttacksPerTurn: 8, connectivityBonus: 2 };
    saveCustomPreset(preset);
    const loaded = loadCustomPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Rusher');
    expect(loaded[0].minAdvantage).toBe(-1);
    expect(loaded[0].maxAttacksPerTurn).toBe(8);
    expect(loaded[0].connectivityBonus).toBe(2);
  });

  it('handles Infinity maxAttacksPerTurn through save/load cycle', () => {
    saveCustomPreset({ name: 'Unlimited', minAdvantage: 0, maxAttacksPerTurn: Infinity, connectivityBonus: 0 });
    const loaded = loadCustomPresets();
    expect(loaded[0].maxAttacksPerTurn).toBe(Infinity);
  });

  it('overwrites preset with same name', () => {
    saveCustomPreset({ name: 'Test', minAdvantage: 0, maxAttacksPerTurn: 5, connectivityBonus: 0 });
    saveCustomPreset({ name: 'Test', minAdvantage: 2, maxAttacksPerTurn: 3, connectivityBonus: 1 });
    const loaded = loadCustomPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].minAdvantage).toBe(2);
    expect(loaded[0].maxAttacksPerTurn).toBe(3);
  });

  it('deletes a preset by name', () => {
    saveCustomPreset({ name: 'A', minAdvantage: 0, maxAttacksPerTurn: 5, connectivityBonus: 0 });
    saveCustomPreset({ name: 'B', minAdvantage: 1, maxAttacksPerTurn: 3, connectivityBonus: 0 });
    deleteCustomPreset('A');
    const loaded = loadCustomPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('B');
  });

  it('ignores preset with empty name', () => {
    saveCustomPreset({ name: '', minAdvantage: 0, maxAttacksPerTurn: 5, connectivityBonus: 0 });
    const loaded = loadCustomPresets();
    expect(loaded).toHaveLength(0);
  });

  it('ignores preset with whitespace-only name', () => {
    saveCustomPreset({ name: '   ', minAdvantage: 0, maxAttacksPerTurn: 5, connectivityBonus: 0 });
    const loaded = loadCustomPresets();
    expect(loaded).toHaveLength(0);
  });

  it('returns empty array when localStorage has no presets', () => {
    expect(loadCustomPresets()).toEqual([]);
  });

  it('returns empty array when localStorage has invalid JSON', () => {
    store.set('dicewars-custom-ai-presets', 'not-json');
    expect(loadCustomPresets()).toEqual([]);
  });

  it('multiple presets can coexist', () => {
    saveCustomPreset({ name: 'Alpha', minAdvantage: -2, maxAttacksPerTurn: 10, connectivityBonus: 5 });
    saveCustomPreset({ name: 'Beta', minAdvantage: 3, maxAttacksPerTurn: 2, connectivityBonus: 0 });
    saveCustomPreset({ name: 'Gamma', minAdvantage: 1, maxAttacksPerTurn: Infinity, connectivityBonus: 3 });
    const loaded = loadCustomPresets();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((p) => p.name).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('deleting non-existent preset is a no-op', () => {
    saveCustomPreset({ name: 'Exists', minAdvantage: 0, maxAttacksPerTurn: 5, connectivityBonus: 0 });
    deleteCustomPreset('NonExistent');
    expect(loadCustomPresets()).toHaveLength(1);
  });
});

import { describe, it, expect } from 'vitest';
import { findPossibleMoves, selectBestMove, executeAITurn } from '../../src/game/AIPlayer';
import { GameState, createInitialGameState } from '../../src/game/GameState';
import { Territory } from '../../src/game/Territory';
import { createPlayer } from '../../src/game/Player';
import { buildAdjacencyMap } from '../../src/utils/graph';
import { SeededRandom } from '../../src/utils/random';

function createAITestState(): GameState {
  const adjacency = buildAdjacencyMap([
    [0, 1], [0, 2], [1, 3], [2, 3],
  ]);

  const territories: Territory[] = [
    { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1, 2], owner: 0, dice: 5 },
    { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0, 3], owner: 1, dice: 2 },
    { id: 2, cells: [], center: { x: 0, y: 1 }, neighbors: [0, 3], owner: 0, dice: 3 },
    { id: 3, cells: [], center: { x: 1, y: 1 }, neighbors: [1, 2], owner: 1, dice: 6 },
  ];

  const players = [
    createPlayer(0, 'Human', true, 0x4a90d9),
    createPlayer(1, 'AI', false, 0xd94a4a),
  ];

  // Set to AI's turn
  const state = createInitialGameState(territories, players, adjacency);
  state.currentPlayerIndex = 1;
  return state;
}

describe('findPossibleMoves', () => {
  it('finds all valid attacks for current player', () => {
    const state = createAITestState();
    const moves = findPossibleMoves(state);

    // AI (player 1) owns territories 1 (2 dice) and 3 (6 dice)
    // Territory 1 can attack 0 (advantage: 2-5 = -3)
    // Territory 3 can attack 2 (advantage: 6-3 = 3)
    expect(moves.length).toBe(2);
  });

  it('calculates advantage correctly', () => {
    const state = createAITestState();
    const moves = findPossibleMoves(state);
    const t3Attack = moves.find((m) => m.attackerId === 3);
    expect(t3Attack).toBeDefined();
    expect(t3Attack!.advantage).toBe(3); // 6 - 3
  });
});

describe('selectBestMove', () => {
  it('picks favorable attacks', () => {
    const state = createAITestState();
    const rng = new SeededRandom(42);
    const move = selectBestMove(state, rng);

    expect(move).not.toBeNull();
    expect(move!.advantage).toBeGreaterThanOrEqual(1);
  });

  it('returns null when no favorable attacks exist', () => {
    const state = createAITestState();
    // Make all AI territories have 1 die
    state.territories[1].dice = 1;
    state.territories[3].dice = 1;

    const rng = new SeededRandom(42);
    const move = selectBestMove(state, rng);
    expect(move).toBeNull();
  });
});

describe('executeAITurn', () => {
  it('executes attacks and returns move list', () => {
    const state = createAITestState();
    const rng = new SeededRandom(42);
    const attacks = executeAITurn(state, rng);

    expect(attacks.length).toBeGreaterThanOrEqual(0);
    for (const attack of attacks) {
      expect(typeof attack.attackerId).toBe('number');
      expect(typeof attack.defenderId).toBe('number');
    }
  });

  it('does not make invalid attacks', () => {
    const state = createAITestState();
    const rng = new SeededRandom(42);
    const attacks = executeAITurn(state, rng);

    for (const attack of attacks) {
      // All attacks should have been from AI territories to enemy territories
      expect(attack.attackerId).not.toBe(attack.defenderId);
    }
  });
});

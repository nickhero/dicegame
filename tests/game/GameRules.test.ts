import { describe, it, expect, beforeEach } from 'vitest';
import {
  canAttackFrom,
  isValidAttack,
  executeAttack,
  endTurn,
  getAttackableTerritories,
  getValidTargets,
} from '../../src/game/GameRules';
import { GameState, createInitialGameState } from '../../src/game/GameState';
import { Territory } from '../../src/game/Territory';
import { createPlayer } from '../../src/game/Player';
import { buildAdjacencyMap } from '../../src/utils/graph';
import { SeededRandom } from '../../src/utils/random';

function createTestState(): GameState {
  // Simple 4-territory map:
  //  0 -- 1
  //  |    |
  //  2 -- 3
  const adjacency = buildAdjacencyMap([
    [0, 1], [0, 2], [1, 3], [2, 3],
  ]);

  const territories: Territory[] = [
    { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1, 2], owner: 0, dice: 4 },
    { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0, 3], owner: 1, dice: 2 },
    { id: 2, cells: [], center: { x: 0, y: 1 }, neighbors: [0, 3], owner: 0, dice: 3 },
    { id: 3, cells: [], center: { x: 1, y: 1 }, neighbors: [1, 2], owner: 1, dice: 5 },
  ];

  const players = [
    createPlayer(0, 'Human', true, 0x4a90d9),
    createPlayer(1, 'AI 1', false, 0xd94a4a),
  ];

  return createInitialGameState(territories, players, adjacency);
}

describe('canAttackFrom', () => {
  it('returns true when territory has >1 die and enemy neighbor', () => {
    const state = createTestState();
    expect(canAttackFrom(0, state)).toBe(true); // 4 dice, neighbors enemy 1
  });

  it('returns false when territory has 1 die', () => {
    const state = createTestState();
    state.territories[0].dice = 1;
    expect(canAttackFrom(0, state)).toBe(false);
  });

  it('returns false when all neighbors are friendly', () => {
    const state = createTestState();
    state.territories[1].owner = 0; // now 0's neighbors are all friendly
    state.territories[2].owner = 0;
    // territory 0's neighbors are 1 and 2, both owned by player 0
    // but let's check territory 2 whose neighbors are 0 (own) and 3 (enemy)
    expect(canAttackFrom(2, state)).toBe(true);
    // territory 0: neighbors 1(own) and 2(own) — no enemy
    expect(canAttackFrom(0, state)).toBe(false);
  });

  it('returns false for enemy territory', () => {
    const state = createTestState();
    // Player 0 is current, territory 1 belongs to player 1
    expect(canAttackFrom(1, state)).toBe(false);
  });
});

describe('isValidAttack', () => {
  it('validates a legal attack', () => {
    const state = createTestState();
    expect(isValidAttack(0, 1, state)).toBe(true);
  });

  it('rejects attacking own territory', () => {
    const state = createTestState();
    expect(isValidAttack(0, 2, state)).toBe(false);
  });

  it('rejects attacking non-adjacent territory', () => {
    const state = createTestState();
    expect(isValidAttack(0, 3, state)).toBe(false);
  });

  it('rejects attack with 1 die', () => {
    const state = createTestState();
    state.territories[0].dice = 1;
    expect(isValidAttack(0, 1, state)).toBe(false);
  });
});

describe('executeAttack', () => {
  it('on win: defender taken, dice transferred', () => {
    // Use a seed where 4 dice vs 2 dice will win
    const state = createTestState();
    state.territories[0].dice = 8;
    state.territories[1].dice = 1;

    // Run multiple times to find a winning seed
    let result;
    for (let seed = 0; seed < 100; seed++) {
      const testState = createTestState();
      testState.territories[0].dice = 8;
      testState.territories[1].dice = 1;
      const rng = new SeededRandom(seed);
      result = executeAttack(0, 1, testState, rng);
      if (result.attackerWins) {
        expect(testState.territories[1].owner).toBe(0);
        expect(testState.territories[0].dice).toBe(1);
        expect(testState.territories[1].dice).toBe(7); // 8-1
        break;
      }
    }
  });

  it('on loss: attacker dice reduced to 1', () => {
    // Use a seed where 2 dice vs 8 dice will lose
    const state = createTestState();
    state.territories[0].dice = 2;
    state.territories[1].dice = 8;

    for (let seed = 0; seed < 100; seed++) {
      const testState = createTestState();
      testState.territories[0].dice = 2;
      testState.territories[1].dice = 8;
      const rng = new SeededRandom(seed);
      const result = executeAttack(0, 1, testState, rng);
      if (!result.attackerWins) {
        expect(testState.territories[1].owner).toBe(1); // still enemy
        expect(testState.territories[0].dice).toBe(1);
        break;
      }
    }
  });

  it('detects player elimination', () => {
    const state = createTestState();
    // Player 1 only has territory 1 and 3
    // Give player 0 a massive advantage and take territory 1
    state.territories[0].dice = 8;
    state.territories[1].dice = 1;
    state.territories[3].owner = 0; // now player 1 only has territory 1

    for (let seed = 0; seed < 100; seed++) {
      const testState = createTestState();
      testState.territories[0].dice = 8;
      testState.territories[1].dice = 1;
      testState.territories[3].owner = 0;
      const rng = new SeededRandom(seed);
      const result = executeAttack(0, 1, testState, rng);
      if (result.attackerWins) {
        expect(testState.players[1].isAlive).toBe(false);
        expect(testState.winner).toBe(0);
        break;
      }
    }
  });
});

describe('endTurn', () => {
  it('distributes dice and advances player', () => {
    const state = createTestState();
    const rng = new SeededRandom(42);
    const prevDice0 = state.territories[0].dice;
    const prevDice2 = state.territories[2].dice;

    endTurn(state, rng);

    expect(state.currentPlayerIndex).toBe(1);
    // Player 0 has territories 0 and 2, contiguous group = 2
    // So 2 dice should be distributed
    const newDice0 = state.territories[0].dice;
    const newDice2 = state.territories[2].dice;
    expect(newDice0 + newDice2).toBe(prevDice0 + prevDice2 + 2);
  });

  it('skips eliminated players', () => {
    const state = createTestState();
    state.players[1].isAlive = false;
    // Add a third player
    state.players.push(createPlayer(2, 'AI 2', false, 0x4ad94a));
    state.territories[1].owner = 2;

    const rng = new SeededRandom(42);
    endTurn(state, rng);

    // Should skip player 1 (dead) and go to player 2
    expect(state.currentPlayerIndex).toBe(2);
  });
});

describe('getAttackableTerritories', () => {
  it('returns territories that can attack', () => {
    const state = createTestState();
    const attackable = getAttackableTerritories(state);
    expect(attackable.length).toBeGreaterThan(0);
    for (const t of attackable) {
      expect(t.owner).toBe(0);
      expect(t.dice).toBeGreaterThan(1);
    }
  });
});

describe('getValidTargets', () => {
  it('returns enemy neighbors', () => {
    const state = createTestState();
    const targets = getValidTargets(0, state);
    expect(targets.length).toBe(1);
    expect(targets[0].id).toBe(1);
  });
});

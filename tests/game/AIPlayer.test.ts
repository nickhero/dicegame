import { describe, it, expect } from 'vitest';
import { findPossibleMoves, selectBestMove, executeAITurn, effectiveAdvantage, useAIPowerUps } from '../../src/game/AIPlayer';
import { PERSONALITIES } from '../../src/game/AIPersonality';
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
    createPlayer(1, 'AI', false, 0xd94a4a, 'balanced'),
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

  it('respects maxAttacksPerTurn for cautious personality', () => {
    const state = createAITestState();
    // Give AI lots of strong territories
    state.territories[1].dice = 8;
    state.territories[3].dice = 8;
    state.territories[0].dice = 1;
    state.territories[2].dice = 1;
    state.players[1].personality = 'cautious';

    const rng = new SeededRandom(42);
    const attacks = executeAITurn(state, rng);
    expect(attacks.length).toBeLessThanOrEqual(PERSONALITIES.cautious.maxAttacksPerTurn);
  });

  it('reckless personality attacks even at disadvantage', () => {
    const state = createAITestState();
    // AI (player 1) has weak territories
    state.territories[1].dice = 2;
    state.territories[3].dice = 3;
    state.territories[0].dice = 4;
    state.territories[2].dice = 4;
    state.players[1].personality = 'reckless';

    const rng = new SeededRandom(42);
    const attacks = executeAITurn(state, rng);
    // Reckless should still try to attack despite disadvantage
    expect(attacks.length).toBeGreaterThan(0);
  });

  it('turtle personality attacks very rarely', () => {
    const state = createAITestState();
    // AI has slight advantage
    state.territories[1].dice = 4;
    state.territories[3].dice = 4;
    state.territories[0].dice = 3;
    state.territories[2].dice = 3;
    state.players[1].personality = 'turtle';

    const rng = new SeededRandom(42);
    const attacks = executeAITurn(state, rng);
    // Turtle needs advantage >= 3 so with +1 advantage it won't attack
    expect(attacks.length).toBe(0);
  });
});

describe('effectiveAdvantage', () => {
  it('returns raw difference with no power-ups', () => {
    expect(effectiveAdvantage(5, 3)).toBe(2);
  });

  it('adds +3 for charge on attacker', () => {
    expect(effectiveAdvantage(5, 3, 'charge')).toBe(5);
  });

  it('subtracts 3 for shield on defender', () => {
    expect(effectiveAdvantage(5, 3, undefined, 'shield')).toBe(-1);
  });

  it('handles both charge and shield', () => {
    expect(effectiveAdvantage(5, 3, 'charge', 'shield')).toBe(2);
  });
});

describe('findPossibleMoves with power-ups', () => {
  it('accounts for charge power-up in advantage', () => {
    const state = createAITestState();
    state.territories[3].powerUp = 'charge';
    const moves = findPossibleMoves(state);
    const t3Attack = moves.find((m) => m.attackerId === 3);
    expect(t3Attack!.advantage).toBe(6); // 6-3 + 3 charge
  });

  it('accounts for shield power-up on defender', () => {
    const state = createAITestState();
    state.territories[2].powerUp = 'shield';
    const moves = findPossibleMoves(state);
    const t3Attack = moves.find((m) => m.attackerId === 3 && m.defenderId === 2);
    expect(t3Attack!.advantage).toBe(0); // 6-3 - 3 shield
  });
});

describe('useAIPowerUps', () => {
  it('uses reinforce power-ups', () => {
    const state = createAITestState();
    state.powerUpsEnabled = true;
    state.territories[1].powerUp = 'reinforce';
    const before = state.territories[1].dice;
    const actions = useAIPowerUps(state);
    expect(actions.length).toBe(1);
    expect(state.territories[1].dice).toBe(before + 2);
    expect(state.territories[1].powerUp).toBeUndefined();
  });

  it('uses fortify to move dice to frontier territory', () => {
    const state = createAITestState();
    state.powerUpsEnabled = true;
    state.territories[3].powerUp = 'fortify';
    state.territories[3].dice = 6;
    state.territories[1].dice = 2;
    const actions = useAIPowerUps(state);
    expect(actions.length).toBe(1);
    expect(state.territories[3].powerUp).toBeUndefined();
    // Dice moved from T3 to T1 (frontier territory)
    expect(state.territories[3].dice).toBeLessThan(6);
    expect(state.territories[1].dice).toBeGreaterThan(2);
  });
});

import { describe, it, expect } from 'vitest';
import { resolveBattle } from '../../src/game/DiceBattle';
import { spawnPowerUp, useFortify, useReinforce } from '../../src/game/PowerUps';
import { GameState, createInitialGameState } from '../../src/game/GameState';
import { Territory } from '../../src/game/Territory';
import { createPlayer } from '../../src/game/Player';
import { SeededRandom } from '../../src/utils/random';

function makeTestState(overrides?: Partial<GameState>): GameState {
  const territories: Territory[] = [
    { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1, 2], owner: 0, dice: 4 },
    { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0, 2], owner: 1, dice: 3 },
    { id: 2, cells: [], center: { x: 2, y: 0 }, neighbors: [0, 1], owner: 0, dice: 2 },
    { id: 3, cells: [], center: { x: 3, y: 0 }, neighbors: [], owner: 1, dice: 5 },
    { id: 4, cells: [], center: { x: 4, y: 0 }, neighbors: [], owner: 0, dice: 6 },
  ];
  const players = [
    createPlayer(0, 'P0', true, 0x4a90d9),
    createPlayer(1, 'P1', false, 0xd94a4a),
  ];
  const adjacency = new Map<number, Set<number>>();
  for (const t of territories) {
    adjacency.set(t.id, new Set(t.neighbors));
  }
  const state = createInitialGameState(territories, players, adjacency);
  state.powerUpsEnabled = true;
  return { ...state, ...overrides };
}

describe('PowerUps - Shield', () => {
  it('adds +3 to defender total', () => {
    const rng = new SeededRandom(42);
    const attackerTerritory: Territory = {
      id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1], owner: 0, dice: 3,
    };
    const defenderTerritory: Territory = {
      id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0], owner: 1, dice: 3, powerUp: 'shield',
    };
    const result = resolveBattle(3, 3, rng, attackerTerritory, defenderTerritory);
    // Defender total should include +3 bonus
    const rawDefenderTotal = result.defenderRolls.reduce((a, b) => a + b, 0);
    expect(result.defenderTotal).toBe(rawDefenderTotal + 3);
  });

  it('is consumed after use', () => {
    const rng = new SeededRandom(42);
    const defenderTerritory: Territory = {
      id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0], owner: 1, dice: 3, powerUp: 'shield',
    };
    resolveBattle(3, 3, rng, undefined, defenderTerritory);
    expect(defenderTerritory.powerUp).toBeUndefined();
  });
});

describe('PowerUps - Charge', () => {
  it('rolls extra dice for attacker', () => {
    const rng = new SeededRandom(42);
    const attackerTerritory: Territory = {
      id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1], owner: 0, dice: 3, powerUp: 'charge',
    };
    const defenderTerritory: Territory = {
      id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0], owner: 1, dice: 3,
    };
    const result = resolveBattle(3, 3, rng, attackerTerritory, defenderTerritory);
    expect(result.attackerRolls.length).toBe(5); // 3 + 2 extra dice
    expect(result.attackerTotal).toBe(result.attackerRolls.reduce((a, b) => a + b, 0));
  });

  it('is consumed after use', () => {
    const rng = new SeededRandom(42);
    const attackerTerritory: Territory = {
      id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1], owner: 0, dice: 3, powerUp: 'charge',
    };
    resolveBattle(3, 3, rng, attackerTerritory, undefined);
    expect(attackerTerritory.powerUp).toBeUndefined();
  });
});

describe('PowerUps - Fortify', () => {
  it('moves dice correctly between adjacent owned territories', () => {
    const state = makeTestState();
    state.territories[0].powerUp = 'fortify';
    // Territory 0 (owner 0, dice 4) -> Territory 2 (owner 0, dice 2), adjacent
    const result = useFortify(0, 2, 2, state);
    expect(result).toBe(true);
    expect(state.territories[0].dice).toBe(2);
    expect(state.territories[2].dice).toBe(4);
  });

  it('consumes the power-up', () => {
    const state = makeTestState();
    state.territories[0].powerUp = 'fortify';
    useFortify(0, 2, 1, state);
    expect(state.territories[0].powerUp).toBeUndefined();
  });

  it('fails if territory does not have fortify power-up', () => {
    const state = makeTestState();
    const result = useFortify(0, 2, 1, state);
    expect(result).toBe(false);
  });

  it('fails if destination is not owned by same player', () => {
    const state = makeTestState();
    state.territories[0].powerUp = 'fortify';
    const result = useFortify(0, 1, 1, state); // territory 1 owned by player 1
    expect(result).toBe(false);
  });

  it('fails if territories are not adjacent', () => {
    const state = makeTestState();
    state.territories[0].powerUp = 'fortify';
    state.territories[4].owner = 0;
    const result = useFortify(0, 4, 1, state); // not adjacent
    expect(result).toBe(false);
  });

  it('fails if moving more than 3 dice', () => {
    const state = makeTestState();
    state.territories[0].powerUp = 'fortify';
    state.territories[0].dice = 6;
    const result = useFortify(0, 2, 4, state);
    expect(result).toBe(false);
  });

  it('fails if source would drop below 1 die', () => {
    const state = makeTestState();
    state.territories[0].powerUp = 'fortify';
    state.territories[0].dice = 2;
    const result = useFortify(0, 2, 2, state);
    expect(result).toBe(false);
  });
});

describe('PowerUps - Reinforce', () => {
  it('adds 2 dice to territory', () => {
    const state = makeTestState();
    state.territories[0].powerUp = 'reinforce';
    state.territories[0].dice = 3;
    const result = useReinforce(0, state);
    expect(result).toBe(true);
    expect(state.territories[0].dice).toBe(5);
  });

  it('consumes the power-up', () => {
    const state = makeTestState();
    state.territories[0].powerUp = 'reinforce';
    state.territories[0].dice = 3;
    useReinforce(0, state);
    expect(state.territories[0].powerUp).toBeUndefined();
  });

  it('respects MAX_DICE_PER_TERRITORY', () => {
    const state = makeTestState();
    state.territories[0].powerUp = 'reinforce';
    state.territories[0].dice = 7;
    const result = useReinforce(0, state);
    expect(result).toBe(true);
    expect(state.territories[0].dice).toBe(8);
  });

  it('fails if territory is already at max dice', () => {
    const state = makeTestState();
    state.territories[0].powerUp = 'reinforce';
    state.territories[0].dice = 8;
    const result = useReinforce(0, state);
    expect(result).toBe(false);
  });

  it('fails if territory does not have reinforce power-up', () => {
    const state = makeTestState();
    const result = useReinforce(0, state);
    expect(result).toBe(false);
  });
});

describe('PowerUps - Spawn', () => {
  it('spawns a power-up on a valid territory', () => {
    const state = makeTestState();
    const rng = new SeededRandom(42);
    spawnPowerUp(state, rng);
    const withPowerUp = state.territories.filter((t) => t.powerUp != null);
    expect(withPowerUp.length).toBe(1);
  });

  it('does not spawn if power-ups are disabled', () => {
    const state = makeTestState();
    state.powerUpsEnabled = false;
    const rng = new SeededRandom(42);
    spawnPowerUp(state, rng);
    const withPowerUp = state.territories.filter((t) => t.powerUp != null);
    expect(withPowerUp.length).toBe(0);
  });

  it('respects maximum of 4 power-ups on the map', () => {
    const state = makeTestState();
    const rng = new SeededRandom(42);
    // Manually place 4 power-ups
    state.territories[0].powerUp = 'shield';
    state.territories[1].powerUp = 'charge';
    state.territories[2].powerUp = 'fortify';
    state.territories[3].powerUp = 'reinforce';

    spawnPowerUp(state, rng);
    const withPowerUp = state.territories.filter((t) => t.powerUp != null);
    expect(withPowerUp.length).toBe(4);
  });

  it('does not place on a territory that already has a power-up', () => {
    const state = makeTestState();
    const rng = new SeededRandom(42);
    // Place power-ups on all but one territory
    state.territories[0].powerUp = 'shield';
    state.territories[1].powerUp = 'charge';
    state.territories[2].powerUp = 'fortify';
    // territories 3 and 4 are free

    spawnPowerUp(state, rng);
    // The new power-up should be on territory 3 or 4
    expect(state.territories[0].powerUp).toBe('shield');
    expect(state.territories[1].powerUp).toBe('charge');
    expect(state.territories[2].powerUp).toBe('fortify');
    const newPowerUps = [state.territories[3].powerUp, state.territories[4].powerUp];
    expect(newPowerUps.filter((p) => p != null).length).toBe(1);
  });

  it('assigns a valid power-up type', () => {
    const state = makeTestState();
    const rng = new SeededRandom(42);
    spawnPowerUp(state, rng);
    const t = state.territories.find((t) => t.powerUp != null);
    expect(t).toBeDefined();
    expect(['shield', 'charge', 'fortify', 'reinforce']).toContain(t!.powerUp);
  });
});

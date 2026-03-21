import { describe, it, expect } from 'vitest';
import { createSnapshot, restoreSnapshot, StateSnapshot } from '../../src/game/GameStateSnapshot';
import { GameState, createInitialGameState } from '../../src/game/GameState';
import { Territory } from '../../src/game/Territory';
import { createPlayer } from '../../src/game/Player';
import { buildAdjacencyMap } from '../../src/utils/graph';

function createTestState(): GameState {
  const adjacency = buildAdjacencyMap([
    [0, 1], [0, 2], [1, 3], [2, 3],
  ]);

  const territories: Territory[] = [
    { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1, 2], owner: 0, dice: 4 },
    { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0, 3], owner: 1, dice: 2 },
    { id: 2, cells: [], center: { x: 0, y: 1 }, neighbors: [0, 3], owner: 0, dice: 3, powerUp: 'shield' },
    { id: 3, cells: [], center: { x: 1, y: 1 }, neighbors: [1, 2], owner: 1, dice: 5, powerUp: 'charge' },
  ];

  const players = [
    createPlayer(0, 'Player 1', true, 0xff0000),
    createPlayer(1, 'AI 1', false, 0x0000ff),
  ];
  players[0].reserveDice = 3;
  players[1].reserveDice = 1;

  const state = createInitialGameState(territories, players, adjacency);
  state.powerUpsEnabled = true;
  return state;
}

describe('createSnapshot', () => {
  it('captures territory owner and dice', () => {
    const state = createTestState();
    const snapshot = createSnapshot(state);

    expect(snapshot.territories).toHaveLength(4);
    expect(snapshot.territories[0]).toEqual({ owner: 0, dice: 4, powerUp: undefined });
    expect(snapshot.territories[1]).toEqual({ owner: 1, dice: 2, powerUp: undefined });
  });

  it('captures territory power-ups', () => {
    const state = createTestState();
    const snapshot = createSnapshot(state);

    expect(snapshot.territories[2].powerUp).toBe('shield');
    expect(snapshot.territories[3].powerUp).toBe('charge');
  });

  it('captures player alive status and reserveDice', () => {
    const state = createTestState();
    const snapshot = createSnapshot(state);

    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.players[0].isAlive).toBe(true);
    expect(snapshot.players[0].reserveDice).toBe(3);
    expect(snapshot.players[1].reserveDice).toBe(1);
  });

  it('captures state indexes', () => {
    const state = createTestState();
    state.currentPlayerIndex = 1;
    state.turnNumber = 5;
    state.selectedTerritoryId = 2;

    const snapshot = createSnapshot(state);
    expect(snapshot.currentPlayerIndex).toBe(1);
    expect(snapshot.turnNumber).toBe(5);
    expect(snapshot.selectedTerritoryId).toBe(2);
  });

  it('captures consecutiveDesperate', () => {
    const state = createTestState();
    state.consecutiveDesperate.set(0, 2);
    state.consecutiveDesperate.set(1, 0);

    const snapshot = createSnapshot(state);
    const desperateMap = new Map(snapshot.consecutiveDesperate);
    expect(desperateMap.get(0)).toBe(2);
    expect(desperateMap.get(1)).toBe(0);
  });

  it('captures powerUpsEnabled', () => {
    const state = createTestState();
    const snapshot = createSnapshot(state);
    expect(snapshot.powerUpsEnabled).toBe(true);
  });
});

describe('restoreSnapshot', () => {
  it('restores territory owners and dice', () => {
    const state = createTestState();
    const snapshot = createSnapshot(state);

    // Mutate
    state.territories[0].owner = 1;
    state.territories[0].dice = 8;
    state.territories[1].owner = 0;

    restoreSnapshot(state, snapshot);

    expect(state.territories[0].owner).toBe(0);
    expect(state.territories[0].dice).toBe(4);
    expect(state.territories[1].owner).toBe(1);
  });

  it('restores territory power-ups', () => {
    const state = createTestState();
    const snapshot = createSnapshot(state);

    state.territories[2].powerUp = undefined;
    state.territories[3].powerUp = undefined;

    restoreSnapshot(state, snapshot);

    expect(state.territories[2].powerUp).toBe('shield');
    expect(state.territories[3].powerUp).toBe('charge');
  });

  it('restores player alive status', () => {
    const state = createTestState();
    const snapshot = createSnapshot(state);

    state.players[1].isAlive = false;
    state.players[0].reserveDice = 0;

    restoreSnapshot(state, snapshot);

    expect(state.players[1].isAlive).toBe(true);
    expect(state.players[0].reserveDice).toBe(3);
  });

  it('round-trip: create → mutate → restore matches original', () => {
    const state = createTestState();
    const snapshot = createSnapshot(state);

    // Heavily mutate state
    state.territories[0].owner = 1;
    state.territories[0].dice = 1;
    state.territories[1].dice = 8;
    state.territories[2].powerUp = undefined;
    state.players[0].isAlive = false;
    state.players[0].reserveDice = 0;
    state.players[1].reserveDice = 10;
    state.currentPlayerIndex = 1;
    state.turnNumber = 99;
    state.selectedTerritoryId = 3;
    state.consecutiveDesperate.set(0, 5);
    state.powerUpsEnabled = false;

    restoreSnapshot(state, snapshot);

    expect(state.territories[0].owner).toBe(0);
    expect(state.territories[0].dice).toBe(4);
    expect(state.territories[1].dice).toBe(2);
    expect(state.territories[2].powerUp).toBe('shield');
    expect(state.players[0].isAlive).toBe(true);
    expect(state.players[0].reserveDice).toBe(3);
    expect(state.players[1].reserveDice).toBe(1);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.turnNumber).toBe(1);
    expect(state.selectedTerritoryId).toBeNull();
    expect(state.consecutiveDesperate.get(0)).toBe(0);
    expect(state.powerUpsEnabled).toBe(true);
  });

  it('does not modify adjacency or neighbors', () => {
    const state = createTestState();
    const originalNeighbors = state.territories.map(t => [...t.neighbors]);
    const snapshot = createSnapshot(state);

    restoreSnapshot(state, snapshot);

    for (let i = 0; i < state.territories.length; i++) {
      expect(state.territories[i].neighbors).toEqual(originalNeighbors[i]);
    }
    // adjacency map should still exist and be the same reference
    expect(state.adjacency.size).toBe(4);
  });
});

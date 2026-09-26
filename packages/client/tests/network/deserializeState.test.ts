import { describe, it, expect } from 'vitest';
import { deserializeWireState } from '../../src/network/deserializeState';
import type { WireGameState } from '@dicewars/shared';

describe('deserializeWireState', () => {
  const mockWireState: WireGameState = {
    territories: [
      {
        id: 0,
        cells: [[0, 0], [0, 1]],
        center: [0.5, 0.5],
        neighborIds: [1],
        owner: 0,
        dice: 3,
        powerUp: { type: 'reinforce' },
      },
      {
        id: 1,
        cells: [[1, 0], [1, 1]],
        center: [1.5, 0.5],
        neighborIds: [0],
        owner: 1,
        dice: 2,
      },
    ],
    players: [
      { index: 0, name: 'Alice', color: 0x4488ff, alive: true, isAI: false, reserveDice: 2 },
      { index: 1, name: 'Bob AI', color: 0xff4444, alive: true, isAI: true, personality: 'aggressive', reserveDice: 0 },
    ],
    currentPlayerIndex: 0,
    turnNumber: 1,
    phase: 'selectingAttacker',
    alliances: [
      { player1Index: 0, player2Index: 1, formedOnTurn: 1 },
    ],
    alliancesEnabled: true,
    powerUpLocations: [
      { territoryId: 0, type: 'reinforce' },
    ],
    gameOver: false,
    winner: null,
    turnTimerRemaining: 25,
    localPlayerIndex: 0,
  };

  it('deserializes territories correctly with coordinates and neighbors', () => {
    const state = deserializeWireState(mockWireState);

    expect(state.territories).toHaveLength(2);
    expect(state.territories[0].id).toBe(0);
    expect(state.territories[0].cells).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }]);
    expect(state.territories[0].center).toEqual({ x: 0.5, y: 0.5 });
    expect(state.territories[0].neighbors).toEqual([1]);
    expect(state.territories[0].owner).toBe(0);
    expect(state.territories[0].dice).toBe(3);
    expect(state.territories[0].powerUp).toBe('reinforce');
  });

  it('builds adjacency map correctly', () => {
    const state = deserializeWireState(mockWireState);

    expect(state.adjacency.get(0)?.has(1)).toBe(true);
    expect(state.adjacency.get(1)?.has(0)).toBe(true);
  });

  it('deserializes players correctly including human/AI flags', () => {
    const state = deserializeWireState(mockWireState);

    expect(state.players).toHaveLength(2);
    expect(state.players[0].name).toBe('Alice');
    expect(state.players[0].isHuman).toBe(true);
    expect(state.players[0].reserveDice).toBe(2);

    expect(state.players[1].name).toBe('Bob AI');
    expect(state.players[1].isHuman).toBe(false);
    expect(state.players[1].personality).toBe('aggressive');
  });

  it('deserializes active alliances when present', () => {
    const state = deserializeWireState(mockWireState);

    expect(state.allianceState).toBeDefined();
    expect(state.allianceState?.alliances).toHaveLength(1);
    expect(state.allianceState?.alliances[0].player1).toBe(0);
    expect(state.allianceState?.alliances[0].player2).toBe(1);
  });

  it('maps gameOver boolean to gameOver phase', () => {
    const gameOverWire: WireGameState = {
      ...mockWireState,
      gameOver: true,
      winner: 0,
    };
    const state = deserializeWireState(gameOverWire);

    expect(state.phase).toBe('gameOver');
    expect(state.winner).toBe(0);
  });

  it('initializes allianceState when alliancesEnabled is true even if alliances is empty', () => {
    const wire: WireGameState = {
      ...mockWireState,
      alliances: [],
      alliancesEnabled: true,
    };
    const state = deserializeWireState(wire);
    expect(state.allianceState).toBeDefined();
    expect(state.allianceState?.alliances).toHaveLength(0);
  });
});

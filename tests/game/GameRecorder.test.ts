import { describe, it, expect } from 'vitest';
import {
  GameRecorder,
  GameAction,
  serializeGameState,
  deserializeAdjacency,
} from '../../src/game/GameRecorder';
import { Territory } from '../../src/game/Territory';
import { createPlayer } from '../../src/game/Player';
import { BattleResult } from '../../src/game/GameState';

function makeBattleResult(attackerWins: boolean): BattleResult {
  return {
    attackerRolls: [3, 4],
    defenderRolls: [2, 1],
    attackerTotal: 7,
    defenderTotal: 3,
    attackerWins,
  };
}

function makeTestTerritories(): Territory[] {
  return [
    { id: 0, cells: [{ x: 0, y: 0 }], center: { x: 0, y: 0 }, neighbors: [1], owner: 0, dice: 3 },
    { id: 1, cells: [{ x: 1, y: 0 }], center: { x: 1, y: 0 }, neighbors: [0], owner: 1, dice: 2 },
  ];
}

function makeTestPlayers() {
  return [
    createPlayer(0, 'Human', true, 0x4a90d9),
    createPlayer(1, 'AI 1', false, 0xd94a4a, 'aggressive'),
  ];
}

function makeTestAdjacency(): Map<number, Set<number>> {
  const adj = new Map<number, Set<number>>();
  adj.set(0, new Set([1]));
  adj.set(1, new Set([0]));
  return adj;
}

describe('GameRecorder', () => {
  it('records actions within a turn', () => {
    const recorder = new GameRecorder();
    recorder.setInitialState(makeTestTerritories(), makeTestPlayers(), makeTestAdjacency(), false);
    recorder.startTurn(1, 0);
    recorder.recordAction({
      type: 'attack', attackerId: 0, defenderId: 1,
      attackerPlayerId: 0, defenderPlayerId: 1,
      result: makeBattleResult(true),
    });
    recorder.recordAction({ type: 'endTurn', playerId: 0, bonusDice: 1 });

    const recording = recorder.getRecording(null, '');
    expect(recording.turns).toHaveLength(1);
    expect(recording.turns[0].turnNumber).toBe(1);
    expect(recording.turns[0].playerId).toBe(0);
    expect(recording.turns[0].actions).toHaveLength(2);
    expect(recording.turns[0].actions[0].type).toBe('attack');
    expect(recording.turns[0].actions[1].type).toBe('endTurn');
  });

  it('tracks multiple turns correctly', () => {
    const recorder = new GameRecorder();
    recorder.setInitialState(makeTestTerritories(), makeTestPlayers(), makeTestAdjacency(), false);

    recorder.startTurn(1, 0);
    recorder.recordAction({
      type: 'attack', attackerId: 0, defenderId: 1,
      attackerPlayerId: 0, defenderPlayerId: 1,
      result: makeBattleResult(true),
    });
    recorder.endCurrentTurn();

    recorder.startTurn(2, 1);
    recorder.recordAction({ type: 'fortify', fromId: 2, toId: 3, diceCount: 2, playerId: 1 });
    recorder.recordAction({ type: 'endTurn', playerId: 1, bonusDice: 0 });
    recorder.endCurrentTurn();

    const recording = recorder.getRecording(0, 'Human');
    expect(recording.turns).toHaveLength(2);
    expect(recording.turns[0].turnNumber).toBe(1);
    expect(recording.turns[0].playerId).toBe(0);
    expect(recording.turns[0].actions).toHaveLength(1);
    expect(recording.turns[1].turnNumber).toBe(2);
    expect(recording.turns[1].playerId).toBe(1);
    expect(recording.turns[1].actions).toHaveLength(2);
  });

  it('getRecording returns all turns including current', () => {
    const recorder = new GameRecorder();
    recorder.setInitialState(makeTestTerritories(), makeTestPlayers(), makeTestAdjacency(), false);
    recorder.startTurn(1, 0);
    recorder.recordAction({ type: 'surrender', playerId: 0 });
    recorder.endCurrentTurn();

    recorder.startTurn(2, 1);
    recorder.recordAction({ type: 'reinforce', territoryId: 5, playerId: 1 });
    // current turn not ended

    const recording = recorder.getRecording(null, '');
    expect(recording.turns).toHaveLength(2);
    expect(recording.turns[1].actions[0].type).toBe('reinforce');
  });

  it('clear resets all state', () => {
    const recorder = new GameRecorder();
    recorder.setInitialState(makeTestTerritories(), makeTestPlayers(), makeTestAdjacency(), false);
    recorder.startTurn(1, 0);
    recorder.recordAction({ type: 'endTurn', playerId: 0, bonusDice: 0 });
    recorder.endCurrentTurn();
    recorder.startTurn(2, 1);

    recorder.clear();

    const recording = recorder.getRecording(null, '');
    expect(recording.turns).toHaveLength(0);
  });

  it('recordAction is a no-op when no turn is started', () => {
    const recorder = new GameRecorder();
    recorder.recordAction({ type: 'endTurn', playerId: 0, bonusDice: 0 });
    const recording = recorder.getRecording(null, '');
    expect(recording.turns).toHaveLength(0);
  });

  it('startTurn ends the previous turn automatically', () => {
    const recorder = new GameRecorder();
    recorder.setInitialState(makeTestTerritories(), makeTestPlayers(), makeTestAdjacency(), false);
    recorder.startTurn(1, 0);
    recorder.recordAction({
      type: 'attack', attackerId: 0, defenderId: 1,
      attackerPlayerId: 0, defenderPlayerId: 1,
      result: makeBattleResult(false),
    });
    // start new turn without ending previous
    recorder.startTurn(2, 1);
    recorder.endCurrentTurn();

    const recording = recorder.getRecording(null, '');
    expect(recording.turns).toHaveLength(2);
    expect(recording.turns[0].turnNumber).toBe(1);
    expect(recording.turns[1].turnNumber).toBe(2);
  });

  it('setInitialState stores territory, player, and adjacency data', () => {
    const recorder = new GameRecorder();
    const territories = makeTestTerritories();
    const players = makeTestPlayers();
    const adjacency = makeTestAdjacency();

    recorder.setInitialState(territories, players, adjacency, true);
    const recording = recorder.getRecording(0, 'Human');

    expect(recording.initialState.territories).toHaveLength(2);
    expect(recording.initialState.territories[0].id).toBe(0);
    expect(recording.initialState.territories[0].owner).toBe(0);
    expect(recording.initialState.territories[0].dice).toBe(3);
    expect(recording.initialState.players).toHaveLength(2);
    expect(recording.initialState.players[0].name).toBe('Human');
    expect(recording.initialState.players[1].personality).toBe('aggressive');
    expect(recording.initialState.adjacency).toEqual([[0, [1]], [1, [0]]]);
    expect(recording.initialState.powerUpsEnabled).toBe(true);
  });

  it('getRecording returns winnerId, winnerName, date, and turnCount', () => {
    const recorder = new GameRecorder();
    recorder.setInitialState(makeTestTerritories(), makeTestPlayers(), makeTestAdjacency(), false);
    recorder.startTurn(1, 0);
    recorder.endCurrentTurn();
    recorder.startTurn(2, 1);
    recorder.endCurrentTurn();

    const recording = recorder.getRecording(0, 'Human');
    expect(recording.winnerId).toBe(0);
    expect(recording.winnerName).toBe('Human');
    expect(recording.date).toBeTruthy();
    expect(recording.turnCount).toBe(2);
  });

  it('attack actions include BattleResult', () => {
    const recorder = new GameRecorder();
    recorder.setInitialState(makeTestTerritories(), makeTestPlayers(), makeTestAdjacency(), false);
    recorder.startTurn(1, 0);

    const result = makeBattleResult(true);
    recorder.recordAction({
      type: 'attack', attackerId: 0, defenderId: 1,
      attackerPlayerId: 0, defenderPlayerId: 1,
      result,
    });

    const recording = recorder.getRecording(null, '');
    const action = recording.turns[0].actions[0];
    expect(action.type).toBe('attack');
    if (action.type === 'attack') {
      expect(action.result.attackerWins).toBe(true);
      expect(action.result.attackerTotal).toBe(7);
      expect(action.result.defenderTotal).toBe(3);
    }
  });

  it('records elimination actions', () => {
    const recorder = new GameRecorder();
    recorder.setInitialState(makeTestTerritories(), makeTestPlayers(), makeTestAdjacency(), false);
    recorder.startTurn(1, 0);
    recorder.recordAction({ type: 'elimination', playerId: 1, eliminatedBy: 0 });

    const recording = recorder.getRecording(0, 'Human');
    const action = recording.turns[0].actions[0];
    expect(action.type).toBe('elimination');
    if (action.type === 'elimination') {
      expect(action.playerId).toBe(1);
      expect(action.eliminatedBy).toBe(0);
    }
  });
});

describe('serializeGameState / deserializeAdjacency', () => {
  it('round-trips adjacency correctly', () => {
    const adj = new Map<number, Set<number>>();
    adj.set(0, new Set([1, 2]));
    adj.set(1, new Set([0, 3]));
    adj.set(2, new Set([0]));
    adj.set(3, new Set([1]));

    const serialized = serializeGameState(
      makeTestTerritories(), makeTestPlayers(), adj, false,
    );

    const deserialized = deserializeAdjacency(serialized.adjacency);
    expect(deserialized.get(0)).toEqual(new Set([1, 2]));
    expect(deserialized.get(1)).toEqual(new Set([0, 3]));
    expect(deserialized.get(2)).toEqual(new Set([0]));
    expect(deserialized.get(3)).toEqual(new Set([1]));
  });

  it('serializes territory cells and center as plain objects', () => {
    const serialized = serializeGameState(
      makeTestTerritories(), makeTestPlayers(), makeTestAdjacency(), false,
    );
    expect(serialized.territories[0].cells).toEqual([{ x: 0, y: 0 }]);
    expect(serialized.territories[0].center).toEqual({ x: 0, y: 0 });
  });
});

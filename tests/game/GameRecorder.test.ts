import { describe, it, expect } from 'vitest';
import { GameRecorder, GameAction } from '../../src/game/GameRecorder';

describe('GameRecorder', () => {
  it('records actions within a turn', () => {
    const recorder = new GameRecorder();
    recorder.startTurn(1, 0);
    recorder.recordAction({ type: 'attack', attackerId: 0, defenderId: 1, attackerPlayerId: 0, defenderPlayerId: 1 });
    recorder.recordAction({ type: 'endTurn', playerId: 0 });

    const recording = recorder.getRecording();
    expect(recording).toHaveLength(1);
    expect(recording[0].turnNumber).toBe(1);
    expect(recording[0].playerId).toBe(0);
    expect(recording[0].actions).toHaveLength(2);
    expect(recording[0].actions[0].type).toBe('attack');
    expect(recording[0].actions[1].type).toBe('endTurn');
  });

  it('tracks multiple turns correctly', () => {
    const recorder = new GameRecorder();

    recorder.startTurn(1, 0);
    recorder.recordAction({ type: 'attack', attackerId: 0, defenderId: 1, attackerPlayerId: 0, defenderPlayerId: 1 });
    recorder.endCurrentTurn();

    recorder.startTurn(2, 1);
    recorder.recordAction({ type: 'fortify', fromId: 2, toId: 3, diceCount: 2, playerId: 1 });
    recorder.recordAction({ type: 'endTurn', playerId: 1 });
    recorder.endCurrentTurn();

    const recording = recorder.getRecording();
    expect(recording).toHaveLength(2);
    expect(recording[0].turnNumber).toBe(1);
    expect(recording[0].playerId).toBe(0);
    expect(recording[0].actions).toHaveLength(1);
    expect(recording[1].turnNumber).toBe(2);
    expect(recording[1].playerId).toBe(1);
    expect(recording[1].actions).toHaveLength(2);
  });

  it('getRecording returns all turns including current', () => {
    const recorder = new GameRecorder();
    recorder.startTurn(1, 0);
    recorder.recordAction({ type: 'surrender', playerId: 0 });
    recorder.endCurrentTurn();

    recorder.startTurn(2, 1);
    recorder.recordAction({ type: 'reinforce', territoryId: 5, playerId: 1 });
    // current turn not ended

    const recording = recorder.getRecording();
    expect(recording).toHaveLength(2);
    expect(recording[1].actions[0].type).toBe('reinforce');
  });

  it('clear resets all state', () => {
    const recorder = new GameRecorder();
    recorder.startTurn(1, 0);
    recorder.recordAction({ type: 'endTurn', playerId: 0 });
    recorder.endCurrentTurn();
    recorder.startTurn(2, 1);

    recorder.clear();

    expect(recorder.getRecording()).toHaveLength(0);
  });

  it('recordAction is a no-op when no turn is started', () => {
    const recorder = new GameRecorder();
    recorder.recordAction({ type: 'endTurn', playerId: 0 });
    expect(recorder.getRecording()).toHaveLength(0);
  });

  it('startTurn ends the previous turn automatically', () => {
    const recorder = new GameRecorder();
    recorder.startTurn(1, 0);
    recorder.recordAction({ type: 'attack', attackerId: 0, defenderId: 1, attackerPlayerId: 0, defenderPlayerId: 1 });
    // start new turn without ending previous
    recorder.startTurn(2, 1);
    recorder.endCurrentTurn();

    const recording = recorder.getRecording();
    expect(recording).toHaveLength(2);
    expect(recording[0].turnNumber).toBe(1);
    expect(recording[1].turnNumber).toBe(2);
  });

  it('records powerUp actions', () => {
    const recorder = new GameRecorder();
    recorder.startTurn(1, 0);
    recorder.recordAction({ type: 'powerUp', action: 'charge', playerId: 0, territoryId: 3 });

    const recording = recorder.getRecording();
    expect(recording[0].actions[0]).toEqual({
      type: 'powerUp', action: 'charge', playerId: 0, territoryId: 3,
    });
  });
});

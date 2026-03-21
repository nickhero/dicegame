import { describe, it, expect } from 'vitest';
import { formatAction, FormattedEvent } from '../../src/game/EventFormatter';
import { GameAction } from '../../src/game/GameRecorder';
import { BattleResult } from '../../src/game/GameState';

const playerNames = ['Alice', 'Bob'];
const playerColors = [0x4a90d9, 0xd94a4a];

function makeResult(attackerWins: boolean): BattleResult {
  return {
    attackerRolls: [3, 4],
    defenderRolls: [2, 1],
    attackerTotal: 7,
    defenderTotal: 3,
    attackerWins,
  };
}

describe('formatAction', () => {
  it('formats a winning attack', () => {
    const action: GameAction = {
      type: 'attack',
      attackerId: 0, defenderId: 1,
      attackerPlayerId: 0, defenderPlayerId: 1,
      result: makeResult(true),
    };

    const event = formatAction(action, playerNames, playerColors)!;
    expect(event).not.toBeNull();
    expect(event.text).toContain('Alice');
    expect(event.text).toContain('won');
    expect(event.text).toContain('7 vs 3');
    expect(event.color).toBe(0x4a90d9);
  });

  it('formats a losing attack', () => {
    const action: GameAction = {
      type: 'attack',
      attackerId: 0, defenderId: 1,
      attackerPlayerId: 0, defenderPlayerId: 1,
      result: makeResult(false),
    };

    const event = formatAction(action, playerNames, playerColors)!;
    expect(event.text).toContain('lost');
  });

  it('formats surrender with red color', () => {
    const action: GameAction = { type: 'surrender', playerId: 0 };
    const event = formatAction(action, playerNames, playerColors)!;
    expect(event.text).toContain('Alice');
    expect(event.text).toContain('surrendered');
    expect(event.color).toBe(0xff4444);
  });

  it('formats elimination with red color', () => {
    const action: GameAction = { type: 'elimination', playerId: 1, eliminatedBy: 0 };
    const event = formatAction(action, playerNames, playerColors)!;
    expect(event.text).toContain('Bob');
    expect(event.text).toContain('eliminated');
    expect(event.color).toBe(0xff4444);
  });

  it('formats fortify with dice count', () => {
    const action: GameAction = { type: 'fortify', fromId: 2, toId: 3, diceCount: 3, playerId: 1 };
    const event = formatAction(action, playerNames, playerColors)!;
    expect(event.text).toContain('Bob');
    expect(event.text).toContain('fortified');
    expect(event.text).toContain('3 dice');
    expect(event.text).toContain('T2');
    expect(event.text).toContain('T3');
    expect(event.color).toBe(0xd94a4a);
  });

  it('formats reinforce action', () => {
    const action: GameAction = { type: 'reinforce', territoryId: 5, playerId: 0 };
    const event = formatAction(action, playerNames, playerColors)!;
    expect(event.text).toContain('Alice');
    expect(event.text).toContain('Reinforce');
    expect(event.text).toContain('T5');
  });

  it('returns null for endTurn with zero bonus dice', () => {
    const action: GameAction = { type: 'endTurn', playerId: 0, bonusDice: 0 };
    const event = formatAction(action, playerNames, playerColors);
    expect(event).toBeNull();
  });

  it('returns event for endTurn with bonus dice > 0', () => {
    const action: GameAction = { type: 'endTurn', playerId: 1, bonusDice: 4 };
    const event = formatAction(action, playerNames, playerColors)!;
    expect(event).not.toBeNull();
    expect(event.text).toContain('Bob');
    expect(event.text).toContain('4 bonus dice');
    expect(event.color).toBe(0xd94a4a);
  });

  it('uses fallback name and color for unknown player id', () => {
    const action: GameAction = { type: 'surrender', playerId: 99 };
    const event = formatAction(action, playerNames, playerColors)!;
    expect(event.text).toContain('?');
  });
});

import { describe, it, expect } from 'vitest';
import { formatAction, FormattedEvent, generateTextLog } from '../../src/game/EventFormatter';
import { GameAction, GameRecording } from '../../src/game/GameRecorder';
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

  it('formats power-up spawn', () => {
    const action: GameAction = { type: 'powerUpSpawn', territoryId: 4, powerUpType: 'shield', ownerId: 1 };
    const event = formatAction(action, playerNames, playerColors)!;
    expect(event.text).toContain('shield');
    expect(event.text).toContain('T4');
    expect(event.text).toContain('Bob');
    expect(event.color).toBe(0xffcc00);
  });

  it('uses fallback name and color for unknown player id', () => {
    const action: GameAction = { type: 'surrender', playerId: 99 };
    const event = formatAction(action, playerNames, playerColors)!;
    expect(event.text).toContain('?');
  });
});

describe('generateTextLog', () => {
  function makeRecording(actions: GameAction[]): GameRecording {
    return {
      initialState: {
        territories: [],
        players: [
          { id: 0, name: 'Alice', isHuman: true, color: 0x4a90d9, personality: null },
          { id: 1, name: 'Bot-1', isHuman: false, color: 0xd94a4a, personality: 'aggressive' },
        ],
        adjacency: [],
        powerUpsEnabled: true,
      },
      turns: [
        { turnNumber: 1, playerId: 0, actions },
      ],
      date: '2026-03-21T12:00:00Z',
      winnerId: 0,
      winnerName: 'Alice',
      turnCount: 1,
    };
  }

  it('includes header with game metadata', () => {
    const log = generateTextLog(makeRecording([]));
    expect(log).toContain('=== DiceWars Game Log ===');
    expect(log).toContain('Alice (human)');
    expect(log).toContain('Bot-1 (aggressive)');
    expect(log).toContain('Winner: Alice');
    expect(log).toContain('Turns: 1');
  });

  it('includes attack actions', () => {
    const log = generateTextLog(makeRecording([
      { type: 'attack', attackerId: 0, defenderId: 1, attackerPlayerId: 0, defenderPlayerId: 1, result: makeResult(true) },
    ]));
    expect(log).toContain('Alice attacked T0 → T1');
    expect(log).toContain('won');
  });

  it('includes power-up actions', () => {
    const log = generateTextLog(makeRecording([
      { type: 'reinforce', territoryId: 3, playerId: 1 },
      { type: 'fortify', fromId: 2, toId: 5, diceCount: 2, playerId: 1 },
    ]));
    expect(log).toContain('Bot-1 used Reinforce on T3');
    expect(log).toContain('Bot-1 fortified T5 with 2 dice from T2');
  });

  it('includes eliminations and surrenders', () => {
    const log = generateTextLog(makeRecording([
      { type: 'surrender', playerId: 1 },
      { type: 'elimination', playerId: 1, eliminatedBy: 0 },
    ]));
    expect(log).toContain('Bot-1 surrendered!');
    expect(log).toContain('Bot-1 was eliminated!');
  });

  it('includes turn headers', () => {
    const log = generateTextLog(makeRecording([]));
    expect(log).toContain('--- Turn 1 (Alice) ---');
  });

  it('ends with footer', () => {
    const log = generateTextLog(makeRecording([]));
    expect(log).toContain('=== End of Log');
  });
});

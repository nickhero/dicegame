import { describe, it, expect, beforeEach } from 'vitest';
import { GameStats } from '../../src/game/GameStats';
import { GameState, createInitialGameState, BattleResult } from '../../src/game/GameState';
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
    { id: 2, cells: [], center: { x: 0, y: 1 }, neighbors: [0, 3], owner: 0, dice: 3 },
    { id: 3, cells: [], center: { x: 1, y: 1 }, neighbors: [1, 2], owner: 1, dice: 5 },
  ];

  const players = [
    createPlayer(0, 'Human', true, 0x4a90d9),
    createPlayer(1, 'AI 1', false, 0xd94a4a),
  ];

  return createInitialGameState(territories, players, adjacency);
}

function makeResult(
  attackerDice: number,
  defenderDice: number,
  attackerWins: boolean,
): BattleResult {
  return {
    attackerRolls: Array(attackerDice).fill(3),
    defenderRolls: Array(defenderDice).fill(2),
    attackerTotal: attackerDice * 3,
    defenderTotal: defenderDice * 2,
    attackerWins,
  };
}

describe('GameStats', () => {
  let stats: GameStats;
  let state: GameState;

  beforeEach(() => {
    stats = new GameStats();
    state = createTestState();
  });

  describe('recordAttack — win/loss counts', () => {
    it('increments attacksInitiated, attacksWon on win', () => {
      const result = makeResult(4, 2, true);
      stats.recordAttack(0, 1, result, state);

      const summary = stats.getSummary();
      const p0 = summary.perPlayer.get(0)!;
      expect(p0.attacksInitiated).toBe(1);
      expect(p0.attacksWon).toBe(1);
      expect(p0.attacksLost).toBe(0);
    });

    it('increments attacksInitiated, attacksLost on loss', () => {
      const result = makeResult(2, 5, false);
      stats.recordAttack(0, 1, result, state);

      const summary = stats.getSummary();
      const p0 = summary.perPlayer.get(0)!;
      expect(p0.attacksInitiated).toBe(1);
      expect(p0.attacksWon).toBe(0);
      expect(p0.attacksLost).toBe(1);
    });

    it('tracks territoriesCaptured and territoriesLost', () => {
      const result = makeResult(4, 2, true);
      stats.recordAttack(0, 1, result, state);

      const summary = stats.getSummary();
      expect(summary.perPlayer.get(0)!.territoriesCaptured).toBe(1);
      expect(summary.perPlayer.get(1)!.territoriesLost).toBe(1);
    });

    it('accumulates totalBattles', () => {
      stats.recordAttack(0, 1, makeResult(4, 2, true), state);
      stats.recordAttack(0, 1, makeResult(3, 5, false), state);
      stats.recordAttack(1, 0, makeResult(5, 3, true), state);

      expect(stats.getSummary().totalBattles).toBe(3);
    });
  });

  describe('territories over time tracking', () => {
    it('records territory counts per turn', () => {
      stats.recordTurnStart(state);
      // Player 0 has territories 0 & 2; player 1 has 1 & 3
      const summary = stats.getSummary();
      expect(summary.territoriesOverTime.get(0)).toEqual([2]);
      expect(summary.territoriesOverTime.get(1)).toEqual([2]);
    });

    it('tracks changes across multiple turns', () => {
      stats.recordTurnStart(state);

      // Simulate player 0 capturing territory 1
      state.territories[1].owner = 0;
      state.turnNumber = 2;
      stats.recordTurnStart(state);

      const summary = stats.getSummary();
      expect(summary.territoriesOverTime.get(0)).toEqual([2, 3]);
      expect(summary.territoriesOverTime.get(1)).toEqual([2, 1]);
    });

    it('updates maxTerritories', () => {
      stats.recordTurnStart(state);
      state.territories[1].owner = 0;
      state.turnNumber = 2;
      stats.recordTurnStart(state);

      const summary = stats.getSummary();
      expect(summary.perPlayer.get(0)!.maxTerritories).toBe(3);
    });
  });

  describe('biggest upset detection', () => {
    it('detects upset when fewer dice beat more dice', () => {
      // Attacker has 2 dice, defender has 6 dice, attacker wins
      const result = makeResult(2, 6, true);
      stats.recordAttack(0, 1, result, state);

      const summary = stats.getSummary();
      expect(summary.biggestUpset).toEqual({
        attackerDice: 2,
        defenderDice: 6,
        winnerId: 0,
      });
    });

    it('returns null when no upset occurred', () => {
      // Attacker has more dice and wins — not an upset
      const result = makeResult(6, 2, true);
      stats.recordAttack(0, 1, result, state);

      const summary = stats.getSummary();
      expect(summary.biggestUpset).toBeNull();
    });

    it('keeps the biggest upset across multiple battles', () => {
      stats.recordAttack(0, 1, makeResult(2, 4, true), state);
      stats.recordAttack(0, 1, makeResult(1, 7, true), state);
      stats.recordAttack(0, 1, makeResult(3, 5, true), state);

      const summary = stats.getSummary();
      expect(summary.biggestUpset).toEqual({
        attackerDice: 1,
        defenderDice: 7,
        winnerId: 0,
      });
    });
  });

  describe('streak tracking', () => {
    it('tracks consecutive wins', () => {
      stats.recordAttack(0, 1, makeResult(4, 2, true), state);
      stats.recordAttack(0, 1, makeResult(4, 2, true), state);
      stats.recordAttack(0, 1, makeResult(4, 2, true), state);

      expect(stats.getSummary().perPlayer.get(0)!.longestWinStreak).toBe(3);
    });

    it('resets streak on loss', () => {
      stats.recordAttack(0, 1, makeResult(4, 2, true), state);
      stats.recordAttack(0, 1, makeResult(4, 2, true), state);
      stats.recordAttack(0, 1, makeResult(2, 5, false), state);
      stats.recordAttack(0, 1, makeResult(4, 2, true), state);

      expect(stats.getSummary().perPlayer.get(0)!.longestWinStreak).toBe(2);
    });

    it('tracks streaks independently per player', () => {
      stats.recordAttack(0, 1, makeResult(4, 2, true), state);
      stats.recordAttack(1, 0, makeResult(5, 3, true), state);
      stats.recordAttack(1, 0, makeResult(5, 3, true), state);

      const summary = stats.getSummary();
      expect(summary.perPlayer.get(0)!.longestWinStreak).toBe(1);
      expect(summary.perPlayer.get(1)!.longestWinStreak).toBe(2);
    });
  });
});

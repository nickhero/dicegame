import { describe, it, expect } from 'vitest';
import { rollDice, sumRolls, resolveBattle, estimateWinProbability, CHARGE_EXTRA_DICE } from '../../src/game/DiceBattle';
import { SeededRandom } from '../../src/utils/random';
import { Territory } from '../../src/game/Territory';

describe('rollDice', () => {
  it('returns correct number of dice', () => {
    const rng = new SeededRandom(42);
    expect(rollDice(5, rng).length).toBe(5);
    expect(rollDice(1, rng).length).toBe(1);
    expect(rollDice(8, rng).length).toBe(8);
  });

  it('all values are between 1 and 6', () => {
    const rng = new SeededRandom(42);
    for (let n = 1; n <= 8; n++) {
      const rolls = rollDice(n, rng);
      for (const r of rolls) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(6);
      }
    }
  });

  it('is deterministic with same seed', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);
    expect(rollDice(8, rng1)).toEqual(rollDice(8, rng2));
  });
});

describe('sumRolls', () => {
  it('sums correctly', () => {
    expect(sumRolls([1, 2, 3])).toBe(6);
    expect(sumRolls([6, 6, 6, 6])).toBe(24);
    expect(sumRolls([1])).toBe(1);
  });

  it('returns 0 for empty array', () => {
    expect(sumRolls([])).toBe(0);
  });
});

describe('resolveBattle', () => {
  it('returns correct structure', () => {
    const rng = new SeededRandom(42);
    const result = resolveBattle(3, 2, rng);
    expect(result.attackerRolls.length).toBe(3);
    expect(result.defenderRolls.length).toBe(2);
    expect(result.attackerTotal).toBe(sumRolls(result.attackerRolls));
    expect(result.defenderTotal).toBe(sumRolls(result.defenderRolls));
    expect(typeof result.attackerWins).toBe('boolean');
  });

  it('attacker wins only when strictly greater', () => {
    // Run many battles and verify the rule
    const rng = new SeededRandom(123);
    for (let i = 0; i < 100; i++) {
      const result = resolveBattle(4, 4, rng);
      if (result.attackerTotal > result.defenderTotal) {
        expect(result.attackerWins).toBe(true);
      } else {
        expect(result.attackerWins).toBe(false);
      }
    }
  });

  it('more dice generally wins more often', () => {
    const rng = new SeededRandom(42);
    let wins8v2 = 0;
    let wins2v8 = 0;
    const trials = 1000;

    for (let i = 0; i < trials; i++) {
      if (resolveBattle(8, 2, new SeededRandom(i)).attackerWins) wins8v2++;
      if (resolveBattle(2, 8, new SeededRandom(i)).attackerWins) wins2v8++;
    }

    expect(wins8v2).toBeGreaterThan(trials * 0.9); // 8v2 should win ~99%+
    expect(wins2v8).toBeLessThan(trials * 0.05);   // 2v8 should win <5%
  });
});

describe('estimateWinProbability', () => {
  it('returns a value between 0 and 1', () => {
    for (let a = 1; a <= 8; a++) {
      for (let d = 1; d <= 8; d++) {
        const p = estimateWinProbability(a, d);
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
      }
    }
  });

  it('higher attacker dice gives higher probability', () => {
    const p3v3 = estimateWinProbability(3, 3);
    const p4v3 = estimateWinProbability(4, 3);
    const p5v3 = estimateWinProbability(5, 3);
    expect(p4v3).toBeGreaterThan(p3v3);
    expect(p5v3).toBeGreaterThan(p4v3);
  });

  it('equal dice gives approximately 40% for attacker', () => {
    const p = estimateWinProbability(4, 4);
    expect(p).toBeGreaterThan(0.3);
    expect(p).toBeLessThan(0.5);
  });
});

function makeTerritory(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 0,
    cells: [],
    center: { x: 0, y: 0 },
    neighbors: [],
    owner: 0,
    dice: 1,
    ...overrides,
  };
}

describe('resolveBattle power-ups', () => {
  it('charge adds extra dice to attacker roll', () => {
    const rng = new SeededRandom(42);
    const attacker = makeTerritory({ dice: 8, powerUp: 'charge' });
    const result = resolveBattle(8, 4, rng, attacker);
    expect(result.attackerRolls.length).toBe(8 + CHARGE_EXTRA_DICE);
    expect(result.attackerTotal).toBe(sumRolls(result.attackerRolls));
  });

  it('charge is consumed after attack', () => {
    const rng = new SeededRandom(42);
    const attacker = makeTerritory({ dice: 4, powerUp: 'charge' });
    resolveBattle(4, 3, rng, attacker);
    expect(attacker.powerUp).toBeUndefined();
  });

  it('shield adds flat +3 bonus to defender total', () => {
    const rng = new SeededRandom(99);
    const defender = makeTerritory({ dice: 3, powerUp: 'shield' });
    const result = resolveBattle(4, 3, rng, undefined, defender);
    expect(result.defenderRolls.length).toBe(3);
    expect(result.defenderTotal).toBe(sumRolls(result.defenderRolls) + 3);
    expect(defender.powerUp).toBeUndefined();
  });

  it('no power-up means no extra dice or bonus', () => {
    const rng = new SeededRandom(42);
    const result = resolveBattle(5, 3, rng);
    expect(result.attackerRolls.length).toBe(5);
    expect(result.defenderRolls.length).toBe(3);
    expect(result.attackerTotal).toBe(sumRolls(result.attackerRolls));
    expect(result.defenderTotal).toBe(sumRolls(result.defenderRolls));
  });
});

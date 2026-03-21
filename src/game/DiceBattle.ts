import { SeededRandom } from '../utils/random';
import { BattleResult } from './GameState';
import { Territory } from './Territory';

/**
 * Roll n dice (each 1–6) and return individual results.
 */
export function rollDice(n: number, rng: SeededRandom): number[] {
  const results: number[] = [];
  for (let i = 0; i < n; i++) {
    results.push(rng.nextInt(1, 6));
  }
  return results;
}

/**
 * Sum an array of dice rolls.
 */
export function sumRolls(rolls: number[]): number {
  return rolls.reduce((a, b) => a + b, 0);
}

const POWER_UP_BONUS = 3;

/**
 * Resolve a battle between attacker and defender.
 * Attacker wins if their total is strictly greater than defender's.
 * If territory objects are provided, charge/shield power-ups are applied and consumed.
 */
export function resolveBattle(
  attackerDice: number,
  defenderDice: number,
  rng: SeededRandom,
  attackerTerritory?: Territory,
  defenderTerritory?: Territory
): BattleResult {
  const attackerRolls = rollDice(attackerDice, rng);
  const defenderRolls = rollDice(defenderDice, rng);
  let attackerTotal = sumRolls(attackerRolls);
  let defenderTotal = sumRolls(defenderRolls);

  if (attackerTerritory?.powerUp === 'charge') {
    attackerTotal += POWER_UP_BONUS;
    attackerTerritory.powerUp = undefined;
  }

  if (defenderTerritory?.powerUp === 'shield') {
    defenderTotal += POWER_UP_BONUS;
    defenderTerritory.powerUp = undefined;
  }

  return {
    attackerRolls,
    defenderRolls,
    attackerTotal,
    defenderTotal,
    attackerWins: attackerTotal > defenderTotal,
  };
}

/**
 * Estimate attack success probability using the average dice advantage.
 * Each die averages 3.5. Attacker needs to roll strictly higher.
 */
export function estimateWinProbability(attackerDice: number, defenderDice: number): number {
  const diff = attackerDice - defenderDice;
  // Sigmoid approximation: 0 diff → ~40%, +1 → ~60%, +2 → ~77%, -1 → ~23%
  return 1 / (1 + Math.exp(-0.8 * diff + 0.4));
}

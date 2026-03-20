import { SeededRandom } from '../utils/random';
import { BattleResult } from './GameState';

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

/**
 * Resolve a battle between attacker and defender.
 * Attacker wins if their total is strictly greater than defender's.
 */
export function resolveBattle(
  attackerDice: number,
  defenderDice: number,
  rng: SeededRandom
): BattleResult {
  const attackerRolls = rollDice(attackerDice, rng);
  const defenderRolls = rollDice(defenderDice, rng);
  const attackerTotal = sumRolls(attackerRolls);
  const defenderTotal = sumRolls(defenderRolls);

  return {
    attackerRolls,
    defenderRolls,
    attackerTotal,
    defenderTotal,
    attackerWins: attackerTotal > defenderTotal,
  };
}

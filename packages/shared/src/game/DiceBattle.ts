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

export const CHARGE_EXTRA_DICE = 2;
export const SHIELD_DEFENSE_BONUS = 3;

/**
 * Resolve a battle between attacker and defender.
 * Attacker wins if their total is strictly greater than defender's.
 * If territory objects are provided, charge/shield power-ups are applied and consumed.
 * Charge adds extra dice to the attacker's roll; Shield adds a flat bonus to defender total.
 */
export function resolveBattle(
  attackerDice: number,
  defenderDice: number,
  rng: SeededRandom,
  attackerTerritory?: Territory,
  defenderTerritory?: Territory
): BattleResult {
  let effectiveAttackDice = attackerDice;
  if (attackerTerritory?.powerUp === 'charge') {
    effectiveAttackDice += CHARGE_EXTRA_DICE;
    attackerTerritory.powerUp = undefined;
  }

  const attackerRolls = rollDice(effectiveAttackDice, rng);
  const defenderRolls = rollDice(defenderDice, rng);
  let attackerTotal = sumRolls(attackerRolls);
  let defenderTotal = sumRolls(defenderRolls);

  if (defenderTerritory?.powerUp === 'shield') {
    defenderTotal += SHIELD_DEFENSE_BONUS;
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
 * Optionally factors in charge (+2 dice) and shield (+3 defense bonus, ~1 die equivalent).
 */
export function estimateWinProbability(
  attackerDice: number,
  defenderDice: number,
  attackerPowerUp?: string,
  defenderPowerUp?: string,
): number {
  let effectiveAtk = attackerDice;
  let effectiveDef = defenderDice;
  if (attackerPowerUp === 'charge') {
    effectiveAtk += CHARGE_EXTRA_DICE;
  }
  if (defenderPowerUp === 'shield') {
    effectiveDef += 1; // +3 flat defense bonus is roughly ~1 die equivalent
  }

  const diff = effectiveAtk - effectiveDef;
  // Sigmoid approximation: 0 diff → ~40%, +1 → ~60%, +2 → ~77%, -1 → ~23%
  return 1 / (1 + Math.exp(-0.8 * diff + 0.4));
}

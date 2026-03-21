import { GameState } from './GameState';
import { SeededRandom } from '../utils/random';
import { MAX_DICE_PER_TERRITORY } from './constants';

export type PowerUpType = 'shield' | 'charge' | 'fortify' | 'reinforce';

export interface PowerUp {
  type: PowerUpType;
  label: string;
  description: string;
}

export const POWER_UPS: Record<PowerUpType, PowerUp> = {
  shield: {
    type: 'shield',
    label: 'Shield',
    description: 'Adds +3 to defender total when this territory is attacked',
  },
  charge: {
    type: 'charge',
    label: 'Charge',
    description: 'Adds +3 to attacker total when attacking from this territory',
  },
  fortify: {
    type: 'fortify',
    label: 'Fortify',
    description: 'Move up to 3 dice from this territory to an adjacent owned territory',
  },
  reinforce: {
    type: 'reinforce',
    label: 'Reinforce',
    description: 'Add 2 dice to this territory (up to max)',
  },
};

const ALL_POWER_UP_TYPES: PowerUpType[] = ['shield', 'charge', 'fortify', 'reinforce'];
const MAX_POWER_UPS_ON_MAP = 4;

/**
 * Spawn a power-up on a random territory that doesn't already have one.
 * Respects the maximum number of power-ups on the map.
 */
export interface PowerUpSpawnInfo {
  territoryId: number;
  powerUpType: PowerUpType;
  ownerId: number;
}

export function spawnPowerUp(state: GameState, rng: SeededRandom): PowerUpSpawnInfo | null {
  if (!state.powerUpsEnabled) return null;

  const currentCount = state.territories.filter((t) => t.powerUp != null).length;
  if (currentCount >= MAX_POWER_UPS_ON_MAP) return null;

  const candidates = state.territories.filter((t) => t.powerUp == null);
  if (candidates.length === 0) return null;

  const territory = rng.pick(candidates);
  territory.powerUp = rng.pick(ALL_POWER_UP_TYPES);
  return { territoryId: territory.id, powerUpType: territory.powerUp, ownerId: territory.owner };
}

/**
 * Fortify: move up to 3 dice from one owned territory to an adjacent owned territory.
 * The source territory must have the 'fortify' power-up. Consumes the power-up.
 * Returns true if the action was successful.
 */
export function useFortify(
  fromId: number,
  toId: number,
  diceCount: number,
  state: GameState
): boolean {
  const from = state.territories[fromId];
  const to = state.territories[toId];

  if (!from || !to) return false;
  if (from.powerUp !== 'fortify') return false;
  if (from.owner !== to.owner) return false;
  if (!from.neighbors.includes(toId)) return false;
  if (diceCount < 1 || diceCount > 3) return false;
  // Must keep at least 1 die on the source territory
  if (from.dice - diceCount < 1) return false;
  if (to.dice + diceCount > MAX_DICE_PER_TERRITORY) return false;

  from.dice -= diceCount;
  to.dice += diceCount;
  from.powerUp = undefined;

  return true;
}

/**
 * Reinforce: add 2 dice to a territory (up to MAX_DICE_PER_TERRITORY).
 * The territory must have the 'reinforce' power-up. Consumes the power-up.
 * Returns true if the action was successful.
 */
export function useReinforce(territoryId: number, state: GameState): boolean {
  const territory = state.territories[territoryId];

  if (!territory) return false;
  if (territory.powerUp !== 'reinforce') return false;

  const addAmount = Math.min(2, MAX_DICE_PER_TERRITORY - territory.dice);
  if (addAmount <= 0) return false;

  territory.dice += addAmount;
  territory.powerUp = undefined;

  return true;
}

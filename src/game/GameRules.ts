import { GameState, BattleResult } from './GameState';
import { Territory } from './Territory';
import { SeededRandom } from '../utils/random';
import { resolveBattle } from './DiceBattle';
import { largestContiguousGroup } from '../utils/graph';
import { MAX_DICE_PER_TERRITORY, MAX_RESERVE_DICE } from './constants';
import { spawnPowerUp, PowerUpSpawnInfo } from './PowerUps';

/**
 * Check if a territory can attack (has >1 die and has enemy neighbor).
 */
export function canAttackFrom(
  territoryId: number,
  state: GameState
): boolean {
  const territory = state.territories[territoryId];
  if (territory.dice <= 1) return false;
  if (territory.owner !== state.currentPlayerIndex) return false;

  return territory.neighbors.some(
    (nId) => state.territories[nId].owner !== territory.owner
  );
}

/**
 * Check if an attack from attacker to defender is valid.
 */
export function isValidAttack(
  attackerId: number,
  defenderId: number,
  state: GameState
): boolean {
  const attacker = state.territories[attackerId];
  const defender = state.territories[defenderId];

  if (attacker.owner !== state.currentPlayerIndex) return false;
  if (attacker.dice <= 1) return false;
  if (defender.owner === attacker.owner) return false;
  if (!attacker.neighbors.includes(defenderId)) return false;

  return true;
}

/**
 * Execute an attack. Mutates game state.
 */
export function executeAttack(
  attackerId: number,
  defenderId: number,
  state: GameState,
  rng: SeededRandom
): BattleResult {
  const attacker = state.territories[attackerId];
  const defender = state.territories[defenderId];

  const result = resolveBattle(attacker.dice, defender.dice, rng, attacker, defender);

  if (result.attackerWins) {
    // Attacker takes territory, moves all but 1 die
    defender.owner = attacker.owner;
    defender.dice = attacker.dice - 1;
    attacker.dice = 1;
  } else {
    // Attacker loses — stack reduced to 1
    attacker.dice = 1;
  }

  state.lastBattle = result;

  // Check if defender's owner is eliminated
  checkElimination(state);

  // Check for winner
  checkWinner(state);

  return result;
}

/**
 * Mark players with no territories as dead.
 */
export function checkElimination(state: GameState): void {
  for (const player of state.players) {
    if (!player.isAlive) continue;
    const hasTerritory = state.territories.some(
      (t) => t.owner === player.id
    );
    if (!hasTerritory) {
      player.isAlive = false;
    }
  }
}

/**
 * Check if only one player remains alive.
 */
export function checkWinner(state: GameState): void {
  const alivePlayers = state.players.filter((p) => p.isAlive);
  if (alivePlayers.length === 1) {
    state.winner = alivePlayers[0].id;
    state.phase = 'gameOver';
  }
}

export interface EndTurnResult {
  spawn: PowerUpSpawnInfo | null;
}

/**
 * End the current player's turn. Distribute bonus dice and advance turn.
 */
export function endTurn(state: GameState, rng: SeededRandom): EndTurnResult {
  const player = state.players[state.currentPlayerIndex];

  // Calculate bonus: largest contiguous group of territories
  const playerTerritories = state.territories
    .filter((t) => t.owner === player.id)
    .map((t) => t.id);

  const bonus = largestContiguousGroup(playerTerritories, state.adjacency);

  // Distribute bonus dice randomly to player's territories
  distributeDice(state, player.id, bonus, rng);

  // Advance to next alive player
  return advancePlayer(state, rng);
}

/**
 * Distribute dice to a player's territories.
 */
export function distributeDice(
  state: GameState,
  playerId: number,
  count: number,
  rng: SeededRandom
): void {
  const player = state.players[playerId];
  let remaining = count + player.reserveDice;
  player.reserveDice = 0;

  const playerTerritories = state.territories.filter(
    (t) => t.owner === playerId
  );

  if (playerTerritories.length === 0) return;

  let distributed = true;
  while (remaining > 0 && distributed) {
    distributed = false;
    const shuffled = [...playerTerritories];
    rng.shuffle(shuffled);

    for (const t of shuffled) {
      if (remaining <= 0) break;
      if (t.dice < MAX_DICE_PER_TERRITORY) {
        t.dice++;
        remaining--;
        distributed = true;
      }
    }
  }

  // Store surplus as reserve (up to max)
  player.reserveDice = Math.min(remaining, MAX_RESERVE_DICE);
}

/**
 * Advance to the next alive player.
 * Spawns a power-up when a new round begins (turn wraps to player 0).
 */
export function advancePlayer(state: GameState, rng?: SeededRandom): EndTurnResult {
  const playerCount = state.players.length;
  let next = (state.currentPlayerIndex + 1) % playerCount;

  // Skip eliminated players
  let safety = 0;
  while (!state.players[next].isAlive && safety < playerCount) {
    next = (next + 1) % playerCount;
    safety++;
  }

  let spawn: PowerUpSpawnInfo | null = null;
  const isNewRound = next <= state.currentPlayerIndex;
  if (isNewRound) {
    state.turnNumber++;
    if (rng) {
      spawn = spawnPowerUp(state, rng);
    }
  }

  state.currentPlayerIndex = next;
  state.phase = 'selectingAttacker';
  state.selectedTerritoryId = null;
  state.lastBattle = null;
  return { spawn };
}

/**
 * Get all territories the current player can attack from.
 */
export function getAttackableTerritories(state: GameState): Territory[] {
  return state.territories.filter((t) => canAttackFrom(t.id, state));
}

/**
 * Get valid attack targets for a selected territory.
 */
export function getValidTargets(
  attackerId: number,
  state: GameState
): Territory[] {
  const attacker = state.territories[attackerId];
  return attacker.neighbors
    .filter((nId) => state.territories[nId].owner !== attacker.owner)
    .map((nId) => state.territories[nId]);
}

/**
 * Check if any attack from the given player has a positive dice advantage (≥1).
 */
function hasPositiveAdvantageAttack(state: GameState, playerId: number): boolean {
  for (const territory of state.territories) {
    if (territory.owner !== playerId) continue;
    if (territory.dice <= 1) continue;
    for (const nId of territory.neighbors) {
      const neighbor = state.territories[nId];
      if (neighbor.owner === playerId) continue;
      if (territory.dice - neighbor.dice >= 1) return true;
    }
  }
  return false;
}

/**
 * Determine if an AI player should surrender.
 *
 * Standard conditions (ALL must be true):
 *  - Player has ≤ 2 territories
 *  - No attack with advantage ≥ 1 exists
 *  - Player has been in this desperate state for ≥ 2 consecutive turns
 *
 * Personality overrides:
 *  - Reckless: never surrenders
 *  - Aggressive: surrenders when down to 1 territory (lower threshold)
 */
export function shouldAISurrender(state: GameState, playerId: number): boolean {
  const player = state.players[playerId];
  if (!player.isAlive) return false;

  const personality = player.personality ?? 'balanced';
  if (personality === 'reckless') return false;

  const territoryCount = state.territories.filter((t) => t.owner === playerId).length;
  const territoryThreshold = personality === 'aggressive' ? 1 : 2;

  const isDesperate =
    territoryCount <= territoryThreshold &&
    !hasPositiveAdvantageAttack(state, playerId);

  // Update consecutive desperate counter
  if (!state.consecutiveDesperate) {
    state.consecutiveDesperate = new Map();
  }
  const prev = state.consecutiveDesperate.get(playerId) ?? 0;

  if (isDesperate) {
    const newCount = prev + 1;
    state.consecutiveDesperate.set(playerId, newCount);
    return newCount >= 2;
  } else {
    state.consecutiveDesperate.set(playerId, 0);
    return false;
  }
}

/**
 * Distribute a surrendered player's territories to neighbors.
 *
 * Each territory goes to the neighboring player with the most adjacent territories.
 * Ties are broken by player order (lower id wins).
 * If no neighbor owns adjacent territory, the territory goes to the player
 * with the most territories overall.
 * Dice remain as-is.
 */
export function distributeSurrenderedTerritories(state: GameState, playerId: number): void {
  const surrenderedTerritories = state.territories.filter((t) => t.owner === playerId);

  for (const territory of surrenderedTerritories) {
    // Count adjacent territories per neighboring player
    const neighborCounts = new Map<number, number>();
    for (const nId of territory.neighbors) {
      const neighborOwner = state.territories[nId].owner;
      if (neighborOwner === playerId) continue;
      if (!state.players[neighborOwner].isAlive) continue;
      neighborCounts.set(neighborOwner, (neighborCounts.get(neighborOwner) ?? 0) + 1);
    }

    let newOwner = -1;
    if (neighborCounts.size > 0) {
      // Pick neighbor with most adjacent territories; ties broken by lower id
      let bestCount = 0;
      for (const [ownerId, count] of neighborCounts) {
        if (count > bestCount || (count === bestCount && (newOwner === -1 || ownerId < newOwner))) {
          bestCount = count;
          newOwner = ownerId;
        }
      }
    } else {
      // No alive neighbor — give to player with most territories overall
      let bestCount = 0;
      for (const p of state.players) {
        if (!p.isAlive || p.id === playerId) continue;
        const count = state.territories.filter((t) => t.owner === p.id).length;
        if (count > bestCount || (count === bestCount && (newOwner === -1 || p.id < newOwner))) {
          bestCount = count;
          newOwner = p.id;
        }
      }
    }

    if (newOwner !== -1) {
      territory.owner = newOwner;
    }
  }

  // Mark player as dead
  state.players[playerId].isAlive = false;

  checkWinner(state);
}

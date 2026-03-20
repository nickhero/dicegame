import { GameState, BattleResult } from './GameState';
import { Territory } from './Territory';
import { SeededRandom } from '../utils/random';
import { resolveBattle } from './DiceBattle';
import { largestContiguousGroup } from '../utils/graph';
import { MAX_DICE_PER_TERRITORY, MAX_RESERVE_DICE } from './constants';

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

  const result = resolveBattle(attacker.dice, defender.dice, rng);

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

/**
 * End the current player's turn. Distribute bonus dice and advance turn.
 */
export function endTurn(state: GameState, rng: SeededRandom): void {
  const player = state.players[state.currentPlayerIndex];

  // Calculate bonus: largest contiguous group of territories
  const playerTerritories = state.territories
    .filter((t) => t.owner === player.id)
    .map((t) => t.id);

  const bonus = largestContiguousGroup(playerTerritories, state.adjacency);

  // Distribute bonus dice randomly to player's territories
  distributeDice(state, player.id, bonus, rng);

  // Advance to next alive player
  advancePlayer(state);
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
 */
export function advancePlayer(state: GameState): void {
  const playerCount = state.players.length;
  let next = (state.currentPlayerIndex + 1) % playerCount;

  // Skip eliminated players
  let safety = 0;
  while (!state.players[next].isAlive && safety < playerCount) {
    next = (next + 1) % playerCount;
    safety++;
  }

  if (state.currentPlayerIndex === 0 && next !== 0) {
    // We've started a new round when wrapping back
  }
  if (next <= state.currentPlayerIndex) {
    state.turnNumber++;
  }

  state.currentPlayerIndex = next;
  state.phase = 'selectingAttacker';
  state.selectedTerritoryId = null;
  state.lastBattle = null;
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

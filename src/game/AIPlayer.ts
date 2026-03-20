import { GameState } from './GameState';
import { SeededRandom } from '../utils/random';
import { canAttackFrom, isValidAttack, executeAttack } from './GameRules';

export interface AIMove {
  attackerId: number;
  defenderId: number;
  advantage: number; // attacker dice - defender dice
}

/**
 * Find all possible attacks for the current AI player.
 */
export function findPossibleMoves(state: GameState): AIMove[] {
  const playerId = state.currentPlayerIndex;
  const moves: AIMove[] = [];

  for (const territory of state.territories) {
    if (territory.owner !== playerId) continue;
    if (!canAttackFrom(territory.id, state)) continue;

    for (const neighborId of territory.neighbors) {
      const neighbor = state.territories[neighborId];
      if (neighbor.owner === playerId) continue;

      moves.push({
        attackerId: territory.id,
        defenderId: neighborId,
        advantage: territory.dice - neighbor.dice,
      });
    }
  }

  return moves;
}

/**
 * Select the best move for the AI.
 * Strategy: attack when advantage ≥ 1, prefer largest advantage.
 */
export function selectBestMove(
  state: GameState,
  rng: SeededRandom
): AIMove | null {
  const moves = findPossibleMoves(state);

  // Only attack when we have an advantage
  const favorableMoves = moves.filter((m) => m.advantage >= 1);

  if (favorableMoves.length === 0) return null;

  // Sort by advantage (descending), pick best with some randomness
  favorableMoves.sort((a, b) => b.advantage - a.advantage);

  // Pick from the top moves (within 1 of the best advantage)
  const bestAdvantage = favorableMoves[0].advantage;
  const topMoves = favorableMoves.filter(
    (m) => m.advantage >= bestAdvantage - 1
  );

  return rng.pick(topMoves);
}

/**
 * Execute one AI turn: make attacks until no favorable moves remain.
 * Returns list of battle results for animation.
 */
export function executeAITurn(
  state: GameState,
  rng: SeededRandom
): { attackerId: number; defenderId: number }[] {
  const attacks: { attackerId: number; defenderId: number }[] = [];
  let safety = 0;

  while (safety < 50) {
    safety++;
    const move = selectBestMove(state, rng);
    if (!move) break;

    if (!isValidAttack(move.attackerId, move.defenderId, state)) break;

    attacks.push({
      attackerId: move.attackerId,
      defenderId: move.defenderId,
    });

    executeAttack(move.attackerId, move.defenderId, state, rng);

    if (state.phase === 'gameOver') break;
  }

  return attacks;
}

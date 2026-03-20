import { GameState } from './GameState';
import { SeededRandom } from '../utils/random';
import { canAttackFrom, isValidAttack, executeAttack } from './GameRules';
import {
  AIPersonality,
  PERSONALITIES,
  PersonalityType,
  scoreMove,
  filterMovesByPersonality,
} from './AIPersonality';

export interface AIMove {
  attackerId: number;
  defenderId: number;
  advantage: number; // attacker dice - defender dice
}

/**
 * Find all possible attacks for the current AI player.
 * When visibleSet is provided, only attacks against visible territories are considered.
 */
export function findPossibleMoves(state: GameState, visibleSet?: Set<number>): AIMove[] {
  const playerId = state.currentPlayerIndex;
  const moves: AIMove[] = [];

  for (const territory of state.territories) {
    if (territory.owner !== playerId) continue;
    if (!canAttackFrom(territory.id, state)) continue;

    for (const neighborId of territory.neighbors) {
      const neighbor = state.territories[neighborId];
      if (neighbor.owner === playerId) continue;
      if (visibleSet && !visibleSet.has(neighborId)) continue;

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
 * Resolve the personality config for the current AI player.
 */
function getPersonality(state: GameState): AIPersonality {
  const player = state.players[state.currentPlayerIndex];
  const type: PersonalityType = player.personality ?? 'balanced';
  return PERSONALITIES[type];
}

/**
 * Select the best move for the AI based on its personality.
 */
export function selectBestMove(
  state: GameState,
  rng: SeededRandom,
  personalityOverride?: AIPersonality,
  visibleSet?: Set<number>,
): AIMove | null {
  const personality = personalityOverride ?? getPersonality(state);
  const moves = findPossibleMoves(state, visibleSet);

  const validMoves = filterMovesByPersonality(moves, personality);
  if (validMoves.length === 0) return null;

  // Score each move using the personality's scoring function
  const scored = validMoves.map((m) => ({
    move: m,
    score: scoreMove(m, personality, state),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Pick from top moves (within 1 point of best score) with randomness
  const bestScore = scored[0].score;
  const topMoves = scored.filter((s) => s.score >= bestScore - 1);

  return rng.pick(topMoves).move;
}

/**
 * Execute one AI turn: make attacks until no favorable moves remain
 * or the personality's attack limit is reached.
 * Returns list of battle results for animation.
 */
export function executeAITurn(
  state: GameState,
  rng: SeededRandom,
  personalityOverride?: AIPersonality,
  visibleSet?: Set<number>,
): { attackerId: number; defenderId: number }[] {
  const personality = personalityOverride ?? getPersonality(state);
  const attacks: { attackerId: number; defenderId: number }[] = [];
  let safety = 0;

  while (safety < 50 && attacks.length < personality.maxAttacksPerTurn) {
    safety++;
    const move = selectBestMove(state, rng, personality, visibleSet);
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

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
import { useFortify, useReinforce } from './PowerUps';
import { MAX_DICE_PER_TERRITORY } from './constants';

export interface AIMove {
  attackerId: number;
  defenderId: number;
  advantage: number; // effective advantage accounting for power-ups
}

const POWER_UP_BONUS = 3;

/**
 * Calculate effective advantage accounting for power-ups on attacker/defender.
 */
export function effectiveAdvantage(
  attackerDice: number,
  defenderDice: number,
  attackerPowerUp?: string,
  defenderPowerUp?: string,
): number {
  let adv = attackerDice - defenderDice;
  if (attackerPowerUp === 'charge') adv += POWER_UP_BONUS;
  if (defenderPowerUp === 'shield') adv -= POWER_UP_BONUS;
  return adv;
}

/**
 * Find all possible attacks for the current AI player.
 * When visibleSet is provided, only attacks against visible territories are considered.
 * Advantage accounts for charge/shield power-ups.
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
        advantage: effectiveAdvantage(
          territory.dice, neighbor.dice,
          territory.powerUp, neighbor.powerUp,
        ),
      });
    }
  }

  return moves;
}

/**
 * Use any available manual power-ups (Reinforce, Fortify) on the AI's territories.
 * Returns descriptions of actions taken for logging.
 */
export function useAIPowerUps(state: GameState): string[] {
  const playerId = state.currentPlayerIndex;
  const actions: string[] = [];

  // Use all Reinforce power-ups first (free +2 dice)
  for (const t of state.territories) {
    if (t.owner !== playerId || t.powerUp !== 'reinforce') continue;
    if (t.dice >= MAX_DICE_PER_TERRITORY) {
      // Already at max — discard so it doesn't sit forever
      t.powerUp = undefined;
      actions.push(`discarded reinforce on T${t.id} (already at max dice)`);
      continue;
    }
    const before = t.dice;
    if (useReinforce(t.id, state)) {
      actions.push(`reinforced T${t.id} (${before}→${t.dice} dice)`);
    }
  }

  // Use Fortify: move dice to adjacent owned territories
  for (const t of state.territories) {
    if (t.owner !== playerId || t.powerUp !== 'fortify') continue;

    // If territory only has 1 die, can't move any — discard the power-up
    if (t.dice <= 1) {
      t.powerUp = undefined;
      actions.push(`discarded fortify on T${t.id} (only 1 die)`);
      continue;
    }

    // Find the best adjacent owned territory to send dice to
    let bestTarget: { id: number; dice: number; priority: number } | null = null;
    for (const nId of t.neighbors) {
      const n = state.territories[nId];
      if (n.owner !== playerId) continue;
      if (n.dice >= MAX_DICE_PER_TERRITORY) continue;

      // Frontier territories (with enemy neighbors) get higher priority
      const isFrontier = n.neighbors.some(
        (nnId) => state.territories[nnId].owner !== playerId,
      );
      const priority = isFrontier ? 2 : 1;

      if (!bestTarget || priority > bestTarget.priority || (priority === bestTarget.priority && n.dice < bestTarget.dice)) {
        bestTarget = { id: n.id, dice: n.dice, priority };
      }
    }

    if (bestTarget) {
      const movable = Math.min(3, t.dice - 1, MAX_DICE_PER_TERRITORY - bestTarget.dice);
      if (movable > 0 && useFortify(t.id, bestTarget.id, movable, state)) {
        actions.push(`fortified T${bestTarget.id} with ${movable} dice from T${t.id}`);
        continue;
      }
    }

    // No valid target — discard so it doesn't sit forever
    t.powerUp = undefined;
    actions.push(`discarded fortify on T${t.id} (no valid target)`);
  }

  return actions;
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

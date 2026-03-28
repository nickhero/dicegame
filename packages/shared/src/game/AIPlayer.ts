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
import { GameAction } from './GameRecorder';
import { wouldBreakAlliance, aiWouldBreakAlliance, breakAlliance } from './Alliance';

export interface AIMove {
  attackerId: number;
  defenderId: number;
  advantage: number; // effective advantage accounting for power-ups
}

export interface PowerUpResult {
  description: string;
  action: GameAction | null; // null for discards
}

const CHARGE_EXTRA_DICE = 2;
const SHIELD_DEFENSE_BONUS = 3;

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
  if (attackerPowerUp === 'charge') adv += CHARGE_EXTRA_DICE;
  if (defenderPowerUp === 'shield') adv -= SHIELD_DEFENSE_BONUS;
  return adv;
}

/**
 * Find all possible attacks for the current AI player.
 * When visibleSet is provided, only attacks against visible territories are considered.
 * Advantage accounts for charge/shield power-ups.
 * Filters out attacks on allied players unless AI personality allows breaking.
 */
export function findPossibleMoves(state: GameState, visibleSet?: Set<number>): AIMove[] {
  const playerId = state.currentPlayerIndex;
  const player = state.players[playerId];
  const moves: AIMove[] = [];

  for (const territory of state.territories) {
    if (territory.owner !== playerId) continue;
    if (!canAttackFrom(territory.id, state)) continue;

    for (const neighborId of territory.neighbors) {
      const neighbor = state.territories[neighborId];
      if (neighbor.owner === playerId) continue;
      if (visibleSet && !visibleSet.has(neighborId)) continue;

      // Skip allied targets unless AI would break the alliance
      if (state.allianceState && wouldBreakAlliance(state.allianceState, playerId, neighbor.owner)) {
        const personality = player.personality ?? 'balanced';
        if (!aiWouldBreakAlliance(state.allianceState, state, playerId, personality)) {
          continue;
        }
      }

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
export function useAIPowerUps(state: GameState): PowerUpResult[] {
  const playerId = state.currentPlayerIndex;
  const results: PowerUpResult[] = [];

  // Use all Reinforce power-ups first (free +2 dice)
  for (const t of state.territories) {
    if (t.owner !== playerId || t.powerUp !== 'reinforce') continue;
    if (t.dice >= MAX_DICE_PER_TERRITORY) {
      // Already at max — discard so it doesn't sit forever
      t.powerUp = undefined;
      results.push({ description: `discarded reinforce on T${t.id} (already at max dice)`, action: null });
      continue;
    }
    const before = t.dice;
    if (useReinforce(t.id, state)) {
      results.push({
        description: `reinforced T${t.id} (${before}→${t.dice} dice)`,
        action: { type: 'reinforce', territoryId: t.id, playerId },
      });
    }
  }

  // Use Fortify: move dice to adjacent owned territories
  for (const t of state.territories) {
    if (t.owner !== playerId || t.powerUp !== 'fortify') continue;

    // If territory only has 1 die, can't move any — discard the power-up
    if (t.dice <= 1) {
      t.powerUp = undefined;
      results.push({ description: `discarded fortify on T${t.id} (only 1 die)`, action: null });
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
        results.push({
          description: `fortified T${bestTarget.id} with ${movable} dice from T${t.id}`,
          action: { type: 'fortify', fromId: t.id, toId: bestTarget.id, diceCount: movable, playerId },
        });
        continue;
      }
    }

    // No valid target — discard so it doesn't sit forever
    t.powerUp = undefined;
    results.push({ description: `discarded fortify on T${t.id} (no valid target)`, action: null });
  }

  return results;
}

/**
 * Resolve the personality config for the current AI player.
 */
function getPersonality(state: GameState): AIPersonality {
  const player = state.players[state.currentPlayerIndex];
  if (player.customPersonalityConfig) {
    return player.customPersonalityConfig;
  }
  const type: PersonalityType = player.personality ?? 'balanced';
  return PERSONALITIES[type] ?? PERSONALITIES.balanced;
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
 * Returns list of battle results for animation plus any alliance-breaking actions.
 */
export function executeAITurn(
  state: GameState,
  rng: SeededRandom,
  personalityOverride?: AIPersonality,
  visibleSet?: Set<number>,
): { attackerId: number; defenderId: number; allianceBroken?: { breakerId: number; otherId: number } }[] {
  const personality = personalityOverride ?? getPersonality(state);
  const attacks: { attackerId: number; defenderId: number; allianceBroken?: { breakerId: number; otherId: number } }[] = [];
  let safety = 0;

  while (safety < 50 && attacks.length < personality.maxAttacksPerTurn) {
    safety++;
    const move = selectBestMove(state, rng, personality, visibleSet);
    if (!move) break;

    if (!isValidAttack(move.attackerId, move.defenderId, state)) break;

    const defenderOwner = state.territories[move.defenderId].owner;
    let allianceBroken: { breakerId: number; otherId: number } | undefined;

    // Check if this attack breaks an alliance
    if (state.allianceState && wouldBreakAlliance(state.allianceState, state.currentPlayerIndex, defenderOwner)) {
      breakAlliance(state.allianceState, state.currentPlayerIndex, defenderOwner);
      allianceBroken = { breakerId: state.currentPlayerIndex, otherId: defenderOwner };
    }

    attacks.push({
      attackerId: move.attackerId,
      defenderId: move.defenderId,
      allianceBroken,
    });

    executeAttack(move.attackerId, move.defenderId, state, rng);

    if (state.phase === 'gameOver') break;
  }

  return attacks;
}

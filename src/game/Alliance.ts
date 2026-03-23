// Alliance system — pure TypeScript, no Phaser imports.
// Temporary non-aggression pacts between players with diplomatic reputation.

import { GameState } from './GameState';
import { SeededRandom } from '../utils/random';
import { PersonalityType } from './AIPersonality';

export interface Alliance {
  player1: number;
  player2: number;
  createdTurn: number;
  duration: number; // turns remaining
}

export interface AllianceProposal {
  fromPlayer: number;
  toPlayer: number;
  duration: number;
}

export interface AllianceState {
  alliances: Alliance[];
  proposals: AllianceProposal[];
  /** Reputation per player — 0-100, starts at 50. Breaking pacts reduces it. */
  reputation: Map<number, number>;
  /** Track which player pairs had alliances broken (for AI trust) */
  betrayals: Map<string, number>; // "p1-p2" -> count
}

const DEFAULT_ALLIANCE_DURATION = 5;
const MIN_REPUTATION_FOR_PROPOSAL = 20;
const BETRAYAL_REPUTATION_PENALTY = 25;
const ALLIANCE_EXPIRE_REPUTATION_BONUS = 5;

export function createAllianceState(playerCount: number): AllianceState {
  const reputation = new Map<number, number>();
  for (let i = 0; i < playerCount; i++) {
    reputation.set(i, 50);
  }
  return {
    alliances: [],
    proposals: [],
    reputation,
    betrayals: new Map(),
  };
}

function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

/** Check if two players are currently allied */
export function areAllied(state: AllianceState, p1: number, p2: number): boolean {
  return state.alliances.some(
    a => (a.player1 === p1 && a.player2 === p2) ||
         (a.player1 === p2 && a.player2 === p1)
  );
}

/** Get all allies of a player */
export function getAllies(state: AllianceState, playerId: number): number[] {
  const allies: number[] = [];
  for (const a of state.alliances) {
    if (a.player1 === playerId) allies.push(a.player2);
    if (a.player2 === playerId) allies.push(a.player1);
  }
  return allies;
}

/** Check if an attack violates an alliance */
export function wouldBreakAlliance(
  state: AllianceState,
  attackerPlayerId: number,
  defenderPlayerId: number,
): boolean {
  return areAllied(state, attackerPlayerId, defenderPlayerId);
}

/** Form an alliance between two players */
export function formAlliance(
  state: AllianceState,
  p1: number,
  p2: number,
  turnNumber: number,
  duration: number = DEFAULT_ALLIANCE_DURATION,
): Alliance {
  // Remove any existing alliance between these two
  state.alliances = state.alliances.filter(
    a => !((a.player1 === p1 && a.player2 === p2) ||
           (a.player1 === p2 && a.player2 === p1))
  );

  const alliance: Alliance = {
    player1: Math.min(p1, p2),
    player2: Math.max(p1, p2),
    createdTurn: turnNumber,
    duration,
  };
  state.alliances.push(alliance);
  return alliance;
}

/** Break an alliance (betrayal) */
export function breakAlliance(
  state: AllianceState,
  breakerId: number,
  otherId: number,
): void {
  state.alliances = state.alliances.filter(
    a => !((a.player1 === breakerId && a.player2 === otherId) ||
           (a.player1 === otherId && a.player2 === breakerId))
  );

  // Reputation penalty for the breaker
  const rep = state.reputation.get(breakerId) ?? 50;
  state.reputation.set(breakerId, Math.max(0, rep - BETRAYAL_REPUTATION_PENALTY));

  // Track betrayal
  const key = pairKey(breakerId, otherId);
  state.betrayals.set(key, (state.betrayals.get(key) ?? 0) + 1);
}

export interface AllianceTickResult {
  expired: Alliance[];
  newProposals: AllianceProposal[];
}

/** Process alliance tick at end of round — expire old alliances, generate AI proposals */
export function tickAlliances(
  allianceState: AllianceState,
  gameState: GameState,
  rng: SeededRandom,
): AllianceTickResult {
  const result: AllianceTickResult = { expired: [], newProposals: [] };

  // Defensive cleanup: remove alliances involving dead players
  allianceState.alliances = allianceState.alliances.filter(
    a => gameState.players[a.player1]?.isAlive && gameState.players[a.player2]?.isAlive
  );

  // Tick duration and expire
  const remaining: Alliance[] = [];
  for (const a of allianceState.alliances) {
    a.duration--;
    if (a.duration <= 0) {
      result.expired.push(a);
      // Small reputation bonus for honoring pact
      for (const pid of [a.player1, a.player2]) {
        const rep = allianceState.reputation.get(pid) ?? 50;
        allianceState.reputation.set(pid, Math.min(100, rep + ALLIANCE_EXPIRE_REPUTATION_BONUS));
      }
    } else {
      remaining.push(a);
    }
  }
  allianceState.alliances = remaining;

  // Clear expired proposals
  allianceState.proposals = [];

  // AI proposal generation
  for (const player of gameState.players) {
    if (player.isHuman || !player.isAlive || !player.personality) continue;

    const proposal = generateAIProposal(allianceState, gameState, player.id, player.personality, rng);
    if (proposal) {
      allianceState.proposals.push(proposal);
      result.newProposals.push(proposal);
    }
  }

  return result;
}

/** AI decides whether to propose an alliance */
export function generateAIProposal(
  allianceState: AllianceState,
  gameState: GameState,
  playerId: number,
  personality: PersonalityType,
  rng: SeededRandom,
): AllianceProposal | null {
  const player = gameState.players[playerId];
  if (!player || !player.isAlive) return null;

  // Already has an alliance? Less likely to form another
  const currentAllies = getAllies(allianceState, playerId);
  if (currentAllies.length >= 1) return null;

  // Personality affects willingness
  const willingness = getAllianceWillingness(personality);
  if (rng.next() > willingness) return null;

  // Find best alliance target — prefer weaker neighbors or shared threats
  const myTerritories = gameState.territories.filter(t => t.owner === playerId).length;
  let bestTarget: number | null = null;
  let bestScore = -Infinity;

  for (const other of gameState.players) {
    if (other.id === playerId || !other.isAlive || other.isHuman) continue; // don't propose to dead, self, or human (handled below)
    if (areAllied(allianceState, playerId, other.id)) continue;

    // Check reputation — won't ally with known betrayers
    const otherRep = allianceState.reputation.get(other.id) ?? 50;
    if (otherRep < MIN_REPUTATION_FOR_PROPOSAL) continue;

    // Check betrayal history between these two
    const betrayalCount = allianceState.betrayals.get(pairKey(playerId, other.id)) ?? 0;
    if (betrayalCount >= 2) continue;

    const otherTerritories = gameState.territories.filter(t => t.owner === other.id).length;
    // Prefer allying with players of similar strength
    const strengthDiff = Math.abs(myTerritories - otherTerritories);
    let score = 10 - strengthDiff;

    // Cautious/turtle prefer alliances more
    if (personality === 'cautious' || personality === 'turtle') score += 3;
    // Reckless doesn't care as much
    if (personality === 'reckless') score -= 3;

    // Penalize for past betrayals
    score -= betrayalCount * 5;

    if (score > bestScore) {
      bestScore = score;
      bestTarget = other.id;
    }
  }

  // Also consider proposing to human (player 0)
  if (playerId !== 0 && gameState.players[0]?.isHuman) {
    if (bestTarget === null || rng.next() < 0.3) {
      const human = gameState.players[0];
      if (human.isAlive && !areAllied(allianceState, playerId, 0)) {
        const humanRep = allianceState.reputation.get(0) ?? 50;
        if (humanRep >= MIN_REPUTATION_FOR_PROPOSAL) {
          bestTarget = 0;
        }
      }
    }
  }

  if (bestTarget === null || bestTarget === playerId) return null;

  return {
    fromPlayer: playerId,
    toPlayer: bestTarget,
    duration: DEFAULT_ALLIANCE_DURATION,
  };
}

/** AI decides whether to accept a proposal */
export function aiWouldAcceptProposal(
  allianceState: AllianceState,
  gameState: GameState,
  proposal: AllianceProposal,
): boolean {
  const player = gameState.players[proposal.toPlayer];
  if (!player || !player.isAlive || !player.personality) return false;

  // Check proposer reputation
  const proposerRep = allianceState.reputation.get(proposal.fromPlayer) ?? 50;
  if (proposerRep < MIN_REPUTATION_FOR_PROPOSAL) return false;

  // Already has an ally
  const currentAllies = getAllies(allianceState, proposal.toPlayer);
  if (currentAllies.length >= 1) return false;

  // Personality-based acceptance
  const willingness = getAllianceWillingness(player.personality);
  // Deterministic for now — accept if willingness > 0.3
  return willingness > 0.3;
}

/** AI decides whether to break an existing alliance to attack */
export function aiWouldBreakAlliance(
  allianceState: AllianceState,
  gameState: GameState,
  attackerId: number,
  personality: PersonalityType,
): boolean {
  // Only reckless and aggressive AI would break alliances
  if (personality === 'reckless') return true;
  if (personality === 'aggressive') {
    // Aggressive breaks if they're dominant (>40% of territories)
    const myTerritories = gameState.territories.filter(t => t.owner === attackerId).length;
    return myTerritories > gameState.territories.length * 0.4;
  }
  return false;
}

/** Remove all alliances and proposals involving a dead player. Preserves reputation and betrayal history. */
export function cleanupDeadPlayerAlliances(allianceState: AllianceState, playerId: number): void {
  allianceState.alliances = allianceState.alliances.filter(
    a => a.player1 !== playerId && a.player2 !== playerId
  );
  allianceState.proposals = allianceState.proposals.filter(
    p => p.fromPlayer !== playerId && p.toPlayer !== playerId
  );
}

function getAllianceWillingness(personality: PersonalityType): number {
  switch (personality) {
    case 'cautious': return 0.7;
    case 'balanced': return 0.4;
    case 'aggressive': return 0.2;
    case 'reckless': return 0.1;
    case 'expansionist': return 0.5;
    case 'turtle': return 0.8;
  }
}

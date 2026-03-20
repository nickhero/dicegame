import { Territory } from './Territory';
import { Player } from './Player';

export interface BattleResult {
  attackerRolls: number[];
  defenderRolls: number[];
  attackerTotal: number;
  defenderTotal: number;
  attackerWins: boolean;
}

export interface GameState {
  territories: Territory[];
  players: Player[];
  adjacency: Map<number, Set<number>>;
  currentPlayerIndex: number;
  turnNumber: number;
  phase: 'waiting' | 'selectingAttacker' | 'selectingDefender' | 'battle' | 'distributing' | 'gameOver';
  selectedTerritoryId: number | null;
  lastBattle: BattleResult | null;
  winner: number | null; // player id of winner
  /** Per-player count of consecutive turns in a desperate state (≤2 territories, no good attacks). */
  consecutiveDesperate: Map<number, number>;
  powerUpsEnabled?: boolean;
}

export function createInitialGameState(
  territories: Territory[],
  players: Player[],
  adjacency: Map<number, Set<number>>
): GameState {
  const consecutiveDesperate = new Map<number, number>();
  for (const p of players) {
    consecutiveDesperate.set(p.id, 0);
  }

  return {
    territories,
    players,
    adjacency,
    currentPlayerIndex: 0,
    turnNumber: 1,
    phase: 'selectingAttacker',
    selectedTerritoryId: null,
    lastBattle: null,
    winner: null,
    consecutiveDesperate,
  };
}

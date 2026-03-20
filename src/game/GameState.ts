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
}

export function createInitialGameState(
  territories: Territory[],
  players: Player[],
  adjacency: Map<number, Set<number>>
): GameState {
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
  };
}

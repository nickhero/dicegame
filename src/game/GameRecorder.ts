// Unified game recording — pure TypeScript, no Phaser imports.

import { Territory, Point } from './Territory';
import { Player } from './Player';
import { BattleResult } from './GameState';
import { PowerUpType } from './PowerUps';
import { PersonalityType } from './AIPersonality';

// ── Serializable initial state (for replay) ─────────────────

export interface SerializedTerritory {
  id: number;
  cells: Point[];
  center: Point;
  neighbors: number[];
  owner: number;
  dice: number;
  gridType?: 'square' | 'hex';
  powerUp?: PowerUpType;
}

export interface SerializedPlayer {
  id: number;
  name: string;
  isHuman: boolean;
  color: number;
  personality: PersonalityType | null;
}

export interface SerializedGameState {
  territories: SerializedTerritory[];
  players: SerializedPlayer[];
  adjacency: [number, number[]][];  // serialized Map
  powerUpsEnabled: boolean;
}

// ── Actions ─────────────────────────────────────────────────

export type GameAction =
  | { type: 'attack'; attackerId: number; defenderId: number; attackerPlayerId: number; defenderPlayerId: number; result: BattleResult }
  | { type: 'endTurn'; playerId: number; bonusDice: number }
  | { type: 'surrender'; playerId: number }
  | { type: 'elimination'; playerId: number; eliminatedBy: number }
  | { type: 'fortify'; fromId: number; toId: number; diceCount: number; playerId: number }
  | { type: 'reinforce'; territoryId: number; playerId: number }
  | { type: 'powerUpSpawn'; territoryId: number; powerUpType: PowerUpType; ownerId: number };

export interface TurnRecord {
  turnNumber: number;
  playerId: number;
  actions: GameAction[];
}

// ── Full recording ──────────────────────────────────────────

export interface GameRecording {
  initialState: SerializedGameState;
  turns: TurnRecord[];
  date: string;  // ISO string
  winnerId: number | null;
  winnerName: string;
  turnCount: number;
}

// ── Serialization helpers ───────────────────────────────────

export function serializeGameState(
  territories: Territory[],
  players: Player[],
  adjacency: Map<number, Set<number>>,
  powerUpsEnabled: boolean,
): SerializedGameState {
  return {
    territories: territories.map(t => ({
      id: t.id,
      cells: t.cells.map(c => ({ x: c.x, y: c.y })),
      center: { x: t.center.x, y: t.center.y },
      neighbors: [...t.neighbors],
      owner: t.owner,
      dice: t.dice,
      gridType: t.gridType,
      powerUp: t.powerUp,
    })),
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      isHuman: p.isHuman,
      color: p.color,
      personality: p.personality,
    })),
    adjacency: Array.from(adjacency.entries()).map(
      ([k, v]) => [k, Array.from(v)] as [number, number[]]
    ),
    powerUpsEnabled,
  };
}

export function deserializeAdjacency(data: [number, number[]][]): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  for (const [k, v] of data) {
    map.set(k, new Set(v));
  }
  return map;
}

// ── Recorder class ──────────────────────────────────────────

export class GameRecorder {
  private initialState: SerializedGameState | null = null;
  private turns: TurnRecord[] = [];
  private currentTurn: TurnRecord | null = null;

  setInitialState(
    territories: Territory[],
    players: Player[],
    adjacency: Map<number, Set<number>>,
    powerUpsEnabled: boolean,
  ): void {
    this.initialState = serializeGameState(territories, players, adjacency, powerUpsEnabled);
  }

  startTurn(turnNumber: number, playerId: number): void {
    this.endCurrentTurn();
    this.currentTurn = { turnNumber, playerId, actions: [] };
  }

  recordAction(action: GameAction): void {
    if (this.currentTurn) {
      this.currentTurn.actions.push(action);
    }
  }

  endCurrentTurn(): void {
    if (this.currentTurn) {
      this.turns.push(this.currentTurn);
      this.currentTurn = null;
    }
  }

  getRecording(winnerId: number | null, winnerName: string): GameRecording {
    const turns = [...this.turns];
    if (this.currentTurn) {
      turns.push(this.currentTurn);
    }
    return {
      initialState: this.initialState!,
      turns,
      date: new Date().toISOString(),
      winnerId,
      winnerName,
      turnCount: turns.length > 0 ? turns[turns.length - 1].turnNumber : 0,
    };
  }

  clear(): void {
    this.initialState = null;
    this.turns = [];
    this.currentTurn = null;
  }
}

// Converts WireGameState (server wire format) to GameState (local rendering format).
// Renderers/UI use GameState with Point objects, Map-based adjacency, etc.

import type {
  WireGameState,
  WireTerritory,
  WirePlayer,
  WireAlliance,
} from '@dicewars/shared';
import type { GameState } from '@dicewars/shared';
import type { Territory, Point } from '@dicewars/shared';
import type { Player } from '@dicewars/shared';
import type { AllianceState, Alliance, AllianceProposal } from '@dicewars/shared';
import type { PowerUpType } from '@dicewars/shared';

function deserializeTerritory(wt: WireTerritory): Territory {
  return {
    id: wt.id,
    cells: wt.cells.map(([x, y]): Point => ({ x, y })),
    center: { x: wt.center[0], y: wt.center[1] },
    neighbors: wt.neighborIds,
    owner: wt.owner,
    dice: wt.dice,
    powerUp: wt.powerUp?.type as PowerUpType | undefined,
  };
}

function deserializePlayer(wp: WirePlayer): Player {
  return {
    id: wp.index,
    name: wp.name,
    color: wp.color,
    isHuman: !wp.isAI,
    isAlive: wp.alive,
    reserveDice: wp.reserveDice,
    personality: wp.isAI ? (wp.personality as Player['personality']) : null,
  };
}

function buildAdjacency(territories: Territory[]): Map<number, Set<number>> {
  const adj = new Map<number, Set<number>>();
  for (const t of territories) {
    adj.set(t.id, new Set(t.neighbors));
  }
  return adj;
}

function deserializeAllianceState(
  alliances: WireAlliance[],
  playerCount: number,
): AllianceState {
  const reputation = new Map<number, number>();
  for (let i = 0; i < playerCount; i++) {
    reputation.set(i, 50);
  }

  return {
    alliances: alliances.map(
      (wa): Alliance => ({
        player1: wa.player1Index,
        player2: wa.player2Index,
        createdTurn: wa.formedOnTurn,
        duration: 5, // default; exact duration not sent over wire
      }),
    ),
    proposals: [] as AllianceProposal[],
    reputation,
    betrayals: new Map<string, number>(),
  };
}

export function deserializeWireState(wire: WireGameState): GameState {
  const territories = wire.territories.map(deserializeTerritory);
  const players = wire.players.map(deserializePlayer);
  const adjacency = buildAdjacency(territories);
  const consecutiveDesperate = new Map<number, number>();
  for (const p of players) {
    consecutiveDesperate.set(p.id, 0);
  }

  const state: GameState = {
    territories,
    players,
    adjacency,
    currentPlayerIndex: wire.currentPlayerIndex,
    turnNumber: wire.turnNumber,
    phase: wire.gameOver ? 'gameOver' : wire.phase,
    selectedTerritoryId: null,
    lastBattle: null,
    winner: wire.winner,
    consecutiveDesperate,
  };

  if (wire.alliances.length > 0) {
    state.allianceState = deserializeAllianceState(wire.alliances, players.length);
  }

  // Restore power-ups from wire powerUpLocations
  for (const wp of wire.powerUpLocations) {
    const t = state.territories[wp.territoryId];
    if (t) {
      t.powerUp = wp.type as PowerUpType;
    }
  }

  state.powerUpsEnabled = wire.powerUpLocations.length > 0 ||
    territories.some((t) => t.powerUp !== undefined);

  return state;
}

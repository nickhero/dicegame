import { getVisibleTerritories } from '@dicewars/shared';
import type { Territory, Player, GameState } from '@dicewars/shared';
import type {
  WireGameState,
  WireTerritory,
  WirePlayer,
  WireAlliance,
  WirePowerUp,
} from '@dicewars/shared';
import type { ActiveGame } from './GameEngine';

function serializeTerritory(t: Territory, visible: boolean): WireTerritory {
  return {
    id: t.id,
    cells: t.cells.map((c) => [c.x, c.y] as [number, number]),
    center: [t.center.x, t.center.y],
    neighborIds: t.neighbors,
    owner: visible ? t.owner : -1,
    dice: visible ? t.dice : 0,
    visible,
    powerUp: visible && t.powerUp ? { type: t.powerUp } : null,
  };
}

function serializePlayer(
  p: Player,
  territories: Territory[],
  connected: boolean,
): WirePlayer {
  return {
    index: p.id,
    name: p.name,
    color: p.color,
    isAI: !p.isHuman,
    personality: p.isHuman ? undefined : (p.personality ?? undefined),
    alive: p.isAlive,
    territoryCount: territories.filter((t) => t.owner === p.id).length,
    reserveDice: p.reserveDice,
    connected,
  };
}

function isPlayerConnected(game: ActiveGame, playerIndex: number): boolean {
  for (const [userId, idx] of game.playerMap) {
    if (idx === playerIndex) {
      return !game.disconnectedPlayers.has(userId);
    }
  }
  // AI players are always "connected"
  return game.aiPlayerIndices.has(playerIndex);
}

function getUserIdForPlayer(game: ActiveGame, playerIndex: number): string | undefined {
  for (const [userId, idx] of game.playerMap) {
    if (idx === playerIndex) return userId;
  }
  return undefined;
}

function buildAlliances(state: GameState): WireAlliance[] {
  if (!state.allianceState) return [];
  return state.allianceState.alliances.map((a) => ({
    player1Index: a.player1,
    player2Index: a.player2,
    formedOnTurn: a.createdTurn,
  }));
}

function filterAlliancesForPlayer(
  state: GameState,
  playerIndex: number,
  alliancesEnabled: boolean,
): WireAlliance[] {
  if (!alliancesEnabled || !state.allianceState) return [];
  return state.allianceState.alliances
    .filter((a) => a.player1 === playerIndex || a.player2 === playerIndex)
    .map((a) => ({
      player1Index: a.player1,
      player2Index: a.player2,
      formedOnTurn: a.createdTurn,
    }));
}

function buildPowerUpLocations(territories: Territory[]): WirePowerUp[] {
  return territories
    .filter((t) => t.powerUp)
    .map((t) => ({ territoryId: t.id, type: t.powerUp! }));
}

/**
 * Serialize full game state without fog filtering.
 */
export function serializeFullState(game: ActiveGame): WireGameState {
  const { state } = game;
  return {
    territories: state.territories.map((t) => serializeTerritory(t, true)),
    players: state.players.map((p) =>
      serializePlayer(p, state.territories, isPlayerConnected(game, p.id)),
    ),
    currentPlayerIndex: state.currentPlayerIndex,
    turnNumber: state.turnNumber,
    phase: state.phase === 'selectingDefender' ? 'selectingDefender' : 'selectingAttacker',
    alliances: buildAlliances(state),
    powerUpLocations: buildPowerUpLocations(state.territories),
    gameOver: game.status === 'finished',
    winner: state.winner,
    turnTimerRemaining: null,
  };
}

/**
 * Filter game state for a specific player, applying fog-of-war when enabled.
 * Spectators (playerIndex === -1) and dead players see full state.
 */
export function filterStateForPlayer(
  game: ActiveGame,
  playerIndex: number,
): WireGameState {
  const { state } = game;

  // Spectators see everything
  if (playerIndex < 0) {
    return serializeFullState(game);
  }

  // Dead players spectate with full vision
  const player = state.players[playerIndex];
  if (player && !player.isAlive) {
    return serializeFullState(game);
  }

  // No fog — full state
  if (!game.config.fogOfWar) {
    return serializeFullState(game);
  }

  // Compute visibility
  const visibleSet = getVisibleTerritories(state, playerIndex);

  return {
    territories: state.territories.map((t) =>
      serializeTerritory(t, visibleSet.has(t.id)),
    ),
    players: state.players.map((p) => ({
      index: p.id,
      name: p.name,
      color: p.color,
      isAI: !p.isHuman,
      personality: p.isHuman ? undefined : (p.personality ?? undefined),
      alive: p.isAlive,
      territoryCount:
        p.id === playerIndex
          ? state.territories.filter((t) => t.owner === p.id).length
          : countVisibleTerritories(state.territories, p.id, visibleSet),
      reserveDice: p.id === playerIndex ? p.reserveDice : 0,
      connected: isPlayerConnected(game, p.id),
    })),
    currentPlayerIndex: state.currentPlayerIndex,
    turnNumber: state.turnNumber,
    phase: state.phase === 'selectingDefender' ? 'selectingDefender' : 'selectingAttacker',
    alliances: filterAlliancesForPlayer(state, playerIndex, game.config.alliances),
    powerUpLocations: state.territories
      .filter((t) => t.powerUp && visibleSet.has(t.id))
      .map((t) => ({ territoryId: t.id, type: t.powerUp! })),
    gameOver: game.status === 'finished',
    winner: state.winner,
    turnTimerRemaining: null,
  };
}

function countVisibleTerritories(
  territories: Territory[],
  ownerIndex: number,
  visibleSet: Set<number>,
): number {
  return territories.filter((t) => t.owner === ownerIndex && visibleSet.has(t.id)).length;
}

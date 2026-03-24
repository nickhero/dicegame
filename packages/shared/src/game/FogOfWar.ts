import { GameState } from './GameState';

/**
 * Get the set of territory IDs visible to a player.
 * A territory is visible if:
 * - It is owned by the player
 * - It is adjacent to any territory owned by the player
 */
export function getVisibleTerritories(state: GameState, playerId: number): Set<number> {
  const visible = new Set<number>();

  for (const territory of state.territories) {
    if (territory.owner === playerId) {
      visible.add(territory.id);
      for (const neighborId of territory.neighbors) {
        visible.add(neighborId);
      }
    }
  }

  return visible;
}

/**
 * Check if a specific territory is visible to a player.
 */
export function isVisible(state: GameState, playerId: number, territoryId: number): boolean {
  const territory = state.territories[territoryId];
  if (territory.owner === playerId) return true;

  // Check if any of the player's territories are adjacent to this one
  for (const t of state.territories) {
    if (t.owner === playerId && t.neighbors.includes(territoryId)) {
      return true;
    }
  }

  return false;
}

// Deep-clone and restore utilities for undo — pure TypeScript, no Phaser imports.

import { GameState } from './GameState';
import { AllianceState } from './Alliance';

export interface StateSnapshot {
  territories: { owner: number; dice: number; powerUp?: string }[];
  players: { id: number; isAlive: boolean; territories: number; reserveDice: number }[];
  currentPlayerIndex: number;
  turnNumber: number;
  selectedTerritoryId: number | null;
  consecutiveDesperate: [number, number][];
  powerUpsEnabled?: boolean;
  allianceState?: AllianceState;
}

export function createSnapshot(state: GameState): StateSnapshot {
  return {
    territories: state.territories.map((t) => ({
      owner: t.owner,
      dice: t.dice,
      powerUp: t.powerUp,
    })),
    players: state.players.map((p) => ({
      id: p.id,
      isAlive: p.isAlive,
      territories: state.territories.filter((t) => t.owner === p.id).length,
      reserveDice: p.reserveDice,
    })),
    currentPlayerIndex: state.currentPlayerIndex,
    turnNumber: state.turnNumber,
    selectedTerritoryId: state.selectedTerritoryId,
    consecutiveDesperate: Array.from(state.consecutiveDesperate.entries()),
    powerUpsEnabled: state.powerUpsEnabled,
    allianceState: state.allianceState ? cloneAllianceState(state.allianceState) : undefined,
  };
}

function cloneAllianceState(s: AllianceState): AllianceState {
  return {
    alliances: s.alliances.map(a => ({ ...a })),
    proposals: s.proposals.map(p => ({ ...p })),
    reputation: new Map(s.reputation),
    betrayals: new Map(s.betrayals),
  };
}

export function restoreSnapshot(state: GameState, snapshot: StateSnapshot): void {
  for (let i = 0; i < snapshot.territories.length; i++) {
    const src = snapshot.territories[i];
    const dest = state.territories[i];
    dest.owner = src.owner;
    dest.dice = src.dice;
    dest.powerUp = src.powerUp as typeof dest.powerUp;
  }

  for (const pSnap of snapshot.players) {
    const player = state.players.find((p) => p.id === pSnap.id);
    if (player) {
      player.isAlive = pSnap.isAlive;
      player.reserveDice = pSnap.reserveDice;
    }
  }

  state.currentPlayerIndex = snapshot.currentPlayerIndex;
  state.turnNumber = snapshot.turnNumber;
  state.selectedTerritoryId = snapshot.selectedTerritoryId;

  state.consecutiveDesperate.clear();
  for (const [key, value] of snapshot.consecutiveDesperate) {
    state.consecutiveDesperate.set(key, value);
  }

  state.powerUpsEnabled = snapshot.powerUpsEnabled;

  if (snapshot.allianceState) {
    state.allianceState = cloneAllianceState(snapshot.allianceState);
  } else {
    state.allianceState = undefined;
  }
}

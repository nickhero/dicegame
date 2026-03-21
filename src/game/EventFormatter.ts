// Generates human-readable event text from game actions — pure TypeScript, no Phaser imports.

import { GameAction } from './GameRecorder';

export interface FormattedEvent {
  text: string;
  color: number;
}

/**
 * Convert a GameAction into a human-readable event log entry.
 * @param action The game action
 * @param playerNames Array of player names indexed by player id
 * @param playerColors Array of player colors indexed by player id
 */
export function formatAction(
  action: GameAction,
  playerNames: string[],
  playerColors: number[],
): FormattedEvent | null {
  switch (action.type) {
    case 'attack': {
      const name = playerNames[action.attackerPlayerId] ?? '?';
      const outcome = action.result.attackerWins ? 'won' : 'lost';
      return {
        text: `${name} attacked T${action.attackerId} → T${action.defenderId} (${outcome} ${action.result.attackerTotal} vs ${action.result.defenderTotal})`,
        color: playerColors[action.attackerPlayerId] ?? 0xcccccc,
      };
    }
    case 'endTurn': {
      const name = playerNames[action.playerId] ?? '?';
      if (action.bonusDice > 0) {
        return {
          text: `${name} received ${action.bonusDice} bonus dice`,
          color: playerColors[action.playerId] ?? 0xcccccc,
        };
      }
      return null;
    }
    case 'surrender': {
      const name = playerNames[action.playerId] ?? '?';
      return {
        text: `${name} surrendered!`,
        color: 0xff4444,
      };
    }
    case 'elimination': {
      const name = playerNames[action.playerId] ?? '?';
      return {
        text: `${name} was eliminated!`,
        color: 0xff4444,
      };
    }
    case 'fortify': {
      const name = playerNames[action.playerId] ?? '?';
      return {
        text: `${name} fortified T${action.toId} with ${action.diceCount} dice from T${action.fromId}`,
        color: playerColors[action.playerId] ?? 0xcccccc,
      };
    }
    case 'reinforce': {
      const name = playerNames[action.playerId] ?? '?';
      return {
        text: `${name} used Reinforce on T${action.territoryId}`,
        color: playerColors[action.playerId] ?? 0xcccccc,
      };
    }
  }
}

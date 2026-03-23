// Generates human-readable event text from game actions — pure TypeScript, no Phaser imports.

import { GameAction, GameRecording } from './GameRecorder';

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
        text: `🏰 ${name} fortified T${action.toId} with ${action.diceCount} dice from T${action.fromId}`,
        color: playerColors[action.playerId] ?? 0xcccccc,
      };
    }
    case 'reinforce': {
      const name = playerNames[action.playerId] ?? '?';
      return {
        text: `🔄 ${name} used Reinforce on T${action.territoryId}`,
        color: playerColors[action.playerId] ?? 0xcccccc,
      };
    }
    case 'powerUpSpawn': {
      const ownerName = playerNames[action.ownerId] ?? '?';
      return {
        text: `⚡ ${action.powerUpType} spawned on T${action.territoryId} (${ownerName})`,
        color: 0xffcc00,
      };
    }
    case 'allianceFormed': {
      const name1 = playerNames[action.player1] ?? '?';
      const name2 = playerNames[action.player2] ?? '?';
      return {
        text: `🤝 ${name1} and ${name2} formed an alliance (${action.duration} turns)`,
        color: 0x44ddff,
      };
    }
    case 'allianceBroken': {
      const breakerName = playerNames[action.breakerId] ?? '?';
      const otherName = playerNames[action.otherId] ?? '?';
      return {
        text: `⚔️ ${breakerName} betrayed ${otherName}!`,
        color: 0xff6644,
      };
    }
    case 'allianceExpired': {
      const name1 = playerNames[action.player1] ?? '?';
      const name2 = playerNames[action.player2] ?? '?';
      return {
        text: `📜 Alliance between ${name1} and ${name2} expired`,
        color: 0x999999,
      };
    }
    case 'allianceProposal': {
      const from = playerNames[action.fromPlayer] ?? '?';
      const to = playerNames[action.toPlayer] ?? '?';
      return {
        text: `📨 ${from} proposed an alliance with ${to}`,
        color: 0x44ddff,
      };
    }
  }
}

/**
 * Generate a full text log from a game recording.
 */
export function generateTextLog(recording: GameRecording): string {
  const playerNames = recording.initialState.players.map((p) => p.name);
  const playerColors = recording.initialState.players.map((p) => p.color);
  const lines: string[] = [];

  lines.push('=== DiceWars Game Log ===');
  lines.push(`Date: ${recording.date}`);
  lines.push(`Players: ${playerNames.join(', ')}`);
  lines.push(`Winner: ${recording.winnerName}`);
  lines.push(`Turns: ${recording.turnCount}`);
  lines.push('');

  for (const turn of recording.turns) {
    const turnPlayerName = playerNames[turn.playerId] ?? `P${turn.playerId}`;
    lines.push(`--- Turn ${turn.turnNumber} (${turnPlayerName}) ---`);

    for (const action of turn.actions) {
      const formatted = formatAction(action, playerNames, playerColors);
      if (formatted) {
        lines.push(`  ${formatted.text}`);
      }
    }
  }

  lines.push('');
  lines.push(`=== End of Log (${recording.turnCount} turns) ===`);
  return lines.join('\n');
}

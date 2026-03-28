// Match history persistence — pure TypeScript, no Phaser imports.

import { GameRecording } from './GameRecorder';
import { GameStatsSummary } from './GameStats';
import { getStorage } from './StorageAdapter';

const STORAGE_KEY = 'dicewars_match_history';
const MAX_MATCHES = 20;

export interface MatchHistoryEntry {
  id: string;
  date: string;
  winnerName: string;
  winnerId: number | null;
  playerNames: string[];
  turnCount: number;
  totalBattles: number;
  recording: GameRecording;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function saveMatch(recording: GameRecording, stats: GameStatsSummary): MatchHistoryEntry {
  const entry: MatchHistoryEntry = {
    id: generateId(),
    date: recording.date,
    winnerName: recording.winnerName,
    winnerId: recording.winnerId,
    playerNames: recording.initialState.players.map(p => p.name),
    turnCount: recording.turnCount,
    totalBattles: stats.totalBattles,
    recording,
  };

  const history = loadHistory();
  history.unshift(entry);

  // Keep only the last MAX_MATCHES
  if (history.length > MAX_MATCHES) {
    history.length = MAX_MATCHES;
  }

  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Storage might be full — remove oldest entries and retry
    while (history.length > 5) {
      history.pop();
      try {
        getStorage().setItem(STORAGE_KEY, JSON.stringify(history));
        break;
      } catch {
        // continue removing
      }
    }
  }

  return entry;
}

export function loadHistory(): MatchHistoryEntry[] {
  try {
    const raw = getStorage().getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MatchHistoryEntry[];
  } catch {
    return [];
  }
}

export function deleteMatch(id: string): void {
  const history = loadHistory().filter(m => m.id !== id);
  getStorage().setItem(STORAGE_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  getStorage().removeItem(STORAGE_KEY);
}

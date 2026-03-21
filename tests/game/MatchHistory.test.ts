import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveMatch, loadHistory, deleteMatch, clearHistory, MatchHistoryEntry } from '../../src/game/MatchHistory';
import { GameRecording, SerializedGameState } from '../../src/game/GameRecorder';
import { GameStatsSummary } from '../../src/game/GameStats';

function makeStorage() {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  return storage;
}

function makeRecording(overrides?: Partial<GameRecording>): GameRecording {
  const initialState: SerializedGameState = {
    territories: [
      { id: 0, cells: [], center: { x: 0, y: 0 }, neighbors: [1], owner: 0, dice: 3 },
      { id: 1, cells: [], center: { x: 1, y: 0 }, neighbors: [0], owner: 1, dice: 2 },
    ],
    players: [
      { id: 0, name: 'Human', isHuman: true, color: 0x4a90d9, personality: null },
      { id: 1, name: 'Bot', isHuman: false, color: 0xd94a4a, personality: 'aggressive' },
    ],
    adjacency: [[0, [1]], [1, [0]]],
    powerUpsEnabled: false,
  };

  return {
    initialState,
    turns: [],
    date: '2025-01-01T00:00:00.000Z',
    winnerId: 0,
    winnerName: 'Human',
    turnCount: 5,
    ...overrides,
  };
}

function makeStats(overrides?: Partial<GameStatsSummary>): GameStatsSummary {
  return {
    turnCount: 5,
    totalBattles: 3,
    perPlayer: new Map(),
    territoriesOverTime: new Map(),
    biggestUpset: null,
    ...overrides,
  };
}

describe('MatchHistory', () => {
  beforeEach(() => {
    makeStorage();
  });

  it('saves a match and retrieves it from history', () => {
    const recording = makeRecording();
    const stats = makeStats();
    const entry = saveMatch(recording, stats);

    expect(entry.id).toBeTruthy();
    expect(entry.winnerName).toBe('Human');
    expect(entry.playerNames).toEqual(['Human', 'Bot']);
    expect(entry.turnCount).toBe(5);
    expect(entry.totalBattles).toBe(3);

    const history = loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(entry.id);
  });

  it('returns empty array when no history exists', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('newest matches appear first', () => {
    saveMatch(makeRecording({ winnerName: 'First' }), makeStats());
    saveMatch(makeRecording({ winnerName: 'Second' }), makeStats());

    const history = loadHistory();
    expect(history[0].winnerName).toBe('Second');
    expect(history[1].winnerName).toBe('First');
  });

  it('prunes oldest entries when exceeding MAX_MATCHES (20)', () => {
    for (let i = 0; i < 25; i++) {
      saveMatch(makeRecording({ winnerName: `Player ${i}` }), makeStats());
    }

    const history = loadHistory();
    expect(history).toHaveLength(20);
    // Most recent should be last saved
    expect(history[0].winnerName).toBe('Player 24');
  });

  it('deletes a specific match by id', () => {
    const entry1 = saveMatch(makeRecording({ winnerName: 'A' }), makeStats());
    const entry2 = saveMatch(makeRecording({ winnerName: 'B' }), makeStats());

    deleteMatch(entry1.id);

    const history = loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(entry2.id);
  });

  it('clearHistory removes all entries', () => {
    saveMatch(makeRecording(), makeStats());
    saveMatch(makeRecording(), makeStats());

    clearHistory();

    expect(loadHistory()).toEqual([]);
  });

  it('handles corrupted localStorage gracefully', () => {
    const storage = makeStorage();
    storage.set('dicewars_match_history', 'not valid json');

    expect(loadHistory()).toEqual([]);
  });
});

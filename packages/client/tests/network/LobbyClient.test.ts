import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LobbyClient, AuthExpiredError } from '../../src/network/LobbyClient';

describe('LobbyClient', () => {
  let lobbyClient: LobbyClient;
  const token = 'test-auth-token';

  beforeEach(() => {
    vi.restoreAllMocks();
    lobbyClient = new LobbyClient(token, 'http://localhost:3001');
  });

  it('fetches games and attaches authorization header', async () => {
    const mockGames = [
      {
        id: 'game-1',
        name: "Alice's Room",
        playerCount: 1,
        maxPlayers: 4,
        hasPassword: false,
        status: 'waiting',
      },
    ];

    global.fetch = vi.fn().mockImplementation((url, options) => {
      expect(options.headers.Authorization).toBe(`Bearer ${token}`);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockGames,
      });
    });

    const games = await lobbyClient.getGames();
    expect(games).toHaveLength(1);
    expect(games[0].id).toBe('game-1');
  });

  it('throws AuthExpiredError on 401 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(lobbyClient.getGames()).rejects.toThrow(AuthExpiredError);
  });

  it('creates game successfully with request payload', async () => {
    const createReq = {
      name: 'New Room',
      maxPlayers: 2,
      config: {
        playerCount: 2,
        mapShape: 'rectangle',
        gridType: 'hex',
        territoryCount: 20,
        speed: 'normal',
        powerUps: true,
        fogOfWar: false,
        alliances: true,
      },
    };

    global.fetch = vi.fn().mockImplementation((url, options) => {
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.name).toBe('New Room');
      return Promise.resolve({
        ok: true,
        status: 201,
        json: async () => ({ id: 'new-game-id', inviteCode: 'ABC-123' }),
      });
    });

    const result = await lobbyClient.createGame(createReq);
    expect(result.id).toBe('new-game-id');
    expect(result.inviteCode).toBe('ABC-123');
  });

  it('fetches user match history with pagination', async () => {
    const mockHistory = [
      {
        id: 'match-1',
        createdAt: '2026-09-25T12:00:00.000Z',
        playerCount: 4,
        turnCount: 25,
        winnerIndex: 0,
        userWon: true,
        userPlayerIndex: 0,
      },
    ];

    global.fetch = vi.fn().mockImplementation((url, options) => {
      expect(url).toContain('/api/me/history?limit=10&offset=20');
      expect(options.headers.Authorization).toBe(`Bearer ${token}`);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockHistory,
      });
    });

    const history = await lobbyClient.getMatchHistory(10, 20);
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('match-1');
    expect(history[0].userWon).toBe(true);
  });

  it('fetches match details by ID', async () => {
    const mockDetail = {
      id: 'match-1',
      roomId: 'room-1',
      recording: {},
      stats: {},
      seed: '123',
      config: {},
      winnerIndex: 0,
      turnCount: 20,
      createdAt: '2026-09-25T12:00:00.000Z',
      players: [],
    };

    global.fetch = vi.fn().mockImplementation((url) => {
      expect(url).toContain('/api/me/history/match-1');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockDetail,
      });
    });

    const detail = await lobbyClient.getMatchDetails('match-1');
    expect(detail.id).toBe('match-1');
    expect(detail.winnerIndex).toBe(0);
  });

  it('deletes a match record', async () => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      expect(url).toContain('/api/me/history/match-1');
      expect(options.method).toBe('DELETE');
      return Promise.resolve({
        ok: true,
        status: 204,
      });
    });

    await expect(lobbyClient.deleteMatch('match-1')).resolves.toBeUndefined();
  });

  it('fetches user stats', async () => {
    const mockStats = {
      totalGames: 10,
      wins: 7,
      losses: 3,
      winRate: 70,
      averageTurnCount: 22,
      longestWinStreak: 4,
    };

    global.fetch = vi.fn().mockImplementation((url) => {
      expect(url).toContain('/api/me/stats');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockStats,
      });
    });

    const stats = await lobbyClient.getUserStats();
    expect(stats.totalGames).toBe(10);
    expect(stats.winRate).toBe(70);
  });

  it('fetches leaderboard', async () => {
    const mockLeaderboard = [
      { userId: 'u1', displayName: 'Ace', wins: 50, totalGames: 60, winRate: 83 },
    ];

    global.fetch = vi.fn().mockImplementation((url) => {
      expect(url).toContain('/api/leaderboard?limit=50');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockLeaderboard,
      });
    });

    const leaderboard = await lobbyClient.getLeaderboard(50);
    expect(leaderboard).toHaveLength(1);
    expect(leaderboard[0].displayName).toBe('Ace');
  });
});

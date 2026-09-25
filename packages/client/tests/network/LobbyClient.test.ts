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
});

import type { GameRoomSummary } from '@dicewars/shared';
import type { SocketClient } from './SocketClient';

const DEFAULT_SERVER_URL = 'http://localhost:3001';

export class AuthExpiredError extends Error {
  constructor() { super('Session expired, please log in again'); }
}

export interface CreateGameRequest {
  name: string;
  maxPlayers: number;
  password?: string;
  aiSlots?: Array<{ slot: number; personality: string }>;
  config: {
    playerCount: number;
    mapShape: string;
    gridType: string;
    territoryCount: number;
    speed: string;
    powerUps: boolean;
    fogOfWar: boolean;
    alliances: boolean;
    seed?: string;
  };
}

export class LobbyClient {
  private serverUrl: string;
  private token: string;
  private lobbySocket: SocketClient | null = null;
  private gameListHandlers: Array<(games: GameRoomSummary[]) => void> = [];

  constructor(token: string, serverUrl: string = DEFAULT_SERVER_URL) {
    this.token = token;
    this.serverUrl = serverUrl;
  }

  setLobbySocket(socket: SocketClient): void {
    this.lobbySocket = socket;
  }

  updateToken(token: string): void {
    this.token = token;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
  }

  async getGames(): Promise<GameRoomSummary[]> {
    const res = await fetch(`${this.serverUrl}/api/games`, {
      headers: this.headers,
    });
    if (res.status === 401) throw new AuthExpiredError();
    if (!res.ok) throw new Error('Failed to fetch games');
    return res.json();
  }

  async getGame(gameId: string): Promise<GameRoomSummary> {
    const res = await fetch(`${this.serverUrl}/api/games/${gameId}`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error('Game not found');
    return res.json();
  }

  async createGame(request: CreateGameRequest): Promise<GameRoomSummary> {
    const res = await fetch(`${this.serverUrl}/api/games`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(request),
    });
    if (res.status === 401) throw new AuthExpiredError();
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to create game');
    }
    return res.json();
  }

  async joinGame(gameId: string, password?: string): Promise<void> {
    const res = await fetch(`${this.serverUrl}/api/games/${gameId}/join`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to join game');
    }
  }

  async leaveGame(gameId: string): Promise<void> {
    const res = await fetch(`${this.serverUrl}/api/games/${gameId}/leave`, {
      method: 'POST',
      headers: this.headers,
    });
    if (!res.ok) throw new Error('Failed to leave game');
  }

  async startGame(gameId: string): Promise<void> {
    const res = await fetch(`${this.serverUrl}/api/games/${gameId}/start`, {
      method: 'POST',
      headers: this.headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to start game');
    }
  }

  async resolveInvite(code: string): Promise<GameRoomSummary | null> {
    const res = await fetch(`${this.serverUrl}/api/games/invite/${code}`, {
      headers: this.headers,
    });
    if (!res.ok) return null;
    return res.json();
  }

  // Real-time lobby updates via WebSocket
  onGameListUpdate(handler: (games: GameRoomSummary[]) => void): () => void {
    this.gameListHandlers.push(handler);
    if (this.lobbySocket) {
      this.lobbySocket.on('lobby:gameList', handler);
    }
    return () => {
      this.gameListHandlers = this.gameListHandlers.filter((h) => h !== handler);
      if (this.lobbySocket) {
        this.lobbySocket.off('lobby:gameList', handler);
      }
    };
  }
}

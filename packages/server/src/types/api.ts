// REST API request/response types

export interface GuestLoginRequest {
  displayName: string;
}

export interface GuestLoginResponse {
  token: string;
  user: {
    id: string;
    name: string;
    isGuest: boolean;
  };
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptime: number;
  timestamp: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface CreateGameRequest {
  name: string;
  config: {
    playerCount: number;
    territoryCount: number;
    mapShape: string;
    gridType: string;
    speed: string;
    powerUps: boolean;
    fogOfWar: boolean;
    alliances: boolean;
    undoEnabled: boolean;
  };
  password?: string;
  aiSlots?: Array<{
    slot: number;
    personality: string;
  }>;
}

export interface JoinGameRequest {
  password?: string;
}

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

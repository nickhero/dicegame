const DEFAULT_SERVER_URL = 'http://localhost:3001';

interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    isGuest: boolean;
  };
}

interface RefreshResponse {
  token: string;
}

export class AuthClient {
  private serverUrl: string;
  private token: string | null = null;
  private user: AuthResponse['user'] | null = null;

  constructor(serverUrl: string = DEFAULT_SERVER_URL) {
    this.serverUrl = serverUrl;
    this.loadFromStorage();
  }

  async loginAsGuest(displayName: string): Promise<AuthResponse> {
    const res = await fetch(`${this.serverUrl}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Login failed');
    }

    const data: AuthResponse = await res.json();
    this.token = data.token;
    this.user = data.user;
    this.saveToStorage();
    return data;
  }

  async refreshToken(): Promise<string> {
    if (!this.token) throw new Error('No token to refresh');

    const res = await fetch(`${this.serverUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!res.ok) {
      throw new Error('Token refresh failed');
    }

    const data: RefreshResponse = await res.json();
    this.token = data.token;
    this.saveToStorage();
    return data.token;
  }

  getToken(): string | null {
    return this.token;
  }

  getUser(): AuthResponse['user'] | null {
    return this.user;
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }

  logout(): void {
    this.token = null;
    this.user = null;
    try {
      localStorage.removeItem('dicewars_token');
      localStorage.removeItem('dicewars_user');
    } catch {
      // localStorage not available
    }
  }

  private saveToStorage(): void {
    try {
      if (this.token) localStorage.setItem('dicewars_token', this.token);
      if (this.user) localStorage.setItem('dicewars_user', JSON.stringify(this.user));
    } catch {
      // localStorage not available
    }
  }

  private loadFromStorage(): void {
    try {
      this.token = localStorage.getItem('dicewars_token');
      const userJson = localStorage.getItem('dicewars_user');
      this.user = userJson ? JSON.parse(userJson) : null;
    } catch {
      // localStorage not available
    }
  }
}

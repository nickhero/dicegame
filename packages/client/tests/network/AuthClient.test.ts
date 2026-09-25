import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthClient } from '../../src/network/AuthClient';

describe('AuthClient', () => {
  let client: AuthClient;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    client = new AuthClient('http://localhost:3001');
  });

  it('starts without a user or token if localStorage is empty', () => {
    expect(client.isAuthenticated()).toBe(false);
    expect(client.getToken()).toBeNull();
    expect(client.getUser()).toBeNull();
  });

  it('successfully logs in as guest and saves credentials', async () => {
    const mockResponse = {
      token: 'guest-jwt-token-123',
      user: {
        id: 'usr_guest_1',
        name: 'Player 1',
        isGuest: true,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await client.loginAsGuest('Player 1');

    expect(result.token).toBe('guest-jwt-token-123');
    expect(client.isAuthenticated()).toBe(true);
    expect(client.getToken()).toBe('guest-jwt-token-123');
    expect(client.getUser()?.name).toBe('Player 1');
    expect(localStorage.getItem('dicewars_token')).toBe('guest-jwt-token-123');
  });

  it('throws on guest login error response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Username too short' } }),
    });

    await expect(client.loginAsGuest('A')).rejects.toThrow('Username too short');
    expect(client.isAuthenticated()).toBe(false);
  });

  it('clears storage and state on logout', () => {
    localStorage.setItem('dicewars_token', 'sample-token');
    localStorage.setItem('dicewars_user', JSON.stringify({ id: 'u1', name: 'User', isGuest: true }));

    const authenticatedClient = new AuthClient('http://localhost:3001');
    expect(authenticatedClient.isAuthenticated()).toBe(true);

    authenticatedClient.logout();
    expect(authenticatedClient.isAuthenticated()).toBe(false);
    expect(authenticatedClient.getToken()).toBeNull();
    expect(localStorage.getItem('dicewars_token')).toBeNull();
  });
});

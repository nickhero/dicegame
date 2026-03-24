import { describe, it, expect } from 'vitest';
import { GameErrorCode, ERROR_HTTP_STATUS } from '../../src/game/ErrorContract';

describe('ErrorContract', () => {
  const allCodes = Object.values(GameErrorCode);

  it('has no duplicate error codes', () => {
    const unique = new Set(allCodes);
    expect(unique.size).toBe(allCodes.length);
  });

  it('maps every GameErrorCode to an HTTP status', () => {
    for (const code of allCodes) {
      expect(ERROR_HTTP_STATUS[code], `missing HTTP status for ${code}`).toBeDefined();
    }
  });

  it('has no extra keys in ERROR_HTTP_STATUS beyond GameErrorCode values', () => {
    const statusKeys = Object.keys(ERROR_HTTP_STATUS);
    expect(statusKeys.sort()).toEqual([...allCodes].sort());
  });

  it('maps all HTTP statuses to valid codes (400-599)', () => {
    for (const [code, status] of Object.entries(ERROR_HTTP_STATUS)) {
      expect(status, `${code} has invalid HTTP status ${status}`).toBeGreaterThanOrEqual(400);
      expect(status, `${code} has invalid HTTP status ${status}`).toBeLessThan(600);
    }
  });

  it('maps auth errors to 401 or 400/429', () => {
    expect(ERROR_HTTP_STATUS[GameErrorCode.AUTH_REQUIRED]).toBe(401);
    expect(ERROR_HTTP_STATUS[GameErrorCode.AUTH_INVALID_TOKEN]).toBe(401);
    expect(ERROR_HTTP_STATUS[GameErrorCode.AUTH_TOKEN_EXPIRED]).toBe(401);
    expect(ERROR_HTTP_STATUS[GameErrorCode.AUTH_RATE_LIMITED]).toBe(429);
  });

  it('maps not-found errors to 404', () => {
    expect(ERROR_HTTP_STATUS[GameErrorCode.LOBBY_GAME_NOT_FOUND]).toBe(404);
    expect(ERROR_HTTP_STATUS[GameErrorCode.GAME_NOT_FOUND]).toBe(404);
    expect(ERROR_HTTP_STATUS[GameErrorCode.GAME_POWERUP_NOT_FOUND]).toBe(404);
    expect(ERROR_HTTP_STATUS[GameErrorCode.GAME_ALLIANCE_PROPOSAL_NOT_FOUND]).toBe(404);
  });

  it('maps INTERNAL_ERROR to 500', () => {
    expect(ERROR_HTTP_STATUS[GameErrorCode.INTERNAL_ERROR]).toBe(500);
  });

  it('maps RATE_LIMITED to 429', () => {
    expect(ERROR_HTTP_STATUS[GameErrorCode.RATE_LIMITED]).toBe(429);
  });
});

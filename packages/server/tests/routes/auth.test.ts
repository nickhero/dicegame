import { describe, it, expect } from 'vitest';
import { createApp } from '../../src/app';

describe('Auth endpoints', () => {
  const app = createApp();

  describe('POST /api/auth/guest', () => {
    it('creates guest user with valid name', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'TestPlayer' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeTruthy();
      expect(body.user.name).toBe('TestPlayer');
      expect(body.user.isGuest).toBe(true);
      expect(body.user.id).toMatch(/^guest_/);
    });

    it('rejects empty name', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: '' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('AUTH_INVALID_NAME');
    });

    it('rejects name too short', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'A' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects name too long', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'A'.repeat(21) }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects special characters', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: '<script>alert(1)</script>' }),
      });
      expect(res.status).toBe(400);
    });

    it('accepts name with spaces and hyphens', async () => {
      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Cool Player-1' }),
      });
      expect(res.status).toBe(200);
    });
  });
});

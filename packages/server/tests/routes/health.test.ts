import { describe, it, expect } from 'vitest';
import { createApp } from '../../src/app';

describe('Health endpoint', () => {
  const app = createApp();

  it('returns ok status', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('2.0.0');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });
});

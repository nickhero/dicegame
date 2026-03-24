import { Hono } from 'hono';

export const healthRoutes = new Hono();

const startTime = Date.now();

healthRoutes.get('/', (c) => {
  return c.json({
    status: 'ok',
    version: '2.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});

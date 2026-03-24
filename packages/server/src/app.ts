import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = new Hono();

  // Global middleware
  app.use('*', cors({ origin: config.clientOrigin }));

  // Public routes
  app.route('/api/health', healthRoutes);
  app.route('/api/auth', authRoutes);

  // Error handler
  app.onError(errorHandler);

  return app;
}

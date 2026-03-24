import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config';
import { healthRoutes } from './routes/health';
import { createAuthRoutes } from './routes/auth';
import { createLobbyRoutes } from './routes/lobby';
import { errorHandler } from './middleware/errorHandler';
import { getDb, AppDatabase } from './db/connection';

export function createApp(db?: AppDatabase) {
  const app = new Hono();
  const database = db ?? getDb();

  // Global middleware
  app.use('*', cors({ origin: config.clientOrigin }));

  // Public routes
  app.route('/api/health', healthRoutes);
  app.route('/api/auth', createAuthRoutes(database));

  // Protected routes
  app.route('/api/games', createLobbyRoutes(database));

  // Error handler
  app.onError(errorHandler);

  return app;
}

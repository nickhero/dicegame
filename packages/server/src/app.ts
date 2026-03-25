import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config';
import { healthRoutes } from './routes/health';
import { createAuthRoutes } from './routes/auth';
import { createLobbyRoutes } from './routes/lobby';
import { createHistoryRoutes } from './routes/history';
import { createStatsRoutes } from './routes/stats';
import { createPreferencesRoutes } from './routes/preferences';
import { createSpectateRoutes } from './routes/spectate';
import { errorHandler } from './middleware/errorHandler';
import { securityHeaders } from './middleware/securityHeaders';
import { getDb, AppDatabase } from './db/connection';

export function createApp(db?: AppDatabase) {
  const app = new Hono();
  const database = db ?? getDb();

  // Global middleware
  app.use('*', securityHeaders);
  app.use('*', cors({ origin: config.clientOrigin }));

  // Public routes
  app.route('/api/health', healthRoutes);
  app.route('/api/auth', createAuthRoutes(database));

  // Protected routes
  app.route('/api/games', createLobbyRoutes(database));
  app.route('/api/games', createSpectateRoutes(database));
  app.route('/api/me', createHistoryRoutes(database));
  app.route('/api', createStatsRoutes(database));
  app.route('/api', createPreferencesRoutes(database));

  // Error handler
  app.onError(errorHandler);

  return app;
}

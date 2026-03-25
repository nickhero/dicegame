import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { config } from './config';
import { healthRoutes } from './routes/health';
import { createAuthRoutes } from './routes/auth';
import { createLobbyRoutes } from './routes/lobby';
import { createHistoryRoutes } from './routes/history';
import { createStatsRoutes } from './routes/stats';
import { createPreferencesRoutes } from './routes/preferences';
import { createAIPresetRoutes } from './routes/aiPresets';
import { createSpectateRoutes } from './routes/spectate';
import { errorHandler } from './middleware/errorHandler';
import { securityHeaders } from './middleware/securityHeaders';
import { getDb, AppDatabase } from './db/connection';
import type { AppEnv } from './types/env';

export function createApp(db?: AppDatabase) {
  const app = new Hono<AppEnv>();
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
  app.route('/api/me', createAIPresetRoutes(database));

  // Production static file serving
  if (config.nodeEnv !== 'development') {
    app.use('/*', serveStatic({ root: '../../client/dist' }));

    // SPA fallback: non-API GET requests serve index.html
    app.get('*', serveStatic({ root: '../../client/dist', path: 'index.html' }));
  }

  // Error handler
  app.onError(errorHandler);

  return app;
}

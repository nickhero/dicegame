import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { UserPreferencesService } from '../services/UserPreferencesService';
import type { AppDatabase } from '../db/connection';
import type { AppEnv } from '../types/env';

export function createPreferencesRoutes(db: AppDatabase) {
  const prefs = new Hono<AppEnv>();
  const preferencesService = new UserPreferencesService(db);

  prefs.use('*', authMiddleware);

  // GET /api/me/preferences — Get user preferences
  prefs.get('/me/preferences', async (c) => {
    const user = c.get('user');
    const preferences = await preferencesService.getPreferences(user.sub);
    return c.json(preferences ?? {});
  });

  // PUT /api/me/preferences — Update user preferences
  prefs.put('/me/preferences', async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'Body must be a JSON object' } }, 400);
    }

    await preferencesService.savePreferences(user.sub, body as Record<string, unknown>);
    return c.json(body);
  });

  return prefs;
}

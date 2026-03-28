import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { AIPresetService } from '../services/AIPresetService';
import type { AppDatabase } from '../db/connection';
import type { AppEnv } from '../types/env';

export function createAIPresetRoutes(db: AppDatabase) {
  const router = new Hono<AppEnv>();
  const presetService = new AIPresetService(db);

  router.use('*', authMiddleware);

  // GET /api/me/ai-presets — List user's presets
  router.get('/ai-presets', async (c) => {
    const user = c.get('user');
    const presets = await presetService.getPresets(user.sub);
    return c.json(presets);
  });

  // POST /api/me/ai-presets — Create preset
  router.post('/ai-presets', async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'Body must be a JSON object' } }, 400);
    }

    try {
      const preset = await presetService.createPreset(user.sub, body);
      return c.json(preset, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create preset';
      return c.json({ error: { code: 'INVALID_INPUT', message } }, 400);
    }
  });

  // PUT /api/me/ai-presets/:id — Update preset
  router.put('/ai-presets/:id', async (c) => {
    const user = c.get('user');
    const presetId = c.req.param('id');
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'Body must be a JSON object' } }, 400);
    }

    try {
      await presetService.updatePreset(user.sub, presetId, body);
      return c.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update preset';
      if (message === 'Preset not found') {
        return c.json({ error: { code: 'NOT_FOUND', message } }, 404);
      }
      return c.json({ error: { code: 'INVALID_INPUT', message } }, 400);
    }
  });

  // DELETE /api/me/ai-presets/:id — Delete preset
  router.delete('/ai-presets/:id', async (c) => {
    const user = c.get('user');
    const presetId = c.req.param('id');

    try {
      await presetService.deletePreset(user.sub, presetId);
      return c.body(null, 204);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete preset';
      return c.json({ error: { code: 'NOT_FOUND', message } }, 404);
    }
  });

  return router;
}

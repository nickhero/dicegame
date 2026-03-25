import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { MatchHistoryService } from '../services/MatchHistoryService';
import { AchievementService } from '../services/AchievementService';
import type { AppDatabase } from '../db/connection';
import type { AppEnv } from '../types/env';

export function createHistoryRoutes(db: AppDatabase) {
  const history = new Hono<AppEnv>();
  const matchService = new MatchHistoryService(db);
  const achievementService = new AchievementService(db);

  history.use('*', authMiddleware);

  // GET /api/me/history — paginated match history
  history.get('/history', async (c) => {
    const user = c.get('user');
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const matches = await matchService.getUserMatches(user.sub, limit, offset);
    return c.json(matches);
  });

  // GET /api/me/history/:id — single match detail
  history.get('/history/:id', async (c) => {
    const match = await matchService.getMatchDetail(c.req.param('id'));
    if (!match) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Match not found' } }, 404);
    }
    return c.json(match);
  });

  // DELETE /api/me/history/:id — delete a match
  history.delete('/history/:id', async (c) => {
    const user = c.get('user');
    const matchId = c.req.param('id');

    const deleted = await matchService.deleteMatch(matchId, user.sub);
    if (!deleted) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Match not found' } }, 404);
    }
    return c.body(null, 204);
  });

  // GET /api/me/achievements — user's unlocked achievements
  history.get('/achievements', async (c) => {
    const user = c.get('user');
    const achievements = await achievementService.getUserAchievements(user.sub);
    return c.json(achievements);
  });

  return history;
}

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { UserStatsService } from '../services/UserStatsService';
import type { AppDatabase } from '../db/connection';
import type { AppEnv } from '../types/env';

export function createStatsRoutes(db: AppDatabase) {
  const stats = new Hono<AppEnv>();
  const statsService = new UserStatsService(db);

  stats.use('*', authMiddleware);

  // GET /api/me/stats — User's own stats
  stats.get('/me/stats', async (c) => {
    const user = c.get('user');
    const userStats = await statsService.getUserStats(user.sub);
    return c.json(userStats);
  });

  // GET /api/leaderboard — Top players
  stats.get('/leaderboard', async (c) => {
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 100, 1), 100) : 100;
    const leaderboard = await statsService.getLeaderboard(limit);
    return c.json(leaderboard);
  });

  return stats;
}

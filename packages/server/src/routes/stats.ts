import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../middleware/auth';
import { UserStatsService } from '../services/UserStatsService';
import type { AppDatabase } from '../db/connection';

export function createStatsRoutes(db: AppDatabase) {
  const stats = new Hono();
  const statsService = new UserStatsService(db);

  stats.use('*', authMiddleware);

  // GET /api/me/stats — User's own stats
  stats.get('/me/stats', async (c) => {
    const user = c.get('user') as JWTPayload;
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

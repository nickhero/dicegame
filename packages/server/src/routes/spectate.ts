import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { authMiddleware, type JWTPayload } from '../middleware/auth';
import { gameRooms, gamePlayers, users } from '../db/schema';
import type { AppDatabase } from '../db/connection';

export function createSpectateRoutes(db: AppDatabase) {
  const spectate = new Hono();
  spectate.use('*', authMiddleware);

  // POST /api/games/:id/spectate — Mark user as spectator for this game
  spectate.post('/:id/spectate', async (c) => {
    const gameId = c.req.param('id');
    const user = c.get('user') as JWTPayload;

    // Verify game exists
    const game = db
      .select()
      .from(gameRooms)
      .where(eq(gameRooms.id, gameId))
      .all();

    if (game.length === 0) {
      return c.json(
        { error: { code: 'GAME_NOT_FOUND', message: 'Game not found' } },
        404,
      );
    }

    // Check if user is already a spectator for this game
    const existing = db
      .select()
      .from(gamePlayers)
      .where(eq(gamePlayers.gameId, gameId))
      .all()
      .filter((p) => p.userId === user.sub && p.isSpectator);

    if (existing.length === 0) {
      const id = `sp_${user.sub}_${gameId}_${Date.now()}`;
      db.insert(gamePlayers)
        .values({
          id,
          gameId,
          userId: user.sub,
          slotIndex: -1,
          isAI: false,
          isSpectator: true,
          joinedAt: new Date().toISOString(),
        })
        .run();
    }

    // Get creator name
    const creator = db
      .select()
      .from(users)
      .where(eq(users.id, game[0].creatorId))
      .all();

    return c.json({
      id: game[0].id,
      name: game[0].name,
      status: game[0].status,
      creatorName: creator[0]?.displayName ?? 'Unknown',
    });
  });

  return spectate;
}

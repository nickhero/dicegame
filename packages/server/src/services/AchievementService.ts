import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { AppDatabase } from '../db/connection';
import { userAchievements } from '../db/schema';
import { ACHIEVEMENTS, GameStats } from '@dicewars/shared';
import type { AchievementContext } from '@dicewars/shared';
import type { ActiveGame } from './GameEngine';

export class AchievementService {
  constructor(private db: AppDatabase) {}

  async checkAndUnlock(userId: string, game: ActiveGame, matchId: string): Promise<string[]> {
    const playerIndex = game.playerMap.get(userId);
    if (playerIndex === undefined) return [];

    const winnerIndex = game.state.winner;
    const winnerName = winnerIndex !== null ? game.state.players[winnerIndex]?.name ?? '' : '';
    const recording = game.recorder.getRecording(winnerIndex, winnerName);
    const stats = GameStats.computeFromRecording(recording);

    const ctx: AchievementContext = {
      stats,
      recording,
      isVictory: winnerIndex === playerIndex,
      territoryCount: game.state.territories.length,
    };

    // Get already-unlocked achievements from DB
    const existing = this.db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId))
      .all();
    const existingIds = new Set(existing.map((a) => a.achievementId));

    const newlyUnlocked: string[] = [];
    const now = new Date().toISOString();

    for (const achievement of ACHIEVEMENTS) {
      if (existingIds.has(achievement.id)) continue;
      try {
        if (achievement.check(ctx)) {
          this.db
            .insert(userAchievements)
            .values({
              id: nanoid(12),
              userId,
              achievementId: achievement.id,
              unlockedAt: now,
              matchId,
            })
            .run();
          newlyUnlocked.push(achievement.id);
        }
      } catch {
        // Skip achievements that fail to evaluate
      }
    }

    return newlyUnlocked;
  }

  async getUserAchievements(userId: string): Promise<Array<{
    achievementId: string;
    unlockedAt: string;
    matchId: string | null;
  }>> {
    return this.db
      .select({
        achievementId: userAchievements.achievementId,
        unlockedAt: userAchievements.unlockedAt,
        matchId: userAchievements.matchId,
      })
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId))
      .all();
  }
}

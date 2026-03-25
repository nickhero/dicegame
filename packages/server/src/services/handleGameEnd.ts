import type { ActiveGame } from './GameEngine';
import type { AppDatabase } from '../db/connection';
import { MatchHistoryService } from './MatchHistoryService';
import { AchievementService } from './AchievementService';

/**
 * Save match to history and check achievements for each human player.
 * Shared between gameHandlers (human-triggered game end) and AITurnRunner.
 */
export async function handleGameEnd(gameId: string, game: ActiveGame, db: AppDatabase): Promise<void> {
  try {
    const matchService = new MatchHistoryService(db);
    const achievementService = new AchievementService(db);

    const matchId = await matchService.saveMatch(gameId, game);

    // Check achievements for each human player
    for (const [userId, playerIndex] of game.playerMap) {
      if (!game.aiPlayerIndices.has(playerIndex)) {
        await achievementService.checkAndUnlock(userId, game, matchId);
      }
    }
  } catch (err) {
    console.error('[GameEnd] Failed to save match or check achievements:', err);
  }
}

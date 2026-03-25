import { eq, sql, desc } from 'drizzle-orm';
import type { AppDatabase } from '../db/connection';
import { matchPlayers, matches, users } from '../db/schema';

export interface UserStats {
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  averageTurnCount: number;
  longestWinStreak: number;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  wins: number;
  totalGames: number;
  winRate: number;
}

export class UserStatsService {
  constructor(private db: AppDatabase) {}

  async getUserStats(userId: string): Promise<UserStats> {
    // Get all matches for this user, ordered chronologically
    const playerMatches = await this.db
      .select({
        isWinner: matchPlayers.isWinner,
        turnCount: matches.turnCount,
        createdAt: matches.createdAt,
      })
      .from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .where(eq(matchPlayers.userId, userId))
      .orderBy(matches.createdAt)
      .all();

    const totalGames = playerMatches.length;

    if (totalGames === 0) {
      return {
        totalGames: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        averageTurnCount: 0,
        longestWinStreak: 0,
      };
    }

    const wins = playerMatches.filter((m) => m.isWinner).length;
    const losses = totalGames - wins;
    const winRate = Math.round((wins / totalGames) * 100);

    const totalTurns = playerMatches.reduce((sum, m) => sum + (m.turnCount ?? 0), 0);
    const averageTurnCount = Math.round(totalTurns / totalGames);

    // Compute longest win streak chronologically
    let longestWinStreak = 0;
    let currentStreak = 0;
    for (const match of playerMatches) {
      if (match.isWinner) {
        currentStreak++;
        if (currentStreak > longestWinStreak) {
          longestWinStreak = currentStreak;
        }
      } else {
        currentStreak = 0;
      }
    }

    return {
      totalGames,
      wins,
      losses,
      winRate,
      averageTurnCount,
      longestWinStreak,
    };
  }

  async getLeaderboard(limit: number = 100): Promise<LeaderboardEntry[]> {
    const rows = await this.db
      .select({
        userId: matchPlayers.userId,
        displayName: users.displayName,
        wins: sql<number>`SUM(CASE WHEN ${matchPlayers.isWinner} = 1 THEN 1 ELSE 0 END)`,
        totalGames: sql<number>`COUNT(*)`,
      })
      .from(matchPlayers)
      .innerJoin(users, eq(matchPlayers.userId, users.id))
      .where(eq(matchPlayers.isAI, false))
      .groupBy(matchPlayers.userId)
      .orderBy(desc(sql`SUM(CASE WHEN ${matchPlayers.isWinner} = 1 THEN 1 ELSE 0 END)`))
      .limit(limit)
      .all();

    return rows.map((row) => ({
      userId: row.userId!,
      displayName: row.displayName,
      wins: Number(row.wins),
      totalGames: Number(row.totalGames),
      winRate: row.totalGames > 0 ? Math.round((Number(row.wins) / Number(row.totalGames)) * 100) : 0,
    }));
  }
}

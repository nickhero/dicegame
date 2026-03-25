import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { AppDatabase } from '../db/connection';
import { matches, matchPlayers, gameRooms, users } from '../db/schema';
import { GameStats } from '@dicewars/shared';
import type { ActiveGame } from './GameEngine';

export class MatchHistoryService {
  constructor(private db: AppDatabase) {}

  async saveMatch(roomId: string, game: ActiveGame): Promise<string> {
    const matchId = nanoid(12);
    const now = new Date().toISOString();

    const winnerIndex = game.state.winner;
    const winnerName = winnerIndex !== null ? game.state.players[winnerIndex]?.name ?? '' : '';
    const recording = game.recorder.getRecording(winnerIndex, winnerName);
    const stats = GameStats.computeFromRecording(recording);

    // Serialize stats (Maps → arrays of entries for JSON)
    const serializedStats = {
      turnCount: stats.turnCount,
      totalBattles: stats.totalBattles,
      perPlayer: Array.from(stats.perPlayer.entries()),
      territoriesOverTime: Array.from(stats.territoriesOverTime.entries()),
      biggestUpset: stats.biggestUpset,
    };

    this.db
      .insert(matches)
      .values({
        id: matchId,
        roomId,
        recording: recording as unknown as Record<string, unknown>,
        stats: serializedStats as unknown as Record<string, unknown>,
        seed: game.config.seed ?? null,
        config: game.config as unknown as Record<string, unknown>,
        winnerIndex: winnerIndex ?? undefined,
        turnCount: game.state.turnNumber,
        createdAt: now,
      })
      .run();

    // Insert a match_players row for EACH player
    for (const player of game.state.players) {
      const playerIndex = player.id;
      const isAI = game.aiPlayerIndices.has(playerIndex);

      // Reverse-lookup userId from playerMap
      let userId: string | undefined;
      for (const [uid, idx] of game.playerMap) {
        if (idx === playerIndex) {
          userId = uid;
          break;
        }
      }

      this.db
        .insert(matchPlayers)
        .values({
          id: nanoid(12),
          matchId,
          userId: userId ?? null,
          playerIndex,
          isAI,
          aiPersonality: isAI ? (player.personality ?? null) : null,
          isWinner: winnerIndex === playerIndex,
        })
        .run();
    }

    // Update gameRooms status to finished
    let winnerId: string | undefined;
    if (winnerIndex !== null) {
      for (const [uid, idx] of game.playerMap) {
        if (idx === winnerIndex) {
          winnerId = uid;
          break;
        }
      }
    }

    this.db
      .update(gameRooms)
      .set({
        status: 'finished',
        finishedAt: now,
        winnerId: winnerId ?? null,
      })
      .where(eq(gameRooms.id, roomId))
      .run();

    return matchId;
  }

  async getUserMatches(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<Array<{
    id: string;
    createdAt: string;
    playerCount: number;
    turnCount: number | null;
    winnerIndex: number | null;
    userWon: boolean;
    userPlayerIndex: number;
  }>> {
    // Find all matchPlayer entries for this user
    const userMatchPlayers = this.db
      .select()
      .from(matchPlayers)
      .where(eq(matchPlayers.userId, userId))
      .all();

    if (userMatchPlayers.length === 0) return [];

    const matchIds = userMatchPlayers.map((mp) => mp.matchId);
    const playerLookup = new Map(userMatchPlayers.map((mp) => [mp.matchId, mp]));

    // Get all matching matches, sorted by date desc
    const allMatches = this.db.select().from(matches).all();
    const filtered = allMatches
      .filter((m) => matchIds.includes(m.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const paginated = filtered.slice(offset, offset + limit);

    return paginated.map((m) => {
      const allPlayers = this.db
        .select()
        .from(matchPlayers)
        .where(eq(matchPlayers.matchId, m.id))
        .all();
      const userMp = playerLookup.get(m.id)!;
      return {
        id: m.id,
        createdAt: m.createdAt,
        playerCount: allPlayers.length,
        turnCount: m.turnCount,
        winnerIndex: m.winnerIndex,
        userWon: userMp.isWinner,
        userPlayerIndex: userMp.playerIndex,
      };
    });
  }

  async getMatchDetail(matchId: string): Promise<{
    id: string;
    roomId: string | null;
    recording: unknown;
    stats: unknown;
    seed: string | null;
    config: unknown;
    winnerIndex: number | null;
    turnCount: number | null;
    createdAt: string;
    players: Array<{
      userId: string | null;
      playerIndex: number;
      isAI: boolean;
      aiPersonality: string | null;
      isWinner: boolean;
      displayName: string | null;
    }>;
  } | null> {
    const matchRows = this.db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .all();

    if (matchRows.length === 0) return null;
    const match = matchRows[0];

    const players = this.db
      .select()
      .from(matchPlayers)
      .where(eq(matchPlayers.matchId, matchId))
      .all();

    const playersWithNames = players.map((p) => {
      let displayName: string | null = null;
      if (p.userId) {
        const userRows = this.db
          .select()
          .from(users)
          .where(eq(users.id, p.userId))
          .all();
        displayName = userRows[0]?.displayName ?? null;
      }
      return {
        userId: p.userId,
        playerIndex: p.playerIndex,
        isAI: p.isAI,
        aiPersonality: p.aiPersonality,
        isWinner: p.isWinner,
        displayName,
      };
    });

    return {
      id: match.id,
      roomId: match.roomId,
      recording: match.recording,
      stats: match.stats,
      seed: match.seed,
      config: match.config,
      winnerIndex: match.winnerIndex,
      turnCount: match.turnCount,
      createdAt: match.createdAt,
      players: playersWithNames,
    };
  }
}

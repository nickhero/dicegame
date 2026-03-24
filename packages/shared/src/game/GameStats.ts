import { GameState, BattleResult } from './GameState';
import { GameRecording } from './GameRecorder';

export interface PlayerStats {
  attacksInitiated: number;
  attacksWon: number;
  attacksLost: number;
  territoriesCaptured: number;
  territoriesLost: number;
  maxTerritories: number;
  longestWinStreak: number;
}

export interface GameStatsSummary {
  turnCount: number;
  totalBattles: number;
  perPlayer: Map<number, PlayerStats>;
  territoriesOverTime: Map<number, number[]>; // playerId → [count per turn]
  biggestUpset: { attackerDice: number; defenderDice: number; winnerId: number } | null;
}

function createEmptyPlayerStats(): PlayerStats {
  return {
    attacksInitiated: 0,
    attacksWon: 0,
    attacksLost: 0,
    territoriesCaptured: 0,
    territoriesLost: 0,
    maxTerritories: 0,
    longestWinStreak: 0,
  };
}

export class GameStats {
  private perPlayer = new Map<number, PlayerStats>();
  private territoriesOverTime = new Map<number, number[]>();
  private totalBattles = 0;
  private turnCount = 0;
  private biggestUpset: GameStatsSummary['biggestUpset'] = null;
  private biggestUpsetGap = 0;
  private currentStreaks = new Map<number, number>();

  recordTurnStart(state: GameState): void {
    this.turnCount = state.turnNumber;

    for (const player of state.players) {
      const id = player.id;

      if (!this.perPlayer.has(id)) {
        this.perPlayer.set(id, createEmptyPlayerStats());
      }

      const count = state.territories.filter((t) => t.owner === id).length;

      if (!this.territoriesOverTime.has(id)) {
        this.territoriesOverTime.set(id, []);
      }
      this.territoriesOverTime.get(id)!.push(count);

      const stats = this.perPlayer.get(id)!;
      if (count > stats.maxTerritories) {
        stats.maxTerritories = count;
      }
    }
  }

  recordAttack(
    attackerId: number,
    defenderId: number,
    result: BattleResult,
    state: GameState,
  ): void {
    this.totalBattles++;

    if (!this.perPlayer.has(attackerId)) {
      this.perPlayer.set(attackerId, createEmptyPlayerStats());
    }
    if (!this.perPlayer.has(defenderId)) {
      this.perPlayer.set(defenderId, createEmptyPlayerStats());
    }

    const attackerStats = this.perPlayer.get(attackerId)!;
    const defenderStats = this.perPlayer.get(defenderId)!;

    attackerStats.attacksInitiated++;

    if (result.attackerWins) {
      attackerStats.attacksWon++;
      attackerStats.territoriesCaptured++;
      defenderStats.territoriesLost++;

      // Update streak
      const streak = (this.currentStreaks.get(attackerId) ?? 0) + 1;
      this.currentStreaks.set(attackerId, streak);
      if (streak > attackerStats.longestWinStreak) {
        attackerStats.longestWinStreak = streak;
      }

      // Check for upset: attacker had fewer dice but still won
      const attackerDice = result.attackerRolls.length;
      const defenderDice = result.defenderRolls.length;
      const gap = defenderDice - attackerDice;
      if (gap > this.biggestUpsetGap) {
        this.biggestUpsetGap = gap;
        this.biggestUpset = { attackerDice, defenderDice, winnerId: attackerId };
      }
    } else {
      attackerStats.attacksLost++;
      this.currentStreaks.set(attackerId, 0);
    }

    // Update max territories for all players after the attack
    for (const player of state.players) {
      const stats = this.perPlayer.get(player.id);
      if (!stats) continue;
      const count = state.territories.filter((t) => t.owner === player.id).length;
      if (count > stats.maxTerritories) {
        stats.maxTerritories = count;
      }
    }
  }

  getSummary(): GameStatsSummary {
    return {
      turnCount: this.turnCount,
      totalBattles: this.totalBattles,
      perPlayer: new Map(this.perPlayer),
      territoriesOverTime: new Map(
        Array.from(this.territoriesOverTime.entries()).map(([k, v]) => [k, [...v]]),
      ),
      biggestUpset: this.biggestUpset,
    };
  }

  /** Compute stats from a completed recording (for match history display) */
  static computeFromRecording(recording: GameRecording): GameStatsSummary {
    const stats = new GameStats();
    // Simulate initial state to get territory counts
    const initialPlayerCounts = new Map<number, number>();
    for (const t of recording.initialState.territories) {
      initialPlayerCounts.set(t.owner, (initialPlayerCounts.get(t.owner) ?? 0) + 1);
    }

    // Initialize player stats and first territory counts
    for (const p of recording.initialState.players) {
      stats.perPlayer.set(p.id, createEmptyPlayerStats());
      const count = initialPlayerCounts.get(p.id) ?? 0;
      stats.perPlayer.get(p.id)!.maxTerritories = count;
      stats.territoriesOverTime.set(p.id, [count]);
    }

    // Track territory ownership through replay
    const ownership = recording.initialState.territories.map(t => t.owner);

    for (const turn of recording.turns) {
      for (const action of turn.actions) {
        if (action.type === 'attack') {
          stats.totalBattles++;
          const attackerStats = stats.perPlayer.get(action.attackerPlayerId)!;
          const defenderStats = stats.perPlayer.get(action.defenderPlayerId)!;

          attackerStats.attacksInitiated++;

          if (action.result.attackerWins) {
            attackerStats.attacksWon++;
            attackerStats.territoriesCaptured++;
            defenderStats.territoriesLost++;
            ownership[action.defenderId] = action.attackerPlayerId;

            // Win streak
            const streak = (stats.currentStreaks.get(action.attackerPlayerId) ?? 0) + 1;
            stats.currentStreaks.set(action.attackerPlayerId, streak);
            if (streak > attackerStats.longestWinStreak) {
              attackerStats.longestWinStreak = streak;
            }

            // Upset check
            const atkDice = action.result.attackerRolls.length;
            const defDice = action.result.defenderRolls.length;
            const gap = defDice - atkDice;
            if (gap > stats.biggestUpsetGap) {
              stats.biggestUpsetGap = gap;
              stats.biggestUpset = { attackerDice: atkDice, defenderDice: defDice, winnerId: action.attackerPlayerId };
            }
          } else {
            attackerStats.attacksLost++;
            stats.currentStreaks.set(action.attackerPlayerId, 0);
          }

          // Update max territories
          for (const p of recording.initialState.players) {
            const count = ownership.filter(o => o === p.id).length;
            const ps = stats.perPlayer.get(p.id)!;
            if (count > ps.maxTerritories) ps.maxTerritories = count;
          }
        }

        if (action.type === 'endTurn') {
          // Record territory counts at turn boundaries
          for (const p of recording.initialState.players) {
            const count = ownership.filter(o => o === p.id).length;
            stats.territoriesOverTime.get(p.id)!.push(count);
          }
        }
      }
    }

    stats.turnCount = recording.turnCount;
    return stats.getSummary();
  }
}

// Achievement system — pure TypeScript, no Phaser imports.

import { GameStatsSummary } from './GameStats';
import { GameRecording, GameAction } from './GameRecorder';
import { TERRITORY_PRESETS } from './GameConfig';
import { getStorage } from './StorageAdapter';

export interface AchievementDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  check: (ctx: AchievementContext) => boolean;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: string; // ISO date
}

export interface AchievementContext {
  stats: GameStatsSummary;
  recording: GameRecording;
  isVictory: boolean;
  territoryCount: number;
}

const STORAGE_KEY = 'dicewars_achievements';

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'flawless_victory',
    name: 'Flawless Victory',
    emoji: '💎',
    description: 'Win without losing a single battle',
    check: (ctx) => {
      if (!ctx.isVictory) return false;
      const humanStats = ctx.stats.perPlayer.get(0);
      if (!humanStats) return false;
      return humanStats.attacksLost === 0 && humanStats.attacksWon > 0;
    },
  },
  {
    id: 'david_vs_goliath',
    name: 'David vs Goliath',
    emoji: '🪨',
    description: 'Win a battle with 1-2 dice against 7-8 dice',
    check: (ctx) => {
      for (const turn of ctx.recording.turns) {
        for (const action of turn.actions) {
          if (action.type === 'attack' && action.attackerPlayerId === 0 && action.result.attackerWins) {
            const atkDice = action.result.attackerRolls.length;
            const defDice = action.result.defenderRolls.length;
            if (atkDice <= 2 && defDice >= 7) return true;
          }
        }
      }
      return false;
    },
  },
  {
    id: 'world_dominator',
    name: 'World Dominator',
    emoji: '🌍',
    description: 'Win on a Huge map (42 territories)',
    check: (ctx) => ctx.isVictory && ctx.territoryCount >= TERRITORY_PRESETS.huge,
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    emoji: '⚡',
    description: 'Win in under 10 turns',
    check: (ctx) => ctx.isVictory && ctx.stats.turnCount < 10,
  },
  {
    id: 'pacifist_start',
    name: 'Pacifist Start',
    emoji: '☮️',
    description: 'End your first turn without attacking',
    check: (ctx) => {
      // Find the first turn where player 0 acts
      for (const turn of ctx.recording.turns) {
        if (turn.playerId === 0) {
          const hasAttack = turn.actions.some(a => a.type === 'attack');
          return !hasAttack;
        }
      }
      return false;
    },
  },
  {
    id: 'comeback_king',
    name: 'Comeback King',
    emoji: '👑',
    description: 'Win after being reduced to 1 territory',
    check: (ctx) => {
      if (!ctx.isVictory) return false;
      const history = ctx.stats.territoriesOverTime.get(0);
      if (!history) return false;
      return history.some(count => count === 1);
    },
  },
  {
    id: 'full_house',
    name: 'Full House',
    emoji: '🏠',
    description: 'Hold all territories at once',
    check: (ctx) => {
      const humanStats = ctx.stats.perPlayer.get(0);
      if (!humanStats) return false;
      return humanStats.maxTerritories >= ctx.territoryCount;
    },
  },
  {
    id: 'win_streak_5',
    name: 'On a Roll',
    emoji: '🔥',
    description: 'Win 5 battles in a row in a single game',
    check: (ctx) => {
      const humanStats = ctx.stats.perPlayer.get(0);
      return (humanStats?.longestWinStreak ?? 0) >= 5;
    },
  },
  {
    id: 'underdog',
    name: 'Underdog',
    emoji: '🐕',
    description: 'Win a game with fewer starting territories than any opponent',
    check: (ctx) => {
      if (!ctx.isVictory) return false;
      const history = ctx.stats.territoriesOverTime;
      const humanStart = history.get(0)?.[0] ?? 0;
      if (humanStart === 0) return false;
      for (const [pid, counts] of history) {
        if (pid !== 0 && counts[0] <= humanStart) return false;
      }
      return true;
    },
  },
  {
    id: 'battle_hardened',
    name: 'Battle Hardened',
    emoji: '⚔️',
    description: 'Fight 50 battles in a single game',
    check: (ctx) => {
      const humanStats = ctx.stats.perPlayer.get(0);
      return (humanStats?.attacksInitiated ?? 0) >= 50;
    },
  },
  {
    id: 'first_blood',
    name: 'First Blood',
    emoji: '🗡️',
    description: 'Eliminate a player',
    check: (ctx) => {
      for (const turn of ctx.recording.turns) {
        for (const action of turn.actions) {
          if (action.type === 'elimination' && action.eliminatedBy === 0) return true;
        }
      }
      return false;
    },
  },
  {
    id: 'triple_kill',
    name: 'Triple Kill',
    emoji: '💀',
    description: 'Eliminate all 3 opponents yourself',
    check: (ctx) => {
      if (!ctx.isVictory) return false;
      let eliminations = 0;
      for (const turn of ctx.recording.turns) {
        for (const action of turn.actions) {
          if (action.type === 'elimination' && action.eliminatedBy === 0) {
            eliminations++;
          }
        }
      }
      return eliminations >= 3;
    },
  },
];

/** Check all achievements against the game context and return newly unlocked ones */
export function checkAchievements(ctx: AchievementContext): AchievementDef[] {
  const unlocked = loadUnlocked();
  const unlockedIds = new Set(unlocked.map(u => u.id));
  const newlyUnlocked: AchievementDef[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (unlockedIds.has(achievement.id)) continue;
    try {
      if (achievement.check(ctx)) {
        newlyUnlocked.push(achievement);
      }
    } catch {
      // Skip achievements that fail to evaluate
    }
  }

  return newlyUnlocked;
}

/** Persist newly unlocked achievements */
export function saveUnlocked(achievements: AchievementDef[]): void {
  const existing = loadUnlocked();
  const existingIds = new Set(existing.map(u => u.id));
  const now = new Date().toISOString();

  for (const a of achievements) {
    if (!existingIds.has(a.id)) {
      existing.push({ id: a.id, unlockedAt: now });
    }
  }

  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // Storage full — silently fail
  }
}

export function loadUnlocked(): UnlockedAchievement[] {
  try {
    const raw = getStorage().getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UnlockedAchievement[];
  } catch {
    return [];
  }
}

export function clearAchievements(): void {
  getStorage().removeItem(STORAGE_KEY);
}

/** Get full achievement info with unlock status */
export function getAchievementStatus(): { def: AchievementDef; unlocked: boolean; unlockedAt: string | null }[] {
  const unlocked = loadUnlocked();
  const unlockedMap = new Map(unlocked.map(u => [u.id, u.unlockedAt]));

  return ACHIEVEMENTS.map(def => ({
    def,
    unlocked: unlockedMap.has(def.id),
    unlockedAt: unlockedMap.get(def.id) ?? null,
  }));
}

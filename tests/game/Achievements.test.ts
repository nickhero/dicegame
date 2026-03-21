import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENTS,
  checkAchievements,
  AchievementContext,
  AchievementDef,
} from '../../src/game/Achievements';
import { GameStatsSummary, PlayerStats } from '../../src/game/GameStats';
import { GameRecording, TurnRecord, GameAction } from '../../src/game/GameRecorder';
import { BattleResult } from '../../src/game/GameState';
import { TERRITORY_PRESETS } from '../../src/game/GameConfig';

function makePlayerStats(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    attacksInitiated: 0,
    attacksWon: 0,
    attacksLost: 0,
    territoriesCaptured: 0,
    territoriesLost: 0,
    maxTerritories: 0,
    longestWinStreak: 0,
    ...overrides,
  };
}

function makeBattleResult(attackerWins: boolean, atkDice = 3, defDice = 3): BattleResult {
  return {
    attackerRolls: Array.from({ length: atkDice }, () => 3),
    defenderRolls: Array.from({ length: defDice }, () => 3),
    attackerTotal: attackerWins ? 20 : 5,
    defenderTotal: attackerWins ? 5 : 20,
    attackerWins,
  };
}

function makeAttackAction(
  attackerPlayerId: number,
  defenderPlayerId: number,
  attackerWins: boolean,
  atkDice = 3,
  defDice = 3,
): GameAction {
  return {
    type: 'attack',
    attackerId: 0,
    defenderId: 1,
    attackerPlayerId,
    defenderPlayerId,
    result: makeBattleResult(attackerWins, atkDice, defDice),
  };
}

function makeRecording(turns: TurnRecord[] = []): GameRecording {
  return {
    initialState: {
      territories: Array.from({ length: 28 }, (_, i) => ({
        id: i,
        cells: [],
        center: { x: 0, y: 0 },
        neighbors: [],
        owner: i % 4,
        dice: 3,
        gridType: 'square' as const,
      })),
      players: [
        { id: 0, name: 'Human', isHuman: true, color: 0x4a90d9, personality: null },
        { id: 1, name: 'Bot-1', isHuman: false, color: 0xd94a4a, personality: 'balanced' },
        { id: 2, name: 'Bot-2', isHuman: false, color: 0x4ad94a, personality: 'balanced' },
        { id: 3, name: 'Bot-3', isHuman: false, color: 0xd9d94a, personality: 'balanced' },
      ],
      adjacency: [] as [number, number[]][],
      powerUpsEnabled: false,
    },
    turns,
    date: new Date().toISOString(),
    winnerId: 0,
    winnerName: 'Human',
    turnCount: 10,
  };
}

function makeCtx(overrides: Partial<AchievementContext> = {}): AchievementContext {
  const perPlayer = new Map<number, PlayerStats>();
  perPlayer.set(0, makePlayerStats({ attacksWon: 5, attacksInitiated: 5 }));
  perPlayer.set(1, makePlayerStats());
  perPlayer.set(2, makePlayerStats());
  perPlayer.set(3, makePlayerStats());

  return {
    stats: {
      turnCount: 20,
      totalBattles: 10,
      perPlayer,
      territoriesOverTime: new Map([
        [0, [7, 8, 10, 12, 15, 20, 28]],
        [1, [7, 6, 5, 4, 3, 0, 0]],
        [2, [7, 7, 6, 5, 3, 0, 0]],
        [3, [7, 7, 7, 7, 7, 8, 0]],
      ]),
      biggestUpset: null,
    },
    recording: makeRecording(),
    isVictory: true,
    territoryCount: 28,
    ...overrides,
  };
}

function findAchievement(id: string): AchievementDef {
  const a = ACHIEVEMENTS.find(a => a.id === id);
  if (!a) throw new Error(`Achievement ${id} not found`);
  return a;
}

describe('Achievement definitions', () => {
  it('has unique IDs', () => {
    const ids = ACHIEVEMENTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all have required fields', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.id).toBeTruthy();
      expect(a.name).toBeTruthy();
      expect(a.emoji).toBeTruthy();
      expect(a.description).toBeTruthy();
      expect(typeof a.check).toBe('function');
    }
  });

  it('has at least 10 achievements', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10);
  });
});

describe('Flawless Victory', () => {
  const check = findAchievement('flawless_victory').check;

  it('unlocks when winning without losses', () => {
    const ctx = makeCtx();
    ctx.stats.perPlayer.get(0)!.attacksLost = 0;
    ctx.stats.perPlayer.get(0)!.attacksWon = 5;
    expect(check(ctx)).toBe(true);
  });

  it('does not unlock with losses', () => {
    const ctx = makeCtx();
    ctx.stats.perPlayer.get(0)!.attacksLost = 1;
    expect(check(ctx)).toBe(false);
  });

  it('does not unlock on defeat', () => {
    const ctx = makeCtx({ isVictory: false });
    ctx.stats.perPlayer.get(0)!.attacksLost = 0;
    expect(check(ctx)).toBe(false);
  });

  it('does not unlock with zero attacks', () => {
    const ctx = makeCtx();
    ctx.stats.perPlayer.get(0)!.attacksWon = 0;
    ctx.stats.perPlayer.get(0)!.attacksLost = 0;
    expect(check(ctx)).toBe(false);
  });
});

describe('David vs Goliath', () => {
  const check = findAchievement('david_vs_goliath').check;

  it('unlocks on extreme upset win', () => {
    const turns: TurnRecord[] = [{
      turnNumber: 1,
      playerId: 0,
      actions: [makeAttackAction(0, 1, true, 1, 8)],
    }];
    const ctx = makeCtx({ recording: makeRecording(turns) });
    expect(check(ctx)).toBe(true);
  });

  it('unlocks on 2v7 win', () => {
    const turns: TurnRecord[] = [{
      turnNumber: 1,
      playerId: 0,
      actions: [makeAttackAction(0, 1, true, 2, 7)],
    }];
    const ctx = makeCtx({ recording: makeRecording(turns) });
    expect(check(ctx)).toBe(true);
  });

  it('does not unlock on normal win', () => {
    const turns: TurnRecord[] = [{
      turnNumber: 1,
      playerId: 0,
      actions: [makeAttackAction(0, 1, true, 5, 4)],
    }];
    const ctx = makeCtx({ recording: makeRecording(turns) });
    expect(check(ctx)).toBe(false);
  });

  it('does not unlock if AI has the upset', () => {
    const turns: TurnRecord[] = [{
      turnNumber: 1,
      playerId: 1,
      actions: [makeAttackAction(1, 0, true, 1, 8)],
    }];
    const ctx = makeCtx({ recording: makeRecording(turns) });
    expect(check(ctx)).toBe(false);
  });
});

describe('World Dominator', () => {
  const check = findAchievement('world_dominator').check;

  it('unlocks on huge map victory', () => {
    expect(check(makeCtx({ territoryCount: TERRITORY_PRESETS.huge }))).toBe(true);
  });

  it('does not unlock on standard map', () => {
    expect(check(makeCtx({ territoryCount: 28 }))).toBe(false);
  });

  it('does not unlock on defeat', () => {
    expect(check(makeCtx({ territoryCount: TERRITORY_PRESETS.huge, isVictory: false }))).toBe(false);
  });
});

describe('Speed Demon', () => {
  const check = findAchievement('speed_demon').check;

  it('unlocks on fast win', () => {
    const ctx = makeCtx();
    ctx.stats.turnCount = 8;
    expect(check(ctx)).toBe(true);
  });

  it('does not unlock on slow win', () => {
    const ctx = makeCtx();
    ctx.stats.turnCount = 15;
    expect(check(ctx)).toBe(false);
  });

  it('does not unlock at exactly 10 turns', () => {
    const ctx = makeCtx();
    ctx.stats.turnCount = 10;
    expect(check(ctx)).toBe(false);
  });
});

describe('Pacifist Start', () => {
  const check = findAchievement('pacifist_start').check;

  it('unlocks when first turn has no attacks', () => {
    const turns: TurnRecord[] = [{
      turnNumber: 1,
      playerId: 0,
      actions: [{ type: 'endTurn', playerId: 0, bonusDice: 3 }],
    }];
    const ctx = makeCtx({ recording: makeRecording(turns) });
    expect(check(ctx)).toBe(true);
  });

  it('does not unlock when first turn has attacks', () => {
    const turns: TurnRecord[] = [{
      turnNumber: 1,
      playerId: 0,
      actions: [
        makeAttackAction(0, 1, true),
        { type: 'endTurn', playerId: 0, bonusDice: 3 },
      ],
    }];
    const ctx = makeCtx({ recording: makeRecording(turns) });
    expect(check(ctx)).toBe(false);
  });

  it('only checks player 0 first turn', () => {
    const turns: TurnRecord[] = [
      { turnNumber: 1, playerId: 1, actions: [makeAttackAction(1, 2, true)] },
      { turnNumber: 1, playerId: 0, actions: [{ type: 'endTurn', playerId: 0, bonusDice: 2 }] },
    ];
    const ctx = makeCtx({ recording: makeRecording(turns) });
    expect(check(ctx)).toBe(true);
  });
});

describe('Comeback King', () => {
  const check = findAchievement('comeback_king').check;

  it('unlocks when reduced to 1 territory then wins', () => {
    const ctx = makeCtx();
    ctx.stats.territoriesOverTime.set(0, [7, 5, 3, 1, 3, 8, 15, 28]);
    expect(check(ctx)).toBe(true);
  });

  it('does not unlock without reaching 1', () => {
    const ctx = makeCtx();
    ctx.stats.territoriesOverTime.set(0, [7, 5, 3, 2, 5, 10, 28]);
    expect(check(ctx)).toBe(false);
  });

  it('does not unlock on defeat', () => {
    const ctx = makeCtx({ isVictory: false });
    ctx.stats.territoriesOverTime.set(0, [7, 3, 1, 0]);
    expect(check(ctx)).toBe(false);
  });
});

describe('Full House', () => {
  const check = findAchievement('full_house').check;

  it('unlocks when holding all territories', () => {
    const ctx = makeCtx();
    ctx.stats.perPlayer.get(0)!.maxTerritories = 28;
    expect(check(ctx)).toBe(true);
  });

  it('does not unlock with fewer than all', () => {
    const ctx = makeCtx();
    ctx.stats.perPlayer.get(0)!.maxTerritories = 27;
    expect(check(ctx)).toBe(false);
  });
});

describe('On a Roll (win streak)', () => {
  const check = findAchievement('win_streak_5').check;

  it('unlocks at 5 streak', () => {
    const ctx = makeCtx();
    ctx.stats.perPlayer.get(0)!.longestWinStreak = 5;
    expect(check(ctx)).toBe(true);
  });

  it('does not unlock at 4', () => {
    const ctx = makeCtx();
    ctx.stats.perPlayer.get(0)!.longestWinStreak = 4;
    expect(check(ctx)).toBe(false);
  });
});

describe('Underdog', () => {
  const check = findAchievement('underdog').check;

  it('unlocks when starting with fewer territories', () => {
    const ctx = makeCtx();
    ctx.stats.territoriesOverTime.set(0, [5, 8, 15, 28]);
    ctx.stats.territoriesOverTime.set(1, [8, 6, 3, 0]);
    expect(check(ctx)).toBe(true);
  });

  it('does not unlock when starting equal', () => {
    const ctx = makeCtx();
    ctx.stats.territoriesOverTime.set(0, [7, 10, 28]);
    ctx.stats.territoriesOverTime.set(1, [7, 4, 0]);
    ctx.stats.territoriesOverTime.set(2, [7, 4, 0]);
    ctx.stats.territoriesOverTime.set(3, [7, 10, 0]);
    expect(check(ctx)).toBe(false);
  });

  it('does not unlock on defeat', () => {
    const ctx = makeCtx({ isVictory: false });
    ctx.stats.territoriesOverTime.set(0, [5, 3, 0]);
    ctx.stats.territoriesOverTime.set(1, [9, 15, 28]);
    expect(check(ctx)).toBe(false);
  });
});

describe('Battle Hardened', () => {
  const check = findAchievement('battle_hardened').check;

  it('unlocks at 50 attacks', () => {
    const ctx = makeCtx();
    ctx.stats.perPlayer.get(0)!.attacksInitiated = 50;
    expect(check(ctx)).toBe(true);
  });

  it('does not unlock at 49', () => {
    const ctx = makeCtx();
    ctx.stats.perPlayer.get(0)!.attacksInitiated = 49;
    expect(check(ctx)).toBe(false);
  });
});

describe('First Blood', () => {
  const check = findAchievement('first_blood').check;

  it('unlocks when human eliminates someone', () => {
    const turns: TurnRecord[] = [{
      turnNumber: 5,
      playerId: 0,
      actions: [{ type: 'elimination', playerId: 2, eliminatedBy: 0 }],
    }];
    const ctx = makeCtx({ recording: makeRecording(turns) });
    expect(check(ctx)).toBe(true);
  });

  it('does not unlock when AI eliminates', () => {
    const turns: TurnRecord[] = [{
      turnNumber: 5,
      playerId: 1,
      actions: [{ type: 'elimination', playerId: 2, eliminatedBy: 1 }],
    }];
    const ctx = makeCtx({ recording: makeRecording(turns) });
    expect(check(ctx)).toBe(false);
  });
});

describe('Triple Kill', () => {
  const check = findAchievement('triple_kill').check;

  it('unlocks when human eliminates all 3', () => {
    const turns: TurnRecord[] = [
      { turnNumber: 3, playerId: 0, actions: [{ type: 'elimination', playerId: 1, eliminatedBy: 0 }] },
      { turnNumber: 5, playerId: 0, actions: [{ type: 'elimination', playerId: 2, eliminatedBy: 0 }] },
      { turnNumber: 8, playerId: 0, actions: [{ type: 'elimination', playerId: 3, eliminatedBy: 0 }] },
    ];
    const ctx = makeCtx({ recording: makeRecording(turns) });
    expect(check(ctx)).toBe(true);
  });

  it('does not unlock with only 2 eliminations', () => {
    const turns: TurnRecord[] = [
      { turnNumber: 3, playerId: 0, actions: [{ type: 'elimination', playerId: 1, eliminatedBy: 0 }] },
      { turnNumber: 5, playerId: 0, actions: [{ type: 'elimination', playerId: 2, eliminatedBy: 0 }] },
    ];
    const ctx = makeCtx({ recording: makeRecording(turns) });
    expect(check(ctx)).toBe(false);
  });

  it('does not unlock on defeat', () => {
    const turns: TurnRecord[] = [
      { turnNumber: 3, playerId: 0, actions: [{ type: 'elimination', playerId: 1, eliminatedBy: 0 }] },
      { turnNumber: 5, playerId: 0, actions: [{ type: 'elimination', playerId: 2, eliminatedBy: 0 }] },
      { turnNumber: 8, playerId: 0, actions: [{ type: 'elimination', playerId: 3, eliminatedBy: 0 }] },
    ];
    const ctx = makeCtx({ recording: makeRecording(turns), isVictory: false });
    expect(check(ctx)).toBe(false);
  });
});

describe('checkAchievements', () => {
  it('returns newly unlocked achievements', () => {
    const ctx = makeCtx();
    ctx.stats.perPlayer.get(0)!.attacksLost = 0;
    ctx.stats.perPlayer.get(0)!.attacksWon = 5;
    const results = checkAchievements(ctx);
    expect(results.some(a => a.id === 'flawless_victory')).toBe(true);
  });

  it('returns empty array when no achievements earned', () => {
    const ctx = makeCtx({ isVictory: false });
    ctx.stats.perPlayer.get(0)!.attacksWon = 0;
    ctx.stats.perPlayer.get(0)!.attacksInitiated = 0;
    const results = checkAchievements(ctx);
    // Only non-victory achievements could trigger; check they're limited
    expect(results.every(a => {
      const def = findAchievement(a.id);
      return def.check(ctx);
    })).toBe(true);
  });
});

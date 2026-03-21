// Full game simulation tests — runs complete games using pure game logic (no Phaser).

import { describe, it, expect } from 'vitest';
import { GameState, createInitialGameState } from '../../src/game/GameState';
import { createPlayer, Player } from '../../src/game/Player';
import { generateMap, assignTerritories } from '../../src/game/MapGenerator';
import {
  isValidAttack,
  executeAttack,
  endTurn,
  shouldAISurrender,
  distributeSurrenderedTerritories,
} from '../../src/game/GameRules';
import { selectBestMove, useAIPowerUps } from '../../src/game/AIPlayer';
import { PERSONALITIES, getRandomPersonality } from '../../src/game/AIPersonality';
import { GameRecorder } from '../../src/game/GameRecorder';
import { generateTextLog } from '../../src/game/EventFormatter';
import { SeededRandom } from '../../src/utils/random';

const MAX_TURNS = 500;

interface SimResult {
  winnerId: number | null;
  turnCount: number;
  totalAttacks: number;
  eliminations: number;
  surrenders: number;
  powerUpsUsed: number;
  recording: ReturnType<GameRecorder['getRecording']>;
}

function simulateGame(seed: number, playerCount = 4, powerUps = true): SimResult {
  const rng = new SeededRandom(seed);

  const { territories, adjacency } = generateMap(20, rng);
  const players: Player[] = [];
  for (let i = 0; i < playerCount; i++) {
    const personality = getRandomPersonality(rng);
    players.push(createPlayer(i, `Bot-${i}`, false, 0xffffff, personality));
  }
  assignTerritories(territories, playerCount, rng);

  const state = createInitialGameState(territories, players, adjacency);
  state.powerUpsEnabled = powerUps;

  const recorder = new GameRecorder();
  recorder.setInitialState(territories, players, adjacency, powerUps);
  recorder.startTurn(state.turnNumber, state.currentPlayerIndex);

  let turnCount = 0;
  let totalAttacks = 0;
  let eliminations = 0;
  let surrenders = 0;
  let powerUpsUsed = 0;

  while (state.phase !== 'gameOver' && turnCount < MAX_TURNS) {
    const currentPlayer = state.players[state.currentPlayerIndex];

    if (!currentPlayer.isAlive) {
      const { spawn } = endTurn(state, rng);
      recorder.recordAction({ type: 'endTurn', playerId: currentPlayer.id, bonusDice: 0 });
      if (spawn) {
        recorder.recordAction({ type: 'powerUpSpawn', territoryId: spawn.territoryId, powerUpType: spawn.powerUpType, ownerId: spawn.ownerId });
      }
      recorder.endCurrentTurn();
      recorder.startTurn(state.turnNumber, state.currentPlayerIndex);
      continue;
    }

    // Check surrender
    if (shouldAISurrender(state, currentPlayer.id)) {
      surrenders++;
      recorder.recordAction({ type: 'surrender', playerId: currentPlayer.id });
      distributeSurrenderedTerritories(state, currentPlayer.id);
      if ((state.phase as string) === 'gameOver') break;
      recorder.recordAction({ type: 'endTurn', playerId: currentPlayer.id, bonusDice: 0 });
      const { spawn } = endTurn(state, rng);
      if (spawn) {
        recorder.recordAction({ type: 'powerUpSpawn', territoryId: spawn.territoryId, powerUpType: spawn.powerUpType, ownerId: spawn.ownerId });
      }
      recorder.endCurrentTurn();
      recorder.startTurn(state.turnNumber, state.currentPlayerIndex);
      continue;
    }

    // Use AI power-ups
    if (state.powerUpsEnabled) {
      const results = useAIPowerUps(state);
      for (const r of results) {
        if (r.action) {
          recorder.recordAction(r.action);
          powerUpsUsed++;
        }
      }
    }

    // Execute attacks
    const personality = PERSONALITIES[currentPlayer.personality ?? 'balanced'];
    const maxAttacks = Math.min(personality.maxAttacksPerTurn, 50);

    const aliveBefore = new Set(
      state.players.filter((p) => p.isAlive).map((p) => p.id),
    );

    for (let i = 0; i < maxAttacks; i++) {
      const move = selectBestMove(state, rng);
      if (!move) break;
      if (!isValidAttack(move.attackerId, move.defenderId, state)) break;

      const attackerPlayerId = state.currentPlayerIndex;
      const defenderPlayerId = state.territories[move.defenderId].owner;
      const result = executeAttack(move.attackerId, move.defenderId, state, rng);
      totalAttacks++;
      recorder.recordAction({
        type: 'attack', attackerId: move.attackerId, defenderId: move.defenderId,
        attackerPlayerId, defenderPlayerId, result,
      });

      if ((state.phase as string) === 'gameOver') break;
    }

    // Record eliminations
    for (const p of state.players) {
      if (aliveBefore.has(p.id) && !p.isAlive) {
        eliminations++;
        recorder.recordAction({
          type: 'elimination', playerId: p.id, eliminatedBy: currentPlayer.id,
        });
      }
    }

    if ((state.phase as string) === 'gameOver') break;

    // End turn
    const { spawn } = endTurn(state, rng);
    recorder.recordAction({ type: 'endTurn', playerId: currentPlayer.id, bonusDice: 0 });
    if (spawn) {
      recorder.recordAction({ type: 'powerUpSpawn', territoryId: spawn.territoryId, powerUpType: spawn.powerUpType, ownerId: spawn.ownerId });
    }
    recorder.endCurrentTurn();
    recorder.startTurn(state.turnNumber, state.currentPlayerIndex);

    turnCount++;
  }

  const alivePlayers = state.players.filter((p) => p.isAlive);
  const winnerId = alivePlayers.length === 1 ? alivePlayers[0].id : null;
  const winnerName = winnerId !== null ? state.players[winnerId].name : 'Draw';

  recorder.endCurrentTurn();
  const recording = recorder.getRecording(winnerId, winnerName);

  return { winnerId, turnCount, totalAttacks, eliminations, surrenders, powerUpsUsed, recording };
}

describe('Full game simulation', () => {
  const seeds = [42, 123, 7777, 99999, 314159];

  for (const seed of seeds) {
    it(`completes within ${MAX_TURNS} turns (seed ${seed})`, () => {
      const result = simulateGame(seed);
      expect(result.turnCount).toBeLessThan(MAX_TURNS);
    });

    it(`has exactly one winner (seed ${seed})`, () => {
      const result = simulateGame(seed);
      expect(result.winnerId).not.toBeNull();
    });

    it(`records attacks in GameRecorder (seed ${seed})`, () => {
      const result = simulateGame(seed);
      expect(result.totalAttacks).toBeGreaterThan(0);

      const attackActions = result.recording.turns
        .flatMap((t) => t.actions)
        .filter((a) => a.type === 'attack');
      expect(attackActions.length).toBe(result.totalAttacks);
    });

    it(`records eliminations matching player count minus one (seed ${seed})`, () => {
      const result = simulateGame(seed);
      const elims = result.recording.turns
        .flatMap((t) => t.actions)
        .filter((a) => a.type === 'elimination');
      // 4 players → 3 must be eliminated (some via surrender, some via combat)
      const surrenderElims = result.recording.turns
        .flatMap((t) => t.actions)
        .filter((a) => a.type === 'surrender');
      expect(elims.length + surrenderElims.length).toBe(3);
    });
  }

  it('produces valid text log from recording', () => {
    const result = simulateGame(42);
    const textLog = generateTextLog(result.recording);

    expect(textLog).toContain('=== DiceWars Game Log ===');
    expect(textLog).toContain('Winner:');
    expect(textLog).toContain('=== End of Log');
    expect(textLog).toContain('--- Turn 1');
    expect(textLog).toContain('attacked');
  });

  it('text log includes power-up actions when enabled', () => {
    // Run multiple seeds to find one with power-up usage
    let foundPowerUp = false;
    for (const seed of [42, 123, 7777, 99999, 314159, 5555, 8888]) {
      const result = simulateGame(seed, 4, true);
      if (result.powerUpsUsed > 0) {
        const textLog = generateTextLog(result.recording);
        const hasFortify = textLog.includes('fortified');
        const hasReinforce = textLog.includes('Reinforce');
        expect(hasFortify || hasReinforce).toBe(true);
        foundPowerUp = true;
        break;
      }
    }
    expect(foundPowerUp).toBe(true);
  });

  it('works with 2 players', () => {
    // 2-player games can stalemate; try a few seeds
    let completed = false;
    for (const seed of [123, 456, 789, 1234]) {
      const result = simulateGame(seed, 2);
      if (result.winnerId !== null) {
        completed = true;
        expect(result.turnCount).toBeLessThan(MAX_TURNS);
        break;
      }
    }
    expect(completed).toBe(true);
  });

  it('works with 6 players', () => {
    const result = simulateGame(42, 6);
    expect(result.winnerId).not.toBeNull();
    expect(result.turnCount).toBeLessThan(MAX_TURNS);
  });

  it('produces deterministic results with same seed', () => {
    const r1 = simulateGame(42);
    const r2 = simulateGame(42);
    expect(r1.winnerId).toBe(r2.winnerId);
    expect(r1.turnCount).toBe(r2.turnCount);
    expect(r1.totalAttacks).toBe(r2.totalAttacks);
  });

  it('produces different results with different seeds', () => {
    const r1 = simulateGame(42);
    const r2 = simulateGame(9999);
    // Extremely unlikely to match on all three
    const same = r1.winnerId === r2.winnerId
      && r1.turnCount === r2.turnCount
      && r1.totalAttacks === r2.totalAttacks;
    expect(same).toBe(false);
  });

  it('recording has valid structure', () => {
    const result = simulateGame(42);
    const rec = result.recording;

    expect(rec.initialState.players.length).toBe(4);
    expect(rec.initialState.territories.length).toBe(20);
    expect(rec.turns.length).toBeGreaterThan(0);
    expect(rec.winnerId).not.toBeNull();
    expect(rec.winnerName).toContain('Bot-');
    expect(rec.turnCount).toBeGreaterThan(0);

    // Every turn should have at least one action (endTurn)
    for (const turn of rec.turns) {
      expect(turn.actions.length).toBeGreaterThan(0);
    }
  });

  it('records power-up spawns in the recording', () => {
    // Run a few seeds to find one with spawns
    let found = false;
    for (const seed of [42, 123, 7777, 99999]) {
      const result = simulateGame(seed, 4, true);
      const spawns = result.recording.turns
        .flatMap((t) => t.actions)
        .filter((a) => a.type === 'powerUpSpawn');
      if (spawns.length > 0) {
        const spawn = spawns[0] as { type: 'powerUpSpawn'; territoryId: number; powerUpType: string; ownerId: number };
        expect(typeof spawn.territoryId).toBe('number');
        expect(typeof spawn.powerUpType).toBe('string');
        expect(typeof spawn.ownerId).toBe('number');

        // Text log should mention the spawn
        const textLog = generateTextLog(result.recording);
        expect(textLog).toContain('spawned');
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

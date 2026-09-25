import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createInitialGameState,
  createPlayer,
  PLAYER_COLORS,
  generateMap,
  assignTerritories,
  SeededRandom,
  GameRecorder,
  GameStats,
  createAllianceState,
} from '@dicewars/shared';
import { LocalGameController } from '../../src/controllers/LocalGameController';

describe('LocalGameController', () => {
  let rng: SeededRandom;
  let recorder: GameRecorder;
  let stats: GameStats;
  let onStateUpdate: ReturnType<typeof vi.fn>;
  let onBattleResult: ReturnType<typeof vi.fn>;
  let onGameOver: ReturnType<typeof vi.fn>;
  let onEventLog: ReturnType<typeof vi.fn>;

  function createController(undoEnabled = true) {
    rng = new SeededRandom(12345);
    const map = generateMap(25, rng, 'square', 'rectangle');
    assignTerritories(map.territories, 2, rng);
    const territories = map.territories;
    const players = [createPlayer(0, 'Human', PLAYER_COLORS[0], true), createPlayer(1, 'AI', PLAYER_COLORS[1], false)];
    const state = createInitialGameState(territories, players, map.adjacency);
    state.allianceState = createAllianceState(2);

    recorder = new GameRecorder(12345, 2);
    stats = new GameStats();
    onStateUpdate = vi.fn();
    onBattleResult = vi.fn();
    onGameOver = vi.fn();
    onEventLog = vi.fn();

    return new LocalGameController(
      state,
      0,
      rng,
      recorder,
      stats,
      undoEnabled,
      {
        onStateUpdate,
        onBattleResult,
        onGameOver,
        onEventLog,
      },
    );
  }

  it('initializes correctly with local state', () => {
    const ctrl = createController();
    expect(ctrl.isOnline).toBe(false);
    expect(ctrl.getLocalPlayerIndex()).toBe(0);
    expect(ctrl.getState()).toBeDefined();
    expect(ctrl.canUndo()).toBe(false);
  });

  it('performs attack and emits battle result and state update', async () => {
    const ctrl = createController();
    const state = ctrl.getState();

    // Find valid attack pair
    let fromId = -1;
    let toId = -1;
    for (const t of state.territories) {
      if (t.owner === 0 && t.dice > 1) {
        const neighbor = t.neighbors.find((nid) => state.territories[nid].owner !== 0);
        if (neighbor !== undefined) {
          fromId = t.id;
          toId = neighbor;
          break;
        }
      }
    }

    if (fromId !== -1 && toId !== -1) {
      await ctrl.attack(fromId, toId);
      expect(onBattleResult).toHaveBeenCalled();
      expect(onStateUpdate).toHaveBeenCalled();
      expect(ctrl.canUndo()).toBe(true);
    }
  });

  it('supports undo after attack', async () => {
    const ctrl = createController();
    const state = ctrl.getState();

    // Make territory 0 owner 0 with 8 dice, neighbor owner 1 with 1 die
    const t0 = state.territories[0];
    const nId = t0.neighbors[0];
    t0.owner = 0;
    t0.dice = 8;
    state.territories[nId].owner = 1;
    state.territories[nId].dice = 1;

    await ctrl.attack(t0.id, nId);
    expect(ctrl.canUndo()).toBe(true);

    const undone = await ctrl.undo();
    expect(undone).toBe(true);
    expect(onEventLog).toHaveBeenCalledWith(expect.stringContaining('Attack undone'), expect.any(Number));
    expect(ctrl.canUndo()).toBe(false);
  });

  it('handles endTurn and advances turn state', async () => {
    const ctrl = createController();
    const initialTurn = ctrl.getState().turnNumber;

    await ctrl.endTurn();
    expect(onStateUpdate).toHaveBeenCalled();
    expect(ctrl.canUndo()).toBe(false);
  });
});

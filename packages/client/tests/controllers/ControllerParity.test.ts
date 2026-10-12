import { describe, it, expect, vi } from 'vitest';
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
  type WireGameState,
} from '@dicewars/shared';
import type { IGameController, GameControllerEvents } from '../../src/controllers/GameController';
import { LocalGameController } from '../../src/controllers/LocalGameController';
import { OnlineGameController } from '../../src/controllers/OnlineGameController';
import { SocketClient } from '../../src/network/SocketClient';

describe('Controller Parity Contract', () => {
  function createLocalHarness() {
    const rng = new SeededRandom(42);
    const map = generateMap(10, rng, 'square', 'rectangle');
    assignTerritories(map.territories, 2, rng);
    const players = [
      createPlayer(0, 'Player1', true, PLAYER_COLORS[0]),
      createPlayer(1, 'Player2', false, PLAYER_COLORS[1]),
    ];
    const state = createInitialGameState(map.territories, players, map.adjacency);
    state.allianceState = createAllianceState(2);

    const recorder = new GameRecorder(42, 2);
    recorder.setInitialState(map.territories, players, map.adjacency, false);
    recorder.startTurn(1, 0);
    const stats = new GameStats();

    const events: Record<string, ReturnType<typeof vi.fn>> = {
      onStateUpdate: vi.fn(),
      onBattleResult: vi.fn(),
      onTurnChanged: vi.fn(),
      onAIAction: vi.fn(),
      onInstantBatch: vi.fn(),
      onGameOver: vi.fn(),
      onAllianceProposal: vi.fn(),
      onEventLog: vi.fn(),
      onToast: vi.fn(),
      onChat: vi.fn(),
      onError: vi.fn(),
    };

    const controller = new LocalGameController(
      state,
      0,
      rng,
      recorder,
      stats,
      true,
      events as unknown as GameControllerEvents,
    );

    return { controller, events, state };
  }

  function createOnlineHarness() {
    const eventHandlers: Record<string, (...args: any[]) => void> = {};
    const mockSocket = {
      connected: true,
      emit: vi.fn(),
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        eventHandlers[event] = handler;
      }),
      off: vi.fn((event: string) => {
        delete eventHandlers[event];
      }),
    };

    const socketClient = new SocketClient({ serverUrl: 'http://localhost:3001' });
    (socketClient as any).socket = mockSocket;
    (socketClient as any).connectionState = 'connected';

    const mockWireState: WireGameState = {
      turnNumber: 1,
      currentPlayerIndex: 0,
      phase: 'selectingAttacker',
      gameOver: false,
      winner: null,
      alliancesEnabled: true,
      powerUpsEnabled: false,
      localPlayerIndex: 0,
      players: [
        {
          index: 0,
          name: 'Player1',
          color: PLAYER_COLORS[0],
          isAI: false,
          alive: true,
          territoryCount: 1,
          diceCount: 3,
          reserveDice: 0,
          connected: true,
        },
        {
          index: 1,
          name: 'Player2',
          color: PLAYER_COLORS[1],
          isAI: true,
          alive: true,
          territoryCount: 1,
          diceCount: 2,
          reserveDice: 0,
          connected: true,
        },
      ],
      territories: [
        {
          id: 0,
          owner: 0,
          dice: 3,
          cells: [[0, 0]],
          center: [50, 50],
          neighborIds: [1],
        },
        {
          id: 1,
          owner: 1,
          dice: 2,
          cells: [[1, 0]],
          center: [100, 50],
          neighborIds: [0],
        },
      ],
      alliances: [],
      powerUpLocations: [],
    };

    const events: Record<string, ReturnType<typeof vi.fn>> = {
      onStateUpdate: vi.fn(),
      onBattleResult: vi.fn(),
      onTurnChanged: vi.fn(),
      onAIAction: vi.fn(),
      onInstantBatch: vi.fn(),
      onGameOver: vi.fn(),
      onAllianceProposal: vi.fn(),
      onEventLog: vi.fn(),
      onToast: vi.fn(),
      onChat: vi.fn(),
      onError: vi.fn(),
    };

    const controller = new OnlineGameController(
      socketClient,
      mockWireState,
      events as unknown as GameControllerEvents,
    );

    return { controller, events, socketClient, mockSocket, eventHandlers, mockWireState };
  }

  it('both controllers adhere to the IGameController interface methods', () => {
    const local = createLocalHarness().controller;
    const online = createOnlineHarness().controller;

    const requiredMethods: (keyof IGameController)[] = [
      'getState',
      'attack',
      'endTurn',
      'undo',
      'canUndo',
      'usePowerUp',
      'proposeAlliance',
      'respondAlliance',
      'surrender',
      'destroy',
    ];

    for (const method of requiredMethods) {
      expect(typeof local[method]).toBe('function');
      expect(typeof online[method]).toBe('function');
    }
  });

  describe('battle result parity', () => {
    it('emits battle result with required schema on local battle', async () => {
      const { controller, events, state } = createLocalHarness();

      let attackerId = -1;
      let defenderId = -1;
      for (const t of state.territories) {
        if (t.owner === 0 && t.dice > 1) {
          for (const nId of t.neighbors) {
            if (state.territories[nId].owner !== 0) {
              attackerId = t.id;
              defenderId = nId;
              break;
            }
          }
        }
        if (attackerId !== -1) break;
      }

      if (attackerId !== -1 && defenderId !== -1) {
        await controller.attack(attackerId, defenderId);
        expect(events.onBattleResult).toHaveBeenCalled();
        const payload = events.onBattleResult.mock.calls[0][0];
        expect(payload).toHaveProperty('attackerId', attackerId);
        expect(payload).toHaveProperty('defenderId', defenderId);
        expect(Array.isArray(payload.attackerDice)).toBe(true);
        expect(Array.isArray(payload.defenderDice)).toBe(true);
        expect(typeof payload.attackerWon).toBe('boolean');
      }
    });

    it('emits battle result with required schema on online battle event', () => {
      const { eventHandlers, events } = createOnlineHarness();

      eventHandlers['game:battleResult']?.({
        attackerTerritoryId: 0,
        defenderTerritoryId: 1,
        attackerDice: [5, 4, 3, 2],
        defenderDice: [3, 2],
        attackerWins: true,
      });

      expect(events.onBattleResult).toHaveBeenCalled();
      const payload = events.onBattleResult.mock.calls[0][0];
      expect(payload).toHaveProperty('attackerId', 0);
      expect(payload).toHaveProperty('defenderId', 1);
      expect(payload.attackerDice).toEqual([5, 4, 3, 2]);
      expect(payload.defenderDice).toEqual([3, 2]);
      expect(payload.attackerWon).toBe(true);
    });
  });

  describe('turn changed parity', () => {
    it('emits onTurnChanged when ending turn in local controller', async () => {
      const { controller, events } = createLocalHarness();

      await controller.endTurn();

      expect(events.onTurnChanged).toHaveBeenCalled();
      const data = events.onTurnChanged.mock.calls[0][0];
      expect(data).toHaveProperty('previousPlayerIndex', 0);
      expect(data).toHaveProperty('turnNumber');
      expect(data).toHaveProperty('bonusDice');
    });

    it('emits onTurnChanged when server sends game:turnChanged', () => {
      const { eventHandlers, events } = createOnlineHarness();

      eventHandlers['game:turnChanged']?.({
        previousPlayerIndex: 0,
        currentPlayerIndex: 1,
        turnNumber: 2,
        bonusDice: 3,
      });

      expect(events.onTurnChanged).toHaveBeenCalled();
      const data = events.onTurnChanged.mock.calls[0][0];
      expect(data.previousPlayerIndex).toBe(0);
      expect(data.currentPlayerIndex).toBe(1);
      expect(data.turnNumber).toBe(2);
      expect(data.bonusDice).toBe(3);
    });
  });

  describe('surrender parity', () => {
    it('surrender marks player eliminated locally and yields turn', async () => {
      const { controller, state } = createLocalHarness();

      await controller.surrender();
      expect(state.players[0].isAlive).toBe(false);
    });

    it('surrender emits socket game:surrender online', async () => {
      const { controller, socketClient } = createOnlineHarness();
      const surrenderSpy = vi.spyOn(socketClient, 'surrender').mockResolvedValue({ success: true } as any);

      await controller.surrender();
      expect(surrenderSpy).toHaveBeenCalled();
    });
  });

  describe('undo parity difference', () => {
    it('local controller can undo after an attack', async () => {
      const { controller, state } = createLocalHarness();
      expect(controller.canUndo()).toBe(false);

      let attackerId = -1;
      let defenderId = -1;
      for (const t of state.territories) {
        if (t.owner === 0 && t.dice > 1) {
          for (const nId of t.neighbors) {
            if (state.territories[nId].owner !== 0) {
              attackerId = t.id;
              defenderId = nId;
              break;
            }
          }
        }
        if (attackerId !== -1) break;
      }

      if (attackerId !== -1) {
        await controller.attack(attackerId, defenderId);
        expect(controller.canUndo()).toBe(true);
        const undoSuccess = await controller.undo();
        expect(undoSuccess).toBe(true);
      }
    });

    it('online controller always rejects undo to maintain competitive integrity', async () => {
      const { controller, socketClient } = createOnlineHarness();
      vi.spyOn(socketClient, 'undo').mockResolvedValue({ success: false, error: 'Not allowed' } as any);

      expect(controller.canUndo()).toBe(false);
      const success = await controller.undo();
      expect(success).toBe(false);
    });
  });

  describe('cleanup and destruction parity', () => {
    it('cleanly destroys both controllers without throwing', () => {
      const local = createLocalHarness().controller;
      const online = createOnlineHarness().controller;

      expect(() => local.destroy()).not.toThrow();
      expect(() => online.destroy()).not.toThrow();
    });
  });
});

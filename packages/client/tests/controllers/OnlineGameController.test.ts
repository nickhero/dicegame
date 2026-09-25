import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WireGameState } from '@dicewars/shared';
import { SocketClient } from '../../src/network/SocketClient';
import { OnlineGameController } from '../../src/controllers/OnlineGameController';

describe('OnlineGameController', () => {
  let socketClient: SocketClient;
  let onStateUpdate: ReturnType<typeof vi.fn>;
  let onBattleResult: ReturnType<typeof vi.fn>;
  let onGameOver: ReturnType<typeof vi.fn>;
  let onTurnChanged: ReturnType<typeof vi.fn>;

  const mockWireState: WireGameState = {
    turnNumber: 1,
    currentPlayerIndex: 0,
    phase: 'selectingAttacker',
    gameOver: false,
    winner: null,
    alliancesEnabled: false,
    powerUpsEnabled: false,
    localPlayerIndex: 0,
    players: [
      {
        index: 0,
        name: 'Alice',
        color: 0xe94560,
        isAI: false,
        alive: true,
        territoryCount: 1,
        diceCount: 3,
        reserveDice: 0,
        connected: true,
      },
      {
        index: 1,
        name: 'Bob',
        color: 0x0f3460,
        isAI: false,
        alive: true,
        territoryCount: 1,
        diceCount: 3,
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

  beforeEach(() => {
    socketClient = new SocketClient('http://localhost:3001');
    onStateUpdate = vi.fn();
    onBattleResult = vi.fn();
    onGameOver = vi.fn();
    onTurnChanged = vi.fn();
  });

  function createController() {
    return new OnlineGameController(
      socketClient,
      mockWireState,
      {
        onStateUpdate,
        onBattleResult,
        onGameOver,
        onTurnChanged,
      },
    );
  }

  it('initializes with deserialized wire state and player index', () => {
    const ctrl = createController();
    expect(ctrl.isOnline).toBe(true);
    expect(ctrl.getLocalPlayerIndex()).toBe(0);
    expect(ctrl.getState().players.length).toBe(2);
    expect(ctrl.getState().territories.length).toBe(2);
  });

  it('forwards attack action to socket client', async () => {
    const ctrl = createController();
    const attackSpy = vi.spyOn(socketClient, 'attack').mockResolvedValue({ success: true } as any);

    const result = await ctrl.attack(0, 1);
    expect(attackSpy).toHaveBeenCalledWith(0, 1);
    expect(result).toBe(true);
  });

  it('forwards endTurn action to socket client', async () => {
    const ctrl = createController();
    const endTurnSpy = vi.spyOn(socketClient, 'endTurn').mockResolvedValue({ success: true } as any);

    await ctrl.endTurn();
    expect(endTurnSpy).toHaveBeenCalled();
  });

  it('forwards powerup and surrender actions', async () => {
    const ctrl = createController();
    const powerUpSpy = vi.spyOn(socketClient, 'usePowerUp').mockResolvedValue({ success: true } as any);
    const surrenderSpy = vi.spyOn(socketClient, 'surrender').mockResolvedValue({ success: true } as any);

    await ctrl.usePowerUp('reinforce', 0);
    expect(powerUpSpy).toHaveBeenCalledWith('reinforce', 0, undefined);

    await ctrl.surrender();
    expect(surrenderSpy).toHaveBeenCalled();
  });
});

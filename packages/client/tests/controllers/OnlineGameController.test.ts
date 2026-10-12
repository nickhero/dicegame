import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WireGameState, AIActionPayload, InstantBatchPayload } from '@dicewars/shared';
import { SocketClient } from '../../src/network/SocketClient';
import { OnlineGameController } from '../../src/controllers/OnlineGameController';

describe('OnlineGameController', () => {
  let socketClient: SocketClient;
  let mockSocket: {
    emit: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
  let eventHandlers: Record<string, (...args: any[]) => void>;
  let onStateUpdate: ReturnType<typeof vi.fn>;
  let onBattleResult: ReturnType<typeof vi.fn>;
  let onGameOver: ReturnType<typeof vi.fn>;
  let onTurnChanged: ReturnType<typeof vi.fn>;
  let onAIAction: ReturnType<typeof vi.fn>;
  let onInstantBatch: ReturnType<typeof vi.fn>;
  let onChat: ReturnType<typeof vi.fn>;

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
    eventHandlers = {};
    mockSocket = {
      emit: vi.fn(),
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        eventHandlers[event] = handler;
      }),
      off: vi.fn((event: string) => {
        delete eventHandlers[event];
      }),
    };
    (socketClient as any).socket = mockSocket;

    onStateUpdate = vi.fn();
    onBattleResult = vi.fn();
    onGameOver = vi.fn();
    onTurnChanged = vi.fn();
    onAIAction = vi.fn();
    onInstantBatch = vi.fn();
    onChat = vi.fn();
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
        onAIAction,
        onInstantBatch,
        onChat,
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

  it('forwards proposeAlliance and triggers toast on rejection/error', async () => {
    const onToast = vi.fn();
    const ctrl = new OnlineGameController(
      socketClient,
      mockWireState,
      {
        onStateUpdate,
        onBattleResult,
        onGameOver,
        onTurnChanged,
        onToast,
      },
    );

    const proposeSpy = vi.spyOn(socketClient, 'proposeAlliance').mockResolvedValueOnce({
      success: false,
      error: { code: 'GAME_ALLIANCE_INVALID_TARGET' as any, message: 'AI Red declined your alliance proposal' },
    });

    const res1 = await ctrl.proposeAlliance(1);
    expect(proposeSpy).toHaveBeenCalledWith(1);
    expect(res1).toBe(false);
    expect(onToast).toHaveBeenCalledWith('AI Red declined your alliance proposal', 'warning');

    proposeSpy.mockResolvedValueOnce({ success: true } as any);
    const res2 = await ctrl.proposeAlliance(1);
    expect(res2).toBe(true);
  });

  it('handles game:turnChanged socket event with TurnChangedData', () => {
    createController();
    eventHandlers['game:turnChanged']?.({
      previousPlayerIndex: 0,
      currentPlayerIndex: 1,
      turnNumber: 2,
      bonusDice: 3,
    });

    expect(onTurnChanged).toHaveBeenCalledWith({
      previousPlayerIndex: 0,
      currentPlayerIndex: 1,
      turnNumber: 2,
      bonusDice: 3,
      powerUpSpawns: undefined,
    });
  });

  it('handles game:aiAction socket event', () => {
    createController();
    const action: AIActionPayload = {
      playerIndex: 1,
      actionType: 'endTurn',
      details: {},
    };
    eventHandlers['game:aiAction']?.(action);

    expect(onAIAction).toHaveBeenCalledWith(action);
  });

  it('handles game:instantBatch socket event and updates state', () => {
    const ctrl = createController();
    const batch: InstantBatchPayload = {
      actions: [{ playerIndex: 1, actionType: 'attack', details: {} }],
      finalState: {
        ...mockWireState,
        turnNumber: 3,
        localPlayerIndex: 0,
      },
    };
    eventHandlers['game:instantBatch']?.(batch);

    expect(onInstantBatch).toHaveBeenCalledWith(batch);
    expect(onStateUpdate).toHaveBeenCalled();
    expect(ctrl.getState().turnNumber).toBe(3);
  });

  it('handles game:chat socket event and sendChat method', () => {
    const ctrl = createController();
    const chatSpy = vi.spyOn(socketClient, 'sendChat').mockImplementation(() => {});

    ctrl.sendChat('Hello world');
    expect(chatSpy).toHaveBeenCalledWith('Hello world');

    eventHandlers['game:chat']?.({
      playerIndex: 0,
      senderName: 'Alice',
      message: 'Hello world',
      timestamp: '2026-09-26T12:00:00Z',
    });

    expect(onChat).toHaveBeenCalledWith({
      playerIndex: 0,
      senderName: 'Alice',
      message: 'Hello world',
      timestamp: '2026-09-26T12:00:00Z',
    });
  });

  it('unsubscribes listeners on destroy', () => {
    const ctrl = createController();
    const offSpy = vi.spyOn(socketClient, 'off');

    ctrl.destroy();

    expect(offSpy).toHaveBeenCalledWith('game:stateUpdate', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('game:turnChanged', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('game:aiAction', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('game:instantBatch', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('game:chat', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('game:error', expect.any(Function));
  });
});

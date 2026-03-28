import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGameActionHandlers } from '../../src/ws/gameHandlers';
import {
  GameEngine,
  GameEngineError,
  type ServerGameConfig,
  type PlayerSlot,
  type ActiveGame,
} from '../../src/services/GameEngine';
import { GameErrorCode, PLAYER_COLORS } from '@dicewars/shared';

// --- Helpers ---

function makeConfig(overrides: Partial<ServerGameConfig> = {}): ServerGameConfig {
  return {
    playerCount: 4,
    territoryCount: 20,
    mapShape: 'rectangle',
    gridType: 'square',
    speed: 'normal',
    powerUps: false,
    fogOfWar: false,
    alliances: false,
    undoEnabled: true,
    seed: '42',
    ...overrides,
  };
}

function makeSlots(count: number, humanCount = 1): PlayerSlot[] {
  const slots: PlayerSlot[] = [];
  for (let i = 0; i < count; i++) {
    if (i < humanCount) {
      slots.push({
        userId: `user-${i}`,
        name: `Player ${i}`,
        isAI: false,
        color: PLAYER_COLORS[i],
      });
    } else {
      slots.push({
        name: `AI ${i}`,
        isAI: true,
        aiPersonality: 'balanced',
        color: PLAYER_COLORS[i],
      });
    }
  }
  return slots;
}

function findAttackPair(game: ActiveGame, playerIndex: number) {
  for (const t of game.state.territories) {
    if (t.owner !== playerIndex || t.dice <= 1) continue;
    for (const nId of t.neighbors) {
      if (game.state.territories[nId].owner !== playerIndex) {
        return { from: t.id, to: nId };
      }
    }
  }
  return null;
}

// --- Mock Socket.IO ---

interface MockEmitter {
  emit: ReturnType<typeof vi.fn>;
}

function createMockNamespace(mockSockets: Array<ReturnType<typeof createMockSocket>> = []) {
  const roomEmitter: MockEmitter = { emit: vi.fn() };
  const socketsMap = new Map<string, unknown>();
  for (const s of mockSockets) {
    socketsMap.set(s.id, s);
  }
  const ns = {
    to: vi.fn().mockReturnValue(roomEmitter),
    emit: vi.fn(),
    sockets: socketsMap,
    _roomEmitter: roomEmitter,
  };
  return ns;
}

function createMockSocket(data: { userId: string; userName: string; gameId?: string }) {
  const handlers = new Map<string, Function>();
  const rooms = new Set<string>();
  if (data.gameId) {
    rooms.add(`game:${data.gameId}`);
  }
  const id = `mock-socket-${data.userId}`;
  const socket = {
    id,
    data: { ...data },
    rooms,
    emit: vi.fn(),
    on: vi.fn((event: string, handler: Function) => {
      handlers.set(event, handler);
    }),
    _handlers: handlers,
  };
  return socket;
}

function getHandler(socket: ReturnType<typeof createMockSocket>, event: string) {
  return socket._handlers.get(event) as Function | undefined;
}

// --- Tests ---

describe('Game Action WebSocket Handlers', () => {
  let engine: GameEngine;
  let game: ActiveGame;
  const roomId = 'test-room';

  beforeEach(() => {
    engine = new GameEngine();
    const config = makeConfig({ seed: '42', undoEnabled: true });
    const slots = makeSlots(4, 2); // 2 humans, 2 AI
    game = engine.createGame(roomId, config, slots);
  });

  describe('handler registration', () => {
    it('registers all 7 game action handlers', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice' });
      const ns = createMockNamespace();

      setupGameActionHandlers(socket as never, ns as never, engine);

      const registeredEvents = socket.on.mock.calls.map((c: unknown[]) => c[0]);
      expect(registeredEvents).toContain('game:attack');
      expect(registeredEvents).toContain('game:endTurn');
      expect(registeredEvents).toContain('game:usePowerUp');
      expect(registeredEvents).toContain('game:surrender');
      expect(registeredEvents).toContain('game:undo');
      expect(registeredEvents).toContain('game:proposeAlliance');
      expect(registeredEvents).toContain('game:respondAlliance');
    });
  });

  describe('game:attack', () => {
    it('executes a valid attack and broadcasts results', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace([socket]);
      setupGameActionHandlers(socket as never, ns as never, engine);

      const pair = findAttackPair(game, 0);
      expect(pair).not.toBeNull();

      const ack = vi.fn();
      const handler = getHandler(socket, 'game:attack')!;
      handler({ fromTerritoryId: pair!.from, toTerritoryId: pair!.to }, ack);

      expect(ack).toHaveBeenCalledOnce();
      const ackArg = ack.mock.calls[0][0];
      expect(ackArg.success).toBe(true);
      expect(ackArg.data.result).toBeDefined();
      expect(ackArg.data.result.attackerRolls).toBeInstanceOf(Array);
      expect(ackArg.data.result.defenderRolls).toBeInstanceOf(Array);

      // Should broadcast battleResult to room
      expect(ns.to).toHaveBeenCalledWith(`game:${roomId}`);
      const emitCalls = ns._roomEmitter.emit.mock.calls;
      const battleResultEmit = emitCalls.find((c: unknown[]) => c[0] === 'game:battleResult');
      expect(battleResultEmit).toBeDefined();
      expect(battleResultEmit[1].attackerTerritoryId).toBe(pair!.from);
      expect(battleResultEmit[1].defenderTerritoryId).toBe(pair!.to);

      // State update is emitted per-socket
      const stateEmit = socket.emit.mock.calls.find((c: unknown[]) => c[0] === 'game:stateUpdate');
      expect(stateEmit).toBeDefined();
    });

    it('rejects attack when not in a game', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice' }); // no gameId
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:attack')!({ fromTerritoryId: 0, toTerritoryId: 1 }, ack);

      expect(ack).toHaveBeenCalledOnce();
      expect(ack.mock.calls[0][0].success).toBe(false);
      expect(ack.mock.calls[0][0].error.code).toBe('CONNECTION_NOT_IN_GAME');
    });

    it('rejects attack on wrong turn', () => {
      // user-1 is player 1, but it's player 0's turn
      const socket = createMockSocket({ userId: 'user-1', userName: 'Bob', gameId: roomId });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:attack')!({ fromTerritoryId: 0, toTerritoryId: 1 }, ack);

      expect(ack).toHaveBeenCalledOnce();
      expect(ack.mock.calls[0][0].success).toBe(false);
      expect(ack.mock.calls[0][0].error.code).toBe(GameErrorCode.GAME_NOT_YOUR_TURN);
    });

    it('returns game over data when attack wins the game', () => {
      // Set up a near-victory state: player 0 owns all territories except one
      for (const t of game.state.territories) {
        t.owner = 0;
        t.dice = 8;
      }
      // Give last territory to player 1
      const lastTerritory = game.state.territories[game.state.territories.length - 1];
      lastTerritory.owner = 1;
      lastTerritory.dice = 1;
      // Mark other players as dead
      game.state.players[2].isAlive = false;
      game.state.players[3].isAlive = false;

      // Find an attack pair from player 0 to the last territory
      const attackerTerritory = game.state.territories.find(
        (t) => t.owner === 0 && t.dice > 1 && t.neighbors.includes(lastTerritory.id),
      );

      if (!attackerTerritory) return; // skip if no valid attack path

      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:attack')!(
        { fromTerritoryId: attackerTerritory.id, toTerritoryId: lastTerritory.id },
        ack,
      );

      const ackArg = ack.mock.calls[0][0];
      if (ackArg.success && ackArg.data.result.attackerWins) {
        // Game should be over
        expect(ackArg.data.gameOver).toBeDefined();
        expect(ackArg.data.gameOver.winnerIndex).toBe(0);

        const emitCalls = ns._roomEmitter.emit.mock.calls;
        const gameOverEmit = emitCalls.find((c: unknown[]) => c[0] === 'game:gameOver');
        expect(gameOverEmit).toBeDefined();
      }
    });
  });

  describe('game:endTurn', () => {
    it('ends turn and broadcasts turn change', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace([socket]);
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:endTurn')!(ack);

      expect(ack).toHaveBeenCalledOnce();
      const ackArg = ack.mock.calls[0][0];
      expect(ackArg.success).toBe(true);
      expect(ackArg.data.bonusDice).toBeGreaterThanOrEqual(0);
      expect(ackArg.data.nextPlayerIndex).toBeGreaterThanOrEqual(0);

      const emitCalls = ns._roomEmitter.emit.mock.calls;
      const turnChangedEmit = emitCalls.find((c: unknown[]) => c[0] === 'game:turnChanged');
      expect(turnChangedEmit).toBeDefined();
      expect(turnChangedEmit[1].previousPlayerIndex).toBe(0);
      expect(turnChangedEmit[1].currentPlayerIndex).toBe(ackArg.data.nextPlayerIndex);
    });

    it('rejects end turn when not in a game', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice' });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:endTurn')!(ack);

      expect(ack.mock.calls[0][0].success).toBe(false);
      expect(ack.mock.calls[0][0].error.code).toBe('CONNECTION_NOT_IN_GAME');
    });

    it('rejects end turn on wrong turn', () => {
      const socket = createMockSocket({ userId: 'user-1', userName: 'Bob', gameId: roomId });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:endTurn')!(ack);

      expect(ack.mock.calls[0][0].success).toBe(false);
      expect(ack.mock.calls[0][0].error.code).toBe(GameErrorCode.GAME_NOT_YOUR_TURN);
    });

    it('signals AI turn when next player is AI', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace([socket]);
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:endTurn')!(ack);

      const ackArg = ack.mock.calls[0][0];
      if (game.aiPlayerIndices.has(ackArg.data.nextPlayerIndex)) {
        expect(ns.emit).toHaveBeenCalledWith('_internal:aiTurnNeeded', {
          gameId: roomId,
          playerIndex: ackArg.data.nextPlayerIndex,
        });
      }
    });
  });

  describe('game:surrender', () => {
    it('surrenders and broadcasts state update', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace([socket]);
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:surrender')!(ack);

      expect(ack).toHaveBeenCalledOnce();
      expect(ack.mock.calls[0][0].success).toBe(true);

      // State update is emitted per-socket
      const stateUpdate = socket.emit.mock.calls.find((c: unknown[]) => c[0] === 'game:stateUpdate');
      expect(stateUpdate).toBeDefined();
    });

    it('rejects surrender when not in a game', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice' });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:surrender')!(ack);

      expect(ack.mock.calls[0][0].success).toBe(false);
      expect(ack.mock.calls[0][0].error.code).toBe('CONNECTION_NOT_IN_GAME');
    });
  });

  describe('game:undo', () => {
    it('undoes an attack and broadcasts restored state', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      // First perform an attack to create a snapshot
      const pair = findAttackPair(game, 0);
      if (!pair) return;

      const attackAck = vi.fn();
      getHandler(socket, 'game:attack')!(
        { fromTerritoryId: pair.from, toTerritoryId: pair.to },
        attackAck,
      );

      if (!attackAck.mock.calls[0][0].success) return;

      // Now undo
      ns._roomEmitter.emit.mockClear();
      ns.to.mockClear();
      ns.to.mockReturnValue(ns._roomEmitter);

      const undoAck = vi.fn();
      getHandler(socket, 'game:undo')!(undoAck);

      expect(undoAck).toHaveBeenCalledOnce();
      const ackArg = undoAck.mock.calls[0][0];
      expect(ackArg.success).toBe(true);
      expect(ackArg.data).toBeDefined();
      expect(ackArg.data.territories).toBeInstanceOf(Array);

      const emitCalls = ns._roomEmitter.emit.mock.calls;
      const stateUpdate = emitCalls.find((c: unknown[]) => c[0] === 'game:stateUpdate');
      expect(stateUpdate).toBeDefined();
    });

    it('rejects undo when no snapshot exists', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:undo')!(ack);

      expect(ack.mock.calls[0][0].success).toBe(false);
      expect(ack.mock.calls[0][0].error.code).toBe(GameErrorCode.GAME_UNDO_NO_SNAPSHOT);
    });

    it('rejects undo when disabled', () => {
      engine.destroyGame(roomId);
      const config = makeConfig({ seed: '42', undoEnabled: false });
      engine.createGame(roomId, config, makeSlots(4, 2));

      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:undo')!(ack);

      expect(ack.mock.calls[0][0].success).toBe(false);
      expect(ack.mock.calls[0][0].error.code).toBe(GameErrorCode.GAME_UNDO_DISABLED);
    });
  });

  describe('game:usePowerUp', () => {
    it('rejects power-up when not in a game', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice' });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:usePowerUp')!(
        { type: 'fortify', targetTerritoryId: 0, sourceTerritoryId: 1 },
        ack,
      );

      expect(ack.mock.calls[0][0].success).toBe(false);
      expect(ack.mock.calls[0][0].error.code).toBe('CONNECTION_NOT_IN_GAME');
    });

    it('rejects unknown power-up type', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:usePowerUp')!(
        { type: 'unknown', targetTerritoryId: 0 },
        ack,
      );

      expect(ack.mock.calls[0][0].success).toBe(false);
    });
  });

  describe('game:proposeAlliance', () => {
    it('rejects alliance when alliances are disabled', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:proposeAlliance')!({ targetPlayerIndex: 1 }, ack);

      expect(ack.mock.calls[0][0].success).toBe(false);
      expect(ack.mock.calls[0][0].error.code).toBe(GameErrorCode.GAME_ALLIANCE_DISABLED);
    });

    it('proposes alliance when alliances are enabled', () => {
      engine.destroyGame(roomId);
      const config = makeConfig({ seed: '42', alliances: true });
      engine.createGame(roomId, config, makeSlots(4, 2));

      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace([socket]);
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:proposeAlliance')!({ targetPlayerIndex: 1 }, ack);

      expect(ack.mock.calls[0][0].success).toBe(true);

      // State update is emitted per-socket
      const stateUpdate = socket.emit.mock.calls.find((c: unknown[]) => c[0] === 'game:stateUpdate');
      expect(stateUpdate).toBeDefined();
    });

    it('rejects alliance when not in a game', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice' });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:proposeAlliance')!({ targetPlayerIndex: 1 }, ack);

      expect(ack.mock.calls[0][0].success).toBe(false);
      expect(ack.mock.calls[0][0].error.code).toBe('CONNECTION_NOT_IN_GAME');
    });
  });

  describe('game:respondAlliance', () => {
    it('rejects alliance response when not in a game', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice' });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:respondAlliance')!({ proposalId: '1', accept: true }, ack);

      expect(ack.mock.calls[0][0].success).toBe(false);
      expect(ack.mock.calls[0][0].error.code).toBe('CONNECTION_NOT_IN_GAME');
    });

    it('rejects invalid proposalId', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:respondAlliance')!({ proposalId: 'invalid', accept: true }, ack);

      expect(ack.mock.calls[0][0].success).toBe(false);
      expect(ack.mock.calls[0][0].error.code).toBe('GAME_ALLIANCE_PROPOSAL_NOT_FOUND');
    });
  });

  describe('error handling', () => {
    it('wraps GameEngineError into structured ack', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      // Attack own territory to trigger GAME_TERRITORY_OWN error
      const myTerritory = game.state.territories.find((t) => t.owner === 0 && t.dice > 1);
      const myOtherTerritory = game.state.territories.find(
        (t) => t.owner === 0 && t.id !== myTerritory?.id,
      );

      if (myTerritory && myOtherTerritory && myTerritory.neighbors.includes(myOtherTerritory.id)) {
        const ack = vi.fn();
        getHandler(socket, 'game:attack')!(
          { fromTerritoryId: myTerritory.id, toTerritoryId: myOtherTerritory.id },
          ack,
        );

        expect(ack.mock.calls[0][0].success).toBe(false);
        expect(ack.mock.calls[0][0].error.code).toBe(GameErrorCode.GAME_TERRITORY_OWN);
      }
    });

    it('wraps unknown errors into INTERNAL_ERROR', () => {
      // Create a socket pointing to a non-existent game
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: 'nonexistent' });
      const ns = createMockNamespace();
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:attack')!({ fromTerritoryId: 0, toTerritoryId: 1 }, ack);

      expect(ack.mock.calls[0][0].success).toBe(false);
      // GameEngine throws GameEngineError for GAME_NOT_FOUND
      expect(ack.mock.calls[0][0].error.code).toBe(GameErrorCode.GAME_NOT_FOUND);
    });
  });

  describe('state serialization in broadcasts', () => {
    it('broadcasts valid WireGameState format', () => {
      const socket = createMockSocket({ userId: 'user-0', userName: 'Alice', gameId: roomId });
      const ns = createMockNamespace([socket]);
      setupGameActionHandlers(socket as never, ns as never, engine);

      const ack = vi.fn();
      getHandler(socket, 'game:endTurn')!(ack);

      // State update is emitted per-socket
      const stateEmit = socket.emit.mock.calls.find((c: unknown[]) => c[0] === 'game:stateUpdate');
      expect(stateEmit).toBeDefined();

      const state = stateEmit![1];
      expect(state.territories).toBeInstanceOf(Array);
      expect(state.players).toBeInstanceOf(Array);
      expect(typeof state.currentPlayerIndex).toBe('number');
      expect(typeof state.turnNumber).toBe('number');
      expect(['selectingAttacker', 'selectingDefender']).toContain(state.phase);
      expect(state.alliances).toBeInstanceOf(Array);
      expect(state.powerUpLocations).toBeInstanceOf(Array);
      expect(typeof state.gameOver).toBe('boolean');
      expect(typeof state.localPlayerIndex).toBe('number');

      // Verify territory wire format
      const t = state.territories[0];
      expect(typeof t.id).toBe('number');
      expect(t.cells).toBeInstanceOf(Array);
      expect(t.neighborIds).toBeInstanceOf(Array);
      expect(typeof t.owner).toBe('number');
      expect(typeof t.dice).toBe('number');
      expect(typeof t.visible).toBe('boolean');

      // Verify player wire format
      const p = state.players[0];
      expect(typeof p.index).toBe('number');
      expect(typeof p.name).toBe('string');
      expect(typeof p.color).toBe('number');
      expect(typeof p.isAI).toBe('boolean');
      expect(typeof p.alive).toBe('boolean');
      expect(typeof p.territoryCount).toBe('number');
      expect(typeof p.reserveDice).toBe('number');
      expect(typeof p.connected).toBe('boolean');
    });
  });
});

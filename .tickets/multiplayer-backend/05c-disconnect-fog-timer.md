# Phase 5c: Disconnect Handling, Fog of War, Turn Timer

**Priority**: 🔴 Critical
**Depends on**: Phase 5a (game engine core), Phase 5b (AI turn loop)
**Scope**: Edge cases and robustness features

## Goal

Handle player disconnections gracefully, implement server-side fog-of-war filtering, and add turn timers for multiplayer.

## Tasks

### 5c.1 — Disconnect tracking + grace period

```typescript
// In gameNamespace.ts
socket.on('disconnect', (reason) => {
  const game = engine.getActiveGame(gameId);
  if (!game || game.status !== 'playing') return;

  const playerIndex = game.playerMap.get(userId);
  if (playerIndex === undefined) return; // spectator disconnect, ignore

  game.disconnectedPlayers.set(userId, Date.now());
  io.to(`game:${gameId}`).emit('game:playerDisconnected', {
    playerIndex,
    reason,
    graceSeconds: 60,
  });

  // Grace period timer
  const graceTimer = setTimeout(() => {
    if (!game.disconnectedPlayers.has(userId)) return; // reconnected
    convertToAI(game, userId, playerIndex);
    io.to(`game:${gameId}`).emit('game:playerConvertedToAI', {
      playerIndex,
      personality: 'balanced',
    });
    // If it was this player's turn, run AI
    if (game.state.currentPlayerIndex === playerIndex) {
      aiRunner.runAITurns(gameId, engine, io);
    }
  }, 60_000);

  game.graceTimers.set(userId, graceTimer);
});
```

- [ ] Track disconnect timestamp + reason
- [ ] 60-second grace period before AI conversion
- [ ] Broadcast disconnect/reconnect/conversion events
- [ ] If disconnected player's turn: pause (wait for grace period)
- [ ] After conversion: trigger AI turn if it's their turn
- [ ] Clear grace timer on reconnect

### 5c.2 — Reconnection flow

```typescript
socket.on('game:reconnect', ({ gameId }) => {
  const game = engine.getActiveGame(gameId);
  const playerIndex = game.playerMap.get(userId);

  // Cancel grace timer
  const timer = game.graceTimers.get(userId);
  if (timer) clearTimeout(timer);
  game.graceTimers.delete(userId);
  game.disconnectedPlayers.delete(userId);

  // Rejoin room
  socket.join(`game:${gameId}`);

  // Full state sync
  const state = engine.getSerializedState(gameId, userId);
  socket.emit('game:stateUpdate', state);
  socket.emit('game:reconnected', {
    playerIndex,
    turnNumber: game.state.turnNumber,
    currentPlayerIndex: game.state.currentPlayerIndex,
  });

  // Notify room
  socket.to(`game:${gameId}`).emit('game:playerReconnected', { playerIndex });
});
```

- [ ] Cancel grace timer immediately
- [ ] Send full state (fog-filtered if applicable)
- [ ] Notify other players of reconnection
- [ ] Restore player control (un-convert from AI)
- [ ] Handle edge case: player reconnects after conversion → takes back control

### 5c.3 — Fog-of-war state filtering

When sending state to a specific player in a fog-of-war game, filter it:

```typescript
getSerializedState(roomId: string, forPlayerId?: string): SerializedGameState {
  const game = this.activeGames.get(roomId);
  const state = game.state;

  if (!game.config.fogOfWar || !forPlayerId) {
    return this.serializeFullState(state);
  }

  const playerIndex = game.playerMap.get(forPlayerId);
  const visibleIds = getVisibleTerritories(state, playerIndex);
  const visibleSet = new Set(visibleIds);

  return {
    territories: state.territories.map(t => {
      if (visibleSet.has(t.id)) {
        return this.serializeTerritory(t); // full info
      }
      return { id: t.id, cells: t.cells, visible: false }; // shape only, no owner/dice
    }),
    players: state.players.map((p, i) => ({
      ...this.serializePlayer(p),
      // Only show territory count for visible territories
      territoryCount: i === playerIndex ? p.territoryCount : undefined,
    })),
    currentPlayerIndex: state.currentPlayerIndex,
    turnNumber: state.turnNumber,
    // Only show visible power-ups
    powerUpLocations: state.powerUpLocations?.filter(p => visibleSet.has(p.territoryId)),
    // Only show alliances involving this player
    alliances: state.alliances?.filter(a =>
      a.player1 === playerIndex || a.player2 === playerIndex
    ),
    gameOver: state.gameOver,
    winner: state.winner,
  };
}
```

- [ ] Full state for spectators (no fog)
- [ ] Filtered state for players in fog-of-war mode
- [ ] Hidden territories: send shape (for map rendering) but NOT owner/dice count
- [ ] Hidden power-ups: don't reveal locations outside visibility
- [ ] Alliance info: only show player's own alliances
- [ ] Tests: verify fog filtering correctness, no information leakage

### 5c.4 — Turn timer

```typescript
class TurnTimer {
  startTimer(game: ActiveGame, onTimeout: () => void): void {
    if (!game.config.turnTimer || game.config.turnTimer === 'unlimited') return;
    if (game.state.players[game.state.currentPlayerIndex].isAI) return;

    const seconds = TURN_TIMER_VALUES[game.config.turnTimer]; // 30 | 60 | 90
    game.turnTimerStart = Date.now();
    game.turnTimerDuration = seconds;

    game.turnTimer = setTimeout(() => {
      onTimeout(); // auto-end-turn
    }, seconds * 1000);
  }

  clearTimer(game: ActiveGame): void {
    if (game.turnTimer) {
      clearTimeout(game.turnTimer);
      game.turnTimer = null;
    }
  }

  getRemainingSeconds(game: ActiveGame): number {
    if (!game.turnTimerStart) return -1; // unlimited
    const elapsed = (Date.now() - game.turnTimerStart) / 1000;
    return Math.max(0, game.turnTimerDuration - elapsed);
  }
}

const TURN_TIMER_VALUES = {
  '30s': 30,
  '60s': 60,
  '90s': 90,
  'unlimited': Infinity,
} as const;
```

**Timer rules:**
- Timer starts when turn passes to a **human** player
- Timer cleared when human ends turn or attacks (attack doesn't reset — incentivizes quick play)
- On timeout: server auto-calls `endTurn()` for that player
- Timer NOT used for AI turns or single-player games
- Remaining time included in state updates so client can show countdown

- [ ] Add `turnTimer` option to `GameSetupConfig` (default: 'unlimited')
- [ ] Timer starts on human turn start
- [ ] Timer cleared on turn end
- [ ] Timeout auto-ends turn
- [ ] Remaining seconds sent to client
- [ ] No timer for AI turns
- [ ] No timer for single-player (configurable — only multiplayer default)
- [ ] Tests: timer fires, timer cleared on turn end, timer not set for AI

### 5c.5 — State serialization format

Define the exact wire format for state updates:

```typescript
// packages/shared/src/types/serialized.ts

interface SerializedGameState {
  territories: SerializedTerritory[];
  players: SerializedPlayer[];
  currentPlayerIndex: number;
  turnNumber: number;
  phase: 'selectingAttacker' | 'selectingDefender';
  alliances: SerializedAlliance[];
  powerUpLocations: SerializedPowerUp[];
  gameOver: boolean;
  winner: number | null;
  turnTimerRemaining: number | null;  // seconds, null = unlimited
}

interface SerializedTerritory {
  id: number;
  cells: [number, number][];   // grid positions
  center: [number, number];    // visual center
  neighborIds: number[];
  owner: number;               // player index, -1 if fog-hidden
  dice: number;                // 0 if fog-hidden
  visible: boolean;            // false = fog-hidden
  powerUp?: { type: string };  // null if no power-up or fog-hidden
}

interface SerializedPlayer {
  index: number;
  name: string;
  color: number;
  isAI: boolean;
  personality?: string;        // AI personality type
  alive: boolean;
  territoryCount: number;      // may be hidden in fog
  reserveDice: number;
  connected: boolean;          // false if disconnected (grace period)
}

interface SerializedAlliance {
  player1: number;
  player2: number;
  turnsRemaining: number;
}

interface SerializedPowerUp {
  territoryId: number;
  type: 'shield' | 'charge' | 'fortify' | 'reinforce';
}
```

- [ ] Define all serialized types in shared package
- [ ] Serialization functions: `serializeState()`, `deserializeState()`
- [ ] Used by server (sending) and client (receiving)
- [ ] Tests: serialize → deserialize roundtrip

## Acceptance Criteria

- Disconnected players handled with 60s grace period, then converted to AI
- Reconnection restores full game state
- Fog-of-war filters state per-player (no information leakage)
- Turn timer enforces time limits for multiplayer humans
- State serialization format is well-defined and tested

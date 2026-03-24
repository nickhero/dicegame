# Phase 5b: AI Turn Loop — Server-Side AI Execution

**Priority**: 🔴 Critical
**Depends on**: Phase 5a (game engine core)
**Scope**: AI turn sequencing, timing, spectator-only games

## Goal

Implement the server-side AI turn loop that executes AI decisions with configurable delays, broadcasting each action for client animation.

## Tasks

### 5b.1 — Speed config: concrete timing values

The existing `SPEED_CONFIGS` define a multiplier. For the server, we need concrete milliseconds:

```typescript
// packages/shared/src/game/ServerTiming.ts
export const SERVER_TIMING = {
  normal: {
    attackDelay: 1200,      // ms between AI attacks
    battleAnimDelay: 1500,  // ms for battle animation to play
    turnEndDelay: 800,      // ms after turn end before next turn
    powerUpDelay: 600,      // ms between power-up actions
    allianceDelay: 1000,    // ms for alliance proposal display
    surrenderDelay: 1500,   // ms to show surrender message
  },
  fast: {
    attackDelay: 600,
    battleAnimDelay: 750,
    turnEndDelay: 400,
    powerUpDelay: 300,
    allianceDelay: 500,
    surrenderDelay: 750,
  },
  instant: {
    attackDelay: 0,
    battleAnimDelay: 0,
    turnEndDelay: 0,
    powerUpDelay: 0,
    allianceDelay: 0,
    surrenderDelay: 0,
  },
} as const;
```

- [ ] Define concrete timing values per speed setting
- [ ] These determine `await delay(ms)` calls in the AI loop
- [ ] Client uses same values to know how long animations should take
- [ ] Put in shared package (both server and client need them)

### 5b.2 — AI turn loop: sequential execution

```typescript
// packages/server/src/services/AITurnRunner.ts

class AITurnRunner {
  private runningGames: Set<string> = new Set();

  async runAITurns(gameId: string, engine: GameEngine, io: Server): Promise<void> {
    if (this.runningGames.has(gameId)) return; // prevent double-run
    this.runningGames.add(gameId);

    try {
      const game = engine.getActiveGame(gameId);
      const timing = SERVER_TIMING[game.config.speed];

      while (game.state.players[game.state.currentPlayerIndex].isAI 
             && game.status === 'playing') {
        await this.executeOneAITurn(gameId, game, timing, engine, io);
      }
    } finally {
      this.runningGames.delete(gameId);
    }
  }

  private async executeOneAITurn(
    gameId: string, game: ActiveGame, timing: TimingConfig,
    engine: GameEngine, io: Server
  ): Promise<void> {
    const aiPlayerIndex = game.state.currentPlayerIndex;
    const room = `game:${gameId}`;

    // 1. Check surrender
    if (shouldAISurrender(game.state, aiPlayerIndex)) {
      engine.aiSurrender(gameId, aiPlayerIndex);
      io.to(room).emit('game:aiAction', { type: 'surrender', player: aiPlayerIndex });
      await delay(timing.surrenderDelay);
      // endTurn is called inside aiSurrender
      return;
    }

    // 2. Alliance tick (proposals, responses)
    const allianceActions = engine.processAllianceTick(gameId);
    for (const action of allianceActions) {
      io.to(room).emit('game:aiAction', action);
      await delay(timing.allianceDelay);
    }

    // 3. AI power-ups (before attacking)
    const powerUpActions = engine.executeAIPowerUps(gameId);
    for (const action of powerUpActions) {
      io.to(room).emit('game:aiAction', action);
      io.to(room).emit('game:stateUpdate', engine.getSerializedState(gameId));
      await delay(timing.powerUpDelay);
    }

    // 4. AI attack loop
    let attackCount = 0;
    const maxAttacks = getMaxAttacks(game.state, aiPlayerIndex); // from personality

    while (attackCount < maxAttacks && game.status === 'playing') {
      const visibleTerritories = game.config.fogOfWar
        ? getVisibleTerritories(game.state, aiPlayerIndex)
        : undefined;
      
      const move = selectBestMove(game.state, aiPlayerIndex, game.rng, visibleTerritories);
      if (!move) break; // no more moves

      // Check alliance break
      if (wouldBreakAlliance(game.state, move.from, move.to)) {
        breakAlliance(game.state, /* ... */);
        io.to(room).emit('game:aiAction', { type: 'allianceBroken', /* ... */ });
        await delay(timing.allianceDelay);
      }

      const result = engine.executeAttack(gameId, 'ai', move.from, move.to);
      io.to(room).emit('game:battleResult', result);
      await delay(timing.battleAnimDelay);

      // State update after battle resolves
      io.to(room).emit('game:stateUpdate', engine.getSerializedState(gameId));
      await delay(timing.attackDelay);

      if (result.gameOver) return; // game ended
      if (result.eliminated) {
        await delay(timing.surrenderDelay); // extra pause for elimination
      }

      attackCount++;
    }

    // 5. End AI turn
    const turnResult = engine.endTurn(gameId, 'ai');
    io.to(room).emit('game:turnChanged', turnResult);
    io.to(room).emit('game:stateUpdate', engine.getSerializedState(gameId));
    await delay(timing.turnEndDelay);
  }
}
```

- [ ] `AITurnRunner` class with guard against double-execution
- [ ] Sequential: surrender check → alliance → power-ups → attacks → end turn
- [ ] Each action emitted individually with delay for animation
- [ ] State update broadcast after each significant change
- [ ] Fog-of-war filtering for AI visibility
- [ ] Personality-based attack limits (`maxAttacksPerTurn`)
- [ ] Alliance break detection + recording

### 5b.3 — Instant mode optimization

For `instant` speed (all delays = 0), batch the entire AI turn sequence:

```typescript
if (timing === SERVER_TIMING.instant) {
  // Run all AI turns synchronously, collect actions
  const actions = engine.runInstantAITurns(gameId);
  // Send batch
  io.to(room).emit('game:instantBatch', { actions, finalState: engine.getSerializedState(gameId) });
  return;
}
```

- [ ] Instant mode runs synchronously (no awaits)
- [ ] Batch all actions into single `game:instantBatch` event
- [ ] Client receives batch and can replay or skip to final state
- [ ] Prevents WebSocket message flood for fast AI games

### 5b.4 — All-AI games (spectator mode)

When a game has 0 humans (all spectators), the AI loop runs continuously:

```typescript
async runSpectatorGame(gameId: string, engine: GameEngine, io: Server): Promise<void> {
  while (engine.getActiveGame(gameId)?.status === 'playing') {
    await this.runAITurns(gameId, engine, io);
    // All players are AI, so runAITurns processes every turn
  }
}
```

- [ ] Detect all-AI game at start
- [ ] Run continuous AI loop until game over
- [ ] Spectators join/leave freely during execution
- [ ] Handle "no spectators left" → continue running (game finishes, recording saved)

### 5b.5 — Cancellation

- [ ] If game is destroyed (all players left), cancel running AI loop
- [ ] Use AbortController pattern: `const abort = new AbortController()`
- [ ] Check `abort.signal.aborted` before each await
- [ ] Clean up resources on cancellation

### 5b.6 — Tests

- [ ] AI executes full attack sequence in correct order
- [ ] AI respects personality-based attack limits
- [ ] AI power-ups used before attacks
- [ ] Alliance proposals/responses during AI turn
- [ ] AI surrender when appropriate
- [ ] Instant mode produces correct batch
- [ ] All-AI game runs to completion
- [ ] Cancellation stops AI loop mid-turn
- [ ] Fog-of-war limits AI visibility
- [ ] Delays match speed config

## Acceptance Criteria

- AI turns execute on server with appropriate pacing per speed setting
- Each AI action individually broadcasted for client animation
- Instant mode sends efficient batched update
- All-AI spectator games run autonomously
- AI loop properly cancellable

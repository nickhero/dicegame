# Phase 5a: Game Engine Core — Attack, Turn, Power-Ups

**Priority**: 🔴 Critical
**Depends on**: Phase 1 (shared package), Phase 4 (lobby/rooms)
**Scope**: Core game actions only — no AI, no disconnect, no fog

## Goal

Implement the `GameEngine` service that manages active games and processes human player actions. This phase covers the "happy path" only: create game → attack → end turn → game over.

## Tasks

### 5a.1 — ActiveGame data structure

```typescript
interface ActiveGame {
  roomId: string;
  state: GameState;
  rng: SeededRandom;
  recorder: GameRecorder;
  snapshot: GameStateSnapshot | null;   // for undo
  config: GameSetupConfig;
  playerMap: Map<string, number>;       // visitorId → playerIndex
  disconnectedPlayers: Map<string, number>;  // visitorId → timestamp
  turnTimer: NodeJS.Timeout | null;
  status: 'playing' | 'finished' | 'abandoned';
}
```

- [ ] Define `ActiveGame` type in `packages/server/src/services/types.ts`
- [ ] In-memory `Map<string, ActiveGame>` — games are short-lived (<30 min)

### 5a.2 — GameEngine class: game lifecycle

```typescript
class GameEngine {
  createGame(roomId: string, config: GameSetupConfig, players: PlayerSlot[]): ActiveGame
  destroyGame(roomId: string): void
  getState(roomId: string): GameState | null
  getSerializedState(roomId: string, forPlayerId?: string): SerializedGameState | null
}
```

**`createGame()` does what GameScene.create() currently does:**
1. Create `SeededRandom` from config seed (or generate random seed)
2. Call `generateMap()` with rng, config.territoryCount, config.mapShape
3. Create `Player[]` from player slots
4. Assign territories to players
5. Distribute initial dice
6. Spawn initial power-ups (if enabled)
7. Create `GameRecorder`
8. Build `playerMap` from slot assignments
9. Return initial `GameState`

- [ ] Extract game initialization from GameScene.create() into GameEngine.createGame()
- [ ] Ensure deterministic: same seed → same map + dice distribution
- [ ] Tests: createGame with various configs produces valid state

### 5a.3 — GameEngine: human attack

```typescript
executeAttack(roomId: string, playerId: string, fromId: number, toId: number): 
  { ok: true; result: BattleResult; eliminated?: number; gameOver?: GameOverData } |
  { ok: false; error: GameError }
```

**Validation (before executing):**
1. Game exists and is playing
2. `playerId` maps to a valid player index
3. It's that player's turn (`currentPlayerIndex === playerMap.get(playerId)`)
4. `canAttackFrom(state, fromId)` — territory owned, dice > 1
5. `isValidAttack(state, fromId, toId)` — adjacent, different owner
6. Alliance check: if `wouldBreakAlliance()`, track the break

**Execution (delegates to shared):**
1. If undo enabled: `createSnapshot(state)` → store in ActiveGame
2. `executeAttack(state, fromId, toId, rng)` — from `@dicewars/shared`
3. Record action in `recorder`
4. Check elimination → record if so
5. Check winner → if game over, trigger finalization

- [ ] Full attack validation with descriptive errors
- [ ] Snapshot for undo before attack
- [ ] Delegate to shared `executeAttack()`
- [ ] Record in GameRecorder
- [ ] Check elimination + game over
- [ ] Tests: valid attack, invalid attacks (wrong player, wrong turn, bad target, alliance)

### 5a.4 — GameEngine: end turn

```typescript
endTurn(roomId: string, playerId: string):
  { ok: true; bonusDice: number; nextPlayerIndex: number; powerUpSpawns?: PowerUpSpawn[] } |
  { ok: false; error: GameError }
```

**What happens (mirrors GameScene.onEndTurn()):**
1. Validate it's this player's turn
2. Call `endTurn(state)` from shared — distributes bonus dice
3. Record `endTurn` action with bonus count
4. Spawn power-ups if enabled (record spawn actions)
5. Record end of turn + start of next turn in recorder
6. Clear undo snapshot
7. Return bonus dice count and next player index

- [ ] End turn validation
- [ ] Bonus dice distribution via shared GameRules
- [ ] Power-up spawning
- [ ] Clear undo state
- [ ] Tests: end turn, bonus dice calculation, power-up spawn

### 5a.5 — GameEngine: power-up usage

```typescript
usePowerUp(roomId: string, playerId: string, type: 'reinforce' | 'fortify' | 'charge' | 'shield', 
           targetId: number, sourceId?: number):
  { ok: true; action: GameAction } |
  { ok: false; error: GameError }
```

**Reinforce**: Add 1 die to territory (if below MAX_DICE)
**Fortify**: Move up to 3 dice from source to target (both must be owned)
**Charge**: Grant +2 attack bonus to territory
**Shield**: Grant defense bonus to territory

- [ ] Validate power-up exists at location
- [ ] Validate territory ownership
- [ ] Execute power-up via shared functions
- [ ] Record in recorder
- [ ] Tests: each power-up type, validation failures

### 5a.6 — GameEngine: undo

```typescript
undoLastAttack(roomId: string, playerId: string):
  { ok: true; restoredState: SerializedGameState } |
  { ok: false; error: GameError }
```

- [ ] Validate undo is enabled in config
- [ ] Validate snapshot exists (only 1 undo per turn)
- [ ] Restore snapshot via shared `restoreSnapshot()`
- [ ] Clear snapshot (can't undo twice)
- [ ] Tests: undo restores state, double-undo fails, undo disabled

### 5a.7 — GameEngine: surrender

```typescript
surrender(roomId: string, playerId: string):
  { ok: true; distributedTo: number[] } |
  { ok: false; error: GameError }
```

- [ ] Validate player is alive
- [ ] Distribute territories via `distributeSurrenderedTerritories()`
- [ ] Record surrender action
- [ ] Check if game is now over
- [ ] Tests: surrender distribution, game over after surrender

### 5a.8 — GameEngine: alliance actions

```typescript
proposeAlliance(roomId: string, playerId: string, targetIndex: number): Result
respondAlliance(roomId: string, playerId: string, proposalId: string, accept: boolean): Result
```

- [ ] Validate alliance feature is enabled
- [ ] Validate target player is alive and not already allied
- [ ] Form or reject alliance via shared functions
- [ ] Record alliance actions
- [ ] Tests: propose, accept, reject, break-on-attack

### 5a.9 — Game over finalization

```typescript
private finalizeGame(game: ActiveGame, winnerIndex: number): GameOverData {
  game.status = 'finished';
  recorder.endTurn();
  const recording = recorder.getRecording();
  const stats = computeFromRecording(recording);
  // Save to database (async, don't block)
  this.persistenceService.saveMatch(game, recording, stats);
  return { winner: winnerIndex, stats, recording };
}
```

- [ ] Finalize recording
- [ ] Compute stats from recording
- [ ] Check achievements for human players
- [ ] Persist to database
- [ ] Return results for broadcast
- [ ] Clean up from memory after 5 min timeout

### 5a.10 — WebSocket handlers for core actions

Wire GameEngine to Socket.IO:

```typescript
socket.on('game:attack', ({ from, to }, ack) => {
  const result = engine.executeAttack(gameId, userId, from, to);
  if (!result.ok) return ack({ success: false, error: result.error });
  ack({ success: true });
  io.to(`game:${gameId}`).emit('game:battleResult', result);
  if (result.eliminated) io.to(...).emit('game:elimination', ...);
  if (result.gameOver) io.to(...).emit('game:gameOver', result.gameOver);
  else io.to(...).emit('game:stateUpdate', engine.getSerializedState(gameId));
});
```

- [ ] Wire all 7 actions: attack, endTurn, usePowerUp, undo, surrender, proposeAlliance, respondAlliance
- [ ] Each: validate → execute → ack → broadcast
- [ ] After endTurn: check if next player is AI → trigger Phase 5b AI loop

## Acceptance Criteria

- Human player can play a complete game via WebSocket (attack, end turn, power-ups, undo, surrender)
- All actions validated server-side with descriptive errors
- Game recording captured server-side
- Game over triggers finalization and persistence
- Alliance system works via WebSocket
- Tests cover all validation and execution paths

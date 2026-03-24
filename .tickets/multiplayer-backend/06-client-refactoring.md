# Phase 6: Client Refactoring — WebSocket Integration

**Priority**: 🔴 Critical
**Depends on**: Phase 5a-c (game engine service)
**Scope**: Refactor Phaser frontend to communicate via WebSocket. No offline mode.

## Goal

Transform the Phaser client from running game logic locally to a **thin rendering layer** that sends intents to the server and renders state updates. All game logic execution moves to the server — the client never calls `executeAttack()`, `endTurn()`, or any game-mutating function directly.

## Tasks

### 6.1 — Network client services

Three client-side services handle all server communication:

#### SocketClient (WebSocket)
```typescript
// packages/client/src/network/SocketClient.ts
class SocketClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents>;

  connect(token: string): Promise<void>
  disconnect(): void
  isConnected(): boolean
  getConnectionState(): 'connecting' | 'connected' | 'disconnected'

  // Game actions (send intent, await server ack)
  attack(from: number, to: number): Promise<ActionResult>
  endTurn(): Promise<ActionResult>
  usePowerUp(type: string, targetId: number, sourceId?: number): Promise<ActionResult>
  surrender(): Promise<ActionResult>
  undo(): Promise<ActionResult>
  proposeAlliance(targetIndex: number): Promise<ActionResult>
  respondAlliance(proposalId: string, accept: boolean): Promise<ActionResult>
  sendChat(message: string): void

  // Event listeners (server → client)
  on<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]): void
  off<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]): void

  // Room management
  joinGame(gameId: string): void
  leaveGame(): void
  spectateGame(gameId: string): void
}

type ActionResult = { success: true } | { success: false; error: GameError };
```

#### AuthClient (REST)
```typescript
class AuthClient {
  async loginAsGuest(displayName: string): Promise<{ token: string; user: User }>
  async refreshToken(): Promise<string>
  getToken(): string | null
  isAuthenticated(): boolean
  logout(): void
}
```

#### LobbyClient (REST + WebSocket)
```typescript
class LobbyClient {
  async getGames(): Promise<GameRoomSummary[]>
  async createGame(config: CreateGameRequest): Promise<GameRoom>
  async joinGame(gameId: string, password?: string): Promise<void>
  async leaveGame(gameId: string): Promise<void>
  async startGame(gameId: string): Promise<void>
  onGameListUpdate(handler: (games: GameRoomSummary[]) => void): Unsubscribe
}
```

- [ ] SocketClient with typed events and promise-based actions
- [ ] AuthClient with guest login and token refresh
- [ ] LobbyClient combining REST + WebSocket
- [ ] Auto-reconnection logic in SocketClient
- [ ] Connection state tracking
- [ ] Tests for all three services (mock Socket.IO)

### 6.2 — New scenes for online flow

```
LoginScene → LobbyScene → WaitingRoomScene → GameScene → GameOverScene
```

#### LoginScene (new)
- Display name text input (pixel art styled)
- "Play as Guest" button
- Calls `authClient.loginAsGuest(name)` → stores token
- On success: transition to LobbyScene
- Shows connection error if server unreachable

#### LobbyScene (new)
- Game browser: list of public games (name, players, config preview)
- "Create Game" button → opens create dialog (reuse SetupScene config UI)
- "Join" button per game row
- "Enter Invite Code" input
- Real-time updates via WebSocket lobby namespace
- Player count indicator

#### WaitingRoomScene (new)
- Shows game config summary
- Player list with slot assignments + colors
- AI slots with personality selector (creator only)
- "Ready" toggle per player
- "Start Game" button (creator only, when all ready)
- "Leave" button
- Real-time: players joining/leaving, ready state changes

- [ ] LoginScene: display name input, guest auth, error handling
- [ ] LobbyScene: game browser, create game dialog, join flow
- [ ] WaitingRoomScene: player list, ready state, start trigger
- [ ] Scene transition flow: Login → Lobby → WaitingRoom → Game

### 6.3 — GameScene surgery: remove local game logic

This is the critical refactoring. Below is the **exact mapping** of what changes in GameScene.ts.

#### Methods that become server calls:

| Current Method | Current Logic | New Behavior |
|---------------|--------------|-------------|
| `handleDefenderSelection()` L674 | Calls `executeAttack(state, from, to, rng)` directly | `await socketClient.attack(from, to)` — result arrives via `game:battleResult` event |
| `onEndTurn()` L977 | Calls `endTurn(state)` directly | `await socketClient.endTurn()` — result arrives via `game:turnChanged` event |
| `activateReinforce()` L799 | Calls `useReinforce(state, territory)` directly | `await socketClient.usePowerUp('reinforce', territoryId)` |
| `handleFortifyTarget()` L831 | Calls `useFortify(state, source, target)` directly | `await socketClient.usePowerUp('fortify', targetId, sourceId)` |
| `undoLastAttack()` L865 | Calls `restoreSnapshot(state, snapshot)` directly | `await socketClient.undo()` — restored state arrives via `game:stateUpdate` |
| `executeHumanSurrender()` L560 | Calls `distributeSurrenderedTerritories()` directly | `await socketClient.surrender()` |
| `showAllianceBreakConfirmation()` L1698 | Calls `breakAlliance()` directly | Handled server-side as part of attack |
| `showAllianceProposal()` L1637 | Calls `formAlliance()` directly | `await socketClient.respondAlliance(id, true/false)` |

#### Methods that are REMOVED entirely:

| Method | Why |
|--------|-----|
| `processAITurns()` ~L1050-1270 | AI runs on server. Client receives `game:aiAction` events. |
| `runInstantSimulation()` ~L1340-1470 | Instant mode handled server-side. Client receives `game:instantBatch`. |
| `processAllianceTick()` ~L1530-1570 | Server handles alliance ticking between turns. |
| `processAllianceTickInstant()` ~L1575-1600 | Server handles this in instant mode. |

**That's ~500 lines removed from GameScene.**

#### Methods that STAY (client-side validation for UX):

| Method | Why It Stays |
|--------|-------------|
| `handleAttackerSelection()` | Client-side territory selection (UI only, no game mutation) |
| `canAttackFrom()` usage L608 | Pre-validate before showing attack UI (avoid round-trip for obvious invalids) |
| `isValidAttack()` usage L637 | Pre-validate attack target for UI feedback |
| `getValidTargets()` L1714 | Highlight valid targets on map (rendering) |
| `getAttackableTerritories()` L1716 | Highlight attackable territories (rendering) |
| `estimateWinProbability()` L1746 | Tooltip display (client-only calculation) |
| `refreshDisplay()` | Reads state, renders — pure rendering |
| `updateHoverEffects()` | Mouse hover UI feedback |

**Note**: These read-only functions use the LOCAL copy of `GameState` (received from server). They never mutate it.

#### New event handlers to ADD:

```typescript
// In GameScene.create():
this.socketClient.on('game:battleResult', (result: BattleResult) => {
  // Play battle animation (same as current code)
  this.battleAnimator.playBattle(result, () => {
    // After animation, state is already updated from stateUpdate event
    this.refreshDisplay();
  });
});

this.socketClient.on('game:stateUpdate', (state: SerializedGameState) => {
  this.gameState = deserializeState(state);
  this.refreshDisplay();
});

this.socketClient.on('game:aiAction', (action: GameAction) => {
  // Add to event log
  this.eventLog.addEntry(formatAction(action, this.gameState));
  // Play corresponding animation/effect
  this.handleAIActionVisual(action);
});

this.socketClient.on('game:turnChanged', (data: TurnChangeData) => {
  this.handleTurnChange(data);
});

this.socketClient.on('game:instantBatch', (batch: InstantBatch) => {
  // Apply final state
  this.gameState = deserializeState(batch.finalState);
  // Optionally replay actions in event log
  for (const action of batch.actions) {
    this.eventLog.addEntry(formatAction(action, this.gameState));
  }
  this.refreshDisplay();
});

this.socketClient.on('game:gameOver', (data: GameOverData) => {
  this.handleGameOver(data);
});

this.socketClient.on('game:playerDisconnected', ({ playerIndex, graceSeconds }) => {
  this.showDisconnectOverlay(playerIndex, graceSeconds);
});

this.socketClient.on('game:playerReconnected', ({ playerIndex }) => {
  this.hideDisconnectOverlay(playerIndex);
});

this.socketClient.on('game:error', (error: GameError) => {
  handleGameError(error); // show toast
});
```

#### What to remove:

- [ ] Remove `this.rng` (SeededRandom) — server owns RNG
- [ ] Remove `this.recorder` (GameRecorder) — server records
- [ ] Remove `this.snapshot` — server manages undo state
- [ ] Remove `import { executeAttack, endTurn, ... } from '../game/GameRules'` (except read-only validation functions)
- [ ] Remove `import { selectBestMove, useAIPowerUps } from '../game/AIPlayer'`
- [ ] Remove `import { createSnapshot, restoreSnapshot } from '../game/GameStateSnapshot'`
- [ ] Remove all `processAITurns()` and `runInstantSimulation()` method bodies
- [ ] Remove `processAllianceTick()` and `processAllianceTickInstant()`

### 6.4 — Single-player via server

No offline mode. Single-player creates a server game with AI opponents:

```
MenuScene → SetupScene → [POST /api/games (with AI slots)] → WaitingRoomScene (auto-start) → GameScene
```

- [ ] SetupScene "Start Game" calls `lobbyClient.createGame()` with AI slots
- [ ] Server auto-starts when creator is the only human and signals ready
- [ ] Same GameScene code as multiplayer
- [ ] Game feels identical to current single-player (just runs on server)

### 6.5 — Connection state UI

- [ ] Connection indicator in HUD: green dot (connected), yellow pulse (reconnecting), red (disconnected)
- [ ] "Reconnecting..." semi-transparent overlay when disconnected
- [ ] After 10s disconnect: "Connection lost — Retry" button
- [ ] On reconnect: full state sync, clear overlay, resume
- [ ] During brief disconnects (<2s): queue player actions, send on reconnect

### 6.6 — Error display

- [ ] Toast notification system (small popup, auto-dismiss after 3s)
- [ ] Error messages from `GameError.message` (human-readable)
- [ ] Rate-limit errors show "Slow down!" message
- [ ] Auth errors trigger re-login flow
- [ ] Game-over errors transition to game over scene

### 6.7 — Tests

- [ ] SocketClient sends correct event names and payloads
- [ ] SocketClient handles success/error acks
- [ ] Event handlers update local game state correctly
- [ ] Auth flow: login → token storage → socket auth
- [ ] Lobby flow: list → create → join → start
- [ ] Connection state transitions
- [ ] Error handling per error code
- [ ] Single-player via server creates correct game config

## Acceptance Criteria

- GameScene is ~1100 lines (down from ~1600 — removed ~500 lines of AI/instant logic)
- Full game playable through server (no local game logic execution)
- Login → lobby → waiting room → game flow works
- Single-player works via server with AI opponents
- Connection handling: reconnects, error messages, state recovery
- No regressions in rendering or animations
- AI actions animate correctly from server events

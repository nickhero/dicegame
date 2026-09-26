# PR Review: v2.1-rework → development

- **Status**: resolved
- **Priority**: 🔴 Critical
- **Depends on**: none
- **Branch**: `v2.1-rework` → `development`
- **Scope**: Online alliances, registration/login, stats/history sync, islands map, in-game chat, controller refactor, client tests
- **Files**: 47 files changed, +3975 / −415 lines

## Summary

Review of the full `v2.1-rework` PR (19 commits, v2.1.0 → v2.6.4). Tests pass (486 shared ✅, 319 server ✅, 33 client ✅), typecheck passes ✅. Several code-level issues identified below requiring fixes before merge.

---

## 🔴 Critical Issues

### C1 — `createApp()` drops generic type, breaking middleware type inference

**File**: [`packages/server/src/app.ts`](file:///Users/niklas/Developer/dicegame-908/packages/server/src/app.ts#L19)

The return type was changed from `Hono<AppEnv>` to plain `Hono` and the `AppEnv` import was removed. This strips all custom environment type information (e.g. `c.get('user')` from auth middleware), meaning downstream route handlers silently lose type safety. The `AppEnv` type was explicitly designed to carry auth user data through the middleware chain.

```diff
-export function createApp(db?: AppDatabase): Hono {
-  const app = new Hono();
+export function createApp(db?: AppDatabase) {
+  const app = new Hono<AppEnv>();
```

- [x] Restore `Hono<AppEnv>` generic and `AppEnv` import

### C2 — `SocketData.userId` / `userName` changed to optional but passed unsafely to `GameEngine`

**File**: [`packages/shared/src/game/ServerTypes.ts`](file:///Users/niklas/Developer/dicegame-908/packages/shared/src/game/ServerTypes.ts#L263-L264)

`SocketData.userId` and `userName` were changed from required `string` to `string | undefined`. However, all game action handlers in [`gameHandlers.ts`](file:///Users/niklas/Developer/dicegame-908/packages/server/src/ws/gameHandlers.ts) still pass `socket.data.userId` directly to `GameEngine` methods like `executeAttack(gameId, socket.data.userId, ...)` without null-checking. This could result in `undefined` being used as a player lookup key if auth middleware somehow fails silently.

- [x] Either revert `userId`/`userName` to required (they're always set by auth middleware), or add guard clauses at each handler entry point

### C3 — `InterServerEvents` interface deleted from shared types

**File**: [`packages/shared/src/game/ServerTypes.ts`](file:///Users/niklas/Developer/dicegame-908/packages/shared/src/game/ServerTypes.ts#L260-L261)

`InterServerEvents` was removed entirely. While currently empty, this is the standard Socket.IO generic parameter for inter-server events (used in multi-server/cluster setups). The type is referenced in [`ws/index.ts`](file:///Users/niklas/Developer/dicegame-908/packages/server/src/ws/index.ts#L17) where it was replaced with `Record<string, never>`. If this was intentional, the `ServerTypes.ts` export should still be re-exported as an alias for documentation.

- [x] Add back `InterServerEvents` as `Record<string, never>` in `ServerTypes.ts`, or document the removal

---

## 🟡 High Issues

### H1 — `proposeAlliance` proposal ID uses `fromPlayer` index — collision-prone

**Files**: [`gameHandlers.ts` L314-315](file:///Users/niklas/Developer/dicegame-908/packages/server/src/ws/gameHandlers.ts#L314-L315), [`AITurnRunner.ts` L353-354](file:///Users/niklas/Developer/dicegame-908/packages/server/src/services/AITurnRunner.ts#L353-L354)

Alliance proposal IDs are generated as `String(result.fromPlayer)` — i.e. the proposer's player index. This means if player 0 proposes to player 1, then player 0 proposes to player 2 (after the first is accepted/declined), both proposals get ID `"0"`. In `respondAlliance`, the proposal is looked up by `proposerIndex = parseInt(proposalId)` matching the first proposal from that player. This design only works if there's at most one pending proposal per player at a time, which isn't enforced.

- [x] Use a unique proposal ID (e.g. `nanoid`, or `${from}-${to}-${turn}`)
- [x] Or validate that duplicate proposal check in `GameEngine.proposeAlliance` covers this adequately

### H2 — Chat `senderName` uses in-game player name, not authenticated display name

**File**: [`gameHandlers.ts` L390-396](file:///Users/niklas/Developer/dicegame-908/packages/server/src/ws/gameHandlers.ts#L390-L396)

The chat `senderName` falls back to `game.state.players[playerIndex]?.name` which is the in-game generated name (e.g. "Player 0"), not the authenticated user's display name. The `socket.data.userName` fallback is secondary. For online games, the authenticated `userName` should be preferred for chat messages to maintain identity consistency.

- [x] Prefer `socket.data.userName` when available, fall back to player name

### H3 — Chat fallback DB query runs synchronously on the event loop

**File**: [`gameHandlers.ts` L398-408](file:///Users/niklas/Developer/dicegame-908/packages/server/src/ws/gameHandlers.ts#L398-L408)

When the game isn't found in memory, the chat handler performs a synchronous `.all()` Drizzle query to look up the player's slot from `gamePlayers`. This blocks the Node.js event loop for every chat message in that path. Since chat can be rate-limited but still fires frequently, this should be async or the path should be eliminated (the game should always be in memory if the player is in the room).

- [x] Remove the DB fallback path (if a game isn't in memory, the player shouldn't be chatting in it)
- [x] Or convert to async if the path is truly needed

### H4 — `LocalGameController.proposeAlliance` doesn't handle human-to-human local alliance proposals

**File**: [`LocalGameController.ts` L175-198](file:///Users/niklas/Developer/dicegame-908/packages/client/src/controllers/LocalGameController.ts#L175-L198)

The method only handles proposals to AI players (`!targetPlayer.isHuman`). If the target is human (possible in local hotseat), the function silently returns `false` with no feedback. The `GameController` interface declares this method, and `GameScene` calls it — for local games with multiple human players, alliance proposals would be silently swallowed.

- [x] Add a proposal UI flow for human targets in local mode, or show a toast explaining alliances are AI-only in local games

### H5 — `GameScene` still contains large blocks of duplicated alliance/battle logic alongside controller delegation

**File**: [`GameScene.ts`](file:///Users/niklas/Developer/dicegame-908/packages/client/src/scenes/GameScene.ts) (~2468 lines)

The controller refactor (ticket 07) extracted `LocalGameController` and `OnlineGameController`, but `GameScene` still contains its own inline implementations of:
- Local AI alliance proposal handling with `aiWouldAcceptProposal`/`formAlliance` (lines ~2070-2130)
- Local battle execution with `executeAttack` (legacy path)
- Inline `createSnapshot`/`restoreSnapshot` undo logic

This means there are **two code paths** for the same operations. The `controller` field is declared but the scene doesn't consistently delegate to it for all actions, creating a risk of divergent behavior.

- [x] Audit all inline game-logic calls in `GameScene` and delegate fully to the controller
- [x] Remove the duplicated alliance/battle/undo logic from `GameScene`

---

## 🟢 Normal Issues

### N1 — `handleControllerBattleResult` always passes `1` for battle speed

**File**: [`GameScene.ts` L2306](file:///Users/niklas/Developer/dicegame-908/packages/client/src/scenes/GameScene.ts#L2306)

```ts
this.getBattleSpeed(1)
```

The `1` is presumably a speed multiplier, but `getBattleSpeed` expects a delay base. This hardcodes normal speed regardless of the user's speed setting. Should use `this.speed` or the configured speed.

- [x] Pass correct speed parameter based on current game speed setting

### N2 — `LocalGameController.endTurn` always records `bonusDice: 0`

**File**: [`LocalGameController.ts` L120](file:///Users/niklas/Developer/dicegame-908/packages/client/src/controllers/LocalGameController.ts#L120)

```ts
this.recorder.recordAction({
  type: "endTurn",
  playerId: previousPlayer,
  bonusDice: 0,  // Always 0
});
```

The `endTurn()` function from shared distributes bonus dice, but the recorder always records 0. This means replays and stats will show no bonus dice for local games.

- [x] Capture the actual bonus dice count from `endTurn()` return value

### N3 — `auth.ts` register/login missing max password length validation

**File**: [`packages/server/src/routes/auth.ts` L112](file:///Users/niklas/Developer/dicegame-908/packages/server/src/routes/auth.ts#L112)

The registration route validates `password.length < 8` but has no upper bound. An attacker could submit a multi-megabyte password, causing `scrypt` to perform expensive hashing on a huge input. The login route has the same issue.

- [x] Add maximum password length check (e.g. 128 chars) in both `/register` and `/login`

### N4 — Chat sanitization doesn't encode `"` or `'` characters

**File**: [`gameHandlers.ts` L382-386](file:///Users/niklas/Developer/dicegame-908/packages/server/src/ws/gameHandlers.ts#L382-L386)

The HTML sanitization only replaces `&`, `<`, `>`. If chat messages are rendered in an HTML attribute context anywhere in the client, unescaped quotes could lead to attribute injection.

- [x] Add `.replace(/"/g, "&quot;").replace(/'/g, "&#39;")` for completeness

### N5 — `GameScene.shutdown()` doesn't clean up all resources

**File**: [`GameScene.ts` L2316-2323](file:///Users/niklas/Developer/dicegame-908/packages/client/src/scenes/GameScene.ts#L2316-L2323)

The `shutdown()` method cleans up `chatCursorTimer`, `connectionCleanup`, and `controller`, but doesn't clean up:
- `disconnectTimer`
- `helpOverlay`, `confirmDialog`, `surrenderDialog` containers
- Keyboard event listeners
- `toastManager`

This can cause memory leaks if GameScene is started/stopped repeatedly.

- [x] Add cleanup for all Phaser objects and event listeners in `shutdown()`

### N6 — `WaitingRoomScene` player list layout uses `\r\n` carriage return

**File**: [`WaitingRoomScene.ts` L498](file:///Users/niklas/Developer/dicegame-908/packages/client/src/scenes/WaitingRoomScene.ts#L498)

```ts
    const slotH = 48;\r
```

A `\r` (carriage return) character was introduced at the end of this line. While harmless at runtime, it can cause issues with line-ending-sensitive tooling and is inconsistent with the rest of the codebase (LF endings).

- [x] Remove the stray `\r` character

### N7 — `ErrorContract.ts` new error codes not re-exported from shared index

**File**: [`packages/shared/src/game/ErrorContract.ts`](file:///Users/niklas/Developer/dicegame-908/packages/shared/src/game/ErrorContract.ts)

New error codes were added (visible in the diff) but should be verified that they're properly re-exported from `packages/shared/src/index.ts` for consumption by server and client.

- [x] Verify new `GameErrorCode` values are accessible via `@dicewars/shared`

---

## ✅ What Looks Good

- **Islands map shape**: Well-implemented with proper connectivity guarantees via land bridges, good test coverage with BFS connectivity verification
- **Auth flow**: Solid password hashing with `scrypt` + `timingSafeEqual`, proper salt management, rate limiting
- **Controller architecture**: Clean `IGameController` interface with proper separation of `LocalGameController` / `OnlineGameController`
- **Chat system**: Server-side HTML sanitization, rate limiting (2 msg/sec), 140-char truncation
- **Alliance diplomacy**: AI acceptance logic, human-to-human proposal/response flow via WebSocket
- **Client test suite**: New tests for controllers, network clients, and deserializer
- **`deserializeWireState` fix**: Using `wire.alliancesEnabled` flag for proper alliance state initialization

## Tasks

- [x] Fix C1 — Restore `Hono<AppEnv>` generic type
- [x] Fix C2 — Guard `socket.data.userId` optionality
- [x] Fix C3 — Restore or document `InterServerEvents` removal
- [x] Fix H1 — Use unique alliance proposal IDs
- [x] Fix H2 — Prefer authenticated display name in chat
- [x] Fix H3 — Remove synchronous DB query in chat handler
- [x] Fix H4 — Handle human-to-human local alliance proposals
- [x] Fix H5 — Complete controller delegation in GameScene
- [x] Fix N1 — Pass correct battle speed
- [x] Fix N2 — Record actual bonus dice count
- [x] Fix N3 — Add max password length
- [x] Fix N4 — Encode quotes in chat sanitization
- [x] Fix N5 — Complete GameScene shutdown cleanup
- [x] Fix N6 — Remove stray carriage return
- [x] Fix N7 — Verify error code re-exports


---

## 🏁 Resolution Summary

All 14 review items have been resolved and verified with 840/840 tests passing across all three workspaces:
- **C1**: Generic `Hono<AppEnv>` restored to `createApp()` with `AppEnv` type in `packages/server/src/app.ts`.
- **C2**: Required `userId` / `userName` restored to `SocketData` and explicit guard clauses added to all socket handlers in `packages/server/src/ws/gameHandlers.ts`.
- **C3**: `InterServerEvents` restored to `packages/shared/src/game/ServerTypes.ts` and re-exported in server event types.
- **H1**: Unique proposal IDs formatted as `${fromPlayer}-${toPlayer}-${turnNumber}` implemented across server `gameHandlers.ts`, `AITurnRunner.ts`, and client controllers.
- **H2**: Chat messages prioritize authenticated `socket.data.userName` over fallback in-game names.
- **H3**: Synchronous database query removed from chat handler.
- **H4**: Local hotseat human-to-human alliance proposals and responses implemented in `LocalGameController.ts`.
- **H5**: Removed duplicate inline battle, alliance, surrender, reinforce, fortify, and undo logic in `GameScene.ts`, fully delegating to `this.controller`.
- **N1**: `getBattleSpeed()` cleanly derives animation speed multiplier from `this.speed` configuration.
- **N2**: `LocalGameController.endTurn` calculates actual bonus dice with `largestContiguousGroup` and records it.
- **N3**: Upper bound limit (<= 128 characters) enforced on passwords in `/api/auth/register` and `/api/auth/login`.
- **N4**: HTML entity encoding extended to quotes (`&quot;` and `&#39;`).
- **N5**: `GameScene.shutdown()` cleans up all dialogs, timers, overlays, toast manager, keyboard listeners, and controller.
- **N6**: Clean LF line endings verified across all source files.
- **N7**: All `GameErrorCode` enum values confirmed exported in `@dicewars/shared`.

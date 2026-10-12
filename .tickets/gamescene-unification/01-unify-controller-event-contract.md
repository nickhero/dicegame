# Unify Controller Event Contract & Consolidate OnlineGameController

- **Status**: done
- **Priority**: 🟡 High
- **Depends on**: none
- **Files**:
  - `packages/client/src/controllers/GameController.ts`
  - `packages/client/src/controllers/OnlineGameController.ts`
  - `packages/client/src/controllers/LocalGameController.ts`
  - `packages/client/tests/controllers/OnlineGameController.test.ts`

## Description

Currently, `GameControllerEvents` in `GameController.ts` defines an incomplete event interface. In online mode, `OnlineGameController` only intercepts a few events, while `GameScene.ts` sets up duplicate raw WebSocket subscriptions on `socketClient` for `game:stateUpdate`, `game:turnChanged`, `game:aiAction`, `game:instantBatch`, `game:playerDisconnected`, `game:playerReconnected`, `game:chat`, and `game:error`.

This dual event listener setup causes redundant deserialization, potential race conditions, and bypasses the controller abstraction. All server socket events must be encapsulated inside `OnlineGameController` and translated into uniform `GameControllerEvents` callbacks that both online and local controllers can satisfy.

## Tasks

- [x] **Enrich `GameControllerEvents`**:
  - Define `DiceDistributionData` interface (`playerId: number`, `deltas: Map<number, number>`, `totalBonus: number`).
  - Update `onTurnChanged` signature to receive an extended payload including `bonusDice`, `distribution?: DiceDistributionData`, and `powerUpSpawns`.
  - Add `onAIAction?: (action: AIActionPayload) => void` to `GameControllerEvents`.
  - Add `onInstantBatch?: (batch: InstantBatchPayload) => void` to `GameControllerEvents`.
  - Add chat event or callback `onChat?: (data: ChatMessageData) => void`.
- [x] **Consolidate `OnlineGameController`**:
  - Move socket listener registration for `game:aiAction`, `game:instantBatch`, `game:chat`, and `game:error` entirely into `OnlineGameController`.
  - Pass all mapped events through to `GameControllerEvents` callbacks.
  - Expose `sendChat(message: string)` forwarding to `socketClient.sendChat`.
  - Implement full listener cleanup in `destroy()` to prevent memory leaks during scene transitions or disconnects.
- [x] **Update Unit Tests**:
  - Expand `packages/client/tests/controllers/OnlineGameController.test.ts` to verify handling of all socket events: `game:aiAction`, `game:instantBatch`, `game:chat`, and `game:error`.

# Refactor GameScene God Object (2,000+ LOC)

- **Status**: pending
- **Priority**: 🟡 High
- **Depends on**: `01-restore-local-gameplay-parity.md`
- **Files**:
  - `packages/client/src/scenes/GameScene.ts`
  - `packages/client/src/controllers/LocalGameController.ts` (new)
  - `packages/client/src/controllers/OnlineGameController.ts` (new)
  - `packages/client/src/controllers/GameController.ts` (new interface)

## Description

`GameScene.ts` currently spans **2,028 lines of code** and suffers from the God Object anti-pattern. It combines:
1. Phaser scene lifecycle and camera management
2. Dual gameplay engines (offline turn loop, AI turn loop, local undo snapshots vs online WebSocket intent emission)
3. Direct socket event subscription and state reconciliation
4. UI dialog rendering (surrender dialog, alliance proposals, power-up popups, help modal)
5. Audio and VFX orchestration

This dense coupling was the direct cause of the regressions in single-player mode when the multiplayer backend was introduced. Refactoring game execution logic into dedicated controllers will prevent future regressions, improve testability, and decouple rendering from state mutations.

## Tasks

- [x] **Define Common GameController Interface**:
  - Create `GameController` interface defining common player actions:
    - `attack(fromId, toId)`
    - `endTurn()`
    - `usePowerUp(type, targetId, sourceId)`
    - `surrender()`
    - `undo()`
    - `proposeAlliance(targetIndex)`
    - `respondAlliance(proposalId, accept)`
- [x] **Extract LocalGameController**:
  - Encapsulate local game loop, AI turn chaining, dice distribution, local snapshots/undo, and local alliance resolution into `LocalGameController`.
  - Expose callbacks/observables for state updates, battle animations, and events.
- [x] **Extract OnlineGameController**:
  - Encapsulate `SocketClient` listener setup, message routing, intent dispatch, reconnect management, and turn timer into `OnlineGameController`.
- [x] **Slim Down GameScene**:
  - Reduce `GameScene` to a presentation coordinator: delegating user input to `this.controller`, and rendering visual updates via `MapRenderer`, `UIRenderer`, `BattleAnimator`, and `TerritoryEffects`.
- [x] **Verification**:
  - Ensure zero regressions in both local offline matches and online multiplayer rooms.

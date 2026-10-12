# Unify GameScene to Solely Depend on IGameController

- **Status**: done
- **Priority**: 🔴 Critical
- **Depends on**: `01-unify-controller-event-contract.md`, `02-local-ai-turn-runner.md`
- **Files**:
  - `packages/client/src/scenes/GameScene.ts`
  - `packages/client/src/controllers/GameController.ts`
  - `packages/client/src/controllers/LocalGameController.ts`
  - `packages/client/src/controllers/OnlineGameController.ts`

## Description

`GameScene.ts` currently contains 30+ conditional checks for `this.isOnlineGame` and `this.controller`. When offline, `this.controller` is undefined, causing the scene to fall back to ~1,500 lines of inline simulation logic (`executeLocalAttack()`, `executeLocalEndTurn()`, `processAITurns()`, manual undo snapshots).

This ticket refactors `GameScene` to always instantiate and delegate to `this.controller` (either `LocalGameController` or `OnlineGameController`). All user actions (attacks, end turn, power-up, surrender, undo, alliance proposals) must call `this.controller.*`. `GameScene` will act strictly as a presentation view reacting to `GameControllerEvents`.

## Tasks

- [x] **Always Initialize `this.controller` in `GameScene.init()` / `create()`**:
  - If `data.socketClient` is present, instantiate `OnlineGameController`.
  - Otherwise, instantiate `LocalGameController` with local state, seed, RNG, recorder, and stats.
  - Wire all controller events (`onStateUpdate`, `onBattleResult`, `onTurnChanged`, `onAIAction`, `onInstantBatch`, `onGameOver`, `onToast`, `onEventLog`, `onAllianceProposal`) to unified scene rendering handlers.
- [x] **Eliminate Dual Gameplay Logic in `GameScene.ts`**:
  - Replace `handleDefenderSelection()` local branch with `await this.controller.attack()`.
  - Delete `executeLocalAttack()` from `GameScene.ts`.
  - Replace `onEndTurn()` local branch with `await this.controller.endTurn()`.
  - Delete `executeLocalEndTurn()` from `GameScene.ts`.
  - Replace human surrender branching with `await this.controller.surrender()`.
  - Replace undo branching with `await this.controller.undo()`.
  - Delete `processAITurns()` and `advanceToNextPlayer()` from `GameScene.ts`.
  - Delete redundant `setupSocketListeners()` and `connectionCleanup` duplicate hooks.
- [x] **Unify Scene Reactions to Events**:
  - Ensure `onBattleResult` triggers `BattleAnimator` identically for local and online games.
  - Ensure `onTurnChanged` displays bonus dice distribution floating text using the payload data.
  - Ensure `onGameOver` transitions to `GameOverScene` cleanly in both modes.
- [x] **Verify Gameplay Parity**:
  - Verify local single-player vs AI plays identically.
  - Verify hotseat local multiplayer plays identically.
  - Verify local spectator mode plays identically.
  - Verify online multiplayer rooms play identically.

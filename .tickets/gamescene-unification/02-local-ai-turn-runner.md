# Implement LocalAITurnRunner & Complete LocalGameController

- **Status**: done
- **Priority**: 🟡 High
- **Depends on**: `01-unify-controller-event-contract.md`
- **Files**:
  - `packages/client/src/controllers/LocalAITurnRunner.ts` (new)
  - `packages/client/src/controllers/LocalGameController.ts`
  - `packages/client/tests/controllers/LocalGameController.test.ts`

## Description

The main blocker preventing `LocalGameController` from being used in `GameScene` is AI turn execution. In online mode, the server's `AITurnRunner` executes AI decisions authoritatively and streams events to clients. In offline mode, `GameScene.ts` currently runs ~250 lines of inline AI logic inside `processAITurns()`, using Phaser timers (`time.delayedCall`), hardcoded animation pauses, and mutating state directly.

We need a dedicated `LocalAITurnRunner` on the client that mirrors the server's `AITurnRunner`, decoupled from Phaser. It should execute AI surrender, AI power-ups, AI attacks, and end-of-turn dice distributions, emitting the exact same `GameControllerEvents` (`onAIAction`, `onBattleResult`, `onTurnChanged`, `onStateUpdate`) at configurable speeds (`normal`, `fast`, `instant`).

## Tasks

- [x] **Create `LocalAITurnRunner`**:
  - Implement sequential AI turn loop for single-player and spectator mode.
  - Implement surrender check using `shouldAISurrender()`.
  - Implement AI power-up evaluation using `useAIPowerUps()`.
  - Implement AI attack evaluation using `selectBestMove()`.
  - Support speed configurations (`normal`, `fast`, `instant`) using promise-based delays.
  - Expose pause / resume capabilities for spectator mode.
- [x] **Enhance `LocalGameController`**:
  - Compute dice distribution delta (`before` vs `after`) on turn end and provide `DiceDistributionData` in `onTurnChanged`.
  - Process alliance expiration and AI diplomacy proposals on turn ticks via `tickAlliances()`.
  - Automatically invoke `LocalAITurnRunner.runAITurns()` when `endTurn()` advances to an AI player.
  - Record stats and match recorder events consistently inside the controller.
- [x] **Update Unit Tests**:
  - Add tests in `packages/client/tests/controllers/LocalGameController.test.ts` testing multi-turn simulation with AI players, power-up usage, surrender, and dice distribution event payloads.

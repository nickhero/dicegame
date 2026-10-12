# Controller Parity Test Suite

- **Status**: done
- **Priority**: 🟢 Normal
- **Depends on**: `03-unify-gamescene-controller.md`
- **Files**:
  - `packages/client/tests/controllers/ControllerParity.test.ts` (new)
  - `packages/client/tests/controllers/LocalGameController.test.ts`
  - `packages/client/tests/controllers/OnlineGameController.test.ts`

## Description

To prevent regressions between offline and online gameplay in future releases, we need a unified test harness verifying that both `LocalGameController` and `OnlineGameController` fulfill the same behavioral contract and emit equivalent event streams when subjected to the same game actions.

## Tasks

- [x] **Create Shared Contract Tests**:
  - Verify that invoking `attack()` emits `onBattleResult` and `onStateUpdate` with matching payload structures in both controllers.
  - Verify that `endTurn()` triggers `onTurnChanged` with consistent bonus dice and player progression data.
  - Verify `surrender()` marks the player eliminated and advances the game state.
  - Verify alliance proposals trigger `onAllianceProposal` and status callbacks consistently.
  - Verify `undo()` behavior (allowed locally, validated/rejected online).
- [x] **Regression Verification**:
  - Run full test suite across packages (`npm run test:all`) and ensure zero regressions.

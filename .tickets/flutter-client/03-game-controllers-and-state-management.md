# 03 - Game Controllers and Reactive State Architecture

- **Status**: pending
- **Priority**: 🔴 Critical
- **Depends on**: `01-dart-core-engine-port.md`, `02-dart-ai-and-tactics-port.md`
- **Files**:
  - `packages/client_flutter/lib/controllers/game_controller.dart`
  - `packages/client_flutter/lib/controllers/local_game_controller.dart`
  - `packages/client_flutter/lib/controllers/game_state_notifier.dart`
  - `packages/client_flutter/test/controllers/local_game_controller_test.dart`

## Description

Establish the controller layer in Dart matching the architectural contract of `GameController`. Implement `LocalGameController` to orchestrate offline game loops, turn transitions, AI thinking delays, attack animations timing, and undo stacks.

## Tasks

- [ ] Define abstract `GameController` interface:
  - Methods: `selectTerritory()`, `attack()`, `endTurn()`, `undo()`, `proposeAlliance()`, `surrender()`.
  - Streams/Notifiers for: `gameState`, `battleEvents`, `turnTimer`, `toastMessages`.
- [ ] Implement `LocalGameController`:
  - Manage game setup from `GameConfig`.
  - Manage human turn input validation.
  - Coordinate AI turn execution loop (configurable delays for normal/fast/instant speeds).
  - Manage dice distribution at turn end.
  - Manage undo state snapshots.
- [ ] Implement reactive view models / state notifiers for Flutter widgets.
- [ ] Add unit tests for `LocalGameController` simulating complete game loops (Human vs AI, AI vs AI).

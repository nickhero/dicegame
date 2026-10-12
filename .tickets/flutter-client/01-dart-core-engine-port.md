# 01 - Port Core Game Engine and Models to Dart

- **Status**: pending
- **Priority**: 🔴 Critical
- **Depends on**: `00-architecture-and-project-setup.md`
- **Files**:
  - `packages/client_flutter/lib/game/constants.dart`
  - `packages/client_flutter/lib/game/models/territory.dart`
  - `packages/client_flutter/lib/game/models/player.dart`
  - `packages/client_flutter/lib/game/models/game_state.dart`
  - `packages/client_flutter/lib/game/engine/seeded_random.dart`
  - `packages/client_flutter/lib/game/engine/map_generator.dart`
  - `packages/client_flutter/lib/game/engine/map_shapes.dart`
  - `packages/client_flutter/lib/game/engine/dice_battle.dart`
  - `packages/client_flutter/lib/game/engine/game_rules.dart`
  - `packages/client_flutter/test/game/...`

## Description

Port the foundational domain models and pure algorithmic logic from `packages/shared/src/game/` into pure Dart. The logic must be completely decoupled from Flutter UI widgets and match the exact determinism and rules of the TypeScript reference.

## Tasks

- [ ] Port `constants.ts` (colors, grid constraints, dice limits) to Dart constants/enums.
- [ ] Port core models:
  - `Territory`: cells, center point, neighbors, owner index, dice count.
  - `Player`: id, name, color, isAI, isAlive.
  - `GameState`: turn, currentPlayerIndex, territories, players, phase, seed, history.
- [ ] Implement `SeededRandom` (LCG / Mulberry32 / PCG matching TypeScript implementation for identical map & battle seeds).
- [ ] Port `MapGenerator` & `MapShapes`:
  - BFS region-growing floodfill for both Square and Hex grids.
  - Territory adjacency graph calculation and visual center calculation.
  - Shape filters (rectangle, diamond, ring, continent, islands).
- [ ] Port `DiceBattle`:
  - Dice roll evaluation, sum comparison, tie resolution (defender advantage), attacker win/loss state mutations.
- [ ] Port `GameRules`:
  - Attack eligibility checks (`canAttack`, adjacent, dice > 1).
  - Move execution (`executeAttack`).
  - Turn completion and reinforcement calculation (Largest Connected Component via BFS).
  - Elimination and win condition checks.
- [ ] Port corresponding unit tests from `packages/shared/tests/game/` to `packages/client_flutter/test/game/` and verify all tests pass with `flutter test`.

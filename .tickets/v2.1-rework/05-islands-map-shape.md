# Implement Missing 'islands' Map Shape Generator

- **Status**: pending
- **Priority**: 🟢 Normal
- **Depends on**: none
- **Files**:
  - `packages/shared/src/game/MapShapes.ts`
  - `packages/shared/src/game/GameConfig.ts`
  - `packages/shared/src/game/MapGenerator.ts`
  - `packages/server/src/services/LobbyService.ts`
  - `packages/client/src/scenes/SetupScene.ts`
  - `packages/shared/tests/game/MapShapes.test.ts`

## Description

The project `README.md` documents:
> "Map shapes (rectangle, diamond, ring, continent, islands)"

However, `MapShape` in `MapShapes.ts` only defines `'rectangle' | 'diamond' | 'ring' | 'continent'`. The `islands` shape was omitted or left unimplemented, creating a documentation discrepancy and missing out on an interesting tactical map layout with isolated archipelagos and chokepoint bridges.

## Tasks

- [ ] **Define 'islands' in Shared Types**:
  - Extend `MapShape` union in `MapShapes.ts`: `'rectangle' | 'diamond' | 'ring' | 'continent' | 'islands'`.
  - Update `GameConfig.ts` and `LobbyService.ts` validation schemas to accept `'islands'`.
- [ ] **Implement Islands Mask Generator**:
  - In `packages/shared/src/game/MapShapes.ts`:
    - Implement `generateIslandsMask(cols: number, rows: number, rng: SeededRandom): boolean[][]`.
    - Generate 2 to 4 separate island clusters (circular or irregular land masses) separated by water, with 1-2 cell connecting land bridges or close border vertices so the graph remains fully connected.
    - Guarantee that all active cells belong to a single connected component using BFS/DFS validation.
- [ ] **UI Selector in SetupScene**:
  - Add `'islands'` option to the map shape selector in `SetupScene.ts`.
  - Ensure the map preview canvas renders the islands shape correctly.
- [ ] **Tests**:
  - Add unit tests in `MapShapes.test.ts` verifying `islands` mask bounds, minimum fill ratio, and connectivity guarantee.

# Map Shape Selector

- **Status**: pending
- **Phase**: 7
- **Depends on**: none
- **Files**: `src/scenes/SetupScene.ts`, `src/game/GameConfig.ts`

## Description

Add a shape picker to SetupScene allowing the player to choose between rectangle, diamond, ring, and continent map shapes. All four shapes are already implemented in `MapShapes.ts` and supported by `generateMap()`.

## Tasks

- [ ] Add `mapShape` field to `GameSetupConfig` (default: `'rectangle'`)
- [ ] Add shape selector buttons to SetupScene UI
- [ ] Pass shape through to `generateMap()` call in GameScene
- [ ] Update map preview in SetupScene to respect selected shape
- [ ] Save/load shape preference in localStorage
- [ ] Add validation for mapShape in `loadPreferences()`

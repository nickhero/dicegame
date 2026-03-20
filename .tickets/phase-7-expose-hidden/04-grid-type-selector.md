# Grid Type Selector

- **Status**: pending
- **Phase**: 7
- **Depends on**: none
- **Files**: `src/scenes/SetupScene.ts`, `src/game/GameConfig.ts`, `src/scenes/GameScene.ts`

## Description

Add a Square/Hex grid type selector to SetupScene. Hex grid rendering is already fully implemented in `MapGenerator.ts` and `MapRenderer.ts` — just needs a UI selector and config plumbing.

## Tasks

- [ ] Add `gridType` field (`'square' | 'hex'`) to `GameSetupConfig` (default: `'square'`)
- [ ] Add selector buttons to SetupScene UI
- [ ] Pass through to `generateMap()` call in GameScene
- [ ] Update map preview to respect grid type
- [ ] Save/load preference in localStorage
- [ ] Add validation in `loadPreferences()`

# Fog of War Toggle

- **Status**: pending
- **Phase**: 7
- **Depends on**: none
- **Files**: `src/scenes/SetupScene.ts`, `src/game/GameConfig.ts`, `src/scenes/GameScene.ts`

## Description

Add an on/off toggle in SetupScene for fog of war. The fog system is fully implemented in `FogOfWar.ts` and the renderer already handles fog overlays — just needs a UI toggle and config plumbing.

## Tasks

- [ ] Add `fogOfWar` boolean to `GameSetupConfig` (default: `false`)
- [ ] Add toggle button to SetupScene UI
- [ ] Pass through to GameScene to set `this.fogOfWarEnabled`
- [ ] Save/load preference in localStorage
- [ ] Add validation in `loadPreferences()`

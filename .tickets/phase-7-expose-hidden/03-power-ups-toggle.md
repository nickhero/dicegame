# Power-Ups Toggle

- **Status**: pending
- **Phase**: 7
- **Depends on**: none
- **Files**: `src/scenes/SetupScene.ts`, `src/game/GameConfig.ts`, `src/scenes/GameScene.ts`

## Description

Add an on/off toggle in SetupScene for power-ups. The power-up system (shield, charge, fortify, reinforce) is fully implemented in `PowerUps.ts` with spawning in `GameRules.ts` and rendering in `MapRenderer.ts` — just needs UI toggle and config wiring.

## Tasks

- [ ] Add `powerUps` boolean to `GameSetupConfig` (default: `false`)
- [ ] Add toggle button to SetupScene UI
- [ ] Pass through to GameScene to set `state.powerUpsEnabled`
- [ ] Save/load preference in localStorage
- [ ] Add validation in `loadPreferences()`

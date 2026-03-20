# Spectator / AI-Only Mode

- **Status**: pending
- **Phase**: 8
- **Depends on**: none
- **Files**: `src/scenes/SetupScene.ts`, `src/scenes/GameScene.ts`, `src/rendering/UIRenderer.ts`

## Description

Add a "Watch AI Battle" option where all players are AI. The game auto-advances through AI turns with full battle animations visible. Human becomes a spectator.

## Tasks

- [ ] Add spectator toggle to SetupScene (or "0 human players" option)
- [ ] Add `spectatorMode` boolean to `GameSetupConfig`
- [ ] GameScene: skip human turn logic when spectator mode is active
- [ ] Auto-advance through AI turns with delays respecting speed settings
- [ ] Add pause/resume control (Space key) during spectator mode
- [ ] Show "Spectating" indicator in UIRenderer
- [ ] Ensure game over screen still works normally
- [ ] Save/load spectator preference

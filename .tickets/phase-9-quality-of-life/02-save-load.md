# Save / Load Game

- **Status**: pending
- **Phase**: 9
- **Depends on**: none
- **Files**: `src/game/GameState.ts`, `src/scenes/GameScene.ts`, `src/scenes/MenuScene.ts`

## Description

Serialize the full GameState and config to localStorage so players can resume games. Auto-save after each turn. Add "Continue" button to MenuScene when a save exists.

## Tasks

- [ ] Create `serializeGameState()` and `deserializeGameState()` functions
- [ ] Auto-save state after each completed turn (human or AI)
- [ ] Add "Continue" button to MenuScene (visible only when save exists)
- [ ] Restore full game state including current player, territories, dice, stats
- [ ] Handle version mismatches gracefully (clear invalid saves)
- [ ] Clear save on game completion (win/lose)
- [ ] Add tests for serialize/deserialize round-trip

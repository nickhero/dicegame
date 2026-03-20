# Undo Last Attack

- **Status**: pending
- **Phase**: 9
- **Depends on**: none
- **Files**: `src/scenes/GameScene.ts`, `src/game/GameState.ts`

## Description

During the human player's turn, allow undoing the last attack to restore the pre-attack state. Limited to 1 undo per turn. Cannot undo after ending turn.

## Tasks

- [ ] Snapshot GameState before each human attack
- [ ] Add undo trigger (Ctrl+Z or UI button)
- [ ] Restore snapshot on undo (territories, dice, ownership)
- [ ] Limit to 1 undo per turn (disable button after use)
- [ ] Reset undo availability on new turn
- [ ] Update event log to reflect undo
- [ ] Add tests for state snapshot/restore

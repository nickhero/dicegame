# Game Replay

- **Status**: pending
- **Phase**: 9
- **Depends on**: `02-save-load`
- **Files**: `src/game/ReplayRecorder.ts` (new), `src/scenes/GameOverScene.ts`, `src/scenes/ReplayScene.ts` (new)

## Description

Record all game actions (attacks, results, dice distributions) per turn. After game over, allow replaying the entire game step by step with visual rendering.

## Tasks

- [ ] Create ReplayRecorder that captures each action as a serializable event
- [ ] Record: attack(source, target, result, dice), endTurn, diceDistribution, surrender, elimination
- [ ] Store replay data alongside game state
- [ ] Create ReplayScene that replays events visually using existing renderers
- [ ] Add replay controls: play, pause, step forward, step back, speed
- [ ] Add "Watch Replay" button to GameOverScene
- [ ] Add tests for replay event recording

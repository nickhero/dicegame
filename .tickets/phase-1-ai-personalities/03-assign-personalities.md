# Assign Personalities at Game Start

- **Status**: open
- **Phase**: 1
- **Depends on**: `02-refactor-ai-personality`
- **Files**: `src/game/Player.ts`, `src/scenes/GameScene.ts`

## Description

Add a `personality` field to the `Player` model and assign a random personality to each AI player at game start. The personality should be used throughout the game for that AI's decisions.

### Changes

1. **Player.ts**: Add optional `personality?: AIPersonality` field to `Player` interface and `createPlayer()` factory
2. **GameScene.ts**: When creating AI players, assign a random personality from `ALL_PERSONALITIES` using the game RNG
3. Ensure human player has `personality: undefined` (human doesn't use AI)

## Acceptance Criteria

- [ ] `Player` interface has optional `personality` field
- [ ] `createPlayer()` accepts optional personality parameter
- [ ] GameScene assigns random personality to each AI player
- [ ] Personality is passed to `executeAITurn()` during AI turns
- [ ] Different AI players can have different personalities in the same game
- [ ] Human player has no personality assigned

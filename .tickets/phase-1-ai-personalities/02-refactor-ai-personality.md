# Refactor AI to Use Personality Config

- **Status**: open
- **Phase**: 1
- **Depends on**: `01-define-personality-types`
- **Files**: `src/game/AIPlayer.ts`

## Description

Refactor `selectBestMove()` and `executeAITurn()` to accept an `AIPersonality` config instead of using hardcoded thresholds.

### Current Behavior (hardcoded)
```typescript
const favorableMoves = moves.filter((m) => m.advantage >= 1);  // hardcoded
```

### New Behavior (personality-driven)
```typescript
const favorableMoves = moves.filter((m) => m.advantage >= personality.minAdvantage);
// Score moves using personality.connectednessWeight
// Cap attacks at personality.maxAttacksPerTurn
```

### Move Scoring

Each move gets a score based on the personality:
- `advantage * 10` (base score)
- `+ connectednessWeight * 5` if the attack would connect two disconnected groups
- Pick from top-scoring moves with randomness (existing behavior)

## Acceptance Criteria

- [ ] `selectBestMove()` signature includes `AIPersonality` parameter
- [ ] `executeAITurn()` signature includes `AIPersonality` parameter
- [ ] Min advantage threshold uses `personality.minAdvantage`
- [ ] Attack count capped at `personality.maxAttacksPerTurn`
- [ ] Expansionist personality uses `connectednessWeight` in scoring
- [ ] Existing "Balanced" behavior is preserved when using the Balanced config
- [ ] All existing tests updated and passing

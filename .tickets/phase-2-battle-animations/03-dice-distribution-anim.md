# Dice Distribution Animation

- **Status**: open
- **Phase**: 2
- **Depends on**: `01-battle-popup`
- **Files**: `src/rendering/DiceRenderer.ts`, `src/scenes/GameScene.ts`

## Description

When bonus dice are distributed at end of turn, show a brief animation so the player can see where dice were placed.

### Animation

1. At end of turn, calculate which territories received dice
2. For each territory that gained dice, show a floating "+1" (or "+2", etc.) text
3. Text floats upward and fades out over 500ms
4. Dice count on the territory updates as the number lands
5. Slight delay between territories receiving dice (staggered, 100ms apart) for visual clarity

### Tracking Changes

Need to compare territory dice counts before/after distribution to know which territories changed. Either:
- Snapshot dice counts before `endTurn()`, compare after
- Have `distributeDice()` return a change log

## Acceptance Criteria

- [ ] Floating "+N" text appears on territories that received bonus dice
- [ ] Text fades out smoothly
- [ ] Staggered timing so player can follow the distribution
- [ ] Works for both human and AI turns
- [ ] No animation in "Instant" speed mode

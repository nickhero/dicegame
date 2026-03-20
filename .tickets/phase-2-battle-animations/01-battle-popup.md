# Battle Popup with Dice Animation

- **Status**: open
- **Phase**: 2
- **Depends on**: none
- **Files**: `src/rendering/BattleAnimator.ts` (new), `src/scenes/GameScene.ts`

## Description

Create an animated battle overlay that shows dice rolling when an attack happens. This replaces the instant resolution with a visual sequence.

### Animation Sequence

1. **Popup appears** — Semi-transparent overlay panel in center of screen
2. **Show combatants** — Attacker dice on left, defender dice on right, colored by owner
3. **Roll animation** — Each die rapidly cycles through faces (100ms per frame, 6–8 cycles)
4. **Settle** — Dice settle to their final values one by one (staggered, 200ms apart)
5. **Show totals** — Running total appears below each side as dice settle
6. **Result flash** — "VICTORY!" (green) or "DEFEAT!" (red) text with scale-in animation
7. **Auto-dismiss** — Panel fades out after 1.5s (configurable for speed setting)

### API

```typescript
class BattleAnimator {
  showBattle(
    attackerDice: number[],
    defenderDice: number[],
    attackerWins: boolean,
    attackerColor: number,
    defenderColor: number,
    onComplete: () => void
  ): void;
}
```

### For AI Turns
- Same animation but faster (0.8x duration)
- Can be skipped entirely in "Instant" speed mode

## Acceptance Criteria

- [ ] Battle popup appears centered with semi-transparent background
- [ ] Dice visually roll (face cycling) before settling
- [ ] Final values match the actual battle result
- [ ] Running totals update as dice settle
- [ ] Victory/defeat text shown clearly
- [ ] Auto-dismisses and calls `onComplete` callback
- [ ] GameScene wires battle flow through animator
- [ ] No interaction possible during animation (isProcessing flag)

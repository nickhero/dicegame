# Post-Game Statistics

- **Status**: done
- **Phase**: 5
- **Depends on**: `01-turn-history-log`
- **Files**: `src/game/GameStats.ts` (new), `src/scenes/GameOverScene.ts`

## Description

Track game statistics throughout play and show a detailed stats screen after the game ends.

### Statistics to Track

**Per Player:**
- Territories held per turn (for line chart)
- Total attacks initiated
- Attacks won / lost
- Territories captured / lost
- Largest territory count reached
- Longest winning streak

**Game-wide:**
- Total turns played
- Total battles
- Biggest upset (defender won with largest dice disadvantage)
- Game duration (turns)

### Stats Screen (GameOverScene)

Show after victory/defeat:
1. **Territory chart** — Line chart showing territories over time per player (use Canvas 2D, no library)
2. **Player scoreboard** — Table with per-player stats
3. **Highlights** — "Biggest upset: AI Red won 2 vs 7!" type callouts
4. **Buttons** — "Play Again" / "Main Menu"

### Implementation

```typescript
class GameStats {
  recordTurnStart(state: GameState): void;
  recordAttack(attackerId: number, defenderId: number, result: BattleResult): void;
  getSummary(): GameStatsSummary;
}
```

Instantiate in GameScene, pass to GameOverScene via `scene.start()`.

## Acceptance Criteria

- [ ] Stats tracked throughout gameplay (no retroactive calculation)
- [ ] Territory-over-time line chart rendered in GameOverScene
- [ ] Per-player stats table displayed
- [ ] At least one "highlight" callout
- [ ] Pure TypeScript stats tracker (testable without Phaser)
- [ ] Tests for stats calculation

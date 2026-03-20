# Animation Speed Controls

- **Status**: done
- **Phase**: 3
- **Depends on**: `02-setup-scene`
- **Files**: `src/scenes/GameScene.ts`, `src/rendering/BattleAnimator.ts`

## Description

Implement a speed multiplier that affects all animation and AI delay timings.

### Speed Levels

| Speed | AI Think Delay | Battle Anim Duration | Dice Distrib Delay | Between-Attack Delay |
|-------|---------------|---------------------|-------------------|---------------------|
| Normal | 800ms | 1500ms | 100ms/territory | 300ms |
| Fast | 200ms | 500ms | 30ms/territory | 100ms |
| Instant | 0ms | 0ms (skip) | 0ms | 0ms |

### Implementation

- Create a `SpeedConfig` object with timing multipliers
- All `time.delayedCall()` durations multiply by the speed factor
- "Instant" mode skips animations entirely (just updates state and renders)
- Speed can be changed mid-game via keyboard shortcut (1/2/3)

## Acceptance Criteria

- [ ] All animation timings respect speed setting
- [ ] "Instant" mode produces correct game state (same as animated)
- [ ] Speed selectable in SetupScene
- [ ] Speed changeable mid-game via keyboard
- [ ] Status bar shows current speed when changed

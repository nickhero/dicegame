# Surrender Mechanic

- **Status**: open
- **Phase**: 6
- **Depends on**: Phase 1
- **Files**: `src/game/GameRules.ts`, `src/game/AIPlayer.ts`, `src/scenes/GameScene.ts`

## Description

Add the ability for players (both AI and human) to surrender when their position is hopeless.

### AI Surrender Logic

AI surrenders when ALL of these conditions are met:
- Has ≤2 territories remaining
- No attack with positive advantage exists
- Has been in this situation for ≥2 consecutive turns

Different personalities have different surrender thresholds:
- **Reckless**: Never surrenders (fights to the death)
- **Aggressive**: Surrenders at 1 territory
- **Others**: Standard logic (≤2 territories, no good attacks)

### Human Surrender

- "Surrender" button in the UI (or via menu)
- Confirmation dialog before surrendering
- Returns to GameOverScene with "Surrender" result

### Territory Distribution

When a player surrenders, their territories are distributed:
1. Each territory goes to the neighboring player with the most adjacent territories
2. Ties broken by player order
3. Dice on surrendered territories remain as-is
4. If no neighbor owns adjacent territory (isolated), territory goes to the player with the most territories overall

### Implementation

Add to GameRules:
```typescript
function shouldAISurrender(state: GameState, playerId: number, personality: AIPersonality): boolean;
function distributeSurrenderedTerritories(state: GameState, playerId: number): void;
```

## Acceptance Criteria

- [ ] AI surrenders under appropriate conditions
- [ ] Personality affects surrender threshold
- [ ] Human player can surrender via UI
- [ ] Confirmation dialog for human surrender
- [ ] Territories distributed to neighbors logically
- [ ] Eliminated player removed from turn order
- [ ] Tests for surrender conditions and territory distribution
- [ ] Game doesn't break if multiple players surrender in one round

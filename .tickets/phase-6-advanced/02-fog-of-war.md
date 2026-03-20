# Fog of War

- **Status**: open
- **Phase**: 6
- **Depends on**: Phase 1
- **Files**: `src/game/FogOfWar.ts` (new), `src/rendering/MapRenderer.ts`

## Description

Optional rule: players can only see dice counts on territories adjacent to their own. All other enemy territories display "?" instead of their dice count.

### Visibility Rules

- Your own territories: always fully visible
- Territories adjacent to any of your territories: fully visible (dice count shown)
- All other territories: owner color visible, but dice count hidden (show "?" or dim overlay)
- AI players also obey fog of war (don't peek at hidden info for move decisions)

### Rendering

- Hidden territories rendered with a semi-transparent dark overlay
- "?" text where dice stacks would normally show
- When a territory enters/exits fog, smooth fade transition

### AI Impact

This significantly changes AI strategy:
- AI can only evaluate moves against visible neighbors
- No global "best move on the entire map" — only local decisions
- Makes Cautious/Turtle personalities stronger (they border fewer enemies)
- Makes Expansionist weaker (can't see the full picture)

### Implementation

```typescript
function getVisibleTerritories(state: GameState, playerId: number): Set<number>;
function isVisible(state: GameState, playerId: number, territoryId: number): boolean;
```

Rendering and AI both call `isVisible()` to filter what they show/know.

## Acceptance Criteria

- [ ] Visibility calculation correct (own + adjacent)
- [ ] Hidden territories show "?" dice count
- [ ] Dark overlay on non-visible territories
- [ ] AI only uses visible information for decisions
- [ ] Optional rule (disabled by default)
- [ ] Tests for visibility calculation
- [ ] Smooth fog transitions
